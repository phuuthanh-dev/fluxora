/** The guided builder edits only queries it can reproduce without changing meaning. */
export const driveSearchTypes = {
  any: "",
  document: "application/vnd.google-apps.document",
  spreadsheet: "application/vnd.google-apps.spreadsheet",
  folder: "application/vnd.google-apps.folder",
  pdf: "application/pdf",
} as const;

export type DriveSearchType = keyof typeof driveSearchTypes;
export type DriveSearch = { name: string; type: DriveSearchType; folder: string };

export function buildDriveSearch(search: DriveSearch): string {
  if (search.name.length > 256 || /[\u0000-\u001f\u007f]/.test(search.name) || search.name.includes("{{")) {
    throw new Error("Use up to 256 characters without control characters or expressions. Use advanced query for expressions.");
  }
  if (!Object.hasOwn(driveSearchTypes, search.type)) throw new Error("Choose a supported file type.");
  if (search.folder && !/^[A-Za-z0-9_-]{1,256}$/.test(search.folder)) throw new Error("Choose a folder or enter a valid folder ID.");
  const clauses: string[] = [];
  if (search.name) clauses.push(`name contains '${search.name.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`);
  if (search.type !== "any") clauses.push(`mimeType = '${driveSearchTypes[search.type]}'`);
  if (search.folder) clauses.push(`'${search.folder}' in parents`);
  return clauses.join(" and ");
}

export function parseDriveSearch(query: string): DriveSearch | null {
  if (query.length > 2048) return null;
  const match = /^(?:name contains '((?:\\['\\]|[^'\\])*)')?(?: and )?(?:mimeType = '([^']+)')?(?: and )?(?:'([A-Za-z0-9_-]{1,256})' in parents)?$/.exec(query);
  if (!match) return null;
  const type = (Object.keys(driveSearchTypes) as DriveSearchType[]).find((key) => driveSearchTypes[key] === (match[2] ?? ""));
  if (!type) return null;
  const search: DriveSearch = { name: (match[1] ?? "").replace(/\\(['\\])/g, "$1"), type, folder: match[3] ?? "" };
  try { return buildDriveSearch(search) === query ? search : null; } catch { return null; }
}
