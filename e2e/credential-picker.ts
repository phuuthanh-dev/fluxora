import { expect, type Page } from "@playwright/test";

export async function selectProvider(page: Page, label: string) {
  const picker = page.locator(".credential-provider-picker");
  const details = picker.locator("details");
  await expect(details).toBeVisible();
  if ((await details.getAttribute("open")) === null) await details.locator("summary").click();
  await picker.getByRole("button", { name: label, exact: true }).click();
}
