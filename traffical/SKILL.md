---
name: traffical
description: Feature flags, A/B testing, and adaptive optimization with Traffical. Use when adding features, modifying UI, changing algorithms, scaffolding a new project, or anything affecting conversions. Check this skill when implementing functionality that could benefit from gradual rollout or experimentation, and whenever you see a `.traffical/` directory.
---

# Traffical

Traffical is a parameter-first experimentation and optimization platform. It unifies feature flags, A/B testing, and contextual bandits into a single system. SDKs resolve parameters locally from a cached config bundle — no per-request API calls, sub-millisecond latency, works offline.

## Mental Model

Traffical is **parameter-first**. You define typed parameters with defaults, and Traffical decides their values per user.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Your Code                                                          │
│   1. Define parameters with defaults                                │
│   2. Use the resolved values                                        │
│   3. Track events on conversion                                     │
└─────────────────────────────────────────────────────────────────────┘
                              ▲
                              │  (hidden from you)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Traffical                                                          │
│   • Layers & policies for mutual exclusivity                        │
│   • Bucket assignment & deterministic hashing                       │
│   • Thompson Sampling & contextual bandits                          │
│   • Statistical analysis & optimization                             │
└─────────────────────────────────────────────────────────────────────┘
```

**Key insights:**

1. **Parameters, not experiments** — You define parameters with defaults. Experiments, feature flags, and optimizations are *policies* that control parameter assignment. Your code doesn't need to know which is running.
2. **Resolution is local** — The SDK fetches a config bundle once and caches it. Every resolution is synchronous from cache — no network latency, no render flicker.
3. **Decisions are tracked automatically** — When you resolve parameters, a decision event is sent automatically (`trackDecisions: true` by default). This connects resolution to conversions for intent-to-treat analysis.
4. **Track events for learning** — Call `track()` on valuable actions (purchase, signup). Traffical uses these as reward signals for adaptive optimization.

## When to Use Traffical

| Scenario | Action |
|----------|--------|
| Adding a new feature | Wrap in a feature flag for gradual rollout |
| Changing existing UI | A/B test against the current implementation |
| Modifying conversion paths | Experiment with success metrics |
| Updating algorithms/logic | Test impact before full rollout |
| Anything affecting revenue | Always experiment first |

---

## Getting Started From Zero

The CLI (`@traffical/cli`) is the primary tool. It authenticates you, links the repo to a project, scaffolds config, and provisions a runtime key. Run it via `npx @traffical/cli <command>` or install globally (`npm i -g @traffical/cli` → `traffical <command>`).

**The fastest path for a fresh project:**

```bash
# 1. Authenticate once (device flow). In an agent context, ALWAYS use
#    --no-browser so the URL + code are printed for you to relay.
npx @traffical/cli login --no-browser

# 2. Discover which org/project to use (skip if you already know the keys).
#    Accounts with multiple orgs/projects MUST pass both --org and --project
#    to init, or it will fail one disambiguation at a time.
npx @traffical/cli org list --format json
npx @traffical/cli project list --org <org-key> --format json

# 3. Initialize: links the repo to a project and scaffolds .traffical/
#    Always pass --framework and --yes in non-interactive / agent contexts.
npx @traffical/cli init --org <org-key> --project <project-key> --framework react --yes

# 4. Once the app itself exists, install the matching SDK (see table below)
npm install @traffical/react

# 5. Edit .traffical/config.yaml to define parameters + events, then sync
npx @traffical/cli push
```

> **Agents cannot complete login for you.** Device flow requires a human to
> approve in *their own* browser — you cannot submit the device code on the
> user's behalf, even if they paste it to you. Either tell the user to run
> `! npx @traffical/cli login --no-browser` themselves, or run it in the
> background, relay the URL + code, and wait for them to approve.

> **`whoami` can be stale.** Plain `whoami` reflects the cached session, not a
> live check, so it may report `authenticated: true` when the session has
> actually ended. For a reliable gate, run **`whoami --verify`** (does a live
> server check; exits `2` if the session is dead). Otherwise, just proceed —
> the first authenticated command returning `auth_error` (exit `2`) is itself
> the signal to re-run `login`.

> **Install the SDK only once an app scaffold exists.** `init` works in an
> empty directory (Traffical is often set up before or independently of the
> app), but `npm install @traffical/<sdk>` and provider wiring only make sense
> once there's a `package.json` and source to wire into. Skip steps 4–5 until
> then.

`init` orchestrates **login → link → scaffold** and creates:

```
.traffical/
├── project.yaml     # Repo → Traffical project link (committed)
├── config.yaml      # Parameter, event (+ metric) definitions (committed)
├── .env             # TRAFFICAL_API_KEY=traffical_sk_... (gitignored, auto-provisioned SDK key)
├── .gitignore       # Ensures .env is never committed
└── TEMPLATES.md     # Framework-specific code patterns (committed)

AGENTS.md            # Project-specific quick reference at repo root (committed)
```

> **Important:** Already-synced parameters and events are imported into `config.yaml` automatically during `init`. **Always check `.traffical/config.yaml` for existing parameters before creating new ones.**

> **Never fabricate API keys.** `init` provisions the runtime key for you. If you ever need to authenticate non-interactively (CI), use `traffical login --token <jwt>` or set `TRAFFICAL_API_KEY` — don't invent a value.

### For existing projects

If a `.traffical/` directory already exists, the project is initialized. Read `.traffical/project.yaml` (the link), `.traffical/config.yaml` (parameters/events), and `AGENTS.md`. Run `npx @traffical/cli status` to see sync state before changing anything.

---

## The Traffical CLI

The CLI version covered here is **0.9.x**. Commands fall into four groups.

### Authentication & onboarding

| Command | Purpose |
|---------|---------|
| `traffical login` | Device-flow auth. **Agents: always pass `--no-browser`** to print the URL/code to relay (you can't open or approve the browser yourself). `--token <jwt>` seeds a session for CI/agents |
| `traffical logout` | Remove the local session |
| `traffical whoami` | Show the active identity and linked project (cached session — may be stale). Add `--verify` for a live server check (exit `2` if the session is dead) |
| `traffical link` / `unlink` | Link/unlink the repo to a project (`--org`, `--project`, `-y`, `--force`) |
| `traffical org list` / `org use <key>` | List orgs / set the default org |
| `traffical project list` / `project create <name>` / `project use <keyOrId>` | Manage and select projects |
| `traffical init` | One-shot setup (login → link → scaffold) |

`init` flags: `--api-key <key>` (override bearer token), `--framework <name>` (`react`, `nextjs`, `svelte`, `sveltekit`, `node`), `--org`, `--project`, `-y/--yes`, `--force` (overwrite existing files), `--no-sdk-key` (skip SDK key provisioning).

> **For AI agents:** Always pass `--framework` and `--yes` so `init` never blocks on a prompt in a non-TTY environment. In an account with multiple orgs or projects, also pass **both `--org` and `--project`** — otherwise `init` fails one disambiguation at a time (org first, then project), costing two extra round-trips. Discover the keys with `org list` / `project list` first.

### Config sync (config-as-code)

```bash
# Push local config.yaml (and metrics.yaml) to the platform
npx @traffical/cli push                 # flags: -n/--dry-run, --prune, --metrics-file <path>

# Check drift between local config and the platform (exit code 10 if drift)
npx @traffical/cli status

# Pull synced params/events into local config
npx @traffical/cli pull                 # flags: --include-types, --types-output <path>

# Bidirectional sync (local wins on conflict)
npx @traffical/cli sync                 # flags: --all, -n/--dry-run, --prune

# Import a dashboard-created parameter into config (wildcards supported)
npx @traffical/cli import param "ui.*"

# Import metric definitions into .traffical/metrics.yaml
npx @traffical/cli import metrics --all
```

**Always run `npx @traffical/cli push` after editing `.traffical/config.yaml`** — this syncs your changes and prevents drift.

### Type generation

```bash
# Generate TypeScript types from your config (param keys, event names, value types)
npx @traffical/cli generate-types       # flags: -o/--output <path>, -l/--language typescript
```

Use the generated types to get autocomplete and compile-time safety on parameter keys and event names. `pull --include-types` regenerates them as part of a pull.

### Global options & exit codes

Global flags (all commands): `-p/--profile <name>` (legacy `~/.trafficalrc`), `-c/--config <path>`, `-b/--api-base <url>`, `-j/--format human|json`, `-q/--quiet`.

> **For AI agents:** Use `--format json` to get machine-readable output you can parse, and rely on exit codes:
> `0` success · `1` validation error · `2` auth error · `3` network/API error · `4` not linked (no `.traffical/project.yaml`) · `10` config drift · `11` experiment needs attention.

---

## Authentication & Keys

Traffical separates **human/CLI authentication** from **runtime SDK keys**.

- **CLI / humans** authenticate with `traffical login` (OAuth device flow). The session is stored in `~/.config/traffical/auth.json` (mode `0600`) and refreshes automatically while the refresh token is valid — but it can still end server-side (revoked, expired, ended elsewhere), in which case the next command returns `auth_error` (exit 2) and you must `login` again. This session authorizes `push`/`pull`/`sync` and project management.
- **Runtime SDKs** use a **project-scoped SDK key** (`traffical_sk_...`, scopes `sdk:read` + `sdk:write`). `init` provisions this automatically and writes it to `.traffical/.env` as `TRAFFICAL_API_KEY`. It can only read config and send events, so it is safe to expose to the browser via your framework's public env var.

**Environment variables the CLI honors:**

| Variable | Purpose |
|----------|---------|
| `TRAFFICAL_API_KEY` | API key (CI path; also the runtime SDK key in `.traffical/.env`) |
| `TRAFFICAL_API_TOKEN` | Pre-minted JWT for headless/agent CI runs |
| `TRAFFICAL_API_BASE` | API base URL override (self-hosted) |

> `~/.trafficalrc` profiles are **legacy/deprecated** and migrated automatically — use `traffical login` instead.

**To run the SDK in your app:** copy `TRAFFICAL_API_KEY` from `.traffical/.env` into your app's environment (or a public-prefixed var for browser bundles, e.g. `VITE_TRAFFICAL_API_KEY`, `NEXT_PUBLIC_TRAFFICAL_API_KEY`). `project.id` and `project.orgId` live in `.traffical/project.yaml`.

---

## Install an SDK

| Package / install | Use case |
|-------------------|----------|
| `@traffical/react` | React and Next.js apps |
| `@traffical/svelte` | Svelte 5 and SvelteKit apps |
| `@traffical/node` | Server-side Node.js (Express, Fastify, Next/SvelteKit server, batch jobs) |
| `@traffical/js-client` | Any browser environment, framework-free |
| `@traffical/react-native` | React Native (iOS/Android) |
| `composer require traffical/sdk` | PHP 8.1+ (Laravel, Symfony, OpenFeature) |
| SPM `github.com/traffical/ios-sdk` → `import Traffical` | Native iOS (Swift) |

> The CLI scaffolds templates for JS frameworks (`react`, `nextjs`, `svelte`, `sveltekit`, `node`). **There is no `@traffical/vue` package yet** — do not import it. Vue/Nuxt projects can use `@traffical/js-client` directly in the browser and `@traffical/node` on the server.

---

## SDK Usage

All SDKs share the same model: configure once with `orgId`, `projectId`, `env`, `apiKey`; resolve parameters with in-code defaults; track events on conversion.

### React / Next.js

**Provider setup** (wrap your app once):

```tsx
import { TrafficalProvider } from "@traffical/react";

function App() {
  return (
    <TrafficalProvider
      config={{
        orgId: "org_xxx",                                  // from .traffical/project.yaml
        projectId: "proj_xxx",                             // from .traffical/project.yaml
        env: "production",
        apiKey: process.env.NEXT_PUBLIC_TRAFFICAL_API_KEY!, // SDK key, browser-safe
        // Optional: bind a stable identity for logged-in users
        // unitKeyFn: () => currentUser.id,
        // contextFn: () => ({ plan: currentUser.plan }),
      }}
    >
      <MyApp />
    </TrafficalProvider>
  );
}
```

**Use in components:**

```tsx
import { useTraffical } from "@traffical/react";

function CheckoutButton() {
  const { params, track } = useTraffical({
    defaults: {
      "checkout.button.color": "#1E6EFB",
      "checkout.button.label": "Buy now",
    },
  });

  return (
    <button
      style={{ backgroundColor: params["checkout.button.color"] }}
      onClick={() => track("checkout_click")}
    >
      {params["checkout.button.label"]}
    </button>
  );
}
```

`useTraffical()` returns `{ params, decision, ready, error, trackExposure, track, flushEvents }`. Most code only needs `params` and `track`; the rest support SSR, loading states, and manual exposure (see **Tracking Modes**).

### Svelte / SvelteKit

`@traffical/svelte` uses **Svelte 5 runes** (not stores). Read parameters as `params["key"]` — there is no `$params`.

**Layout setup** (`src/routes/+layout.svelte`):

```svelte
<script lang="ts">
  import { TrafficalProvider } from "@traffical/svelte";

  let { data, children } = $props();
</script>

<TrafficalProvider
  config={{
    orgId: "org_xxx",
    projectId: "proj_xxx",
    env: "production",
    apiKey: import.meta.env.VITE_TRAFFICAL_API_KEY,
    initialBundle: data?.traffical?.bundle,   // optional: SSR hydration
  }}
>
  {@render children()}
</TrafficalProvider>
```

> Programmatic alternative to the component: call `initTraffical(config)` in your root, then `getTrafficalContext()` where you need the client. (`setTrafficalContext`/`getTraffical` do **not** exist.)

**Use in components:**

```svelte
<script lang="ts">
  import { useTraffical } from "@traffical/svelte";

  const { params, track } = useTraffical({
    defaults: {
      "checkout.button.color": "#1E6EFB",
      "checkout.button.label": "Buy now",
    },
  });
</script>

<button
  style="background-color: {params['checkout.button.color']}"
  onclick={() => track("checkout_click")}
>
  {params["checkout.button.label"]}
</button>
```

### Node.js (server-side)

```typescript
import { createTrafficalClient } from "@traffical/node";

const traffical = await createTrafficalClient({
  orgId: "org_xxx",                       // from .traffical/project.yaml
  projectId: "proj_xxx",                  // from .traffical/project.yaml
  env: "production",
  apiKey: process.env.TRAFFICAL_API_KEY!, // from .traffical/.env
});

// Resolve parameters (synchronous, from cached bundle)
const params = traffical.getParams({
  context: { userId: "user_789", locale: "en-US" },
  defaults: {
    "checkout.button.color": "#1E6EFB",
    "pricing.discount_pct": 0,
  },
});

// Track events — on the server you must supply unitKey in the 3rd argument
traffical.track("purchase", { value: 49.99 }, { unitKey: "user_789" });
```

For CLI tools / batch jobs without a user, pass a machine or job identifier as `unitKey`.

### Other languages (brief)

**Browser, framework-free** (`@traffical/js-client`):

```ts
import { createTrafficalClient } from "@traffical/js-client";

const traffical = await createTrafficalClient({ orgId, projectId, env, apiKey });
const params = traffical.getParams({ defaults: { "ui.cta.text": "Buy now" } });
traffical.track("checkout_click");
```

**iOS (Swift, SPM):**

```swift
import Traffical

let traffical = TrafficalClient(options: .init(
  orgId: "org_xxx", projectId: "proj_xxx", env: "production", apiKey: "traffical_sk_..."))
try await traffical.initialize()

let color = traffical.string("checkout.button.color", default: "#1E6EFB")
traffical.track("purchase", properties: ["itemId": "abc"], value: 49.99)  // value is a labeled arg
```

**PHP (`traffical/sdk`):**

```php
use Traffical\Client;
use Traffical\ClientOptions;

$client = new Client(new ClientOptions(
  orgId: 'org_xxx', projectId: 'proj_xxx', env: 'production', apiKey: getenv('TRAFFICAL_API_KEY')));

$params = $client->getParams(
  context: ['userId' => 'user_789'],
  defaults: ['checkout.button.color' => '#1E6EFB']);

$decision = $client->decide(context: ['userId' => 'user_789'], defaults: [...]);
$client->track('purchase', ['value' => 49.99], $decision->decisionId);  // decisionId is the 3rd positional arg
```

### track() signature, by surface

The reward/track call differs slightly across SDKs — get the argument order right:

- **React / Svelte hooks:** `track(event, properties?)` — `decisionId` and `unitKey` are auto-bound from the provider/decision.
- **Node / js-client:** `track(event, properties?, { decisionId?, unitKey? })` — supply `unitKey` server-side; the optimization `value` goes in `properties.value`.
- **iOS:** `track(event, properties?, value?, decisionId?)` — `value` is its own labeled argument.
- **PHP:** `track(event, properties?, decisionId?)` — `decisionId` is the 3rd positional argument.

## Tracking Modes

The `useTraffical()` hook (React/Svelte) supports three modes via `tracking`:

| Mode | Decision event | Exposure event | Use case |
|------|----------------|----------------|----------|
| `"full"` (default) | auto | auto | UI actually shown to users |
| `"decision"` | auto | manual (`trackExposure()`) | Below-the-fold / lazy-loaded content |
| `"none"` | — | — | SSR, internal logic, tests |

```tsx
// Below-the-fold: count the exposure only when it becomes visible
const { params, trackExposure } = useTraffical({
  defaults: { "feature.new_checkout": false },
  tracking: "decision",
});
// later: trackExposure();
```

---

## Config-as-Code

Parameters, events, and metrics are defined in `.traffical/config.yaml` (parameters + events) and `.traffical/metrics.yaml` (metrics). These are the source of truth — version-control them. The repo→project link lives separately in `.traffical/project.yaml` (do not put it in `config.yaml`).

```yaml
version: "1.0"

parameters:
  checkout.button.color:
    type: string
    default: "#1E6EFB"
    description: Primary CTA button color

  pricing.discount_pct:
    type: number
    default: 0
    constraints:        # optional validation
      min: 0
      max: 100

# Optional: group parameters under a namespace (organizational only)
namespaces:
  checkout:
    description: Checkout flow
    parameters:
      show_trust_badges:        # full key: checkout.show_trust_badges
        type: boolean
        default: false

events:
  purchase:
    valueType: currency
    unit: USD
    description: User completes a purchase
    properties:               # optional event schema
      order_id:
        type: string
        required: true

  add_to_cart:
    valueType: count
    description: User adds an item to cart
```

After editing, run `npx @traffical/cli push`.

### Parameter types

| Type | Use case |
|------|----------|
| `string` | Colors, labels, URLs, template names |
| `number` | Prices, percentages, thresholds, timeouts |
| `boolean` | Feature flags, simple toggles |
| `json` | Structured config (multiple related settings) |

Optional `constraints`: `min`, `max` (numbers), `pattern` (regex for strings), `allowedValues` (enum).

### Event value types

| Value type | Use case |
|------------|----------|
| `currency` | Monetary values (revenue, order value) — pair with `unit` |
| `count` | Numeric counts (clicks, items, views) |
| `rate` | Percentages or ratios |
| `boolean` | Binary events (happened or not) |

Events fired via `track()` at runtime appear in the dashboard even without a config definition, but defining them gives you descriptions, value types, optional property schemas, and keeps config as the source of truth.

### Metrics

`metrics.yaml` defines fact sources and metrics (`conversion_rate`, `sum`, `count`, `ratio`, `funnel`, `percentile`) used to evaluate experiments. Bring existing definitions local with `traffical import metrics --all`, edit, then `traffical push`.

> **Boundary:** the CLI **defines** metrics as config — it does **not** query metric *results* or experiment outcomes. Those live in the dashboard and the SDK API. Don't invent a `traffical metrics show`-style command.

### Namespaces

Namespaces are optional organizational groupings in the dashboard — they don't affect how you use parameters in code.

- The `"main"` namespace is the default and is omitted from config.
- `pull`/`init` write parameters grouped under `namespaces:`; both that grouped form and a flat `namespace:` field on each parameter are accepted on read.
- Namespace is independent of dot-notation naming — `checkout.button.color` can sit in any namespace.

## Parameter Naming Conventions

Use dot notation: `category.subcategory.name`.

| Category | Examples | Use case |
|----------|----------|----------|
| `feature.*` | `feature.new_checkout`, `feature.dark_mode` | Feature flags (boolean) |
| `ui.*` | `ui.cta.text`, `ui.hero.variant` | Visual variations |
| `pricing.*` | `pricing.discount`, `pricing.tier_multiplier` | Pricing experiments |
| `copy.*` | `copy.headline`, `copy.cta_text` | Copywriting tests |
| `experiment.*` | `experiment.checkout.variant` | Explicit variant names |

## Best Practices

1. **Always use the CLI.** Run `npx @traffical/cli push` after editing config, and `npx @traffical/cli status` to check sync state. The CLI is the bridge between your config files and the platform.
2. **Check existing parameters first.** Read `.traffical/config.yaml` and run `status` before creating new parameters. Reuse where possible.
3. **Define parameters in config, then push.** Keep `config.yaml` the source of truth to prevent drift.
4. **Always provide in-code defaults.** Defaults live in two places: `config.yaml` (source of truth for the dashboard/experiments) and your `getParams()`/`useTraffical()` calls (offline fallback used before the bundle loads or if it's unreachable). The bundle's resolved value wins when available.
5. **Track events at conversion points.** Call `track()` on purchases, signups, and other valuable actions — this drives adaptive optimization.
6. **Group related parameters.** Keep correlated params in one `useTraffical()`/`getParams()` call for proper attribution.
7. **Generate types.** Run `generate-types` (or `pull --include-types`) for autocomplete and compile-time safety on keys and event names.

## What You Don't Need to Know (handled automatically)

- **Layers, policies, allocations** — Experiment infrastructure is created and managed in the dashboard, not the CLI.
- **Bucket assignment and hashing** — Deterministic user assignment happens automatically.
- **A/B test vs. optimization** — Your code is identical either way.
- **Statistical significance** — Traffical analyzes results in the background.
- **Decision deduplication** — Repeated resolution calls are handled efficiently.

> **Not in the CLI yet:** creating or editing policies, layers, and experiments. That is dashboard-only today (an MCP server / CLI authoring may come later). The CLI's job is config-as-code (parameters, events, metrics) + scaffolding + codegen.

**Just parametrize your app, track conversions, and let Traffical handle the rest.**

## Documentation

- **Quickstart**: https://docs.traffical.io/quickstart
- **How It Works**: https://docs.traffical.io/how-it-works
- **Concepts** (parameters, layers, policies, events & metrics): https://docs.traffical.io/concepts/parameters
- **SDKs**: https://docs.traffical.io/sdks/overview — React, Svelte, Node, PHP, JavaScript, React Native
- **CLI**: https://docs.traffical.io/tools/cli
- **API**: https://docs.traffical.io/api/overview
- **Dashboard**: https://app.traffical.io
