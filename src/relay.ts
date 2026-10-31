// Live yard frames: nested arrays of numbers the owner of a yard sends for the room to relay (client
// yard/sync.js). The server never reads what they mean. It checks only that a frame is that shape
// and within its budget, so nothing else can ride along to the other clients.
export function isFrame(msg: unknown, budget: number): boolean {
  let left = budget;
  const walk = (v: unknown): boolean => {
    if (typeof v === "number") return Number.isFinite(v) && --left >= 0;
    if (!Array.isArray(v)) return false;
    return v.every(walk);
  };
  return Array.isArray(msg) && walk(msg);
}

// One client's frames of one kind: false while the last one is less than `gap` ms old.
export function allowFrame(last: Map<string, number>, sessionId: string, gap: number, now = Date.now()): boolean {
  const at = last.get(sessionId);
  if (at !== undefined && now - at < gap) return false;
  last.set(sessionId, now);
  return true;
}
