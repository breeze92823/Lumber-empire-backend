import { AD_TOKEN_MAX_LEN } from "./constants.js";

// A rewarded ad's token, asked of Bloxity once: a token verifies once, for this game only, within
// five minutes. The client only pays out on our yes. An outage is a no: the ad can't be proved.
const VERIFY_PATH = "/v1/ads/reward/verify";
const TIMEOUT_MS = 6000;

export async function verifyAdReward(token: unknown): Promise<boolean> {
  if (typeof token !== "string" || !token || token.length > AD_TOKEN_MAX_LEN) return false;
  const api = (process.env.BLOXITY_API_URL || "https://api.bloxity.io").replace(/\/$/, "");
  try {
    const res = await fetch(`${api}${VERIFY_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gameSlug: process.env.BLOXITY_GAME_ID ?? "", rewardToken: token }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return false;
    return ((await res.json()) as { valid?: unknown }).valid === true;
  } catch (err) {
    console.warn("[adReward] verify failed", err);
    return false;
  }
}
