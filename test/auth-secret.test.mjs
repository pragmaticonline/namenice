import assert from "node:assert/strict";
import test from "node:test";
import { createAuth } from "../src/auth.ts";

const fakeDb = {
  prepare() {
    return {
      bind() { return this; },
      async first() { return null; },
      async all() { return { results: [] }; },
      async run() { return { meta: { changes: 0 } }; },
    };
  },
  async batch() { return []; },
};

test("production origin rejects missing or default BETTER_AUTH_SECRET", () => {
  assert.throws(
    () => createAuth({ DB: fakeDb }, "https://www.namenice.net"),
    /BETTER_AUTH_SECRET must be set/,
  );
  assert.throws(
    () => createAuth({ DB: fakeDb, BETTER_AUTH_SECRET: "dev-secret-change-me-32chars-min" }, "https://namenice.net"),
    /BETTER_AUTH_SECRET must be set/,
  );
});

test("production origin accepts a unique BETTER_AUTH_SECRET", () => {
  const auth = createAuth(
    { DB: fakeDb, BETTER_AUTH_SECRET: "test-production-secret-0123456789abcdef" },
    "https://www.namenice.net",
  );
  assert.ok(auth);
});

test("local origin keeps the development fallback", () => {
  const auth = createAuth({ DB: fakeDb }, "http://localhost:8787");
  assert.ok(auth);
});
