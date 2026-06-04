#!/usr/bin/env node
// Phase 0 skill checker — deterministic, zero-dependency.
//
// Validates SKILL.md against known ground truth so factual drift (wrong SDK
// API names, nonexistent packages, stale CLI commands) fails fast — the class
// of bug that shipped a broken Svelte/Vue snippet before this existed.
//
// Design rules:
//   • Only FENCED code blocks are checked for code/command correctness. Prose
//     may discuss anti-patterns (e.g. "`getTraffical` does not exist"), so we
//     never flag tokens that appear outside ``` fences.
//   • Frontmatter + links are checked over the whole document.
//   • No network and no SDK checkout required: ground truth is encoded below.
//     Phase 1 (separate evals repo) will verify this ground truth against the
//     live SDK/CLI so the manifest itself can't drift.
//
// Usage:
//   node tests/check-skill.mjs                 # checks every */SKILL.md
//   node tests/check-skill.mjs path/to/SKILL.md
//   CHECK_LINKS=1 node tests/check-skill.mjs   # also HTTP-check doc links
//
// Exit code: 0 = clean, 1 = at least one error.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ──────────────────────────────────────────────────────────────────────────
// GROUND TRUTH — keep in sync with /Users/marcel/Code/traffical/sdk.
// Phase 1 will validate these lists against the real packages automatically.
// ──────────────────────────────────────────────────────────────────────────

// Real, published/workspace packages an agent may import or install.
const REAL_PACKAGES = new Set([
  "@traffical/react",
  "@traffical/svelte",
  "@traffical/node",
  "@traffical/js-client",
  "@traffical/react-native",
  "@traffical/core",
  "@traffical/core-io",
  "@traffical/cli",
  "traffical/sdk", // composer (PHP)
]);

// Public exports per package. If a package appears here, an imported symbol
// that is NOT listed is treated as a fabrication (error). Packages that are
// real but absent from this map only produce a warning on unknown symbols.
const KNOWN_EXPORTS = {
  "@traffical/react": new Set([
    "TrafficalProvider", "useTraffical", "useTrafficalTrack", "useTrafficalClient",
    "useTrafficalPlugin", "useTrafficalParams", "useTrafficalDecision",
    "useTrafficalReward", "TrafficalClient", "createTrafficalClient",
    "createTrafficalClientSync",
  ]),
  "@traffical/svelte": new Set([
    "TrafficalProvider", "initTraffical", "getTrafficalContext", "hasTrafficalContext",
    "useTraffical", "useTrafficalTrack", "useTrafficalReward", "useTrafficalClient",
    "useTrafficalPlugin",
  ]),
  "@traffical/node": new Set([
    "createTrafficalClient", "createTrafficalClientSync", "TrafficalClient",
  ]),
  "@traffical/js-client": new Set([
    "createTrafficalClient", "createTrafficalClientSync", "TrafficalClient",
  ]),
};

// CLI commands that exist in @traffical/cli v0.9.x (top-level).
const CLI_COMMANDS = new Set([
  "login", "logout", "whoami", "link", "unlink", "org", "project", "init",
  "pull", "push", "sync", "status", "import", "generate-types",
]);

// Known-wrong tokens that must never appear in example code. Each is a real
// mistake we have already fixed once; this keeps it from coming back.
// `langs` (optional) restricts a rule to certain fenced languages — e.g.
// `$params` is wrong in Svelte but a normal variable in PHP.
const DENYLIST = [
  { re: /@traffical\/vue\b/, msg: "no @traffical/vue package exists yet — use @traffical/js-client + @traffical/node for Vue/Nuxt" },
  { re: /@traffical\/nuxt\b/, msg: "no @traffical/nuxt package exists" },
  { re: /\bsetTrafficalContext\b/, langs: ["svelte"], msg: "setTrafficalContext is not a Svelte export — use TrafficalProvider or initTraffical()" },
  { re: /\bgetTraffical(?!Context)\b/, langs: ["svelte"], msg: "getTraffical() is not a Svelte export — use useTraffical() (or getTrafficalContext())" },
  { re: /\$params\b/, langs: ["svelte"], msg: "@traffical/svelte uses Svelte 5 runes — read params[\"key\"], not $params" },
  { re: /\bpk_live_/, msg: "pk_live_ keys are not the Traffical model — use the traffical_sk_ SDK key from .traffical/.env" },
];

// Languages whose fenced blocks contain JS-ish imports.
const JS_LANGS = new Set(["ts", "tsx", "typescript", "js", "jsx", "svelte"]);

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

const issues = [];
const add = (level, file, line, msg) => issues.push({ level, file, line, msg });

/** Line number (1-based) of `index` within `text`. */
const lineAt = (text, index) => text.slice(0, index).split("\n").length;

/** Extract fenced code blocks with language + the file line they start on. */
function extractFences(text) {
  const lines = text.split("\n");
  const blocks = [];
  let cur = null;
  lines.forEach((line, i) => {
    const open = line.match(/^```([a-zA-Z0-9_-]*)\s*$/);
    if (!cur && open) {
      cur = { lang: open[1].toLowerCase(), startLine: i + 2, content: [] }; // +2: first content line
    } else if (cur && /^```\s*$/.test(line)) {
      blocks.push({ ...cur, content: cur.content.join("\n") });
      cur = null;
    } else if (cur) {
      cur.content.push(line);
    }
  });
  if (cur) add("error", null, cur.startLine - 1, "unclosed code fence");
  return blocks;
}

// ──────────────────────────────────────────────────────────────────────────
// Checks
// ──────────────────────────────────────────────────────────────────────────

function checkFrontmatter(file, text) {
  if (!text.startsWith("---\n")) {
    add("error", file, 1, "missing YAML frontmatter (must start with ---)");
    return;
  }
  const end = text.indexOf("\n---", 4);
  if (end === -1) {
    add("error", file, 1, "frontmatter not closed with ---");
    return;
  }
  const fm = text.slice(4, end);
  const name = fm.match(/^name:\s*(.+)$/m);
  const desc = fm.match(/^description:\s*(.+)$/m);
  if (!name || !name[1].trim()) add("error", file, 2, "frontmatter missing `name`");
  if (!desc || !desc[1].trim()) {
    add("error", file, 3, "frontmatter missing `description`");
  } else {
    const len = desc[1].trim().length;
    if (len < 40) add("warn", file, 3, `description is short (${len} chars) — skills match better with a richer description`);
    if (len > 1024) add("warn", file, 3, `description is long (${len} chars) — consider trimming`);
  }
}

function checkFences(file, blocks) {
  for (const b of blocks) {
    // Denylisted tokens — some rules are restricted to specific languages.
    for (const { re, msg, langs } of DENYLIST) {
      if (langs && !langs.includes(b.lang)) continue;
      const m = b.content.match(re);
      if (m) add("error", file, b.startLine + lineAt(b.content, m.index) - 1, msg);
    }

    if (JS_LANGS.has(b.lang)) checkJsImports(file, b);
    if (b.lang === "bash" || b.lang === "sh" || b.lang === "shell") checkShell(file, b);
  }
}

function checkJsImports(file, b) {
  // Module specifiers: flag nonexistent / denied @traffical packages.
  for (const m of b.content.matchAll(/from\s*["']([^"']+)["']/g)) {
    const mod = m[1];
    if (!mod.startsWith("@traffical/")) continue;
    const line = b.startLine + lineAt(b.content, m.index) - 1;
    if (!REAL_PACKAGES.has(mod)) {
      add("error", file, line, `imports nonexistent package "${mod}"`);
    }
  }
  // Named imports from traffical packages: flag fabricated symbols.
  for (const m of b.content.matchAll(/import\s+(?:type\s+)?\{([^}]+)\}\s+from\s*["'](@traffical\/[^"']+)["']/g)) {
    const pkg = m[2];
    const known = KNOWN_EXPORTS[pkg];
    const line = b.startLine + lineAt(b.content, m.index) - 1;
    const names = m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
    for (const name of names) {
      if (!known) {
        if (REAL_PACKAGES.has(pkg)) add("warn", file, line, `cannot verify export "${name}" of ${pkg} (no export list)`);
        continue;
      }
      if (!known.has(name)) add("error", file, line, `"${name}" is not exported by ${pkg}`);
    }
  }
}

function checkShell(file, b) {
  // CLI commands: `traffical <cmd>` or `[npx ]@traffical/cli <cmd>`. Placeholders
  // like `<command>` are skipped (the capture requires a lowercase letter).
  const cmdRe = /(?:@traffical\/cli|(?<![\/\w.])traffical)\s+([a-z][a-z0-9-]*)/g;
  for (const m of b.content.matchAll(cmdRe)) {
    const cmd = m[1];
    if (CLI_COMMANDS.has(cmd)) continue;
    add("error", file, b.startLine + lineAt(b.content, m.index) - 1, `unknown CLI command "traffical ${cmd}"`);
  }
  // Package installs.
  for (const m of b.content.matchAll(/(?:npm (?:install|i)|pnpm add|yarn add)\s+((?:@traffical\/[a-z-]+\s*)+)/g)) {
    for (const pkg of m[1].trim().split(/\s+/)) {
      if (!REAL_PACKAGES.has(pkg)) {
        add("error", file, b.startLine + lineAt(b.content, m.index) - 1, `installs nonexistent package "${pkg}"`);
      }
    }
  }
  for (const m of b.content.matchAll(/composer require\s+([a-z0-9][a-z0-9\/-]+)/g)) {
    if (!REAL_PACKAGES.has(m[1])) {
      add("error", file, b.startLine + lineAt(b.content, m.index) - 1, `composer requires nonexistent package "${m[1]}"`);
    }
  }
}

async function checkLinks(file, text) {
  if (process.env.CHECK_LINKS !== "1") return;
  const urls = [...new Set([...text.matchAll(/https?:\/\/[^\s)"'`]+/g)].map((m) => m[0].replace(/[.,]+$/, "")))];
  await Promise.all(urls.map(async (url) => {
    try {
      const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(10000) });
      if (!res.ok) add("warn", file, 0, `link ${res.status}: ${url}`);
    } catch (e) {
      add("warn", file, 0, `link unreachable: ${url} (${e.name})`);
    }
  }));
}

// ──────────────────────────────────────────────────────────────────────────
// Discovery + main
// ──────────────────────────────────────────────────────────────────────────

function discoverSkillFiles() {
  const out = [];
  for (const entry of readdirSync(REPO_ROOT)) {
    const p = join(REPO_ROOT, entry, "SKILL.md");
    try { if (statSync(p).isFile()) out.push(p); } catch {}
  }
  return out;
}

const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const files = args.length ? args : discoverSkillFiles();

if (!files.length) {
  console.error("No SKILL.md found.");
  process.exit(1);
}

for (const file of files) {
  const text = readFileSync(file, "utf-8");
  checkFrontmatter(file, text);
  checkFences(file, extractFences(text));
  await checkLinks(file, text);
}

// ──────────────────────────────────────────────────────────────────────────
// Report
// ──────────────────────────────────────────────────────────────────────────

const rel = (f) => (f ? relative(REPO_ROOT, f) : "?");
const errors = issues.filter((i) => i.level === "error");
const warns = issues.filter((i) => i.level === "warn");

for (const i of [...errors, ...warns]) {
  const tag = i.level === "error" ? "✗ error" : "‼ warn ";
  console.log(`${tag}  ${rel(i.file)}:${i.line}  ${i.msg}`);
}

console.log(
  `\nChecked ${files.length} skill file(s): ` +
  `${errors.length} error(s), ${warns.length} warning(s).`
);
process.exit(errors.length ? 1 : 0);
