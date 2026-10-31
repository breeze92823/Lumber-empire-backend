import { PLOT_COUNT } from "./constants.js";

// Each player owns one of the world's PLOT_COUNT yards, numbered 0..PLOT_COUNT - 1 (the client's
// PLOTS table says where each one stands). A slot is taken on join and freed with the session, so
// a player riding out a dropped connection keeps their yard. -1 = none free.
export function freeSlot(taken: Iterable<number>): number {
  const used = new Set(taken);
  for (let slot = 0; slot < PLOT_COUNT; slot++) if (!used.has(slot)) return slot;
  return -1;
}
