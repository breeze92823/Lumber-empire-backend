import { Room, Client, CloseCode } from "colyseus";
import { WorldState, PlayerState } from "./schema/WorldState.js";
import { LEADERBOARD_EVERY_MS, NAME_MAX, PFP_MAX_LEN, RECONNECT_SECONDS, ROOM_MAX_CLIENTS, YARD_FAST_GAP_MS, YARD_FAST_NUMBERS, YARD_SLOW_GAP_MS, YARD_SLOW_NUMBERS } from "../constants.js";
import { accountFor } from "../auth.js";
import { getPlayers, type PlayerDoc } from "../db.js";
import { sanitizeProgress } from "../sanitize.js";
import { applyAvatar, applyPlot, applyPose } from "../presence.js";
import { ranksOf, topBoards } from "../leaderboard.js";
import { queueScores } from "../platformBoards.js";
import { allowFrame, isFrame } from "../relay.js";
import { freeSlot } from "../slots.js";

function sanitizeName(raw: unknown): string {
  return typeof raw === "string" ? raw.slice(0, NAME_MAX) : "";
}

function sanitizePfp(raw: unknown): string {
  return typeof raw === "string" && raw.length <= PFP_MAX_LEN && /^https?:\/\//i.test(raw) ? raw : "";
}

/**
 * Room every client joins via `client.joinOrCreate("world", { userId, username, token })`. A room is
 * one world of PLOT_COUNT yards: each player owns one (`slot`), and everyone watches the others'.
 * Loads and saves each signed-in player's progress (MongoDB, see db.ts) -- the client keeps no save
 * of its own, so this is the only place progress lives. The game is client-authoritative: no
 * gameplay rules live here, saves are only bounded (sanitize.ts). What a client says only ever
 * lands on its own roster entry, and a yard frame is stamped here with the sender's slot, so nobody
 * can touch another player's yard. Full rooms spill into a fresh one automatically (maxClients).
 */
export class WorldRoom extends Room<{ state: WorldState }> {
  state = new WorldState();
  maxClients = ROOM_MAX_CLIENTS;

  // sessionId -> user id (Bloxity id). Only gates this room's own Mongo reads/writes. Guests have
  // no entry.
  userIds = new Map<string, string>();

  // sessionIds that already got a progress/noProgress answer for their current identity.
  private identified = new Set<string>();
  // sessionIds whose current identity's save has been read: only these may write. A save sent
  // before the load answered would overwrite the stored progress with a fresh player's defaults.
  private loaded = new Set<string>();
  // sessionId -> how many identity checks it has started: only the latest may land.
  private checks = new Map<string, number>();
  // sessionId -> when its last yard frame of each kind was relayed.
  private fastAt = new Map<string, number>();
  private slowAt = new Map<string, number>();
  // slot -> the last `yardSlow`, for a client that has only just arrived.
  private lastSlow = new Map<number, unknown>();

  messages = {
    // Debounced push of the client's whole progress. Upserts, so a first save creates the document.
    saveProgress: async (client: Client, msg: unknown) => {
      const p = this.state.players.get(client.sessionId);
      const patch = sanitizeProgress(msg);
      if (!p || !patch || !this.loaded.has(client.sessionId)) return;

      const userId = this.userIds.get(client.sessionId);
      if (!userId) return;
      const players = getPlayers();
      if (!players) return; // Mongo unset/unreachable -- degrade silently
      // These only ever go up ($max), so a stale or replayed save can't lower a leaderboard score.
      const { earned, rebirths, playtime, ...rest } = patch;
      const best = { earned, rebirths, playtime };
      for (const key of Object.keys(best) as (keyof typeof best)[]) if (best[key] === undefined) delete best[key];
      try {
        await players.updateOne(
          { _id: userId },
          {
            // Display name comes from this connection's own PlayerState, not `msg`.
            $set: { ...rest, username: p.username || "Player", updatedAt: new Date() },
            ...(Object.keys(best).length > 0 && { $max: best }),
            $setOnInsert: { version: 1 },
          },
          { upsert: true },
        );
        queueScores(userId, best);
      } catch (err) {
        console.warn("[WorldRoom] saveProgress failed", err);
      }
    },
    // Presence (presence.ts): the sender's pose ~10x/s, its Bloxity look and its yard, relayed
    // through the roster so everyone draws them in the world.
    pose: (client: Client, msg: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (p) applyPose(p, msg);
    },
    setAvatar: (client: Client, msg: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (p) applyAvatar(p, msg);
    },
    setPlot: (client: Client, msg: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (p) applyPlot(p, msg);
    },
    // Live yard frames (relay.ts): passed on as [slot, frame], the slot being the sender's own.
    yardFast: (client: Client, msg: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !isFrame(msg, YARD_FAST_NUMBERS) || !allowFrame(this.fastAt, client.sessionId, YARD_FAST_GAP_MS)) return;
      this.broadcast("yardFast", [p.slot, msg], { except: client });
    },
    yardSlow: (client: Client, msg: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !isFrame(msg, YARD_SLOW_NUMBERS) || !allowFrame(this.slowAt, client.sessionId, YARD_SLOW_GAP_MS)) return;
      this.lastSlow.set(p.slot, msg);
      this.broadcast("yardSlow", [p.slot, msg], { except: client });
    },
    // A client has just arrived and can take them: every other yard as it last stood.
    yardHello: (client: Client) => {
      const mine = this.state.players.get(client.sessionId)?.slot;
      for (const [slot, frame] of this.lastSlow) if (slot !== mine) client.send("yardSlow", [slot, frame]);
    },
    // Re-states identity after a login/logout that happens AFTER join (a guest who signs in
    // mid-session). The server answers with progress/noProgress for the new identity.
    identify: (client: Client, msg: { username?: string; userId?: string; pfp?: string; token?: string }) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      if (typeof msg?.username === "string") p.username = sanitizeName(msg.username);
      if (typeof msg?.pfp === "string") p.pfp = sanitizePfp(msg.pfp);
      if (typeof msg?.userId === "string") void this.setUserId(client, p, msg.userId, msg.token);
    },
  };

  // Leaderboards (leaderboard.ts): each client gets the top lists + their own ranks, to itself, every
  // LEADERBOARD_EVERY_MS, and once right after their save loads.
  onCreate() {
    this.clock.setInterval(() => {
      for (const c of this.clients) void this.sendLeaderboard(c);
    }, LEADERBOARD_EVERY_MS);
  }

  // `leaderboard` { boards: { rebirths|earned|playtime: [{ name, value }] }, ranks: { stat: n | null } }.
  private async sendLeaderboard(client: Client) {
    const userId = this.userIds.get(client.sessionId) ?? "";
    const [boards, ranks] = await Promise.all([topBoards(), ranksOf(userId)]);
    if (!this.state.players.has(client.sessionId)) return;
    try {
      client.send("leaderboard", { boards, ranks });
    } catch {
      // Gone meanwhile.
    }
  }

  onJoin(client: Client, options?: { username?: string; userId?: string; pfp?: string; token?: string; pose?: unknown; avatar?: string; plot?: string }) {
    const p = new PlayerState();
    p.username = sanitizeName(options?.username);
    p.pfp = sanitizePfp(options?.pfp);
    p.slot = freeSlot([...this.state.players.values()].map((o) => o.slot));
    // Presence from the join options, so the others draw the newcomer right away.
    applyPose(p, options?.pose);
    applyAvatar(p, options);
    applyPlot(p, options);
    this.state.players.set(client.sessionId, p);
    void this.setUserId(client, p, typeof options?.userId === "string" ? options.userId : "", options?.token);
  }

  // A deliberate `room.leave()` closes with CONSENTED -- drop the player at once. Anything
  // else (WiFi blip, backgrounded tab) gets RECONNECT_SECONDS to reconnect with the same session,
  // and keeps its yard meanwhile.
  async onLeave(client: Client, code?: number) {
    if (code === CloseCode.CONSENTED) {
      void this.stampLastSeen(client.sessionId);
      this.forgetSession(client.sessionId);
      return;
    }
    try {
      await this.allowReconnection(client, RECONNECT_SECONDS);
    } catch {
      void this.stampLastSeen(client.sessionId);
      this.forgetSession(client.sessionId);
    }
  }

  // Server-clock "last seen" for a player who has really gone. Call before forgetSession.
  private async stampLastSeen(sessionId: string) {
    const userId = this.userIds.get(sessionId);
    const players = getPlayers();
    if (!userId || !players) return;
    try {
      await players.updateOne({ _id: userId }, { $set: { lastSeen: Date.now() } });
    } catch (err) {
      console.warn("[WorldRoom] stampLastSeen failed", err);
    }
  }

  // Drops a session's per-connection bookkeeping. Its roster entry goes with it, and so its slot.
  private forgetSession(sessionId: string) {
    const slot = this.state.players.get(sessionId)?.slot;
    if (slot !== undefined) this.lastSlow.delete(slot);
    this.state.players.delete(sessionId);
    this.userIds.delete(sessionId);
    this.identified.delete(sessionId);
    this.loaded.delete(sessionId);
    this.checks.delete(sessionId);
    this.fastAt.delete(sessionId);
    this.slowAt.delete(sessionId);
  }

  // Asks who the client really is (auth.ts): guests and anyone Bloxity won't vouch for get no
  // identity, and nothing is loaded or saved for them. Called from both onJoin and `identify`;
  // answers with progress / noProgress / serverError.
  private async setUserId(client: Client, p: PlayerState, raw: string, token: unknown) {
    const check = (this.checks.get(client.sessionId) ?? 0) + 1;
    this.checks.set(client.sessionId, check);
    const userId = (await accountFor(raw, token)).slice(0, 128);
    // The player may have left, or sent a newer identity, while Bloxity answered.
    if (this.checks.get(client.sessionId) !== check || this.state.players.get(client.sessionId) !== p) return;

    const prev = this.userIds.get(client.sessionId) || "";
    // No change (e.g. a username-only identify) -- but the very first call must still answer.
    if (userId === prev && this.identified.has(client.sessionId)) return;
    this.identified.add(client.sessionId);
    this.loaded.delete(client.sessionId); // no writes until the new identity's save is read
    p.signedIn = !!userId;
    p.uid = userId;

    if (userId) {
      // Evict any OTHER live session already claiming this account, so one account never has
      // two racing Mongo writers (a crashed tab lingers up to RECONNECT_SECONDS via
      // allowReconnection in onLeave).
      for (const [sid, uid] of this.userIds) {
        if (sid === client.sessionId || uid !== userId) continue;
        this.forgetSession(sid);
        const stale = this.clients.find((c) => c.sessionId === sid);
        if (stale) {
          try {
            stale.leave(CloseCode.CONSENTED);
          } catch {
            // Already gone -- nothing to clean up.
          }
        }
      }
      this.userIds.set(client.sessionId, userId);
    } else {
      // No identity: stop persisting for this connection. (The client flushes a final
      // saveProgress under the OLD id before sending `identify`.)
      this.userIds.delete(client.sessionId);
    }

    await this.loadProgress(client, userId, p);
  }

  // Sends the saved doc to just this client so it can hydrate its state ("progress"), or
  // "noProgress" when there is nothing to load (new account, guest, or Mongo unset). A failed read
  // sends "serverError" and keeps saving off, so a save that could not be read is never overwritten.
  private async loadProgress(client: Client, userId: string, p: PlayerState) {
    const players = getPlayers();
    let doc: PlayerDoc | null = null;
    if (userId && players) {
      try {
        doc = await players.findOne({ _id: userId });
      } catch (err) {
        console.warn("[WorldRoom] loadProgress failed", err);
        client.send("serverError", {});
        return;
      }
    }
    // The player may have left, or switched identity again, while the read was in flight.
    if (this.state.players.get(client.sessionId) !== p || (this.userIds.get(client.sessionId) ?? "") !== userId) return;

    this.loaded.add(client.sessionId);
    const now = Date.now();
    if (!doc) client.send("noProgress", { serverTime: now });
    else client.send("progress", { ...(sanitizeProgress(doc) ?? {}), serverTime: now });
    void this.sendLeaderboard(client);
  }
}
