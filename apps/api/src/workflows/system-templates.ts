import type { WorkflowGraph } from "@workflow/contracts";

export type SystemWorkflowTemplate = {
  slug: string;
  name: string;
  description: string;
  tags: string[];
  requiredConnections: string[];
  graph: WorkflowGraph;
};

const dataReadSamples = [
  { slug: "inspect-postgres-rows", name: "Inspect PostgreSQL rows", description: "Read a bounded table page. Select your connection, schema and table before a live run.", connection: "PostgreSQL", type: "action.postgres.select.v2", config: { credentialId: "", schema: "public", table: "example_table", limit: 20 }, summary: "PostgreSQL read completed. Rows returned: {{steps.inspect.output.count}}." },
  { slug: "inspect-supabase-rows", name: "Inspect Supabase rows", description: "Read a bounded table page. Select your connection and table before a live run.", connection: "Supabase", type: "action.supabase.select.v2", config: { credentialId: "", table: "example_table", limit: 20 }, summary: "Supabase read completed. Rows returned: {{steps.inspect.output.count}}." },
  { slug: "inspect-sheet-rows", name: "Inspect spreadsheet rows", description: "Read a range from a spreadsheet. Select your Google connection and spreadsheet before a live run.", connection: "Google", type: "action.google-sheets.v2", config: { credentialId: "", spreadsheetId: "", operation: "read", range: "Sheet1!A1:C20", valueInputOption: "USER_ENTERED" }, summary: "Spreadsheet read completed for range {{steps.inspect.output.range}}." },
  { slug: "find-notion-pages", name: "Find Notion pages", description: "Search pages shared with your Notion integration. Connect Notion before a live run.", connection: "Notion", type: "action.notion.search-pages.v2", config: { credentialId: "", query: "", pageSize: 20 }, summary: "Notion search completed. More pages available: {{steps.inspect.output.hasMore}}." },
  { slug: "inspect-trello-cards", name: "Inspect Trello cards", description: "List open cards on a board. Select your Trello connection and board before a live run.", connection: "Trello", type: "action.trello.list-cards", config: { credentialId: "", boardId: "aaaaaaaaaaaaaaaaaaaaaaaa", limit: 20, filter: "open" }, summary: "Trello read completed. Cards returned: {{steps.inspect.output.count}}." },
] as const;

export const systemWorkflowTemplates: SystemWorkflowTemplate[] = [
  {
    slug: "steam-daily-report",
    name: "Steam daily report",
    description: "Send a daily public Steam account snapshot to Google Chat.",
    tags: ["Personal", "Notifications"],
    requiredConnections: ["Steam", "Google Chat"],
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
  {
    slug: "steam-discord-daily-report",
    name: "Steam report to Discord",
    description: "Send a daily public Steam account snapshot to a Discord channel.",
    tags: ["Personal", "Notifications"],
    requiredConnections: ["Steam", "Discord"],
    graph: {
      nodes: [
        { id: "daily-schedule", type: "trigger.cron", position: { x: 100, y: 220 }, config: { expression: "0 9 * * *", timezone: "Asia/Ho_Chi_Minh" } },
        { id: "steam", type: "action.steam.account-snapshot", position: { x: 400, y: 220 }, config: { credentialId: "", steamId: "" } },
        { id: "discord", type: "action.discord.webhook", position: { x: 720, y: 220 }, config: { credentialId: "", content: "Steam daily report for {{steps.steam.output.profile.personaname}}: {{steps.steam.output.summary.totalGames}} games." } },
      ],
      edges: [
        { id: "schedule-to-steam", source: "daily-schedule", target: "steam", kind: "success" },
        { id: "steam-to-discord", source: "steam", target: "discord", kind: "success" },
      ],
    },
  },
  {
    slug: "steam-telegram-daily-report",
    name: "Steam report to Telegram",
    description: "Send a daily public Steam account snapshot to a Telegram chat.",
    tags: ["Personal", "Notifications"],
    requiredConnections: ["Steam", "Telegram"],
    graph: {
      nodes: [
        { id: "daily-schedule", type: "trigger.cron", position: { x: 100, y: 220 }, config: { expression: "0 9 * * *", timezone: "Asia/Ho_Chi_Minh" } },
        { id: "steam", type: "action.steam.account-snapshot", position: { x: 400, y: 220 }, config: { credentialId: "", steamId: "" } },
        { id: "telegram", type: "action.telegram.message", position: { x: 720, y: 220 }, config: { credentialId: "", destinationType: "dm", chatId: "", text: "Steam daily report for {{steps.steam.output.profile.personaname}}: {{steps.steam.output.summary.totalGames}} games.", parseMode: "Markdown" } },
      ],
      edges: [
        { id: "schedule-to-steam", source: "daily-schedule", target: "steam", kind: "success" },
        { id: "steam-to-telegram", source: "steam", target: "telegram", kind: "success" },
      ],
    },
  },
  ...dataReadSamples.map((sample): SystemWorkflowTemplate => ({
    slug: sample.slug, name: sample.name, description: sample.description, tags: ["Data", "Starter"], requiredConnections: [sample.connection],
    graph: {
      nodes: [
        { id: "manual", type: "trigger.manual", position: { x: 100, y: 220 }, config: {} },
        { id: "inspect", type: sample.type, position: { x: 400, y: 220 }, config: { ...sample.config } },
      ],
      edges: [{ id: "manual-to-inspect", source: "manual", target: "inspect", kind: "success" }],
    },
  })),
  ...dataReadSamples.map((sample): SystemWorkflowTemplate => ({
    slug: `${sample.slug}-chat-summary`, name: `${sample.connection} read summary to Google Chat`,
    description: `Read from ${sample.connection} and send a short summary to a Google Chat webhook. Select your connections and resources before running live.`,
    tags: ["Data", "Notifications"], requiredConnections: [sample.connection, "Google Chat"],
    graph: {
      nodes: [
        { id: "manual", type: "trigger.manual", position: { x: 100, y: 220 }, config: {} },
        { id: "inspect", type: sample.type, position: { x: 400, y: 220 }, config: { ...sample.config } },
        { id: "notify", type: "action.google-chat.webhook", position: { x: 700, y: 220 }, config: { credentialId: "", message: sample.summary } },
      ],
      edges: [{ id: "manual-to-inspect", source: "manual", target: "inspect", kind: "success" }, { id: "inspect-to-notify", source: "inspect", target: "notify", kind: "success" }],
    },
  })),
];
