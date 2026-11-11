import { expect, test } from "@playwright/test";
import { safeReturnTo } from "../apps/web/src/features/auth/auth-redirect";

async function register(page: import("@playwright/test").Page) {
  const email = `auth-guards-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const password = "e2e-password-123";
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("Route Test");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Workflows", level: 1 })).toBeVisible();
  return { email, password };
}

test("guest deep link returns after sign-in and authenticated auth routes redirect", async ({ page }) => {
  const { email, password } = await register(page);
  await page.getByLabel("Account actions").click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard/executions?view=example");
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(new URL(page.url()).searchParams.get("next")).toBe("/dashboard/executions?view=example");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/executions\?view=example$/);
  for (const route of ["/login", "/register"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/dashboard$/);
  }
});

test("return destinations reject external URLs and OAuth restores a safe internal path", async ({ page }) => {
  await register(page);
  await page.goto("/login?next=https%3A%2F%2Fevil.example%2F");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.route("**/auth/me", route => route.fulfill({ status: 401, json: { code: "UNAUTHENTICATED" } }));
  await page.route("**/auth/providers", route => route.fulfill({ json: { google: true, github: true } }));
  await page.route("**/auth/google/start", route => route.fulfill({ contentType: "text/html", body: "Local OAuth fixture" }));
  await page.goto("/login?next=%2Fdashboard%2Fexecutions%3Fview%3Doauth");
  await page.getByRole("button", { name: "Google", exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/google\/start$/);
  await page.unroute("**/auth/me");
  await page.goto("/dashboard?auth=google");
  await expect(page).toHaveURL(/\/dashboard\/executions\?view=oauth$/);
});

test("failed logout keeps the session page visible and allows a retry", async ({ page }) => {
  await register(page);
  await page.route("**/auth/logout", route => route.fulfill({ status: 503, json: { message: "Unavailable" } }));
  await page.getByLabel("Account actions").click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("menu", { name: "Account menu" }).getByRole("alert")).toContainText("Could not sign out");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.unroute("**/auth/logout");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("admin rejects guests and shows a dedicated denial for a regular user", async ({ page }) => {
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(new URL(page.url()).searchParams.get("next")).toBe("/admin/users");
  await register(page);
  await page.route("**/admin/access", route => route.fulfill({ status: 403, json: { code: "ADMIN_REQUIRED", message: "Platform administrator access is required." } }));
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Access restricted" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Platform administration" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Back to workspace" })).toBeVisible();
});

test("session check distinguishes server errors from an absent session", async ({ page }) => {
  await page.route("**/auth/me", route => route.fulfill({ status: 503, json: { message: "Unavailable" } }));
  await page.goto("/login");
  await expect(page.locator(".auth-card").getByRole("alert")).toContainText("Unable to check your session");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toHaveCount(0);
  await page.unroute("**/auth/me");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

test("a malformed successful session response is not treated as an authenticated user", async ({ page }) => {
  await page.route("**/auth/me", route => route.fulfill({ status: 200, json: {} }));
  await page.goto("/login");
  await expect(page.locator(".auth-card").getByRole("alert")).toContainText("Unable to check your session");
  await expect(page).toHaveURL(/\/login$/);
});

test("cancelled OAuth keeps its safe return destination when switching auth forms", async ({ page }) => {
  await page.route("**/auth/providers", route => route.fulfill({ json: { google: true, github: true } }));
  await page.route("**/auth/google/start", route => route.fulfill({ contentType: "text/html", body: "Local OAuth fixture" }));
  await page.goto("/login?next=%2Fdashboard%2Fexecutions");
  await page.getByRole("button", { name: "Google", exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/google\/start$/);
  await page.goto("/login?authError=google_cancelled");
  await expect(page.locator(".auth-card").getByRole("alert")).toContainText("cancelled");
  await page.getByRole("button", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/register\?next=/);
  expect(new URL(page.url()).searchParams.get("next")).toBe("/dashboard/executions");
});

test("return paths reject external and encoded authority tricks", () => {
  for (const unsafe of ["https://evil.example", "//evil.example", "/\\evil.example", "/%2f%2fevil.example", "/dashboard/%5c%5cevil.example", "/dashboard/../../login", "/dashboardish"]) expect(safeReturnTo(unsafe)).toBe("/dashboard");
  expect(safeReturnTo("/editor?workflow=example#node")).toBe("/editor?workflow=example#node");
});

test("expired session during an operation returns to login", async ({ page }) => {
  await register(page);
  await page.route("**/auth/me", route => route.fulfill({ status: 401, json: { code: "UNAUTHENTICATED" } }));
  await page.route("**/execution-activity", route => route.fulfill({ status: 401, json: { code: "UNAUTHENTICATED", message: "Session no longer valid." } }));
  await page.getByRole("button", { name: "Refresh workspace activity" }).click();
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(new URL(page.url()).searchParams.get("next")).toBe("/dashboard");
});
