/** Clear a saved cursor when its list context changes in the inspector. */
export function resetDrivePageToken(config: Record<string, unknown>, key: string, value: unknown) {
  const updated = { ...config, [key]: value };
  if (value === undefined) delete updated[key];
  if (["credentialId", "query", "operation"].includes(key) && config[key] !== value && "pageToken" in config) updated.pageToken = "";
  return updated;
}
