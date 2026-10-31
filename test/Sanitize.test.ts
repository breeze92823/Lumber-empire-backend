import assert from "assert";

import { CURRENCY_MAX, OWNED_MAX } from "../src/constants.js";
import { sanitizeProgress } from "../src/sanitize.js";

describe("sanitizeProgress", () => {
  it("rejects non-objects and bounds numbers", () => {
    assert.strictEqual(sanitizeProgress(null), null);
    assert.strictEqual(sanitizeProgress([1]), null);
    const out = sanitizeProgress({ money: 1e40, earned: -5, playtime: NaN, rebirths: 3.7, hack: "x" })!;
    assert.strictEqual(out.money, CURRENCY_MAX);
    assert.strictEqual(out.earned, 0);
    assert.strictEqual(out.playtime, undefined);
    assert.strictEqual(out.rebirths, 3);
    assert.ok(!("hack" in out));
  });

  it("keeps well-formed sales in the order they were bought, floors included", () => {
    const out = sanitizeProgress({ owned: ["debarker", "sawmill@1", "debarker", "Bad Id!", "x@99", 7] })!;
    assert.deepStrictEqual(out.owned, ["debarker", "sawmill@1"]);
    const many = Array.from({ length: OWNED_MAX + 5 }, (_, i) => `sale${i}`);
    assert.strictEqual(sanitizeProgress({ owned: many })!.owned!.length, OWNED_MAX);
  });

  it("keeps the shop's perks", () => {
    assert.deepStrictEqual(sanitizeProgress({ perks: ["hacker", "opTruck", "hacker", "Bad Id!"] })!.perks, ["hacker", "opTruck"]);
  });

  it("bounds upgrade levels", () => {
    const out = sanitizeProgress({ upgrades: { axe: 2.9, walkSpeed: -1, "bad id": 1, carry: "x" } })!;
    assert.deepStrictEqual(out.upgrades, { axe: 2, walkSpeed: 0 });
  });

  it("bounds the crew and the Online Gifts state", () => {
    const out = sanitizeProgress({ workers: 4.5, maxWorkers: -2, hirePrice: 900, crates: 3, giftTime: -4, giftsClaimed: [0, 0, 3, 99, "1"] })!;
    assert.deepStrictEqual([out.workers, out.maxWorkers, out.hirePrice, out.crates], [4, 0, 900, 3]);
    assert.strictEqual(out.giftTime, 0);
    assert.deepStrictEqual(out.giftsClaimed, [0, 3]);
  });
});
