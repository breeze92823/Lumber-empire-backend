import assert from "assert";

import { verifyAdReward } from "../src/adReward.js";
import { AD_TOKEN_MAX_LEN } from "../src/constants.js";

describe("verifyAdReward", () => {
  const real = globalThis.fetch;
  let sent: { url: string; body: unknown } | null = null;
  const answer = (status: number, body: unknown) => {
    sent = null;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(init.body as string) };
      return new Response(JSON.stringify(body), { status });
    }) as typeof fetch;
  };
  afterEach(() => (globalThis.fetch = real));

  it("passes only when Bloxity says the token is valid", async () => {
    answer(200, { valid: true });
    assert.strictEqual(await verifyAdReward("good"), true);
    assert.ok(sent!.url.endsWith("/v1/ads/reward/verify"));
    assert.strictEqual((sent!.body as { rewardToken: string }).rewardToken, "good");
    answer(200, { valid: false, reason: "unknown" });
    assert.strictEqual(await verifyAdReward("spent"), false);
    answer(500, { valid: true });
    assert.strictEqual(await verifyAdReward("error"), false);
  });

  it("never asks about something that isn't a token", async () => {
    answer(200, { valid: true });
    for (const token of [undefined, "", 7, "x".repeat(AD_TOKEN_MAX_LEN + 1)]) assert.strictEqual(await verifyAdReward(token), false);
    assert.strictEqual(sent, null);
  });

  it("treats an outage as a no", async () => {
    globalThis.fetch = (async () => {
      throw new Error("down");
    }) as typeof fetch;
    assert.strictEqual(await verifyAdReward("good"), false);
  });
});
