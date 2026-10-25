import { expect, test } from "@playwright/test";

test("credential lifecycle: create with conflict handling, rename, secret rotation, in-use delete blocking, and unreferenced deletion", async ({ page }) => {
  const email = `cred-lifecycle-${Date.now()}@example.test`;
  await page.goto("/");

  // Sign up
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.locator('input[autocomplete="name"]').fill("Lifecycle Tester");
  await page.locator('input[autocomplete="email"]').fill(email);
  await page.locator('input[autocomplete="new-password"]').fill("test-password-123");
  const registerPromise = page.waitForResponse((res) => res.request().method() === "POST" && res.url().includes("/register"));
  await page.getByRole("button", { name: "Create account" }).click();
  expect((await registerPromise).ok()).toBeTruthy();

  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
  await expect(page.getByText("Execution runtime ready")).toBeVisible();

  // Create a blank workflow from dashboard
  await page.getByRole("textbox", { name: "New workflow name" }).fill("Lifecycle Test Workflow");
  const createPromise = page.waitForResponse((res) => res.request().method() === "POST" && res.url().includes("/workflows"));
  await page.getByRole("button", { name: "Blank workflow" }).click();
  expect((await createPromise).ok()).toBeTruthy();

  await expect(page).toHaveURL(/\/editor\?workflow=/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Lifecycle Test Workflow" })).toBeVisible();

  // Open credential manager
  await page.getByLabel("Manage actions").click();
  await page.getByRole("button", { name: "Credentials" }).click();

  // 1. Create a Discord Webhook credential
  await page.getByLabel("Provider").selectOption("DISCORD_WEBHOOK");
  await page.getByRole("textbox", { name: "Connection name" }).fill("Discord Primary Alerts");
  await page.getByRole("textbox", { name: "Secret JSON" }).fill('{"webhookUrl":"https://discord.com/api/webhooks/111/token-initial"}');
  const createDiscordPromise = page.waitForResponse((res) => res.request().method() === "POST" && res.url().includes("/credentials"));
  await page.getByRole("button", { name: "Encrypt & save" }).click();
  const discordCred = (await (await createDiscordPromise).json()) as { credential: { id: string } };
  await expect(page.getByText("Credential encrypted and saved. Select it from a compatible node in the editor.")).toBeVisible();

  // 2. Duplicate label test on creation: attempt creating another Discord credential with same label
  await page.getByLabel("Provider").selectOption("DISCORD_WEBHOOK");
  await page.getByRole("textbox", { name: "Connection name" }).fill("Discord Primary Alerts");
  await page.getByRole("textbox", { name: "Secret JSON" }).fill('{"webhookUrl":"https://discord.com/api/webhooks/222/token-dup"}');
  await page.getByRole("button", { name: "Encrypt & save" }).click();

  // Assert inline conflict error alert
  await expect(page.locator('form.credential-form p[role="alert"]')).toContainText("already exists");
  // Assert input values are preserved
  await expect(page.getByRole("textbox", { name: "Connection name" })).toHaveValue("Discord Primary Alerts");
  await expect(page.getByRole("textbox", { name: "Secret JSON" })).toHaveValue('{"webhookUrl":"https://discord.com/api/webhooks/222/token-dup"}');

  // Also create a second distinct credential for conflict testing during rename
  await page.getByRole("textbox", { name: "Connection name" }).fill("Discord Secondary Alerts");
  await page.getByRole("button", { name: "Encrypt & save" }).click();
  await expect(page.getByText("Credential encrypted and saved. Select it from a compatible node in the editor.")).toBeVisible();

  // Verify credential card actions exist
  const primaryCard = page.locator(`li[data-credential-id="${discordCred.credential.id}"]`);
  await expect(primaryCard).toBeVisible();
  await expect(primaryCard.getByRole("button", { name: "Rename Discord Primary Alerts" })).toBeVisible();
  await expect(primaryCard.getByRole("button", { name: "Rotate secret for Discord Primary Alerts" })).toBeVisible();
  await expect(primaryCard.getByRole("button", { name: "Delete Discord Primary Alerts" })).toBeVisible();

  // 3. Rename credential conflict test
  await primaryCard.getByRole("button", { name: "Rename Discord Primary Alerts" }).click();
  await expect(primaryCard.getByLabel("New connection name")).toHaveValue("Discord Primary Alerts");
  // Attempt to rename to the other credential's name
  await primaryCard.getByLabel("New connection name").fill("Discord Secondary Alerts");
  await primaryCard.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(primaryCard.locator('p[role="alert"]')).toContainText("already exists");
  await expect(primaryCard.getByLabel("New connection name")).toHaveValue("Discord Secondary Alerts");

  // Valid rename
  await primaryCard.getByLabel("New connection name").fill("Discord Ops Main");
  const renamePromise = page.waitForResponse((res) => res.request().method() === "PATCH" && res.url().includes(discordCred.credential.id));
  await primaryCard.getByRole("button", { name: "Save name", exact: true }).click();
  expect((await renamePromise).ok()).toBeTruthy();
  await expect(page.getByText('Credential renamed to "Discord Ops Main". Node bindings preserved.')).toBeVisible();
  await expect(primaryCard.locator("strong")).toHaveText("Discord Ops Main");

  // 4. Secret rotation test
  await primaryCard.getByRole("button", { name: "Rotate secret for Discord Ops Main" }).click();
  await expect(primaryCard.getByText("Existing secret values cannot be displayed for security. Enter a complete replacement secret.")).toBeVisible();

  // Try invalid JSON
  await primaryCard.getByLabel("Replacement secret JSON").fill("not-json");
  await primaryCard.getByRole("button", { name: "Rotate secret", exact: true }).click();
  await expect(primaryCard.locator('p[role="alert"]')).toContainText(/not valid JSON|Secret JSON is invalid/);

  // Valid rotation
  await primaryCard.getByLabel("Replacement secret JSON").fill('{"webhookUrl":"https://discord.com/api/webhooks/111/token-rotated"}');
  const rotatePromise = page.waitForResponse((res) => res.request().method() === "PATCH" && res.url().includes(discordCred.credential.id));
  await primaryCard.getByRole("button", { name: "Rotate secret", exact: true }).click();
  expect((await rotatePromise).ok()).toBeTruthy();
  await expect(page.getByText('Secret rotated for "Discord Ops Main". Node bindings preserved.')).toBeVisible();

  // Close credential manager to bind node
  await page.getByRole("button", { name: "Close credential manager" }).click();

  // 5. Add a Discord webhook node from palette and select this credential
  await page.getByRole("button", { name: /Discord webhook Post a message to a Discord channel/ }).click();
  await expect(page.getByText("Discord webhook added to the draft.")).toBeVisible();

  await expect(page.getByLabel("Discord credential")).toBeVisible();
  await page.getByLabel("Discord credential").selectOption({ label: "Discord Ops Main" });
  await page.getByLabel("Message content").fill("Testing credential retention");

  // Save the draft with this credential referenced
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved to your workspace.")).toBeVisible();

  // Re-open credential manager
  await page.getByLabel("Manage actions").click();
  await page.getByRole("button", { name: "Credentials" }).click();

  // 6. Safe deletion test: delete must be blocked by the workflow draft reference
  await primaryCard.getByRole("button", { name: "Delete Discord Ops Main" }).click();
  await expect(primaryCard.getByText("Are you sure you want to delete Discord Ops Main? This action cannot be undone.")).toBeVisible();

  const blockedDeletePromise = page.waitForResponse((res) => res.request().method() === "DELETE" && res.url().includes(discordCred.credential.id));
  await primaryCard.getByRole("button", { name: "Confirm delete", exact: true }).click();
  const blockedResponse = await blockedDeletePromise;
  expect(blockedResponse.status()).toBe(409);

  // Assert inline accessible error blocker
  await expect(primaryCard.locator('[role="alert"]')).toContainText("Credential is in use and cannot be deleted.");
  await expect(primaryCard.getByText(/Referenced in workflow: Lifecycle Test Workflow/)).toBeVisible();

  // Cancel deletion view
  await primaryCard.getByRole("button", { name: "Cancel" }).click();

  // 7. Delete unreferenced credential succeeds
  // "Discord Secondary Alerts" is not referenced anywhere in any workflow
  const secondaryCard = page.locator("li.credential-card").filter({ hasText: "Discord Secondary Alerts" });
  await secondaryCard.getByRole("button", { name: "Delete Discord Secondary Alerts" }).click();
  const successfulDeletePromise = page.waitForResponse((res) => res.request().method() === "DELETE");
  await secondaryCard.getByRole("button", { name: "Confirm delete", exact: true }).click();
  expect((await successfulDeletePromise).ok()).toBeTruthy();
  await expect(page.getByText('Credential "Discord Secondary Alerts" deleted.')).toBeVisible();
  await expect(page.locator("li.credential-card").filter({ hasText: "Discord Secondary Alerts" })).toHaveCount(0);

  // 8. Unbind the primary credential from workflow and delete it successfully
  await page.getByRole("button", { name: "Close credential manager" }).click();
  // Clear the credential from the node
  await page.getByLabel("Discord credential").selectOption({ value: "" });
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved to your workspace.")).toBeVisible();

  // Re-open credential manager and delete primary credential
  await page.getByLabel("Manage actions").click();
  await page.getByRole("button", { name: "Credentials" }).click();

  await primaryCard.getByRole("button", { name: "Delete Discord Ops Main" }).click();
  const primaryDeletePromise = page.waitForResponse((res) => res.request().method() === "DELETE" && res.url().includes(discordCred.credential.id));
  await primaryCard.getByRole("button", { name: "Confirm delete", exact: true }).click();
  expect((await primaryDeletePromise).ok()).toBeTruthy();
  await expect(page.getByText('Credential "Discord Ops Main" deleted.')).toBeVisible();
  await expect(page.locator(`li[data-credential-id="${discordCred.credential.id}"]`)).toHaveCount(0);
});
