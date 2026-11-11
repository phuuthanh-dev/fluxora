-- Existing registrations were restricted to one webhook trigger per
-- workflow. Backfill only unambiguous stored graphs; unknown legacy records
-- remain null and are never attributed by guessing.
ALTER TABLE "WebhookEndpoint" ADD COLUMN "triggerNodeId" TEXT;

UPDATE "WebhookEndpoint" AS endpoint
SET "triggerNodeId" = candidate.node_id
FROM (
  SELECT e.id, MIN(node->>'id') AS node_id
  FROM "WebhookEndpoint" e
  JOIN "WorkflowVersion" v ON v.id = e."workflowVersionId"
  CROSS JOIN LATERAL jsonb_array_elements(v.graph->'nodes') AS node
  WHERE node->>'type' = 'trigger.webhook'
     OR node->>'type' LIKE 'trigger.github.%'
     OR node->>'type' LIKE 'trigger.gitlab.%'
     OR node->>'type' IN ('trigger.uptime-kuma.alert', 'trigger.telegram.update', 'trigger.vercel.deployment', 'trigger.trello.board-action', 'trigger.sentry.issue-created', 'trigger.slack.event', 'trigger.jira.issue')
  GROUP BY e.id
  HAVING COUNT(*) = 1 AND MIN(node->>'id') IS NOT NULL
) AS candidate
WHERE endpoint.id = candidate.id;

CREATE UNIQUE INDEX "WebhookEndpoint_workflowId_triggerNodeId_key"
  ON "WebhookEndpoint"("workflowId", "triggerNodeId");
