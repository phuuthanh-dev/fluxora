import path from "node:path";

/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  // Playwright can start its own dev server while the user's preview stays open.
  ...(process.env.FLUXORA_E2E_NEXT_DIR === "1" ? { distDir: ".next-e2e" } : {}),
};

export default nextConfig;
