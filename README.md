# Traffical Agent Skills

[Traffical](https://traffical.io) is a platform for experimentation, feature management, and adaptive optimization, built on a **parameter-first** architecture: you define typed parameters with defaults, and experiments, feature flags, rollouts, and bandit optimization are all policies that control how those parameters resolve per user — with no code changes between them.

This repo contains the official [Agent Skills](https://agentskills.io) that teach AI coding agents how to use Traffical properly: CLI and auth flows, config-as-code, SDK wiring for every framework, parameter naming conventions, correct event placement — and a full **codebase audit** workflow that finds the product decisions hiding in your code.

Instead of reading docs and wiring everything by hand, your agent does the work the right way, first time. Full product docs for the skill: [docs.traffical.io/tools/agent-skill](https://docs.traffical.io/tools/agent-skill).

## Install

```bash
npx skills add traffical/skills
```

Works with **40+ coding agents** — Claude Code, Cursor, Codex, Windsurf, Cline, and more. The installer auto-detects which agents you have.

```bash
npx skills add traffical/skills -a claude-code   # one specific agent
npx skills add traffical/skills -a cursor
npx skills add traffical/skills -g               # globally (all projects)
npx skills add traffical/skills -y               # non-interactive
npx skills add traffical/skills --list           # preview without installing
```

Once installed, just talk to your agent normally — the skill triggers whenever you do something Traffical can help with: adding a feature, changing UI, pricing, or copy, auditing a repo, migrating hand-rolled flags, wiring event tracking, or any time it sees a `.traffical/` directory.

## Available Skills

| Skill | When | Description |
|-------|------|-------------|
| [**traffical**](traffical/SKILL.md) | Build-time | Set up from zero, parametrize code, author config-as-code, wire any SDK (React, Svelte, Node, JS, React Native, iOS, PHP), place conversion events, audit a codebase, migrate flags. |
| [**traffical-changes**](traffical-changes/SKILL.md) | Operate-time | Read-only companion for running changes: experiment/canary/rollout status, evidence and recommendations, guardrail breaches, the decision log, runtime estimates — via MCP (`api.traffical.io/mcp`) or the management API. |

The boundary: `traffical` builds and instruments; `traffical-changes` reads what's running. Agents read evidence and recommend — humans approve transitions in the dashboard.

## What the `traffical` skill teaches

- **Set up from zero** — drives the CLI end to end: device-flow login, project linking, `.traffical/` scaffolding, browser-safe SDK key provisioning. No fabricated commands or keys.
- **Parametrize, don't flag** — the core habit. A boolean flag only buys on/off; a typed parameter buys on/off *and every value in between*, controllable and experimentable from the dashboard forever. The skill lifts real values (copy, prices, thresholds, model choices) into typed parameters and reserves `feature.*` booleans for genuinely binary things.
- **Config-as-code discipline** — parameters and events live in `.traffical/config.yaml`, synced with `push`, typed via `generate-types`, with defaults equal to current behavior so nothing changes on day one.
- **Correct event placement** — `track()` at the real success point (after `res.ok`, never on render or click-before-success), the right signature per SDK, identity bound once, `flushEvents()` before navigation.
- **Framework-correct wiring** — provider setup, SSR/flicker-free patterns, decoupled attribution via `decisionId`, `identify()` on login — for React, Next.js, Svelte, SvelteKit, Node, framework-free JS, React Native, iOS, and PHP.

## Auditing a codebase

The skill's audit answers one question: **what product decisions are frozen in this code that should be configurable and measurable?** Ask naturally — "go through this repo and tell me what we should move into Traffical" — and the agent follows the playbook in [`traffical/references/audit.md`](traffical/references/audit.md):

- **Findings are decisions, not constants.** It hunts specific shapes — hand-rolled env flags, third-party flag SDK calls, AI decision points (model names, prompts, temperatures), business numerics, ranking weights, copy and UX tunables — and judges each against a simple bar: would someone plausibly want to change this without a deploy, does it visibly alter behavior, and could an outcome measure it?
- **Capped and ranked.** Default cap of 10, ranked by leverage (revenue levers first). It also lists what it deliberately did *not* flag, and why — the near-misses are what make the rest credible.
- **Behavior-preserving by construction.** Every proposed parameter's default equals the current hardcoded value. Accepting a finding changes nothing until you decide it should.
- **Two artifacts, zero code changes:**
  - `TRAFFICAL_AUDIT.md` — the report: ranked findings with `file:line` evidence, ready-to-paste parameter blocks, outcome mappings, untracked conversions, and a suggested order (instrument first, then migrate the riskiest flag, then parametrize the highest-leverage values).
  - `.traffical/audit.yaml` — the review state: every finding carries a status (`proposed | accepted | dismissed | deferred`). Dismiss with a reason and it is never proposed again; re-audits diff against this file instead of starting over.
- **Safety rails.** Audit-only (no code or config changes unless you ask), secrets are never quoted, and repo contents are treated as data — instructions embedded in scanned code are refused and flagged.

The audit behavior is exercised by behavioral evals (separate repo) against a realistic fixture with planted decisions, planted noise, a canary secret, and a prompt-injection trap — passing across both Claude-family agents and Codex.

## Example prompts

| You say | The agent does |
|---------|----------------|
| "Set us up with Traffical and put the checkout button color behind it." | Logs in, inits the project, installs `@traffical/react`, defines `checkout.button.color`, wires the provider, reads it via the SDK, pushes. |
| "Go through this repo and tell me what we should move into Traffical." | Writes a ranked `TRAFFICAL_AUDIT.md` plus `.traffical/audit.yaml` review state. No code changed. |
| "Make the pricing card's discount, CTA, and highlight color controllable without a redeploy." | Lifts each value into a typed parameter (number with constraints, strings), reads them via the SDK with in-code defaults, pushes. |
| "We're flying blind on checkout — nothing fires when an order completes." | Defines a `purchase` currency event and fires `track()` at the success point, flushing before navigation where relevant. |
| "How's the new-hero experiment doing — should we ship it?" | (`traffical-changes`) Reads the change's evidence and recommendation over MCP, explains it, and points you at the dashboard to act. |

## How the skills stay accurate

Skills drift when the SDK and CLI evolve under them. This repo treats that as a testing problem:

```bash
npm test                          # static drift check on every */SKILL.md + references
CHECK_LINKS=1 npm test            # also HTTP-check documentation links
```

The zero-dependency checker validates all fenced code against ground truth: real package names and exports, real CLI commands, real MCP tools and API paths, SDK config options, the `traffical_sk_` key format, and the audit contract's enums. Ground truth is split:

- **Hand-maintained** fallbacks at the top of [`tests/check-skill.mjs`](tests/check-skill.mjs), including a denylist of previously-shipped mistakes so fixed bugs can't return.
- **Generated** from the real SDK into [`tests/ground-truth.json`](tests/ground-truth.json) by [`tests/sync-ground-truth.mjs`](tests/sync-ground-truth.mjs) — it imports the installed `@traffical/*` packages (resolving `export *`), reads config-option names from their `.d.ts`, and the key prefix from the control plane. The checker only ever *expands* allowlists from it, so regenerating is always safe. The published docs have drifted from the SDK more than once; the SDK is the source of truth.

```bash
# Regenerate where the SDK / a demo's node_modules is available:
node tests/sync-ground-truth.mjs
node tests/sync-ground-truth.mjs /path/to/app-with-traffical-installed
```

`ground-truth.json` is committed so `npm test` runs offline in CI on every PR. Beyond the static layer, behavioral evals (agents run on sandboxed fixture repos with a recording fake CLI, graded on what they actually produce) live in a separate repo.

## Repo layout

```
traffical/
├── SKILL.md                  # build-time skill
└── references/
    ├── sdk-usage.md          # per-surface SDK patterns (Svelte, Node, RN, iOS, PHP...)
    └── audit.md              # the codebase-audit playbook + audit.yaml contract
traffical-changes/
└── SKILL.md                  # operate-time skill (MCP / management API)
tests/
├── check-skill.mjs           # zero-dependency drift checker
├── sync-ground-truth.mjs     # regenerates ground truth from the real SDK
└── ground-truth.json         # committed manifest (offline CI)
```

## Learn More

- [Agent Skill docs](https://docs.traffical.io/tools/agent-skill) — the product page for this repo
- [Traffical Documentation](https://docs.traffical.io) · [Dashboard](https://app.traffical.io)
- [Agent Skills Specification](https://agentskills.io) · [Skills CLI](https://github.com/vercel-labs/skills)
