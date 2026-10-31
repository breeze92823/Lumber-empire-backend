import {
  COUNT_MAX, CURRENCY_MAX, GIFTS_MAX, ID_PATTERN, OWNED_MAX, PLAY_SECONDS_MAX, REBIRTHS_MAX, SALE_PATTERN,
  TUTORIAL_MAX, UPGRADE_LEVEL_MAX, UPGRADES_MAX,
} from "./constants.js";
import type { PlayerDoc } from "./db.js";

export function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
export function clampNum(v: number, max: number): number {
  return Math.min(max, Math.max(0, v));
}
export function clampInt(v: number, max: number, min = 0): number {
  return Math.min(max, Math.max(min, Math.floor(v)));
}
function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// Sales bought, in the order they were bought (a save replays them in it): no repeats, bounded count.
export function sanitizeOwned(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((v): v is string => typeof v === "string" && SALE_PATTERN.test(v)))].slice(0, OWNED_MAX);
}

// Upgrade levels { id: level }: slug ids, whole levels, bounded kinds.
function sanitizeUpgrades(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObject(raw)) return out;
  for (const [id, n] of Object.entries(raw)) {
    if (Object.keys(out).length >= UPGRADES_MAX) break;
    if (ID_PATTERN.test(id) && finite(n)) out[id] = clampInt(n, UPGRADE_LEVEL_MAX);
  }
  return out;
}

// The game is client-authoritative -- no server-side gameplay validation. What IS enforced:
// shape and bounds, so a malformed payload can never corrupt this player's own Mongo document.
// A forged number can only ever affect the sender's own save.
export function sanitizeProgress(raw: unknown): Partial<PlayerDoc> | null {
  if (!isObject(raw)) return null;
  const out: Partial<PlayerDoc> = {};

  if (finite(raw.money)) out.money = clampNum(raw.money, CURRENCY_MAX);
  if (finite(raw.earned)) out.earned = clampNum(raw.earned, CURRENCY_MAX);
  if (finite(raw.rebirths)) out.rebirths = clampInt(raw.rebirths, REBIRTHS_MAX);
  if (finite(raw.playtime)) out.playtime = clampInt(raw.playtime, PLAY_SECONDS_MAX);
  if (finite(raw.lastSeen)) out.lastSeen = clampInt(raw.lastSeen, Date.now() + 10 * 60 * 1000);
  if (finite(raw.tutorial)) out.tutorial = clampInt(raw.tutorial, TUTORIAL_MAX);

  if (raw.owned !== undefined) out.owned = sanitizeOwned(raw.owned);
  if (raw.upgrades !== undefined) out.upgrades = sanitizeUpgrades(raw.upgrades);
  if (raw.perks !== undefined) out.perks = sanitizeOwned(raw.perks);

  if (finite(raw.workers)) out.workers = clampInt(raw.workers, COUNT_MAX);
  if (finite(raw.maxWorkers)) out.maxWorkers = clampInt(raw.maxWorkers, COUNT_MAX);
  if (finite(raw.hirePrice)) out.hirePrice = clampNum(raw.hirePrice, CURRENCY_MAX);
  if (finite(raw.crates)) out.crates = clampInt(raw.crates, COUNT_MAX);

  if (finite(raw.giftTime)) out.giftTime = clampInt(raw.giftTime, PLAY_SECONDS_MAX);
  if (raw.giftsClaimed !== undefined) {
    const claimed = Array.isArray(raw.giftsClaimed) ? raw.giftsClaimed.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < GIFTS_MAX) : [];
    out.giftsClaimed = [...new Set(claimed)];
  }
  return out;
}
