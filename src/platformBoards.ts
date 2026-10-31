import { DEV_ID_PREFIX, LEADERBOARD_STATS, PLATFORM_BOARD_BATCH, PLATFORM_BOARD_EVERY_MS, PLATFORM_BOARDS } from "./constants.js";

// The Leaderboards on Bloxity's own trophy button: saved scores are queued here and reported in
// batches. A no-op unless deployed by Boxity hosting (BLOXITY_REPORT_TOKEN).
type Scores = Partial<Record<(typeof LEADERBOARD_STATS)[number], number>>;

const queued = new Map<string, Scores>(); // user id -> the latest scores not reported yet

// The doc's `playtime` is in seconds, a `time` board counts milliseconds.
const boardScore = (stat: string, value: number) => (stat === "playtime" ? value * 1000 : value);

export function queueScores(userId: string, scores: Scores): void {
  if (!process.env.BLOXITY_REPORT_TOKEN || !userId || userId.startsWith(DEV_ID_PREFIX)) return;
  queued.set(userId, { ...queued.get(userId), ...scores });
}

export async function reportScores(): Promise<void> {
  const token = process.env.BLOXITY_REPORT_TOKEN;
  const gameId = process.env.BLOXITY_GAME_ID;
  if (!token || !gameId || !queued.size) return;

  const scores: { board: string; userId: string; score: number }[] = [];
  for (const [userId, stats] of queued) {
    const bare = userId.split("#")[0];
    for (const [board, value] of Object.entries(stats)) {
      if (typeof value === "number" && value > 0) scores.push({ board, userId: `legion_${bare.replace(/^legion_/, "")}`, score: boardScore(board, value) });
    }
    queued.delete(userId);
    if (scores.length >= PLATFORM_BOARD_BATCH - LEADERBOARD_STATS.length) break;
  }
  if (!scores.length) return;

  const api = (process.env.BLOXITY_API_URL || "https://api.bloxity.io").replace(/\/$/, "");
  try {
    const res = await fetch(`${api}/v1/leaderboards/hosted/${gameId}/report`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ boards: PLATFORM_BOARDS, scores }),
      signal: AbortSignal.timeout(6000),
    });
    const body: { dropped?: unknown } | null = await res.json().catch((): null => null);
    if (body?.dropped) console.warn("[boards] dropped", body.dropped);
    if (!res.ok) console.warn("[boards] report failed", res.status);
  } catch (err) {
    console.warn("[boards] report failed", err);
  }
}

export function installPlatformBoards(): void {
  if (!process.env.BLOXITY_REPORT_TOKEN) return;
  setInterval(() => void reportScores(), PLATFORM_BOARD_EVERY_MS).unref();
}

// Test-only: forget what is queued.
export function __resetPlatformBoardsForTest(): void {
  queued.clear();
}
