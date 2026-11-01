import assert from "node:assert/strict";
import test from "node:test";
import { buildMongoFilter, parseMongoFilter } from "./mongodb-filter";

test("MongoDB visual filters preserve typed conditions and use AND", () => {
  const rows = [{ field: "status", operator: "eq" as const, type: "text" as const, value: "ready" }, { field: "count", operator: "gte" as const, type: "number" as const, value: "3" }, { field: "active", operator: "eq" as const, type: "boolean" as const, value: "false" }];
  const filter = buildMongoFilter(rows);
  assert.deepEqual(JSON.parse(filter), { $and: [{ status: "ready" }, { count: { $gte: 3 } }, { active: false }] });
  assert.deepEqual(parseMongoFilter(filter), rows);
  assert.equal(buildMongoFilter([]), "{}");
});

test("MongoDB visual filter preserves unsupported JSON by refusing to interpret it", () => {
  for (const value of ['{"$or":[{"a":1},{"b":2}]}', '{"a":{"$in":[1,2]}}', '{"a":null}', '{"$and":[]}', 'bad']) assert.equal(parseMongoFilter(value), null);
  assert.deepEqual(parseMongoFilter('{"_id":{"$exists":false}}'), [{ field: "_id", operator: "exists", type: "boolean", value: "false" }]);
  assert.throws(() => buildMongoFilter([{ field: "$where", operator: "eq", type: "text", value: "test" }]));
  assert.throws(() => buildMongoFilter([{ field: "count", operator: "eq", type: "number", value: "" }]));
});
