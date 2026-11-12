/** Proposed benefits only. They are not payment terms or enforced limits. */
export const planCatalog = {
  FREE: { name: "Free", priceVnd: 0, monthlyRuns: 1000, activeWorkflows: 5, workspaces: 1, concurrentRuns: 1 },
  STARTER: { name: "Starter", priceVnd: 99000, monthlyRuns: 3000, activeWorkflows: 15, workspaces: 2, concurrentRuns: 2 },
  PRO: { name: "Pro", priceVnd: 199000, monthlyRuns: 10000, activeWorkflows: 50, workspaces: 3, concurrentRuns: 3 },
} as const;

export type PlanCode = keyof typeof planCatalog;

export function effectivePlan(plan: string | null, expiresAt: Date | null, now = new Date()): PlanCode {
  return (plan === "STARTER" || plan === "PRO") && expiresAt !== null && expiresAt > now ? plan : "FREE";
}
