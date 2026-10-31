import assert from "assert";
import type { ColyseusTestServer } from "@colyseus/testing";

import type appConfig from "../src/app.config.js";
import { WorldState } from "../src/rooms/schema/WorldState.js";
import { AVATAR_MAX_LEN, CARRY_MAX, PLOT_MAX_LEN, POSE_BOUNDS } from "../src/constants.js";
import { sleep } from "./fakePlayers.js";
import { testServer } from "./server.js";

describe("presence", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;
  before(async () => (colyseus = await testServer()));
  beforeEach(async () => await colyseus.cleanup());

  it("takes the pose, look and yard from the join options", async () => {
    const room = await colyseus.createRoom<WorldState>("world", {});
    const a = await colyseus.connectTo(room, {
      userId: "guest-a",
      pose: { x: 3, y: 0.5, z: -12, yaw: Math.PI, speed: 4, swing: 0.5, kind: "log", count: 2 },
      avatar: '{"equipped":{}}',
      plot: '{"owned":["debarker"]}',
    });
    await sleep(50);
    const p = room.state.players.get(a.sessionId)!;
    assert.deepStrictEqual([p.x, p.y, p.z, p.speed, p.swing, p.carryKind, p.carryCount], [3, 0.5, -12, 4, 0.5, "log", 2]);
    assert.ok(Math.abs(Math.abs(p.yaw) - Math.PI) < 1e-5);
    assert.strictEqual(p.avatar, '{"equipped":{}}');
    assert.strictEqual(p.plot, '{"owned":["debarker"]}');
  });

  it("bounds what it relays to the others", async () => {
    const room = await colyseus.createRoom<WorldState>("world", {});
    const a = await colyseus.connectTo(room, { userId: "guest-a" });
    const b = await colyseus.connectTo(room, { userId: "guest-b" });
    await sleep(50);
    a.send("pose", { x: 1e9, y: "high", z: -1e12, yaw: 7, speed: -3, swing: 9, kind: "Bad Id!", count: 900 });
    a.send("setAvatar", { avatar: "x".repeat(AVATAR_MAX_LEN + 1) });
    a.send("setPlot", { plot: "x".repeat(PLOT_MAX_LEN + 1) });
    await sleep(100);
    const p = room.state.players.get(a.sessionId)!;
    assert.strictEqual(p.x, POSE_BOUNDS.xy);
    assert.strictEqual(p.y, 0, "a non-number is ignored");
    assert.strictEqual(p.z, -POSE_BOUNDS.xy);
    assert.ok(Math.abs(p.yaw - Math.atan2(Math.sin(7), Math.cos(7))) < 1e-5, "yaw wrapped to -PI..PI");
    assert.strictEqual(p.speed, 0);
    assert.strictEqual(p.swing, 1);
    assert.strictEqual(p.carryKind, "", "a malformed id is ignored");
    assert.strictEqual(p.carryCount, CARRY_MAX);
    assert.strictEqual(p.avatar, "", "an oversized look is ignored");
    assert.strictEqual(p.plot, "", "an oversized yard is ignored");

    // b's synced copy of the roster sees a's presence.
    const seen = (b.state as any).players.get(a.sessionId);
    assert.strictEqual(seen.x, POSE_BOUNDS.xy);
  });
});
