import { schema, t, type SchemaType } from "@colyseus/schema";

// The live roster: who is in the room. Durable progress lives in Mongo (src/db.ts).
// To sync something new about a player, add a field here and accept it in a WorldRoom message.
export const PlayerState = schema(
  {
    username: t.string().default(""), // client-reported Bloxity displayName/username, not validated
    signedIn: t.boolean().default(false), // has a checked Bloxity id: only signed-in players are saved
    uid: t.string().default(""), // that id ("" = guest): Bloxity chat messages name their sender by it
    pfp: t.string().default(""), // Bloxity profile picture URL ("" = none)
    slot: t.int8().default(-1), // the yard this player owns, 0..PLOT_COUNT - 1 (slots.ts)
    // Presence (presence.ts, `pose` / `setAvatar` / `setPlot`): what the others draw in the world.
    x: t.float64().default(0), // feet position in the player's own yard, metres from its origin
    y: t.float64().default(0),
    z: t.float64().default(0),
    yaw: t.float32().default(0), // heading, rad
    speed: t.float32().default(0), // m/s, for the walk cycle and dead reckoning
    swing: t.float32().default(0), // how far through an axe swing, 0 = none
    carryKind: t.string().default(""), // the product in their hands, "" = nothing
    carryCount: t.uint8().default(0),
    avatar: t.string().default(""), // Bloxity look JSON { equipped, proportions }, "" = default
    plot: t.string().default(""), // their yard JSON { owned, levels, rebirths, crew, signs }, "" = fresh
  },
  "PlayerState",
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const WorldState = schema(
  {
    players: t.map(PlayerState), // keyed by sessionId
  },
  "WorldState",
);
export type WorldState = SchemaType<typeof WorldState>;
