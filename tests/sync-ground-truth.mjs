#!/usr/bin/env node
// Regenerate tests/ground-truth.json from the REAL SDK — so the Phase-0 checker
// validates the skill against what the SDK actually exports, not a hand-kept list.
//
// This is the durable fix for skill↔SDK drift: the published docs have been wrong
// (pk_/sk_ key model, unitKeyFn placement, Svelte's initialBundle) — source is truth.
//
// Run it where the SDK packages are installed (a demo's node_modules) or where the
// SDK monorepo is checked out. The resulting ground-truth.json is committed and read
// offline by check-skill.mjs (which runs in the public skill repo's CI without the SDK).
//
// Usage:
//   node tests/sync-ground-truth.mjs                 # auto-discovers demo node_modules
//   node tests/sync-ground-truth.mjs <dir-with-@traffical-node_modules> [...more dirs]

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");

// Where the real, built @traffical/* packages live. Default: the three demos +
// the SDK monorepo. Override by passing roots as args.
const DEFAULT_ROOTS = [
  "/Users/marcel/Code/traffical/ng/demos/ecommerce-full",
  "/Users/marcel/Code/traffical/ng/demos/playground",
  "/Users/marcel/Code/traffical/ng/demos/ecommerce-mobile",
];
const CONTROL_PLANE_KEYS = "/Users/marcel/Code/traffical/ng/control-plane/src/auth/api-keys.ts";

const roots = (process.argv.slice(2).filter((a) => !a.startsWith("-")).length
  ? process.argv.slice(2).filter((a) => !a.startsWith("-"))
  : DEFAULT_ROOTS
).map((r) => (isAbsolute(r) ? r : resolve(process.cwd(), r)));

// ── discover installed @traffical/* package dirs (first occurrence wins) ──────
const pkgDirs = new Map(); // name -> abs dir
for (const root of roots) {
  const scope = join(root, "node_modules", "@traffical");
  if (!existsSync(scope)) continue;
  for (const entry of readdirSync(scope)) {
    const dir = join(scope, entry);
    const pj = join(dir, "package.json");
    if (existsSync(pj) && !pkgDirs.has(`@traffical/${entry}`)) {
      pkgDirs.set(`@traffical/${entry}`, dir);
    }
  }
}
if (!pkgDirs.size) {
  console.error("No @traffical/* packages found under:", roots.join(", "));
  console.error("Pass a directory whose node_modules/@traffical/* is installed.");
  process.exit(1);
}

// ── resolve a package (or subpath) entry file from its package.json `exports` ─
function resolveEntry(pkgDir, sub = ".") {
  const pj = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  const exp = pj.exports;
  const pick = (e) => (typeof e === "string" ? e : e?.import ?? e?.default ?? e?.module ?? null);
  let rel = null;
  if (exp && typeof exp === "object") rel = pick(exp[sub]);
  if (!rel && sub === ".") rel = pj.module ?? pj.main;
  return rel ? join(pkgDir, rel) : null;
}

// Subpath entries the skill/docs reference (server-only bundle fetchers).
const SUBPATHS = { "@traffical/react": ["./server"], "@traffical/svelte": ["./sveltekit"] };

// resolve a subpath's .d.ts (for packages we can't import at runtime, e.g. RN/Svelte)
function resolveTypes(pkgDir, sub = ".") {
  const pj = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  const e = pj.exports?.[sub];
  const t = (typeof e === "object" && (e.types || e.default?.replace?.(/\.js$/, ".d.ts"))) || pj.types;
  for (const cand of [t, "dist/index.d.ts", "index.d.ts"]) {
    if (cand && existsSync(join(pkgDir, cand))) return join(pkgDir, cand);
  }
  return null;
}

// parse value export names from a .d.ts (skips `type`-only and unresolved `export *`)
function dtsExportNames(file) {
  const names = new Set();
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/export\s+declare\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_]\w*)/g)) names.add(m[1]);
  for (const m of text.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (let part of m[1].split(",")) {
      part = part.trim(); if (!part || part.startsWith("type ")) continue;
      const as = part.split(/\s+as\s+/); const id = (as[1] || as[0]).trim();
      if (/^[A-Za-z_]\w*$/.test(id)) names.add(id);
    }
  }
  return names;
}

// ── enumerate exports: runtime import (resolves `export *`) ∪ .d.ts names ──────
async function exportsOf(name, pkgDir) {
  const out = new Set();
  const entries = [["@", "."], ...((SUBPATHS[name] || []).map((s) => [name + "/" + s.slice(2), s]))];
  for (const [label, sub] of entries) {
    const entry = resolveEntry(pkgDir, sub);
    if (entry && existsSync(entry)) {
      try {
        const mod = await import(pathToFileURL(entry).href);
        for (const k of Object.keys(mod)) if (k !== "default") out.add(k);
      } catch (e) {
        console.error(`  note: ${name}${sub === "." ? "" : " " + sub} not importable (${e.message.split("\n")[0]}) — falling back to .d.ts`);
      }
    }
    const dts = resolveTypes(pkgDir, sub);
    if (dts) for (const n of dtsExportNames(dts)) out.add(n);
  }
  return [...out].sort();
}

// ── collect config option field names from .d.ts option/config interfaces ─────
function walkDts(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) { if (e !== "node_modules") walkDts(p, acc); }
    else if (e.endsWith(".d.ts")) acc.push(p);
  }
  return acc;
}
function configOptionsFrom(pkgDirsList) {
  const fields = new Set();
  for (const pkgDir of pkgDirsList) {
    for (const file of walkDts(pkgDir)) {
      const text = readFileSync(file, "utf8");
      // Find `interface X {…}` / `type X = {…}` blocks via brace matching, keep
      // those that look like client/provider config (name or body signals it).
      const re = /\b(?:interface|type)\s+(\w+)\s*(?:=\s*)?\{/g;
      let m;
      while ((m = re.exec(text))) {
        const name = m[1];
        let i = re.lastIndex - 1, depth = 0, end = -1;
        for (; i < text.length; i++) {
          if (text[i] === "{") depth++;
          else if (text[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
        }
        if (end === -1) continue;
        const body = text.slice(re.lastIndex, end);
        const looksConfig = /Options$|Config$|Props$/.test(name) || /\borgId\b|\bunitKeyFn\b|\binitialBundle\b/.test(body);
        if (!looksConfig) continue;
        for (const f of body.matchAll(/^\s*(\w+)\??\s*:/gm)) fields.add(f[1]);
        re.lastIndex = end + 1;
      }
    }
  }
  return [...fields].sort();
}

// ── canonical package list from the SDK monorepo (if present) else installed ──
function canonicalPackages() {
  const sdkPkgs = "/Users/marcel/Code/traffical/sdk/js-sdk/packages";
  const names = new Set();
  if (existsSync(sdkPkgs)) {
    for (const d of readdirSync(sdkPkgs)) {
      const pj = join(sdkPkgs, d, "package.json");
      if (existsSync(pj)) try { names.add(JSON.parse(readFileSync(pj, "utf8")).name); } catch {}
    }
  }
  for (const k of pkgDirs.keys()) names.add(k);
  names.add("traffical/sdk"); // PHP composer package (not in JS monorepo)
  return [...names].filter(Boolean).sort();
}

// ── key prefix from the control plane key generator ──────────────────────────
function keyPrefix() {
  try {
    const t = readFileSync(CONTROL_PLANE_KEYS, "utf8");
    const m = t.match(/`(traffical_[a-z]+_)\$\{/) || t.match(/(traffical_sk_)/);
    return m ? m[1] : "traffical_sk_";
  } catch { return "traffical_sk_"; }
}

// ── build + write ─────────────────────────────────────────────────────────────
const exportsMap = {};
for (const [name, dir] of pkgDirs) {
  const ex = await exportsOf(name, dir);
  if (ex.length) exportsMap[name] = ex;
}

const groundTruth = {
  _comment: "Generated by tests/sync-ground-truth.mjs from the real SDK. Do not hand-edit; re-run the script.",
  generatedFromRoots: roots,
  packages: canonicalPackages(),
  exports: exportsMap,
  configOptions: configOptionsFrom([...pkgDirs.values()]),
  keyPrefix: keyPrefix(),
};

const outPath = join(REPO, "tests", "ground-truth.json");
writeFileSync(outPath, JSON.stringify(groundTruth, null, 2) + "\n");
console.log("Wrote", outPath);
console.log("  packages:", groundTruth.packages.length);
console.log("  exports for:", Object.keys(exportsMap).join(", "));
console.log("  configOptions:", groundTruth.configOptions.length, "→", groundTruth.configOptions.join(", "));
console.log("  keyPrefix:", groundTruth.keyPrefix);
