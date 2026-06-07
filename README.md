# Traffical Agent Skills

Traffical is a platform for experimentation, feature management, and adaptive optimization. It is built on a parameter-first architecture that unifies A/B testing, feature flags, and contextual bandits into a single system.

This repo contains [Agent Skills](https://agentskills.io) that teach AI coding agents how to use Traffical in your projects: SDK integration, config-as-code workflows, parameter naming, event tracking, and CLI usage.

## Install

```bash
npx skills add traffical/skills
```

This works with **40+ coding agents** including Claude Code, Cursor, Codex, Windsurf, Cline, and more. The CLI auto-detects which agents you have installed.

### Options

```bash
# Install to a specific agent
npx skills add traffical/skills -a cursor
npx skills add traffical/skills -a claude-code

# Install globally (available across all projects)
npx skills add traffical/skills -g

# Non-interactive installation
npx skills add traffical/skills -y

# List available skills without installing
npx skills add traffical/skills --list
```

## Available Skills

| Skill | Description |
|-------|-------------|
| **traffical** | Feature flags, A/B testing, and experimentation with Traffical. Covers the CLI (login, init, sync, codegen, metrics), config-as-code, all SDKs (React, Svelte, Node, JS, React Native, iOS, PHP), and best practices. |

## Development

Skills are validated by a zero-dependency static checker that catches factual
drift — nonexistent packages, wrong SDK exports, stale CLI commands — by
checking the fenced code in each `SKILL.md` against known ground truth:

```bash
npm test                          # check every */SKILL.md
CHECK_LINKS=1 npm test            # also HTTP-check documentation links
```

Ground truth (real packages, exports, CLI commands) is split in two:

- **Hand-maintained** fallbacks live at the top of [`tests/check-skill.mjs`](tests/check-skill.mjs).
- **Generated** from the real SDK into [`tests/ground-truth.json`](tests/ground-truth.json)
  by [`tests/sync-ground-truth.mjs`](tests/sync-ground-truth.mjs) — it imports the
  installed `@traffical/*` packages (resolving `export *`), reads the config-option
  field names from their `.d.ts`, and the SDK key prefix from the control plane. The
  checker merges this in (it only **expands** the allowlists), and adds an SDK key-format
  rule (`traffical_sk_` only — no `pk_`/`sk_`) plus a config-option check that warns on
  options the SDK doesn't accept. The published docs have drifted from the SDK more than
  once, so the SDK is the source of truth.

```bash
# Regenerate the manifest where the SDK / a demo's node_modules is available:
node tests/sync-ground-truth.mjs                      # auto-discovers the demos
node tests/sync-ground-truth.mjs /path/to/app-with-traffical-installed
```

`ground-truth.json` is committed so `npm test` runs offline in CI (no SDK checkout
needed); regenerate and commit it when the SDK changes. Runs automatically in CI on every PR.

## Learn More

- [Traffical Documentation](https://docs.traffical.io)
- [Traffical Dashboard](https://app.traffical.io)
- [Agent Skills Specification](https://agentskills.io)
- [Skills CLI](https://github.com/vercel-labs/skills)
