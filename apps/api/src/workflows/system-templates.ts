import type { WorkflowGraph } from "@workflow/contracts";

export type SystemWorkflowTemplate = {
  slug: string;
  name: string;
  description: string;
  graph: WorkflowGraph;
};

export const systemWorkflowTemplates: SystemWorkflowTemplate[] = [
  {
    slug: "steam-daily-report",
    name: "Steam daily report",
    description: "Send a daily public Steam account snapshot to Google Chat.",
    graph: {
      nodes: [
        { id: "daily-schedule", type: "trigger.cron", position: { x: 100, y: 220 }, config: { expression: "0 9 * * *", timezone: "Asia/Ho_Chi_Minh" } },
        { id: "steam", type: "action.steam.account-snapshot", position: { x: 400, y: 220 }, config: { credentialId: "", steamId: "" } },
        { id: "google-chat", type: "action.google-chat.webhook", position: { x: 720, y: 220 }, config: { credentialId: "", message: "Steam daily report for {{steps.steam.output.profile.personaname}}: {{steps.steam.output.summary.totalGames}} games." } },
      ],
      edges: [
        { id: "schedule-to-steam", source: "daily-schedule", target: "steam", kind: "success" },
        { id: "steam-to-chat", source: "steam", target: "google-chat", kind: "success" },
      ],
    },
  },
];
