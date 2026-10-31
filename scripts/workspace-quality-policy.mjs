export function qualityCommands(scripts = {}) {
  const commands = [];
  if (scripts.typecheck) commands.push("typecheck");
  // Lifecycle hooks may add work even when the main commands match.
  if (scripts.lint && (scripts.lint !== scripts.typecheck || scripts.prelint || scripts.postlint || scripts.pretypecheck || scripts.posttypecheck)) commands.push("lint");
  return commands;
}
