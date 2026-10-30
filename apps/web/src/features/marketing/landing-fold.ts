/** Adapted from the owner-supplied Relay foldBox: rectangle → square → logo. */
export function relayFoldBox(
  grow: number,
  width: number,
  height: number,
  tile: number,
  radius = 32,
) {
  const g = Math.max(0, Math.min(1, grow));
  const square = Math.max(tile, Math.min(width, height));
  if (g < 0.5) {
    const side = tile + (square - tile) * g * 2;
    return { width: side, height: side, radius: side * (24 / 76) };
  }
  const t = g * 2 - 1;
  return {
    width: square + (width - square) * t,
    height: square + (height - square) * t,
    radius: square * (24 / 76) * (1 - t) + radius * t,
  };
}
