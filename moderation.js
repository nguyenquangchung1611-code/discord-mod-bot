import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = join(__dirname, "rules.json");

// Escape a plain keyword so it is matched literally inside a RegExp.
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Build a single case-insensitive RegExp for one rule.
// keyword rules match the word anywhere; \b guards avoid matching inside other words.
function compileRule(rule) {
  const parts = rule.patterns.map((p) =>
    rule.type === "keyword" ? `\\b${escapeRegex(p)}\\b` : p
  );
  return new RegExp(parts.join("|"), "i");
}

// Read a wordlist file: one term per line, '#' comments and blanks ignored.
async function readWordlist(relPath) {
  try {
    const raw = await readFile(join(__dirname, relPath), "utf8");
    return raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  } catch {
    console.warn(`Wordlist not found: ${relPath}`);
    return [];
  }
}

export async function loadRules() {
  const raw = await readFile(RULES_PATH, "utf8");
  const data = JSON.parse(raw);

  // Merge in patterns from an external wordlist file when a rule specifies one.
  for (const rule of data.rules) {
    if (rule.patternsFile) {
      const fromFile = await readWordlist(rule.patternsFile);
      rule.patterns = [...(rule.patterns ?? []), ...fromFile];
    }
  }

  // Pre-compile enabled rules so we don't rebuild RegExps on every message.
  data._compiled = data.rules
    .filter((r) => r.enabled !== false && r.patterns?.length)
    .map((r) => ({ rule: r, regex: compileRule(r) }));
  return data;
}

export async function saveRules(data) {
  // Drop the runtime-only compiled field before persisting.
  const { _compiled, ...persistable } = data;
  await writeFile(RULES_PATH, JSON.stringify(persistable, null, 2) + "\n", "utf8");
}

// Returns the first matching rule, or null if the content is clean.
export function checkContent(content, rulesData) {
  for (const { rule, regex } of rulesData._compiled) {
    if (regex.test(content)) return rule;
  }
  return null;
}
