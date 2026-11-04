import { expect, test, type Page } from "@playwright/test";

async function mockWorkspace(page: Page) {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [
      { id: "workspace-1", name: "First workspace", slug: "first", role: "OWNER" },
      { id: "workspace-2", name: "Other workspace", slug: "second", role: "OWNER" },
    ] });
    if (path.endsWith("/credentials")) return send({ credentials: [] });
    return route.continue();
  });
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [375, 1440]) {
    test(`Google recovery is readable in ${theme} at ${width}px`, async ({ page }, testInfo) => {
      await page.addInitScript((value) => localStorage.setItem("fluxora-theme", value), theme);
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await mockWorkspace(page);
      await page.goto("/dashboard/connections?workspace=workspace-1&google_oauth=missing_refresh");
      const notice = page.getByRole("alert").filter({ hasText: "Google connection needs another try" });
      await expect(notice).toBeVisible();
      await expect(notice).toContainText("Any existing connection was not changed");
      await expect(notice.getByRole("button", { name: "Try Google again" })).toBeVisible();
      await expect(page.getByText(/Google requests access to view, create, edit and delete files/)).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const bounds = await notice.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
      await page.screenshot({ path: testInfo.outputPath(`google-recovery-${theme}-${width}.png`) });
      await notice.getByRole("button", { name: "Dismiss" }).click();
      await expect(notice).toHaveCount(0);
      await expect(page).toHaveURL(/workspace=workspace-1$/);
    });
  }
}

test("Google recovery retry uses the verified workspace and makes no provider request itself", async ({ page }) => {
  await mockWorkspace(page);
  let requested = "";
  await page.route("**/credentials/google/connect", async (route) => {
    requested = route.request().url();
    await route.fulfill({ status: 200, contentType: "text/html", body: "Synthetic OAuth start" });
  });
  await page.goto("/dashboard/connections?workspace=workspace-1&google_oauth=missing_refresh");
  await page.getByRole("button", { name: "Try Google again" }).click();
  await expect.poll(() => requested).toContain("/workspaces/workspace-1/credentials/google/connect");
});

test("legacy Gmail rebind explains activation, checkpoint and potential message gap", async ({ page }) => {
  await mockWorkspace(page);
  await page.goto("/dashboard/connections?workspace=workspace-1&google_oauth=legacy_identity_unknown&kind=gmail&credentialId=legacy-1");
  const notice = page.getByRole("alert").filter({ hasText: "original account cannot be verified" });
  await expect(notice).toContainText("deactivate before publishing");
  await expect(notice).toContainText("Reactivation creates a new checkpoint");
  await expect(notice).toContainText("may not be processed");
  await expect(notice.getByRole("button", { name: "Add new connection" })).toBeVisible();
  await expect(page.getByText(/Google may combine returned permissions with prior grants/)).toBeVisible();
});

test("Redis failure explains the shared state service and provides a retry", async ({ page }) => {
  await mockWorkspace(page);
  await page.goto("/dashboard/connections?workspace=workspace-1&google_oauth=redis_unavailable&kind=google");
  const notice = page.getByRole("alert").filter({ hasText: "Redis" });
  await expect(notice).toContainText("restore the shared Redis service");
  await expect(notice.getByRole("button", { name: "Try Google again" })).toBeVisible();
});

test("Gmail asks for additional capabilities only when selected", async ({ page }) => {
  await mockWorkspace(page);
  let requested = "";
  await page.route("**/credentials/gmail/connect?**", async (route) => {
    requested = route.request().url();
    await route.fulfill({ status: 200, contentType: "text/html", body: "Synthetic OAuth start" });
  });
  await page.goto("/dashboard/connections?workspace=workspace-1");
  await page.getByLabel("Provider", { exact: true }).selectOption("EMAIL");
  await expect(page.getByLabel("Read messages (restricted; required)")).toBeChecked();
  await expect(page.getByLabel("Send email (sensitive)")).not.toBeChecked();
  await page.getByLabel("Send email (sensitive)").check();
  await page.getByLabel("Manage labels (non-sensitive)").check();
  await expect(page.getByText(/Google verification is required for public apps/)).toBeVisible();
  await page.getByRole("button", { name: "Connect Gmail" }).click();
  await expect.poll(() => requested).not.toBe("");
  expect(new URL(requested).searchParams.get("capabilities")).toBe("readonly,send,labels");
});

test("Gmail reconnect shows previously selected capabilities", async ({ page }) => {
  await mockWorkspace(page);
  await page.route("**/workspaces/workspace-1/credentials", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ credentials: [{ id: "gmail-1", provider: "GMAIL", label: "Work Gmail", isManaged: true, gmailCapabilities: ["readonly", "send"] }] }) }));
  await page.goto("/dashboard/connections?workspace=workspace-1");
  const card = page.locator('li[data-credential-id="gmail-1"]');
  await expect(card.getByLabel("Send email (sensitive)")).toBeChecked();
  await expect(card.getByLabel("Manage drafts and send (restricted)")).not.toBeChecked();
  await expect(card.getByRole("button", { name: "Reconnect Google" })).toBeVisible();
});

test("retry retains the selected Gmail permissions and target", async ({ page }) => {
  await mockWorkspace(page);
  let requested = "";
  await page.route("**/credentials/gmail/connect?**", async (route) => {
    requested = route.request().url();
    await route.fulfill({ status: 200, contentType: "text/html", body: "Synthetic OAuth start" });
  });
  await page.goto("/dashboard/connections?workspace=workspace-1&google_oauth=scope_missing&kind=gmail&credentialId=gmail-1&capabilities=readonly%2Csend");
  await page.getByRole("button", { name: "Try Google again" }).click();
  await expect.poll(() => requested).not.toBe("");
  const query = new URL(requested).searchParams;
  expect(query.get("credentialId")).toBe("gmail-1");
  expect(query.get("capabilities")).toBe("readonly,send");
});

test("a changed refresh grant prompts the owner to reconnect", async ({ page }) => {
  await mockWorkspace(page);
  await page.route("**/workspaces/workspace-1/credentials", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ credentials: [{ id: "gmail-1", provider: "GMAIL", label: "Work Gmail", isManaged: true, gmailCapabilities: ["readonly"], googleReconnectRequired: true }] }) }));
  await page.goto("/dashboard/connections?workspace=workspace-1");
  const card = page.locator('li[data-credential-id="gmail-1"]');
  await expect(card.getByRole("status")).toContainText("Reconnect this account before the current token expires");
});

test("legacy Google connections offer an explicit verification reconnect without removing existing access", async ({ page }) => {
  await mockWorkspace(page);
  await page.route("**/workspaces/workspace-1/credentials", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ credentials: [{ id: "legacy-google", provider: "GOOGLE", label: "Google OAuth", isManaged: true, googleLegacyScopesUnverified: true }] }) }));
  await page.goto("/dashboard/connections?workspace=workspace-1");
  const card = page.locator('li[data-credential-id="legacy-google"]');
  await expect(card.getByRole("status")).toContainText("Existing workflows continue under Google’s permissions");
  await expect(card.getByRole("button", { name: "Reconnect Google" })).toBeVisible();
});
