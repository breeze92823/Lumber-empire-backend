import assert from "assert";

import { __resetAuthForTest, accountFor } from "../src/auth.js";

describe("accountFor", () => {
  const real = globalThis.fetch;
  let calls = 0;
  const answer = (status: number, body: unknown) => {
    calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(JSON.stringify(body), { status });
    }) as typeof fetch;
  };
  beforeEach(() => __resetAuthForTest());
  afterEach(() => (globalThis.fetch = real));

  it("never gives a guest an account", async () => {
    assert.strictEqual(await accountFor("guest-abc", "token", true), "");
    assert.strictEqual(await accountFor("guest-abc", undefined, false), "");
  });

  it("trusts the sent id outside production", async () => {
    assert.strictEqual(await accountFor("dev-abc", undefined, false), "dev-abc");
  });

  it("uses the account Bloxity names, not the one the client claims", async () => {
    answer(200, { valid: true, user: { _id: "real-id" } });
    assert.strictEqual(await accountFor("someone-else", "good", true), "real-id");
  });

  it("makes a claim with no token or a refused one a guest", async () => {
    assert.strictEqual(await accountFor("victim", undefined, true), "");
    answer(401, {});
    assert.strictEqual(await accountFor("victim", "forged", true), "");
    answer(200, { valid: false });
    assert.strictEqual(await accountFor("victim", "stale", true), "");
  });

  it("refuses a dev id in production", async () => {
    answer(200, { valid: true, user: { _id: "x" } });
    assert.strictEqual(await accountFor("dev-abc", "token", true), "");
    assert.strictEqual(calls, 0);
  });

  it("remembers an answer, but not an outage", async () => {
    answer(200, { valid: true, user: { _id: "real-id" } });
    await accountFor("u", "cached", true);
    await accountFor("u", "cached", true);
    assert.strictEqual(calls, 1);
    answer(503, {});
    assert.strictEqual(await accountFor("u", "down", true), "");
    await accountFor("u", "down", true);
    assert.strictEqual(calls, 2, "an outage asks again");
  });
});
