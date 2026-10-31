import { AVATAR_MAX_LEN, CARRY_MAX, ID_PATTERN, PLOT_MAX_LEN, POSE_BOUNDS } from "./constants.js";
import type { PlayerState } from "./rooms/schema/WorldState.js";

// Presence: what the other clients need to draw a player and their yard (client remotePlayers.js,
// yard/plots.js). Relayed through the roster as sent, only bounded here -- like the rest of the game
// it is client-authoritative and purely cosmetic. Each message only ever touches its sender's entry.

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// `pose` { x, y, z, yaw, speed, swing, kind, count }: feet position in the sender's own yard
// (metres from its origin; each client knows where that yard stands in its world), heading (rad),
// speed (m/s), how far through an axe swing (0 = none) and what the hands hold (product id, how many).
export function applyPose(p: PlayerState, msg: unknown): void {
  if (!msg || typeof msg !== "object") return;
  const m = msg as Record<string, unknown>;
  const b = POSE_BOUNDS;
  if (finite(m.x)) p.x = clamp(m.x, -b.xy, b.xy);
  if (finite(m.y)) p.y = clamp(m.y, -b.xy, b.xy);
  if (finite(m.z)) p.z = clamp(m.z, -b.xy, b.xy);
  if (finite(m.yaw)) p.yaw = Math.atan2(Math.sin(m.yaw), Math.cos(m.yaw));
  if (finite(m.speed)) p.speed = clamp(m.speed, 0, b.speed);
  if (finite(m.swing)) p.swing = clamp(m.swing, 0, 1);
  if (finite(m.count)) p.carryCount = clamp(Math.floor(m.count), 0, CARRY_MAX);
  if (m.kind === "" || (typeof m.kind === "string" && ID_PATTERN.test(m.kind))) p.carryKind = m.kind;
}

// `setAvatar` { avatar }: the Bloxity look as an opaque JSON string ("" = default), length-capped.
export function applyAvatar(p: PlayerState, msg: unknown): void {
  const a = (msg as { avatar?: unknown })?.avatar;
  if (typeof a === "string" && a.length <= AVATAR_MAX_LEN) p.avatar = a;
}

// `setPlot` { plot }: the sender's yard as an opaque JSON string, length-capped.
export function applyPlot(p: PlayerState, msg: unknown): void {
  const v = (msg as { plot?: unknown })?.plot;
  if (typeof v === "string" && v.length <= PLOT_MAX_LEN) p.plot = v;
}
