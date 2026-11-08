import { expect, test } from "@playwright/test";

test("Steam offers the community operations and an owned-game picker with manual fallback", async ({ page }) => {
  const graph = { nodes: [
    { id: "manual", type: "trigger.manual", position: { x: 100, y: 100 }, config: {} },
    { id: "steam", type: "action.steam", position: { x: 400, y: 100 }, config: { credentialId: "steam-1", operation: "profile", steamId: "", vanity: "", appId: "", language: "english" } },
    { id: "snapshot", type: "action.steam.account-snapshot", position: { x: 700, y: 100 }, config: { steamId: "", achievementAppId: "", includeOwnedGames: true, includeRecentGames: true } },
  ], edges: [] };
  const workflow = { id: "steam-test", workspaceId: "workspace-1", name: "Steam test", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  let gameRequests = 0;
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [{ id: "steam-1", provider: "STEAM", label: "My Steam" }] });
    if (path.endsWith("/steam/games")) { gameRequests++; return send({ games: [{ id: "620", name: "Portal 2" }, { id: "570", name: "Dota 2" }], hasMore: false }); }
    if (path.endsWith("/workflows/steam-test")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=steam-test");
  await page.locator('.react-flow__node[data-id="snapshot"]').click();
  await page.getByLabel("Steam ID 64", { exact: true }).fill("invalid");
  await expect(page.getByRole("alert").filter({ hasText: "Enter a valid Steam ID 64 as text." })).toBeVisible();
  await page.getByLabel("Steam ID 64", { exact: true }).fill("76561198000000000");
  await expect(page.getByRole("alert").filter({ hasText: "Enter a valid Steam ID 64 as text." })).toHaveCount(0);
  await page.locator(".react-flow__node").filter({ hasText: "Get user profile" }).click();
  const operation = page.getByLabel("Operation", { exact: true });
  await expect(operation.locator("option")).toHaveCount(8);
  await operation.selectOption("achievements");
  const game = page.getByRole("group", { name: "Game", exact: true });
  await expect(game.getByRole("option", { name: "Portal 2" })).toHaveAttribute("value", "620");
  await game.getByRole("combobox").selectOption("620");
  await expect(game.getByRole("combobox")).toHaveValue("620");
  await game.getByRole("button", { name: /Enter value or expression|Enter game manually/ }).click();
  await game.getByLabel("Game value").fill("570");
  await expect(game.getByLabel("Game value")).toHaveValue("570");
  const requestsAfterGameSelection = gameRequests;
  await operation.selectOption("resolveVanity");
  await expect(page.getByLabel("Profile name or Steam profile URL")).toBeVisible();
  await expect(page.locator(".react-flow__node").filter({ hasText: "Resolve profile URL" })).toBeVisible();
  await expect(game).toHaveCount(0);
  expect(requestsAfterGameSelection).toBeGreaterThan(0);
  expect(gameRequests).toBe(requestsAfterGameSelection);
  await page.getByLabel("Display name", { exact: true }).fill("My Steam step");
  await operation.selectOption("recentGames");
  await expect(page.locator(".react-flow__node").filter({ hasText: "My Steam step" })).toBeVisible();
  await operation.selectOption("gameNews");
  await expect(page.getByLabel("Steam connection")).toHaveCount(0);
  await expect(page.getByLabel("Steam game App ID")).toBeVisible();
  await expect(page.getByText(/No Steam connection is needed/)).toBeVisible();

  const library = page.getByRole("complementary", { name: "Node Library" });
  await library.getByLabel("Search apps and operations").fill("owned games");
  const owned = library.getByRole("button", { name: /Steam: Get owned games/ });
  await expect(owned).toBeVisible();
  await library.getByRole("button", { name: "Add Get owned games to favorites (Steam)" }).click();
  await owned.click();
  await expect(page.getByLabel("Operation", { exact: true })).toHaveValue("ownedGames");
  await expect(page.locator(".react-flow__node").filter({ hasText: "Get owned games" })).toBeVisible();
  await expect(library.getByRole("button", { name: "Remove Get owned games from favorites (Steam)" })).toBeVisible();
  await library.getByLabel("Search apps and operations").fill("badges");
  await library.getByRole("button", { name: /Steam: Get badges/ }).dragTo(page.locator(".react-flow__pane"));
  await expect(page.getByLabel("Operation", { exact: true })).toHaveValue("badges");
  await expect(page.locator(".react-flow__node").filter({ hasText: "Get badges" })).toBeVisible();
  await page.reload();
  const favorites = library.getByRole("region", { name: "Favorites" });
  await favorites.getByRole("button", { name: /Steam: Get owned games/ }).click();
  await expect(page.getByLabel("Operation", { exact: true })).toHaveValue("ownedGames");
});
