import { expect, test } from "@playwright/test";

const api = `http://localhost:${process.env.E2E_API_PORT ?? "3001"}/api/v1`;

test("credential lifecycle: create with conflict handling, rename, secret rotation, in-use delete blocking, and unreferenced deletion", async ({ page }) => {
  // Registration, workflow creation and the complete credential lifecycle share
  // one journey; individual assertions retain their normal timeout.
  test.setTimeout(60_000);
  const email = `cred-lifecycle-${Date.now()}@example.test`;
  await page.goto("/login");

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
  const createdWorkflowRes = await (await createPromise).json() as { workflow: { id: string; workspaceId: string } };
  const workspaceId = createdWorkflowRes.workflow.workspaceId;

  await expect(page).toHaveURL(/\/editor\?workflow=/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Lifecycle Test Workflow" })).toBeVisible();

  // Open credential manager
  await page.getByLabel("Manage actions").click();
  await page.getByRole("button", { name: "Credentials" }).click();

  // Secret visibility is per field and only affects the unsaved draft.
  await page.getByLabel("Provider").selectOption("TRELLO");
  const trelloKey = page.getByLabel("Trello API key", { exact: true });
  const trelloToken = page.getByLabel("Trello token", { exact: true });
  await trelloKey.fill("sample-key");
  await trelloToken.fill("sample-token");
  await expect(trelloKey).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show Trello API key" }).click();
  await expect(trelloKey).toHaveAttribute("type", "text");
  await expect(trelloToken).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Hide Trello API key" }).click();
  await expect(trelloKey).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show Trello API key" }).click();
  await page.getByLabel("Provider").selectOption("DISCORD_WEBHOOK");
  await page.getByLabel("Provider").selectOption("TRELLO");
  await expect(page.getByLabel("Trello API key", { exact: true })).toHaveAttribute("type", "password");
  const savedKey = "fixture_trello_api_key_123456789ab";
  const savedToken = "fixture_trello_token_123456789xy";
  await page.getByLabel("Trello API key", { exact: true }).fill(savedKey);
  await page.getByLabel("Trello token", { exact: true }).fill(savedToken);
  await page.getByLabel("Connection name", { exact: true }).fill("Trello visibility test");
  const trelloSave = page.waitForResponse((res) => res.request().method() === "POST" && res.url().includes("/credentials"));
  await page.getByRole("button", { name: "Encrypt & save" }).click();
  const trelloSaveResponse = await trelloSave;
  expect(trelloSaveResponse.headers()["cache-control"]).toContain("no-store");
  const trelloResponse = await trelloSaveResponse.json();
  expect(JSON.stringify(trelloResponse)).not.toContain(savedKey);
  expect(JSON.stringify(trelloResponse)).not.toContain(savedToken);
  const trelloCard = page.locator("li.credential-card").filter({ hasText: "Trello visibility test" });
  await expect(trelloCard.getByText("••••••ab")).toBeVisible();
  await expect(trelloCard.getByText("••••••xy")).toBeVisible();
  await trelloCard.getByLabel("Actions for Trello visibility test actions").click();
  await trelloCard.getByRole("button", { name: "Delete Trello visibility test" }).click();
  await trelloCard.getByRole("button", { name: "Confirm delete" }).click();
  await expect(trelloCard).toHaveCount(0);
  await page.getByLabel("Provider").selectOption("MONGODB");
  await page.getByLabel("Configuration type").selectOption("connectionString");
  await page.getByLabel("Connection string", { exact: true }).fill("mongodb+srv://example.test");
  await page.getByRole("button", { name: "Show Connection string" }).click();
  await expect(page.getByLabel("Connection string", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide Connection string" }).click();
  await expect(page.getByLabel("Connection string", { exact: true })).toHaveAttribute("type", "password");

  await page.getByRole("button", { name: "Edit JSON", exact: true }).click();

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

  // Credential actions are grouped in a compact, accessible menu.
  const primaryCard = page.locator(`li[data-credential-id="${discordCred.credential.id}"]`);
  await expect(primaryCard).toBeVisible();
  const openActions = async (name: string) => {
    await primaryCard.getByLabel("Actions for Discord Primary Alerts actions").click();
    await expect(primaryCard.getByRole("menu")).toBeVisible();
    await primaryCard.getByRole("button", { name }).click();
  };

  // 3. Rename credential conflict test
  await openActions("Rename Discord Primary Alerts");
  await expect(primaryCard.getByText("Not used by any current workflow or active execution.")).toBeVisible();
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
  await primaryCard.getByLabel("Actions for Discord Ops Main actions").click();
  await primaryCard.getByRole("button", { name: "Rotate secret for Discord Ops Main" }).click();
  await expect(primaryCard.getByText("Existing secret values cannot be displayed for security. Enter all replacement values. The advanced JSON option preserves custom fields.")).toBeVisible();

  const replacementUrl = primaryCard.getByLabel("Webhook URL", { exact: true });
  await expect(replacementUrl).toHaveValue("");
  await replacementUrl.fill("https://discord.com/api/webhooks/111/sample");
  await primaryCard.getByRole("button", { name: "Show Webhook URL" }).click();
  await expect(replacementUrl).toHaveAttribute("type", "text");
  await primaryCard.getByRole("button", { name: "Hide Webhook URL" }).click();
  await expect(replacementUrl).toHaveAttribute("type", "password");

  await primaryCard.getByRole("button", { name: "Edit JSON", exact: true }).click();

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
  await page.getByLabel("Search apps and operations").fill("Discord");
  await page.getByRole("button", { name: /Discord: Send webhook message/ }).click();
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
  await primaryCard.getByLabel("Actions for Discord Ops Main actions").click();
  await primaryCard.getByRole("button", { name: "Delete Discord Ops Main" }).click();
  await expect(primaryCard.getByText("Current workflows")).toBeVisible();
  await expect(primaryCard.getByText("draft", { exact: true })).toBeVisible();
  await expect(primaryCard.getByText("Are you sure you want to delete Discord Ops Main? This action cannot be undone.")).toBeVisible();

  const blockedDeletePromise = page.waitForResponse((res) => res.request().method() === "DELETE" && res.url().includes(discordCred.credential.id));
  await primaryCard.getByRole("button", { name: "Confirm delete", exact: true }).click();
  const blockedResponse = await blockedDeletePromise;
  expect(blockedResponse.status()).toBe(409);

  // Assert inline accessible error blocker
  await expect(primaryCard.locator('[role="alert"]')).toContainText("Credential is in use and cannot be deleted.");
  await expect(primaryCard.getByText("Lifecycle Test Workflow", { exact: true })).toBeVisible();

  // Cancel deletion view
  await primaryCard.getByRole("button", { name: "Cancel" }).click();

  // 7. Delete unreferenced credential succeeds
  // "Discord Secondary Alerts" is not referenced anywhere in any workflow
  const secondaryCard = page.locator("li.credential-card").filter({ hasText: "Discord Secondary Alerts" });
  await secondaryCard.getByLabel("Actions for Discord Secondary Alerts actions").click();
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

  await primaryCard.getByLabel("Actions for Discord Ops Main actions").click();
  await primaryCard.getByRole("button", { name: "Delete Discord Ops Main" }).click();
  const primaryDeletePromise = page.waitForResponse((res) => res.request().method() === "DELETE" && res.url().includes(discordCred.credential.id));
  await primaryCard.getByRole("button", { name: "Confirm delete", exact: true }).click();
  expect((await primaryDeletePromise).ok()).toBeTruthy();
  await expect(page.getByText('Credential "Discord Ops Main" deleted.')).toBeVisible();
  await expect(page.locator(`li[data-credential-id="${discordCred.credential.id}"]`)).toHaveCount(0);

  // 9. Google OAuth protection and manual "OAuth backup" test
  // Verify manual create of canonical Google OAuth is rejected with CREDENTIAL_MANAGED_BY_OAUTH
  const rejectedOAuthCreateRes = await page.request.post(`${api}/workspaces/${workspaceId}/credentials`, {
    data: { provider: "GOOGLE", label: "Google OAuth", data: { accessToken: "manual" } },
  });
  expect(rejectedOAuthCreateRes.status()).toBe(400);
  const rejectedOAuthCreateBody = (await rejectedOAuthCreateRes.json()) as { code: string };
  expect(rejectedOAuthCreateBody.code).toBe("CREDENTIAL_MANAGED_BY_OAUTH");

  // Create a manual Google credential named "OAuth backup" (must be permitted)
  const oauthBackupRes = await page.request.post(`${api}/workspaces/${workspaceId}/credentials`, {
    data: { provider: "GOOGLE", label: "OAuth backup", data: { accessToken: "backup-token" } },
  });
  expect(oauthBackupRes.ok()).toBeTruthy();
  const oauthBackupCred = (await oauthBackupRes.json()) as { credential: { id: string } };

  // Verify manual rename of "OAuth backup" to "Google OAuth" is rejected with CREDENTIAL_MANAGED_BY_OAUTH
  const rejectedRenameRes = await page.request.patch(`${api}/workspaces/${workspaceId}/credentials/${oauthBackupCred.credential.id}`, {
    data: { label: "Google OAuth" },
  });
  expect(rejectedRenameRes.status()).toBe(400);
  const rejectedRenameBody = (await rejectedRenameRes.json()) as { code: string };
  expect(rejectedRenameBody.code).toBe("CREDENTIAL_MANAGED_BY_OAUTH");

  // Seed canonical Google OAuth credential directly into database (not via invalid public create API)
  const fs = await import("node:fs");
  if (!process.env.DATABASE_URL && fs.existsSync(".env")) {
    const match = fs.readFileSync(".env", "utf8").match(/^DATABASE_URL="?([^"\n]+)"?/m);
    if (match) process.env.DATABASE_URL = match[1];
  }
  const { PrismaClient } = await import("../apps/api/node_modules/@prisma/client/default.js");
  const prisma = new PrismaClient();
  const googleOAuthCred = await prisma.credential.upsert({
    where: { workspaceId_provider_label: { workspaceId, provider: "GOOGLE", label: "Google OAuth" } },
    create: { workspaceId, provider: "GOOGLE", label: "Google OAuth", encryptedData: "dGVzdC1lbmNyeXB0ZWQtZGF0YQ==" },
    update: {},
  });

  // Re-open credential manager so the list refreshes
  await page.getByRole("button", { name: "Close credential manager" }).click();
  await page.getByLabel("Manage actions").click();
  await page.getByRole("button", { name: "Credentials" }).click();

  // Verify the manual "OAuth backup" card keeps its actions in the compact menu.
  const oauthBackupCard = page.locator(`li[data-credential-id="${oauthBackupCred.credential.id}"]`);
  await expect(oauthBackupCard).toBeVisible();
  await expect(oauthBackupCard.getByText("Managed OAuth")).toHaveCount(0);
  await oauthBackupCard.getByLabel("Actions for OAuth backup actions").click();
  await expect(oauthBackupCard.getByRole("button", { name: "Rename OAuth backup" })).toBeVisible();
  await expect(oauthBackupCard.getByRole("button", { name: "Rotate secret for OAuth backup" })).toBeVisible();
  await expect(oauthBackupCard.getByRole("button", { name: "Delete OAuth backup" })).toBeVisible();

  // Verify the canonical "Google OAuth" card displays managed state and no Rename/Rotate/Delete buttons
  const googleOAuthCard = page.locator(`li[data-credential-id="${googleOAuthCred.id}"]`);
  await expect(googleOAuthCard).toBeVisible();
  await expect(googleOAuthCard.getByText("Managed OAuth")).toBeVisible();
  await expect(googleOAuthCard.getByRole("button", { name: "Reconnect Google" })).toBeVisible();
  await expect(googleOAuthCard.getByRole("button", { name: /Rename/ })).toHaveCount(0);
  await expect(googleOAuthCard.getByRole("button", { name: /Rotate/ })).toHaveCount(0);
  await expect(googleOAuthCard.getByRole("button", { name: /Delete/ })).toHaveCount(0);

  // Direct API regression: direct PATCH must be rejected with CREDENTIAL_MANAGED_BY_OAUTH
  const directPatchRes = await page.request.patch(`${api}/workspaces/${workspaceId}/credentials/${googleOAuthCred.id}`, {
    data: { label: "Hacked Google" },
  });
  expect(directPatchRes.status()).toBe(400);
  const directPatchBody = (await directPatchRes.json()) as { code: string };
  expect(directPatchBody.code).toBe("CREDENTIAL_MANAGED_BY_OAUTH");

  // Direct API regression: direct DELETE must be rejected with CREDENTIAL_MANAGED_BY_OAUTH
  const directDeleteRes = await page.request.delete(`${api}/workspaces/${workspaceId}/credentials/${googleOAuthCred.id}`);
  expect(directDeleteRes.status()).toBe(400);
  const directDeleteBody = (await directDeleteRes.json()) as { code: string };
  expect(directDeleteBody.code).toBe("CREDENTIAL_MANAGED_BY_OAUTH");

  // Clean up manual OAuth backup credential via delete
  await page.request.delete(`${api}/workspaces/${workspaceId}/credentials/${oauthBackupCred.credential.id}`);
  await prisma.$disconnect();

  // 10. Telegram legacy fallback rotation test:
  // Create a legacy Telegram credential with both botToken and chatId
  const legacyTgRes = await page.request.post(`${api}/workspaces/${workspaceId}/credentials`, {
    data: { provider: "TELEGRAM_BOT", label: "Legacy Telegram Ops", data: { botToken: "legacy-token-123", chatId: "-100998877" } },
  });
  expect(legacyTgRes.ok()).toBeTruthy();
  const legacyTgCred = (await legacyTgRes.json()) as { credential: { id: string } };

  // Re-open credential manager to view the new Telegram credential
  await page.getByRole("button", { name: "Close credential manager" }).click();
  await page.getByLabel("Manage actions").click();
  await page.getByRole("button", { name: "Credentials" }).click();

  const legacyTgCard = page.locator(`li[data-credential-id="${legacyTgCred.credential.id}"]`);
  await expect(legacyTgCard).toBeVisible();
  await legacyTgCard.getByLabel("Actions for Legacy Telegram Ops actions").click();
  await legacyTgCard.getByRole("button", { name: "Rotate secret for Legacy Telegram Ops" }).click();

  // Verify UI explainer for Telegram bot token rotation preserving legacy fallback
  await expect(legacyTgCard.getByText(/legacy fallback chat ID stored with this credential will be preserved server-side/)).toBeVisible();

  await legacyTgCard.getByRole("button", { name: "Edit JSON", exact: true }).click();

  // Rotate with payload that omits chatId
  await legacyTgCard.getByLabel("Replacement secret JSON").fill('{"botToken":"new-rotated-token-456"}');
  const tgRotatePromise = page.waitForResponse((res) => res.request().method() === "PATCH" && res.url().includes(legacyTgCred.credential.id));
  await legacyTgCard.getByRole("button", { name: "Rotate secret", exact: true }).click();
  expect((await tgRotatePromise).ok()).toBeTruthy();
  await expect(page.getByText('Secret rotated for "Legacy Telegram Ops". Node bindings preserved.')).toBeVisible();
});
