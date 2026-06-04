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

Ground truth (real packages, exports, CLI commands) lives at the top of
[`tests/check-skill.mjs`](tests/check-skill.mjs); update it when the SDKs or CLI
change. Runs automatically in CI on every PR.

## Learn More

- [Traffical Documentation](https://docs.traffical.io)
- [Traffical Dashboard](https://app.traffical.io)
- [Agent Skills Specification](https://agentskills.io)
- [Skills CLI](https://github.com/vercel-labs/skills)
