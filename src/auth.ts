import { createHash } from "node:crypto";

import { DEV_ID_PREFIX, GUEST_ID_PREFIX } from "./constants.js";

// Who a player really is. The client's Bloxity token is checked with Bloxity, so nobody can claim
// someone else's id and write over their save. Without a good answer the player is a guest: never
// loaded, never saved. Outside production there is no Bloxity to ask, so the sent id is trusted.
const VERIFY_PATH = "/v1/auth/game-token/verify";
const TIMEOUT_MS = 6000;
const GOOD_TTL_MS = 60_000; // how long an answer is remembered
const BAD_TTL_MS = 30_000;
const CACHE_MAX = 2000;

const cache = new Map<string, { userId: string; until: number }>();

// Cached by a hash, so this map never holds a usable credential.
const hashOf = (token: string) => createHash("sha256").update(token).digest("hex");

// The Bloxity id `token` belongs to, "" when it is refused or Bloxity can't be reached.
export async function verifyToken(token: string, now = Date.now()): Promise<string> {
  const key = hashOf(token);
  const known = cache.get(key);
  if (known && known.until > now) return known.userId;

  const api = (process.env.BLOXITY_API_URL || "https://api.bloxity.io").replace(/\/$/, "");
  let userId = "";
  let reached = false;
  try {
    const res = await fetch(`${api}${VERIFY_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ gameSlug: process.env.BLOXITY_GAME_ID ?? "" }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    reached = res.ok || res.status === 401 || res.status === 403;
    if (res.ok) {
      const body = (await res.json()) as { valid?: boolean; user?: { _id?: unknown }; _id?: unknown };
      const id = body.user?._id ?? body._id;
      if (body.valid !== false && typeof id === "string") userId = id;
    }
  } catch (err) {
    console.warn("[auth] verify failed", err);
  }
  // An outage is not a verdict on the token: the next attempt asks again.
  if (reached) {
    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(key, { userId, until: now + (userId ? GOOD_TTL_MS : BAD_TTL_MS) });
  }
  return userId;
}

// The account a session may read and write, "" = guest. `sentId` is the client's claim.
export async function accountFor(sentId: string, token: unknown, production = process.env.NODE_ENV === "production"): Promise<string> {
  if (sentId.startsWith(GUEST_ID_PREFIX)) return "";
  if (!production) return sentId;
  if (sentId.startsWith(DEV_ID_PREFIX) || typeof token !== "string" || !token) return "";
  return verifyToken(token);
}

// Test-only: forget the cached answers.
export function __resetAuthForTest(): void {
  cache.clear();
}
