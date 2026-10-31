import { MongoClient, type Collection } from "mongodb";

import { LEADERBOARD_STATS } from "./constants.js";

// Bloxity Legion hosting injects MONGODB_URI per game+channel -- an isolated database with
// scoped credentials. A local `npm start` normally has no Mongo reachable, so a missing or
// unreachable URI must degrade to "no persistence" rather than crash the room.

// The persisted client state (what `saveProgress` carries, see sanitize.ts). The client keeps
// nothing in the browser: this document is the player's only save.
export interface PlayerDoc {
  _id: string; // Bloxity user id -- see WorldRoom.ts (guests are never saved)
  username?: string; // display name as of the last save
  money?: number; // the wallet
  earned?: number; // money made in all, across rebirths (only ever goes up)
  rebirths?: number; // only ever goes up
  playtime?: number; // s with the game visible (only ever goes up)
  owned?: string[]; // sales bought since the last rebirth, in order (client YARD.saleSigns ids)
  upgrades?: Record<string, number>; // upgrade id -> level (client GAME.upgrades)
  perks?: string[]; // shop items bought (client shop.js): they outlive a rebirth
  workers?: number; // the crew
  maxWorkers?: number;
  hirePrice?: number; // what the next worker costs
  crates?: number;
  giftTime?: number; // Online Gifts clock, s online this round
  giftsClaimed?: number[]; // WINDOWS.gifts indexes claimed this round
  lastSeen?: number; // epoch ms of the last save or leave, server clock (the client's offline earnings run from it)
  tutorial?: number; // new player tutorial: stages finished, TUTORIAL_MAX = done, unset = a save from before it (only ever goes up)
  version: number;
  updatedAt: Date;
}

let client: MongoClient | null = null;
let players: Collection<PlayerDoc> | null = null;

export async function connectDb(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn("[db] MONGODB_URI not set -- player progress will not persist");
    return;
  }
  try {
    client = new MongoClient(uri);
    await client.connect();
    // No dbName passed to .db() -- the injected URI already points at this game+channel's database.
    players = client.db().collection<PlayerDoc>("players");
    console.log("[db] connected to MongoDB");
    // The leaderboards sort and count by these (leaderboard.ts).
    for (const stat of LEADERBOARD_STATS) {
      players.createIndex({ [stat]: -1 }).catch((err) => console.warn(`[db] index on ${stat} failed`, err));
    }
  } catch (err) {
    console.warn("[db] connect failed -- player progress will not persist:", err);
    client = null;
    players = null;
  }
}

// Null whenever Mongo is unset/unreachable -- every caller must treat that as "skip persistence".
export function getPlayers(): Collection<PlayerDoc> | null {
  return players;
}

// Test-only seam: exercise the save/load logic against an in-memory fake collection.
export function __setPlayersForTest(fake: Collection<PlayerDoc> | null): void {
  players = fake;
}
