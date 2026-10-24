import assert from "node:assert/strict";
import test from "node:test";
import { applyHttpCredential, HttpCredentialError } from "./http-credential";

test("applies bearer, API-key, basic, and header HTTP credentials without exposing them in config", () => {
  assert.deepEqual(applyHttpCredential("https://api.example.test/items", {}, { authType: "bearer", token: "secret" }).headers, { Authorization: "Bearer secret" });
  assert.equal(applyHttpCredential("https://api.example.test/items", {}, { authType: "apiKey", name: "api_key", value: "secret", location: "query" }).url, "https://api.example.test/items?api_key=secret");
  assert.equal(applyHttpCredential("https://api.example.test/items", {}, { authType: "basic", username: "user", password: "pass" }).headers.Authorization, "Basic dXNlcjpwYXNz");
  assert.deepEqual(applyHttpCredential("https://api.example.test/items", { Accept: "application/json" }, { authType: "headers", headers: { "X-Client": "workflow" } }).headers, { Accept: "application/json", "X-Client": "workflow" });
  assert.throws(() => applyHttpCredential("https://api.example.test", {}, { authType: "bearer" }), HttpCredentialError);
});
