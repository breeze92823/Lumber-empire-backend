import { listen } from "@colyseus/tools";

import app from "./app.config.js";
import { connectDb } from "./db.js";
import { installRoomReporter } from "./legion-room-reporter.js";
import { installPlatformBoards } from "./platformBoards.js";

// Player-progress persistence (src/db.ts) connects before the room accepts
// players; connectDb() itself never throws or hangs (degrades to "no persistence").
await connectDb();

// Listens on PORT (or 2567).
await listen(app);

// Both are no-ops without the Bloxity env vars: this pod's rooms for the matchmaker, and the
// trophy button's scores.
installRoomReporter();
installPlatformBoards();
