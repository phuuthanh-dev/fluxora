import { expect, test } from "@playwright/test";

test("configure Discord and Telegram notification nodes with encrypted credentials and mock run", async ({ page }) => {
  const email = `notifications-e2e-${Date.now()}@example.test`;
  await page.goto("/login");

  // Sign up
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.locator('input[autocomplete="name"]').fill("Notification Tester");
  await page.locator('input[autocomplete="email"]').fill(email);
  await page.locator('input[autocomplete="new-password"]').fill("test-password-123");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Execution runtime ready")).toBeVisible();

  // Create a blank workflow from dashboard
  await page.getByRole("textbox", { name: "New workflow name" }).fill("Notification Pipeline");
  const createPromise = page.waitForResponse((res) => res.request().method() === "POST" && res.url().includes("/workflows"));
  await page.getByRole("button", { name: "Blank workflow" }).click();
  expect((await createPromise).ok()).toBeTruthy();

  await expect(page).toHaveURL(/\/editor\?workflow=/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Notification Pipeline" })).toBeVisible();

  // Open credential manager and create Discord Webhook credential
  await page.getByLabel("Manage actions").click();
  await page.getByRole("button", { name: "Credentials" }).click();

  await page.getByLabel("Provider").selectOption("DISCORD_WEBHOOK");
  await expect(page.getByRole("textbox", { name: "Connection name" })).toHaveValue("Discord incoming webhook");
  await expect(page.getByRole("textbox", { name: "Secret JSON" })).toContainText('"webhookUrl"');
  await expect(page.getByText("Paste the webhook URL from your Discord channel integrations.")).toBeVisible();

  await page.getByRole("textbox", { name: "Connection name" }).fill("Discord Alerts");
  await page.getByRole("textbox", { name: "Secret JSON" }).fill('{"webhookUrl":"https://discord.com/api/webhooks/123/fake-token"}');
  const discordPromise = page.waitForResponse((res) => res.request().method() === "POST" && res.url().includes("/credentials"));
  await page.getByRole("button", { name: "Encrypt & save" }).click();
  const discordCred = (await (await discordPromise).json()) as { credential: { id: string } };
  await expect(page.getByText("Credential encrypted and saved. Select it from a compatible node in the editor.")).toBeVisible();

  // Create Telegram Bot credential
  await page.getByLabel("Provider").selectOption("TELEGRAM_BOT");
  await expect(page.getByRole("textbox", { name: "Connection name" })).toHaveValue("Telegram bot");
  await expect(page.getByRole("textbox", { name: "Secret JSON" })).toContainText('"botToken"');
  await expect(page.getByText("Enter your Telegram Bot API token from @BotFather. Destination Chat ID is configured on the Telegram message node (credential chatId is deprecated).")).toBeVisible();

  await page.getByRole("textbox", { name: "Connection name" }).fill("Telegram Ops Bot");
  await page.getByRole("textbox", { name: "Secret JSON" }).fill('{"botToken":"123456:FAKE-BOT-TOKEN","chatId":"-100987654321"}');
  const telegramPromise = page.waitForResponse((res) => res.request().method() === "POST" && res.url().includes("/credentials"));
  await page.getByRole("button", { name: "Encrypt & save" }).click();
  const telegramCred = (await (await telegramPromise).json()) as { credential: { id: string } };
  await expect(page.getByText("Credential encrypted and saved. Select it from a compatible node in the editor.")).toBeVisible();

  await page.getByRole("button", { name: "Close credential manager" }).click();

  // Add Discord webhook node from palette
  await page.getByLabel("Search apps and operations").fill("Discord");
  await page.getByRole("button", { name: /Discord: Send webhook message/ }).click();
  await expect(page.getByText("Discord webhook added to the draft.")).toBeVisible();

  // Configure Discord node in inspector
  await expect(page.getByLabel("Discord credential")).toBeVisible();
  await page.getByLabel("Discord credential").selectOption({ label: "Discord Alerts" });
  await page.getByLabel("Message content").fill("Deploy completed for {{ steps.trigger.output.service }}");
  await page.getByLabel("Username (optional)").fill("CI-Bot");
  await page.getByLabel("Allowed mentions JSON (optional)").fill('{"parse":["users"]}');

  // Add Telegram message node from palette
  await page.getByLabel("Search apps and operations").fill("Telegram");
  await page.getByRole("button", { name: /Telegram: Send message/ }).click();
  await expect(page.getByText("Telegram message added to the draft.")).toBeVisible();

  // Configure Telegram node in inspector
  await expect(page.getByLabel("Telegram credential")).toBeVisible();
  await page.getByLabel("Telegram credential").selectOption({ label: "Telegram Ops Bot" });
  await expect(page.getByLabel("Telegram destination type")).toHaveValue("dm");
  await page.getByLabel("Telegram destination type").selectOption("supergroup");
  await expect(page.getByLabel(/Supergroup chat ID/)).toBeVisible();
  await expect(page.getByLabel("Topic / thread ID (optional)")).toBeVisible();
  await page.getByLabel(/Supergroup chat ID/).fill("-1004413027775");
  await page.getByLabel("Message text").fill("Status update: All systems operational");

  // Save the draft with added nodes
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved to your workspace.")).toBeVisible();

  // Import connected graph to test end-to-end execution path
  const connectedGraph = {
    nodes: [
      {
        id: "manual",
        type: "workflowNode",
        position: { x: 100, y: 150 },
        data: {
          nodeType: "trigger.manual",
          label: "Manual trigger",
          description: "Start a test run from the editor.",
          category: "trigger",
          config: {},
          available: true,
        },
      },
      {
        id: "discord-node",
        type: "workflowNode",
        position: { x: 400, y: 150 },
        data: {
          nodeType: "action.discord.webhook",
          label: "Discord webhook",
          description: "Post a message to a Discord channel via incoming webhook.",
          category: "action",
          config: { credentialId: discordCred.credential.id, content: "Deploy notification" },
          available: true,
        },
      },
      {
        id: "telegram-node",
        type: "workflowNode",
        position: { x: 700, y: 150 },
        data: {
          nodeType: "action.telegram.message",
          label: "Telegram message",
          description: "Send a message via Telegram Bot API.",
          category: "action",
          config: { credentialId: telegramCred.credential.id, text: "System alert" },
          available: true,
        },
      },
    ],
    edges: [
      {
        id: "edge-1",
        source: "manual",
        target: "discord-node",
        kind: "success",
        sourceHandle: "success",
      },
      {
        id: "edge-2",
        source: "discord-node",
        target: "telegram-node",
        kind: "success",
        sourceHandle: "success",
      },
    ],
  };

  await page.locator('input[type="file"]').setInputFiles({
    name: "workflow.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(connectedGraph)),
  });
  await expect(page.getByText("Workflow JSON imported into a fresh local draft.")).toBeVisible();

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved to your workspace.")).toBeVisible();

  // Run test (mock run)
  await page.getByRole("button", { name: "Run test" }).click();
  await expect(page.getByText(/Mock execution succeeded/i)).toBeVisible({ timeout: 15_000 });

  // Inspect Discord node output in execution result
  await page.getByRole("heading", { name: "Send webhook message", exact: true }).click();
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue("Discord webhook");
  await expect(page.getByRole("region", { name: "Last execution" }).getByText(/SUCCEEDED · ATTEMPT/i)).toBeVisible();
  await expect(page.locator(".result-view").getByText("delivered", { exact: true })).toBeVisible();
  await expect(page.locator(".result-view").getByText(": mock", { exact: true })).toBeVisible();
  await expect(page.locator(".result-view").getByText("destination", { exact: true })).toBeVisible();

  // Inspect Telegram node output in execution result
  await page.getByRole("heading", { name: "Send message", exact: true }).click();
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue("Telegram message");
  await expect(page.getByRole("region", { name: "Last execution" }).getByText(/SUCCEEDED · ATTEMPT/i)).toBeVisible();
  await expect(page.locator(".result-view").getByText("delivered", { exact: true })).toBeVisible();
  await expect(page.locator(".result-view").getByText(": mock", { exact: true })).toBeVisible();
  await expect(page.locator(".result-view").getByText("destination", { exact: true })).toBeVisible();
});
