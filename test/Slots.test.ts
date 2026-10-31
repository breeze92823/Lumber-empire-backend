import assert from "assert";
import type { ColyseusTestServer } from "@colyseus/testing";
import { matchMaker } from "@colyseus/core";

import type appConfig from "../src/app.config.js";
import { PLOT_COUNT } from "../src/constants.js";
import { WorldState } from "../src/rooms/schema/WorldState.js";
import { freeSlot } from "../src/slots.js";
import { sleep } from "./fakePlayers.js";
import { testServer } from "./server.js";

describe("slots", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;
  before(async () => (colyseus = await testServer()));
  beforeEach(async () => await colyseus.cleanup());

  it("picks the lowest free yard, and none when the world is full", () => {
    assert.strictEqual(freeSlot([]), 0);
    assert.strictEqual(freeSlot([0, 1, 3]), 2);
    assert.strictEqual(freeSlot([0, 1, 2, 3, 4, 5]), -1);
  });

  it("gives six players six different yards and a seventh a new world", async () => {
    const first = await colyseus.createRoom<WorldState>("world", {});
    assert.strictEqual(first.maxClients, PLOT_COUNT);
    const clients = [];
    for (let i = 0; i < PLOT_COUNT; i++) clients.push(await colyseus.connectTo(first, { userId: `guest-${i}` }));
    await sleep(50);
    const slots = clients.map((c) => first.state.players.get(c.sessionId)!.slot);
    assert.deepStrictEqual([...slots].sort(), [0, 1, 2, 3, 4, 5]);

    const seat = await matchMaker.joinOrCreate("world", { userId: "guest-7" });
    assert.notStrictEqual(seat.roomId, first.roomId);
  });

  it("frees a yard for the next player when its owner has gone", async () => {
    const room = await colyseus.createRoom<WorldState>("world", {});
    const a = await colyseus.connectTo(room, { userId: "guest-a" });
    const b = await colyseus.connectTo(room, { userId: "guest-b" });
    await sleep(50);
    assert.strictEqual(room.state.players.get(b.sessionId)!.slot, 1);
    await a.leave();
    await sleep(50);
    const c = await colyseus.connectTo(room, { userId: "guest-c" });
    await sleep(50);
    assert.strictEqual(room.state.players.get(c.sessionId)!.slot, 0);
  });

  it("keeps a yard for a dropped connection", async () => {
    const room = await colyseus.createRoom<WorldState>("world", {});
    const a = await colyseus.connectTo(room, { userId: "guest-a" });
    await sleep(50);
    const entry = room.state.players.get(a.sessionId)!;
    assert.strictEqual(entry.slot, 0);
    await a.leave(false); // not consented: the room waits for it
    await sleep(100);
    assert.strictEqual(room.state.players.get(a.sessionId)?.slot, 0, "still held while it may reconnect");
    const b = await colyseus.connectTo(room, { userId: "guest-b" });
    await sleep(50);
    assert.strictEqual(room.state.players.get(b.sessionId)!.slot, 1);
  });
});
