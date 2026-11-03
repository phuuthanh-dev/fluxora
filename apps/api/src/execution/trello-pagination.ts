/** Trello documents before/since as dates derived from card IDs. IDs carry
 * creation time only to the second, so a boundary with equal timestamps
 * cannot safely advance using that date. Ordering is checked on the received
 * page but cannot prove the provider returned every matching card. */
export function trelloPageBoundary(ids: string[], pageSize: number, before?: string) {
  const timestamps = ids.map((id) => Number.parseInt(id.slice(0, 8), 16));
  const cutoff = before ? Number.parseInt(before.slice(0, 8), 16) : undefined;
  if (cutoff !== undefined && timestamps.some((time) => time >= cutoff)) return { invalidCutoff: true, nextBefore: null, warning: "" };
  if (ids.length <= pageSize) return { invalidCutoff: false, nextBefore: null, warning: "" };
  const distinct = new Set(ids.map((id) => id.toLowerCase())).size === ids.length;
  const ordered = timestamps.every((time, index) => index === 0 || timestamps[index - 1]! >= time);
  const separated = timestamps[pageSize - 1]! > timestamps[pageSize]!;
  if (!distinct || !ordered || !separated) return { invalidCutoff: false, nextBefore: null, warning: "Trello returned an ambiguous page boundary. Further pages could skip or repeat cards; refine the selection or use a card ID." };
  return { invalidCutoff: false, nextBefore: ids[pageSize - 1]!, warning: "Trello results can change between requests; ordering and completeness across pages are not guaranteed." };
}
