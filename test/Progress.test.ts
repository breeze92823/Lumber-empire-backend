import assert from "assert";
import type { ColyseusTestServer } from "@colyseus/testing";

import type appConfig from "../src/app.config.js";
import { WorldState } from "../src/rooms/schema/WorldState.js";
import { __setPlayersForTest } from "../src/db.js";
import { fakePlayers, sleep } from "./fakePlayers.js";
import { testServer } from "./server.js";

describe("progress", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;
  before(async () => (colyseus = await testServer()));
  beforeEach(async () => await colyseus.cleanup());
  afterEach(() => __setPlayersForTest(null));

  const quiet = (c: { onMessage(type: string, fn: (m: any) => void): unknown }) => c.onMessage("leaderboard", () => {});

  it("sends a saved player their progress and saves what they send back", async () => {
    const fake = fakePlayers([{ _id: "u1", money: 5000, owned: ["debarker", "sawmill"], upgrades: { axe: 2 }, earned: 900, rebirths: 2, version: 1, updatedAt: new Date() }]);
    __setPlayersForTest(fake);
    const room = await colyseus.createRoom<WorldState>("world", {});
    const c = await colyseus.connectTo(room, { userId: "u1", username: "Ann" });
    let got: any = null;
    quiet(c);
    c.onMessage("progress", (m: any) => (got = m));
    fake.release();
    await sleep(150);
    assert.strictEqual(got?.money, 5000);
    assert.deepStrictEqual(got?.owned, ["debarker", "sawmill"]);
    assert.deepStrictEqual(got?.upgrades, { axe: 2 });

    c.send("saveProgress", { money: 7000, earned: 400, rebirths: 1, owned: ["debarker"], crates: 3, hack: 1 });
    await sleep(150);
    const doc = fake.docs.get("u1")! as any;
    assert.strictEqual(doc.money, 7000, "the wallet can go down");
    assert.deepStrictEqual(doc.owned, ["debarker"]);
    assert.strictEqual(doc.crates, 3);
    assert.strictEqual(doc.earned, 900, "a leaderboard score never goes down");
    assert.strictEqual(doc.rebirths, 2, "a leaderboard score never goes down");
    assert.strictEqual(doc.username, "Ann");
    assert.ok(!("hack" in doc));
  });

  it("sends lastSeen with the server's time and moves it on with every save, whatever the client says", async () => {
    const long = Date.now() - 3600_000;
    const fake = fakePlayers([{ _id: "u6", money: 1, lastSeen: long, version: 1, updatedAt: new Date() }]);
    __setPlayersForTest(fake);
    const room = await colyseus.createRoom<WorldState>("world", {});
    const c = await colyseus.connectTo(room, { userId: "u6" });
    let got: any = null;
    quiet(c);
    c.onMessage("progress", (m: any) => (got = m));
    fake.release();
    await sleep(150);
    assert.strictEqual(got?.lastSeen, long);
    assert.ok(got?.serverTime - got?.lastSeen >= 3600_000);

    const before = Date.now();
    c.send("saveProgress", { money: 2, lastSeen: long });
    await sleep(150);
    assert.ok(fake.docs.get("u6")!.lastSeen! >= before, "a save can't keep the old time to be paid for it twice");
  });

  it("saves the tutorial's progress, sends it back and never lets it go down", async () => {
    const fake = fakePlayers([{ _id: "u5", tutorial: 2, version: 1, updatedAt: new Date() }]);
    __setPlayersForTest(fake);
    const room = await colyseus.createRoom<WorldState>("world", {});
    const c = await colyseus.connectTo(room, { userId: "u5" });
    let got: any = null;
    quiet(c);
    c.onMessage("progress", (m: any) => (got = m));
    fake.release();
    await sleep(150);
    assert.strictEqual(got?.tutorial, 2);

    c.send("saveProgress", { tutorial: 1, money: 1 });
    await sleep(150);
    assert.strictEqual(fake.docs.get("u5")!.tutorial, 2, "a stale save can't send a player back");
    c.send("saveProgress", { tutorial: 3 });
    await sleep(150);
    assert.strictEqual(fake.docs.get("u5")!.tutorial, 3);
  });

  it("creates a new account's save and never saves a guest", async () => {
    const fake = fakePlayers();
    __setPlayersForTest(fake);
    const room = await colyseus.createRoom<WorldState>("world", {});
    const c = await colyseus.connectTo(room, { userId: "new1" });
    let none = false;
    quiet(c);
    c.onMessage("noProgress", () => (none = true));
    fake.release();
    await sleep(150);
    assert.ok(none);
    c.send("saveProgress", { money: 10 });
    await sleep(150);
    assert.strictEqual(fake.docs.get("new1")?.money, 10);

    const guest = await colyseus.connectTo(room, { userId: "guest-abc" });
    quiet(guest);
    guest.onMessage("noProgress", () => {});
    await sleep(150);
    guest.send("saveProgress", { money: 99 });
    await sleep(150);
    assert.strictEqual(fake.docs.size, 1, "a guest is never written");
    assert.strictEqual(room.state.players.get(guest.sessionId)?.signedIn, false);
  });

  it("loads the new identity when a guest signs in mid-session, keeping their yard", async () => {
    const fake = fakePlayers([{ _id: "u2", money: 42, version: 1, updatedAt: new Date() }]);
    __setPlayersForTest(fake);
    const room = await colyseus.createRoom<WorldState>("world", {});
    const c = await colyseus.connectTo(room, { userId: "guest-x" });
    let got: any = null;
    quiet(c);
    c.onMessage("noProgress", () => {});
    c.onMessage("progress", (m: any) => (got = m));
    fake.release();
    await sleep(150);
    const { slot } = room.state.players.get(c.sessionId)!;
    c.send("identify", { userId: "u2", username: "Bea" });
    await sleep(150);
    assert.strictEqual(got?.money, 42);
    assert.strictEqual(room.state.players.get(c.sessionId)?.signedIn, true);
    assert.strictEqual(room.state.players.get(c.sessionId)?.slot, slot);
  });

  it("evicts an older session of the same account and frees its yard", async () => {
    const fake = fakePlayers([{ _id: "u4", money: 1, version: 1, updatedAt: new Date() }]);
    __setPlayersForTest(fake);
    const room = await colyseus.createRoom<WorldState>("world", {});
    const a = await colyseus.connectTo(room, { userId: "u4" });
    quiet(a);
    a.onMessage("progress", () => {});
    fake.release();
    await sleep(100);
    const b = await colyseus.connectTo(room, { userId: "u4" });
    quiet(b);
    b.onMessage("progress", () => {});
    await sleep(100);
    assert.strictEqual(room.state.players.size, 1);
    assert.ok(room.state.players.has(b.sessionId));
    const c = await colyseus.connectTo(room, { userId: "guest-c" });
    await sleep(50);
    assert.strictEqual(room.state.players.get(c.sessionId)!.slot, 0, "the evicted yard is free again");
  });

  it("keeps saving off when the save could not be read", async () => {
    const fake = fakePlayers([{ _id: "u3", money: 1e9, version: 1, updatedAt: new Date() }]);
    (fake as any).findOne = async () => {
      await fake.gate;
      throw new Error("down");
    };
    __setPlayersForTest(fake);
    const room = await colyseus.createRoom<WorldState>("world", {});
    const c = await colyseus.connectTo(room, { userId: "u3" });
    let failed = false;
    c.onMessage("serverError", () => (failed = true));
    fake.release();
    await sleep(150);
    assert.ok(failed);
    c.send("saveProgress", { money: 0 });
    await sleep(150);
    assert.strictEqual(fake.docs.get("u3")!.money, 1e9, "the unread save is never overwritten");
  });
});
