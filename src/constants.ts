// Keep in step with the client's src/config.js by hand.
// Players per room, and so yards per world: each player owns one of the world's PLOT_COUNT yards.
export const PLOT_COUNT = 6;
export const ROOM_MAX_CLIENTS = PLOT_COUNT;

// Longest accepted strings.
export const NAME_MAX = 64;
// Profile picture URL (Bloxity `pfp`), relayed so other players can draw it.
export const PFP_MAX_LEN = 512;
// Presence (presence.ts): the Bloxity avatar JSON relayed for the others to draw, the pose bounds
// (metres from the sender's own yard, m/s) and the most goods a hand can show.
export const AVATAR_MAX_LEN = 3000;
export const POSE_BOUNDS = { xy: 5000, speed: 200 };
export const CARRY_MAX = 64;
// `emote` (presence.ts): a Bloxity emote id plus a number that makes a repeat of it a change.
export const EMOTE_PATTERN = /^[A-Za-z0-9_-]{1,64}#[0-9]{1,3}$/;
// `adReward` (adReward.ts): the longest rewarded-ad token passed on to Bloxity.
export const AD_TOKEN_MAX_LEN = 4096;
// `plot` (presence.ts): what the sender's yard owns, relayed as JSON for the others to build.
export const PLOT_MAX_LEN = 8000;

// Live yard frames (relay.ts): the crew at ~5 Hz and the belts, logs and trucks at ~1 Hz, nested
// arrays of numbers relayed to the room. The budgets are how many numbers one frame may hold; the
// gaps are the shortest time allowed between two frames from one client.
export const YARD_FAST_NUMBERS = 600;
export const YARD_SLOW_NUMBERS = 6000;
export const YARD_FAST_GAP_MS = 100;
export const YARD_SLOW_GAP_MS = 500;

// Colyseus drops the whole connection for a WebSocket message above this (default 4 KB).
export const MAX_PAYLOAD_BYTES = 128 * 1024;

// How long a dropped connection (WiFi blip, backgrounded tab) may reconnect with the same session.
export const RECONNECT_SECONDS = 20;

// Upper bounds for saved values, so a forged payload cannot store a bogus number. Generous
// ceilings, not game rules.
export const CURRENCY_MAX = 1e33; // money, earned
export const REBIRTHS_MAX = 1e9;
export const PLAY_SECONDS_MAX = 31_536_000; // ~1 year
export const COUNT_MAX = 1e6; // workers, crates

// Sales bought (client YARD.saleSigns) and upgrades (client GAME.upgrades), with slack.
export const OWNED_MAX = 256;
export const UPGRADES_MAX = 64;
export const UPGRADE_LEVEL_MAX = 1000;
// Online Gifts (client WINDOWS.gifts): claimed indexes.
export const GIFTS_MAX = 64;
// The new player tutorial's stages (client TUTORIAL.stages), with slack for more.
export const TUTORIAL_MAX = 32;

// Leaderboards (leaderboard.ts; client boards.js, YARD.leaderboard): the saved doc fields ranked,
// rows per board and how often the lists are re-read and re-sent.
export const LEADERBOARD_STATS = ["rebirths", "earned", "playtime"] as const;
export type LeaderboardStat = (typeof LEADERBOARD_STATS)[number];
export const LEADERBOARD_SIZE = 10;
export const LEADERBOARD_EVERY_MS = 60 * 1000;

// The same boards on Bloxity (platformBoards.ts; the client's bloxity.js defines them too): how
// often scores are reported, the most in one call and the score per saved stat (`time` boards
// count in milliseconds).
export const PLATFORM_BOARD_EVERY_MS = 30 * 1000;
export const PLATFORM_BOARD_BATCH = 200;
export const PLATFORM_BOARDS = [
  { id: "earned", label: "Top Earners", order: "desc", mode: "best", format: "compact", reset: "none" },
  { id: "rebirths", label: "Top Rebirths", order: "desc", mode: "best", format: "number", reset: "none" },
  { id: "playtime", label: "Top Playtime", order: "desc", mode: "best", format: "time", reset: "none" },
] as const;

// Ids from the client's catalogs (upgrades, products); a sale may carry its floor (`debarker@1`).
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
export const SALE_PATTERN = /^[A-Za-z0-9_-]{1,32}(@[0-9])?$/;

// The client's per-browser fallback id for players who are not signed in to Bloxity.
// Guests are never persisted.
export const GUEST_ID_PREFIX = "guest-";
// A local `VITE_DEV_MODE` client's id: there is no Bloxity token to check, so production refuses it.
export const DEV_ID_PREFIX = "dev-";
