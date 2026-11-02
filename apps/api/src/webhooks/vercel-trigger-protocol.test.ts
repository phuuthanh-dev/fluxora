import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { normalizeVercelDeployment, readVercelDeploymentFilter, verifyVercelSignature } from "./vercel-trigger-protocol";

const secret = "synthetic-vercel-signing-secret";
const filter = { event: "deployment.ready" as const, projectId: "prj_example", owner: "team" as const, teamId: "team_example" };
const raw = (team: unknown = { id: "team_example" }, project = "prj_example") => Buffer.from(JSON.stringify({ id: "evt_example", type: "deployment.ready", payload: { team, project: { id: project }, deployment: { id: "dpl_example", meta: { private: "not returned" } } } }));

test("Vercel signatures authenticate exact raw bytes and reject malformed inputs", () => {
  const payload = raw();
  const signature = createHmac("sha1", secret).update(payload).digest("hex");
  assert.equal(verifyVercelSignature(payload, signature, secret), true);
  assert.equal(verifyVercelSignature(Buffer.concat([payload, Buffer.from(" ")]), signature, secret), false);
  assert.equal(verifyVercelSignature(payload, signature, "different"), false);
  assert.equal(verifyVercelSignature(payload, "not-hex", secret), false);
  assert.equal(verifyVercelSignature(Buffer.alloc(256 * 1024 + 1), signature, secret), false);
});

test("Vercel event normalizer restricts event, project and team without persisting metadata", () => {
  const result = normalizeVercelDeployment(raw(), filter);
  assert.deepEqual(result, { kind: "accepted", eventId: "evt_example", payload: { source: "vercel", event: "deployment.ready", eventId: "evt_example", projectId: "prj_example", deploymentId: "dpl_example", teamId: "team_example" } });
  assert.equal(normalizeVercelDeployment(raw({ id: "team_other" }), filter).kind, "ignored");
  assert.equal(normalizeVercelDeployment(raw({ id: "team_example" }, "prj_other"), filter).kind, "ignored");
  assert.equal(normalizeVercelDeployment(raw(null), filter).kind, "ignored");
  assert.equal(normalizeVercelDeployment(raw(null), { event: "deployment.ready", projectId: "prj_example", owner: "personal" }).kind, "accepted");
  assert.equal(normalizeVercelDeployment(raw({ id: null }), { event: "deployment.ready", projectId: "prj_example", owner: "personal" }).kind, "accepted");
  assert.throws(() => normalizeVercelDeployment(Buffer.from("{"), filter));
  assert.throws(() => readVercelDeploymentFilter({ ...filter, teamId: "" }));
});

test("created and canceled deployments preserve event filtering", () => {
  for (const event of ["deployment.created", "deployment.canceled"] as const) {
    const payload = Buffer.from(JSON.stringify({ id: "evt_123", type: event, payload: { team: { id: "team_example" }, project: { id: "prj_example" }, deployment: { id: "dpl_example" } } }));
    assert.equal(normalizeVercelDeployment(payload, { ...filter, event }).kind, "accepted");
    assert.equal(normalizeVercelDeployment(payload, filter).kind, "ignored");
  }
});
