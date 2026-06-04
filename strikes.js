import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// DATA_DIR lets the strike store live on a mounted persistent volume so it
// survives redeploys on platforms with ephemeral filesystems (Railway/Render/Fly).
const DATA_DIR = process.env.DATA_DIR || __dirname;
const STORE_PATH = join(DATA_DIR, "strikes.json");

// In-memory store, keyed by "guildId:userId" -> { count, last }.
// `last` is an epoch-ms timestamp of the most recent violation.
let store = {};

export async function loadStrikes() {
  // Ensure the data directory exists (e.g. a freshly mounted volume).
  await mkdir(DATA_DIR, { recursive: true }).catch(() => {});
  try {
    store = JSON.parse(await readFile(STORE_PATH, "utf8"));
  } catch {
    store = {}; // first run, no file yet
  }
}

async function persist() {
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2) + "\n", "utf8").catch((err) =>
    console.warn("Could not persist strikes.json:", err.message)
  );
}

function key(guildId, userId) {
  return `${guildId}:${userId}`;
}

// Record a violation and return how many strikes the user now has within the
// active window. Strikes older than `resetDays` are forgiven (count restarts).
export function recordStrike(guildId, userId, resetDays) {
  const k = key(guildId, userId);
  const now = Date.now();
  const entry = store[k];

  const expired = entry && resetDays > 0 && now - entry.last > resetDays * 86_400_000;
  const count = expired || !entry ? 1 : entry.count + 1;

  store[k] = { count, last: now };
  persist();
  return count;
}

// Map a strike count onto the timeout ladder; counts beyond the ladder length
// stay at the final (longest) tier.
export function timeoutMinutesForStrike(count, ladder) {
  const idx = Math.min(count, ladder.length) - 1;
  return ladder[Math.max(idx, 0)];
}

// Manual reset, e.g. for a /strikes clear command.
export function clearStrikes(guildId, userId) {
  delete store[key(guildId, userId)];
  persist();
}

export function getStrikeCount(guildId, userId) {
  return store[key(guildId, userId)]?.count ?? 0;
}
