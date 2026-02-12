---
name: traffical
description: Feature flags, A/B testing, and adaptive optimization with Traffical. Use when adding features, modifying UI, changing algorithms, or anything affecting conversions. Check this skill when implementing new functionality that could benefit from gradual rollout or experimentation.
---

# Traffical

Traffical is a parameter-first experimentation and optimization platform. It unifies feature flags, A/B testing, and contextual bandits into a single system. SDKs resolve parameters locally at the edge — no per-request API calls, sub-millisecond latency, works offline.

## Mental Model

Traffical is **parameter-first**. You define parameters with defaults, and Traffical handles the rest.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Your Code                                                          │
│                                                                     │
│  1. Define parameters with defaults                                 │
│  2. Use the resolved values                                         │
│  3. Track events on conversion                                      │
└─────────────────────────────────────────────────────────────────────┘
                              ▲
                              │  (hidden from you)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Traffical                                                          │
│                                                                     │
│  • Layers & policies for mutual exclusivity                         │
│  • Bucket assignment & deterministic hashing                        │
│  • Thompson Sampling & contextual bandits                           │
│  • Statistical analysis & optimization                              │
└─────────────────────────────────────────────────────────────────────┘
```

**Key insights:**

1. **Parameters, Not Experiments** — You define parameters with defaults. Experiments, feature flags, and optimizations are policies that control parameter assignment. Your code doesn't need to know which.
2. **Resolution Is Local** — The SDK fetches a config bundle once and caches it. Every resolution call is synchronous from cache — no network latency, no render flicker.
3. **Decisions Are Tracked Automatically** — When you call `useTraffical()` or `decide()`, a decision event is automatically sent to Traffical (enabled by default via `trackDecisions: true`). This connects parameter resolution to conversion events for intent-to-treat analysis. No manual setup needed.
4. **Track Events for Learning** — Call `track()` when valuable actions happen (purchase, signup, etc.). Traffical uses this data for adaptive optimization.

## When to Use Traffical

| Scenario | Action |
|----------|--------|
| Adding a new feature | Wrap in feature flag for gradual rollout |
| Changing existing UI | A/B test against current implementation |
| Modifying conversion paths | Experiment with success metrics |
| Updating algorithms/logic | Test impact before full rollout |
| Anything affecting revenue | Always experiment first |

## Getting Started in a Project

### Check for existing setup

Look for a `.traffical/` directory or `traffical.yaml` in the project root. If it exists, the project is already initialized — check the config for existing parameters before creating new ones.

### Initialize with the CLI

If no `.traffical/` directory exists, initialize Traffical:

```bash
# Install the CLI
npm install -g @traffical/cli

# Initialize (creates .traffical/ directory with config and templates)
npx @traffical/cli init --api-key <api-key>
```

This creates:

```
.traffical/
├── config.yaml      # Parameter and event definitions
├── AGENTS.md        # AI agent integration guide (project-specific)
└── templates/       # Framework-specific code templates
```

The CLI auto-detects your framework (React, Next.js, Svelte, SvelteKit, Vue, Nuxt, Node.js) and generates appropriate templates.

### SDK configuration values

After `traffical init`, the `.traffical/config.yaml` contains `project.id` and `project.orgId`. Use these values (along with an `env` like `"production"`) when initializing the SDK. Store the API key in environment variables (`TRAFFICAL_API_KEY`).

### Install an SDK

| Package | Use case |
|---------|----------|
| `@traffical/react` | React and Next.js apps |
| `@traffical/svelte` | Svelte and SvelteKit apps |
| `@traffical/node` | Server-side Node.js (Express, Fastify, etc.) |
| `@traffical/js-client` | Any browser environment |

```bash
# Pick the one matching your framework
npm install @traffical/react
# or
npm install @traffical/svelte
# or
npm install @traffical/node
```

## SDK Usage

### React / Next.js

**Provider setup** (wrap your app once):

```tsx
import { TrafficalProvider } from "@traffical/react";

function App() {
  return (
    <TrafficalProvider
      config={{
        orgId: "org_xxx",
        projectId: "proj_xxx",
        env: "production",
        apiKey: "pk_live_your_public_key",
      }}
      // Optional: provide unitKeyFn for logged-in users
      // unitKeyFn: () => currentUser.id,
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

### Svelte / SvelteKit

**Layout setup:**

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import { setTrafficalContext } from "@traffical/svelte";

  setTrafficalContext({
    orgId: "org_xxx",
    projectId: "proj_xxx",
    env: "production",
    apiKey: "pk_live_your_public_key",
    context: { userId: data.user?.id ?? "anonymous" },
  });
</script>

<slot />
```

**Use in components** (`params` and `track` are Svelte stores — use `$` prefix):

```svelte
<script>
  import { getTraffical } from "@traffical/svelte";

  const { params, track } = getTraffical({
    defaults: {
      "checkout.button.color": "#1E6EFB",
      "checkout.button.label": "Buy now",
    },
  });
</script>

<button
  style="background-color: {$params['checkout.button.color']}"
  on:click={() => $track("checkout_click")}
>
  {$params["checkout.button.label"]}
</button>
```

### Node.js (Server-side)

```typescript
import { createTrafficalClient } from "@traffical/node";

const traffical = await createTrafficalClient({
  orgId: "org_xxx",
  projectId: "proj_xxx",
  env: "production",
  apiKey: "sk_live_your_api_key",
});

// Resolve parameters (synchronous, from cached bundle)
const params = traffical.getParams({
  context: { userId: "user_789", locale: "en-US" },
  defaults: {
    "checkout.button.color": "#1E6EFB",
    "pricing.discount_pct": 0,
  },
});

// Track events (value goes in properties, unitKey in options)
traffical.track("purchase", { value: 49.99 }, { unitKey: "user_789" });
```

### track() API

The `track()` signature differs between client-side and server-side SDKs:

- **React/Svelte** (client-side): `track(event, properties?)` — The `decisionId` and `unitKey` are automatically bound from the provider context. Just call `track("purchase", { value: 49.99 })`.
- **Node.js** (server-side): `track(event, properties?, options?)` — You must provide `unitKey` in the third argument: `traffical.track("purchase", { value: 49.99 }, { unitKey: userId })`. Optionally pass `decisionId` for explicit attribution.

## Config-as-Code

Parameters and events are defined in `.traffical/config.yaml` (or `traffical.yaml`). This file is the source of truth — version-control it alongside your code.

```yaml
version: "1.0"
project:
  id: proj_xxx
  orgId: org_xxx

parameters:
  checkout.button.color:
    type: string
    default: "#1E6EFB"
    description: Primary CTA button color

  checkout.show_trust_badges:
    type: boolean
    default: false

  pricing.discount_pct:
    type: number
    default: 0

events:
  purchase:
    valueType: currency
    unit: USD
    description: User completes a purchase

  add_to_cart:
    valueType: count
    description: User adds item to cart
```

### Parameter types

| Type | Use case |
|------|----------|
| `string` | Colors, labels, URLs, template names |
| `number` | Prices, percentages, thresholds, timeouts |
| `boolean` | Feature flags, simple toggles |
| `json` | Structured config (multiple related settings) |

### Event value types

| Value Type | Use case |
|------------|----------|
| `currency` | Monetary values (revenue, order value) |
| `count` | Numeric counts (clicks, items, views) |
| `rate` | Percentages or ratios |
| `boolean` | Binary events (happened or not) |

## CLI Commands

```bash
# Check sync status between local config and Traffical platform
traffical status

# Push local changes to Traffical (local wins)
traffical push

# Pull remote changes to local config (remote wins)
traffical pull

# Bidirectional sync (local wins for conflicts)
traffical sync

# Import dashboard parameters (supports wildcards)
traffical import "ui.*"

# Validate config without pushing (dry run)
traffical push --dry-run

# Add Traffical references to AI tool config files
traffical integrate-ai-tools
```

## Parameter Naming Conventions

Use dot notation: `category.subcategory.name`

| Category | Examples | Use case |
|----------|----------|----------|
| `feature.*` | `feature.new_checkout`, `feature.dark_mode` | Feature flags (boolean) |
| `ui.*` | `ui.cta.text`, `ui.hero.variant` | Visual variations |
| `pricing.*` | `pricing.discount`, `pricing.tier_multiplier` | Pricing experiments |
| `copy.*` | `copy.headline`, `copy.cta_text` | Copywriting tests |
| `experiment.*` | `experiment.checkout.variant` | Explicit variant names |

## Best Practices

1. **Check existing parameters first** — Look in `.traffical/config.yaml` (or `traffical.yaml`) before creating new ones. Reuse existing parameters where possible.

2. **Always provide in-code defaults** — Defaults appear in two places: in `config.yaml` (the source of truth for the dashboard and experiment setup) and in your `getParams()`/`useTraffical()` calls (the offline fallback). In-code defaults are what the SDK returns when the config bundle hasn't loaded yet or is unreachable. The bundle's resolved value always takes precedence when available.

3. **Track events at conversion points** — Call `track()` on purchases, signups, and other valuable actions. This enables adaptive optimization.

4. **Group related parameters** — Keep correlated params in one `useTraffical()` / `getTraffical()` / `getParams()` call for proper attribution.

5. **Use meaningful param names** — Follow dot notation: `category.subcategory.name`. Be descriptive.

6. **Define parameters in config** — Add new parameters to `.traffical/config.yaml` and run `traffical push` to sync them. This keeps the config file as the source of truth.

7. **Use the CLI for changes** — Prefer `traffical push` / `traffical pull` / `traffical sync` over manual dashboard edits to avoid drift.

## What You Don't Need to Know

These are internal concepts handled by Traffical automatically:

- **Layers, policies, allocations** — Experiment infrastructure is managed in the dashboard
- **Bucket assignment and hashing** — Deterministic user assignment happens automatically
- **Whether an A/B test vs. optimization is running** — Your code is the same either way
- **Statistical significance calculations** — Traffical handles analysis in the background
- **Decision deduplication** — Multiple resolution calls are handled efficiently

**Just parametrize your app, track conversions, and let Traffical handle the rest.**

## Documentation

- **Quickstart**: https://docs.traffical.io/quickstart
- **How It Works**: https://docs.traffical.io/how-it-works
- **Parameters**: https://docs.traffical.io/concepts/parameters
- **React SDK**: https://docs.traffical.io/sdks/react
- **Svelte SDK**: https://docs.traffical.io/sdks/svelte
- **Node.js SDK**: https://docs.traffical.io/sdks/node
- **CLI**: https://docs.traffical.io/tools/cli
- **API Overview**: https://docs.traffical.io/api/overview
- **Dashboard**: https://app.traffical.io
