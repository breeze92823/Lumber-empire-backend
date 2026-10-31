import assert from "assert";
import type { ColyseusTestServer } from "@colyseus/testing";

import type appConfig from "../src/app.config.js";
import { YARD_FAST_NUMBERS } from "../src/constants.js";
import { allowFrame, isFrame } from "../src/relay.js";
import { WorldState } from "../src/rooms/schema/WorldState.js";
import { sleep } from "./fakePlayers.js";
import { testServer } from "./server.js";

describe("yard relay", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;
  before(async () => (colyseus = await testServer()));
  beforeEach(async () => await colyseus.cleanup());

  it("accepts only nested numbers within budget", () => {
    assert.ok(isFrame([1, [2, 3], [[4]]], 4));
    assert.ok(!isFrame([1, 2, 3, 4, 5], 4), "over budget");
    assert.ok(!isFrame([1, "x"], 4), "a string");
    assert.ok(!isFrame([1, { slot: 3 }], 4), "an object");
    assert.ok(!isFrame([NaN], 4), "a non-finite number");
    assert.ok(!isFrame({ slot: 1 }, 4), "not an array");
  });

  it("limits how often one client's frames pass", () => {
    const last = new Map<string, number>();
    assert.ok(allowFrame(last, "a", 100, 1000));
    assert.ok(!allowFrame(last, "a", 100, 1050));
    assert.ok(allowFrame(last, "b", 100, 1050), "each client has its own clock");
    assert.ok(allowFrame(last, "a", 100, 1100));
  });

  it("stamps a frame with its sender's yard, whatever the frame says", async () => {
    const room = await colyseus.createRoom<WorldState>("world", {});
    const a = await colyseus.connectTo(room, { userId: "guest-a" });
    const b = await colyseus.connectTo(room, { userId: "guest-b" });
    const seen: any[] = [];
    let echoed = false;
    a.onMessage("yardFast", () => (echoed = true));
    b.onMessage("yardFast", (m: any) => seen.push(m));
    await sleep(50);
    a.send("yardFast", [1, 2, 3]); // a's own yard is 0: the leading 1 is only data
    await sleep(100);
    assert.deepStrictEqual(seen, [[0, [1, 2, 3]]]);
    assert.ok(!echoed, "a frame does not go back to its sender");
  });

  it("drops a malformed or oversized frame", async () => {
    const room = await colyseus.createRoom<WorldState>("world", {});
    const a = await colyseus.connectTo(room, { userId: "guest-a" });
    const b = await colyseus.connectTo(room, { userId: "guest-b" });
    let got = 0;
    b.onMessage("yardFast", () => got++);
    await sleep(50);
    a.send("yardFast", { slot: 1 });
    a.send("yardFast", new Array(YARD_FAST_NUMBERS + 1).fill(0));
    await sleep(100);
    assert.strictEqual(got, 0);
  });

  it("has no message that can reach another player's roster entry", async () => {
    const room = await colyseus.createRoom<WorldState>("world", {});
    const a = await colyseus.connectTo(room, { userId: "guest-a" });
    const b = await colyseus.connectTo(room, { userId: "guest-b" });
    await sleep(50);
    const target = room.state.players.get(b.sessionId)!;
    for (const type of ["pose", "setPlot", "setAvatar"]) {
      a.send(type, { sessionId: b.sessionId, slot: 1, plot: "stolen", avatar: "stolen", x: 99 });
    }
    await sleep(100);
    assert.deepStrictEqual([target.plot, target.avatar, target.x, target.slot], ["", "", 0, 1]);
    assert.strictEqual(room.state.players.get(a.sessionId)!.slot, 0, "a slot cannot be sent either");
  });

  it("shows a newcomer the yards as they last stood, not their own", async () => {
    const room = await colyseus.createRoom<WorldState>("world", {});
    const a = await colyseus.connectTo(room, { userId: "guest-a" });
    await sleep(50);
    a.send("yardSlow", [7, [8]]);
    await sleep(50);
    const b = await colyseus.connectTo(room, { userId: "guest-b" });
    const seen: any[] = [];
    b.onMessage("yardSlow", (m: any) => seen.push(m));
    b.send("yardHello");
    await sleep(100);
    assert.deepStrictEqual(seen, [[0, [7, [8]]]]);
    a.onMessage("yardSlow", () => assert.fail("a yard's own frame must not come back"));
    a.send("yardHello");
    await sleep(50);
  });

  it("forgets a yard's last frame when its owner goes", async () => {
    const room = await colyseus.createRoom<WorldState>("world", {});
    const a = await colyseus.connectTo(room, { userId: "guest-a" });
    const b = await colyseus.connectTo(room, { userId: "guest-b" }); // keeps the room open
    b.onMessage("yardSlow", () => {});
    await sleep(50);
    a.send("yardSlow", [1]);
    await sleep(50);
    await a.leave();
    await sleep(50);
    const c = await colyseus.connectTo(room, { userId: "guest-c" });
    let got = 0;
    c.onMessage("yardSlow", () => got++);
    c.send("yardHello");
    await sleep(100);
    assert.strictEqual(got, 0);
  });
});
