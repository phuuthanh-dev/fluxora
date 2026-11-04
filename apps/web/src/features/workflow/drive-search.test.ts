import assert from "node:assert/strict";
import test from "node:test";
import { buildDriveSearch, parseDriveSearch } from "./drive-search";

test("guided Drive filters round trip without changing escaped names or folder scope", () => {
  const search = { name: "Thanh's \\ report and notes", type: "spreadsheet" as const, folder: "folder_123" };
  const query = buildDriveSearch(search);
  assert.equal(query, "name contains 'Thanh\\'s \\\\ report and notes' and mimeType = 'application/vnd.google-apps.spreadsheet' and 'folder_123' in parents");
  assert.deepEqual(parseDriveSearch(query), search);
  assert.deepEqual(parseDriveSearch(""), { name: "", type: "any", folder: "" });
  for (const partial of [{ name: "test", type: "any", folder: "" }, { name: "", type: "pdf", folder: "" }, { name: "", type: "any", folder: "root" }] as const) assert.deepEqual(parseDriveSearch(buildDriveSearch(partial)), partial);
});

test("advanced Drive queries stay untouched and guided input cannot inject conditions or expressions", () => {
  for (const query of ["trashed = false", "name = 'exact'", "name contains '{{steps.a.output.name}}'", "mimeType = 'custom/type'", "name contains 'a' or trashed = true", "name contains 'broken"]) assert.equal(parseDriveSearch(query), null);
  const escaped = buildDriveSearch({ name: "x' or trashed = true or name = '", type: "any", folder: "" });
  assert.equal(escaped, "name contains 'x\\' or trashed = true or name = \\''");
  assert.throws(() => buildDriveSearch({ name: "{{steps.a.output.name}}", type: "any", folder: "" }));
  assert.throws(() => buildDriveSearch({ name: "", type: "any", folder: "foo' or trashed = true" }));
});
