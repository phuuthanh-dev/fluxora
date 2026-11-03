import assert from "node:assert/strict";
import test from "node:test";
import { executableWorkflowNodeTypes, getSharedNodeConfigurationFields, sharedNodeConfigurationTypes, workflowNodeTypes } from "@workflow/contracts";
import { getOperationMetadata, getOperationMetadataRegistry } from "@workflow/contracts/dist/operation-metadata";
import { nodeCatalog } from "./node-catalog";

const sorted = (values: readonly string[]) => [...values].sort();

test("registry, graph contracts and catalog agree on availability and credential fields", () => {
  assert.deepEqual(sorted(Object.keys(getOperationMetadataRegistry())), sorted(workflowNodeTypes));
  assert.deepEqual(sorted(nodeCatalog.map((node) => node.type)), sorted(workflowNodeTypes));
  assert.equal(new Set(nodeCatalog.map((node) => node.type)).size, nodeCatalog.length);
  assert.deepEqual(sorted(nodeCatalog.filter((node) => node.available).map((node) => node.type)), sorted(executableWorkflowNodeTypes));
  for (const node of nodeCatalog) {
    const metadata = getOperationMetadata(node.type);
    assert.ok(metadata, node.type);
    assert.equal(metadata.availability === "executable", node.available, node.type);
    const fields = node.configurationFields?.filter((field) => field.kind === "credential") ?? [];
    if (fields.length && metadata.auth.kind === "credential") {
      const expectedProvider = metadata.auth.provider;
      assert.ok(fields.some((field) => field.kind === "credential" && field.providers.some((provider) => provider === expectedProvider)), node.type);
    }
  }
});

test("unknown and planned nodes do not acquire executable metadata", () => {
  for (const type of ["", "toString", "__proto__", "action.imaginary"]) assert.equal(getOperationMetadata(type), undefined);
  for (const type of ["action.facebook-meta", "action.instagram"]) assert.equal(getOperationMetadata(type)?.availability, "planned");
  for (const type of ["action.http-request", "action.google-drive", "action.google-sheets"]) assert.equal(getOperationMetadata(type)?.effect, "configuration-dependent");
  assert.deepEqual(getOperationMetadata("action.http-request")?.auth, { kind: "credential", provider: "HTTP", requirement: "optional", context: "execution" });
});

test("shared fields preserve the editor catalog and return independent descriptors", () => {
  assert.equal(sharedNodeConfigurationTypes.length, 74);
  for (const type of sharedNodeConfigurationTypes) {
    const shared = getSharedNodeConfigurationFields(type);
    assert.ok(shared, type);
    assert.deepEqual(shared, nodeCatalog.find((node) => node.type === type)?.configurationFields, type);
    shared[0]!.label = "locally changed";
    assert.notEqual(getSharedNodeConfigurationFields(type)?.[0]?.label, "locally changed", type);
  }
  for (const node of nodeCatalog) if (node.configurationFields) assert.ok(getSharedNodeConfigurationFields(node.type), `${node.type} has local-only field descriptors`);
  assert.ok(getSharedNodeConfigurationFields("action.http-request"));
  assert.equal(getSharedNodeConfigurationFields("__proto__"), undefined);
});
