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
  { slug: "inspect-postgres-rows", name: "Inspect PostgreSQL rows", description: "Read a bounded table page. Choose a schema and table before testing; connect PostgreSQL before a live run.", connection: "PostgreSQL", type: "action.postgres.select", config: { credentialId: "", schema: "public", table: "", limit: 20 }, summary: "PostgreSQL read completed. Rows returned: {{steps.inspect.output.count}}." },
  { slug: "inspect-supabase-rows", name: "Inspect Supabase rows", description: "Read a bounded table page. Choose a table before testing; connect Supabase before a live run.", connection: "Supabase", type: "action.supabase.select", config: { credentialId: "", table: "", limit: 20, rejectUnsafeNumbers: true }, summary: "Supabase read completed. Rows returned: {{steps.inspect.output.count}}." },
  { slug: "inspect-sheet-rows", name: "Inspect spreadsheet rows", description: "Read a range from a spreadsheet. Select your Google connection and spreadsheet before a live run.", connection: "Google", type: "action.google-sheets", config: { credentialId: "", spreadsheetId: "", operation: "read", range: "Sheet1!A1:C20", valueInputOption: "USER_ENTERED" }, summary: "Spreadsheet read completed for range {{steps.inspect.output.range}}." },
  { slug: "find-notion-pages", name: "Find Notion pages", description: "Search pages shared with your Notion integration. Connect Notion before a live run.", connection: "Notion", type: "action.notion.search-pages", config: { credentialId: "", query: "", pageSize: 20 }, summary: "Notion search completed. More pages available: {{steps.inspect.output.hasMore}}." },
  { slug: "inspect-trello-cards", name: "Inspect Trello cards", description: "List open cards on a board. Choose a board before testing; connect Trello before a live run.", connection: "Trello", type: "action.trello.list-cards", config: { credentialId: "", boardId: "", limit: 20, filter: "open" }, summary: "Trello read completed. Cards returned: {{steps.inspect.output.count}}." },
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
        { id: "telegram", type: "action.telegram.message", position: { x: 720, y: 220 }, config: { credentialId: "", destinationType: "dm", chatId: "", text: "Steam daily report for {{steps.steam.output.profile.personaname}}: {{steps.steam.output.summary.totalGames}} games.", parseMode: "" } },
      ],
      edges: [
        { id: "schedule-to-steam", source: "daily-schedule", target: "steam", kind: "success" },
        { id: "steam-to-telegram", source: "steam", target: "telegram", kind: "success" },
      ],
    },
  },
  ...([
    { slug: "ai-structured-gemini-to-chat", provider: "Gemini", type: "action.gemini" },
    { slug: "ai-structured-openai-to-chat", provider: "OpenAI", type: "action.openai" },
  ] as const).map((sample): SystemWorkflowTemplate => ({
    slug: sample.slug,
    name: `${sample.provider} structured summary to Google Chat`,
    description: `Generate a structured summary of sample text. Choose a model before testing; connect ${sample.provider} and a Google Chat webhook for a live run. Live generation can incur provider charges.`,
    tags: ["AI", "Notifications"],
    requiredConnections: [sample.provider, "Google Chat"],
    graph: {
      nodes: [
        { id: "manual", type: "trigger.manual", position: { x: 100, y: 220 }, config: {} },
        { id: "summarize", type: sample.type, position: { x: 400, y: 220 }, config: {
          credentialId: "", model: "", prompt: "Summarize this sample: The weekly report is ready for review.", maxOutputTokens: 256, timeoutMs: 30000,
          outputSchema: { type: "object", properties: { summary: { type: "string" }, priority: { type: "string", enum: ["normal", "high"] } }, required: ["summary", "priority"], additionalProperties: false },
        } },
        { id: "notify", type: "action.google-chat.webhook", position: { x: 700, y: 220 }, config: { credentialId: "", message: "AI summary: {{steps.summarize.output.json.summary}}\nPriority: {{steps.summarize.output.json.priority}}" } },
      ],
      edges: [{ id: "manual-to-summarize", source: "manual", target: "summarize", kind: "success" }, { id: "summarize-to-notify", source: "summarize", target: "notify", kind: "success" }],
    },
  })),
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
    description: `${sample.description} Send a short summary to a Google Chat webhook.`,
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
