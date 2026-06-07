# SDK Usage (all surfaces)

Read this when wiring a Traffical SDK that isn't React. **React/Next.js lives inline in `SKILL.md`** as the canonical example — this file covers Svelte, server-side Node, framework-free JS, iOS, and PHP, plus the `track()` signatures and tracking modes.

All SDKs share the same model: configure once with `orgId`, `projectId`, `env`, `apiKey`; resolve parameters with in-code defaults; track events on conversion. `orgId`/`projectId` come from `.traffical/project.yaml`; the SDK key comes from `.traffical/.env`.

## Svelte / SvelteKit

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
    initialBundle: data?.traffical?.bundle,   // optional: SSR hydration (Svelte's primary field; localConfig also accepted)
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

## Node.js (server-side)

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

For CLI tools / batch jobs without a user, pass a machine or job identifier as `unitKey`. The unit key must be the **same stable identity** you resolve parameters for, or decisions and conversions won't join.

## Browser, framework-free (`@traffical/js-client`)

```ts
import { createTrafficalClient } from "@traffical/js-client";

const traffical = await createTrafficalClient({ orgId, projectId, env, apiKey });
const params = traffical.getParams({ defaults: { "ui.cta.text": "Buy now" } });
traffical.track("checkout_click");
```

## iOS (Swift, SPM)

Add `github.com/traffical/ios-sdk` via Swift Package Manager, then:

```swift
import Traffical

let traffical = TrafficalClient(options: .init(
  orgId: "org_xxx", projectId: "proj_xxx", env: "production", apiKey: "traffical_sk_..."))
try await traffical.initialize()

let color = traffical.string("checkout.button.color", default: "#1E6EFB")
traffical.track("purchase", properties: ["itemId": "abc"], value: 49.99)  // value is a labeled arg
```

## PHP (`traffical/sdk`, `composer require traffical/sdk`)

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

## `track()` signature, by surface

The reward/track call differs slightly across SDKs — get the argument order right:

- **React / Svelte hooks:** `track(event, properties?)` — `decisionId` and `unitKey` are auto-bound from the provider/decision.
- **Node / js-client:** `track(event, properties?, { decisionId?, unitKey? })` — supply `unitKey` server-side; the optimization `value` goes in `properties.value`.
- **iOS:** `track(event, properties?, value?, decisionId?)` — `value` is its own labeled argument.
- **PHP:** `track(event, properties?, decisionId?)` — `decisionId` is the 3rd positional argument.

## React Native (`@traffical/react-native`)

Same model as React, with a mobile-specific provider. The unit key persists in
AsyncStorage; mobile defaults to `evaluationMode: "server"` (a network resolve per
session) — set `"bundle"` with a baked `localConfig` for offline / first-launch experiments.

```tsx
import { TrafficalRNProvider, useTraffical } from "@traffical/react-native";

function App() {
  return (
    <TrafficalRNProvider
      config={{
        orgId: "org_xxx",
        projectId: "proj_xxx",
        env: "production",
        apiKey: process.env.EXPO_PUBLIC_TRAFFICAL_API_KEY,  // traffical_sk_ — app-safe
        unitKeyFn: () => userId,                            // e.g. from AsyncStorage
        // evaluationMode: "bundle",
        // localConfig: require("./traffical-bundle.json"), // baked at build for cold start
      }}
      loadingComponent={<Splash />}
    >
      <RootNavigator />
    </TrafficalRNProvider>
  );
}
```

In components, `useTraffical({ defaults })` and `track()` work exactly as on web.
On a screen that navigates right after a conversion (e.g. checkout), `await flushEvents()`
before navigating so batched events aren't dropped when it unmounts.

## Decoupled tracking with `decide()` + `decisionId`

When resolution and conversion happen in different places — backend resolves, frontend
converts; email/batch sends; switchback windows — capture a `decisionId` from `decide()`
and pass it to `track()` so the conversion attributes to the right decision:

```typescript
// Resolve once and keep the decision id.
const decision = traffical.decide({
  context: { userId: "user_789" },
  defaults: { "search.ranking_algo": "bm25" },
});
const algo = decision.assignments["search.ranking_algo"];

// Later / elsewhere — attribute the conversion explicitly.
traffical.track("purchase", { value: 49.99 }, { decisionId: decision.decisionId, unitKey: "user_789" });
```

In-component hook tracking (`track` from `useTraffical()`) threads the `decisionId` for you —
you only need this for cross-boundary attribution.

## Flicker-free first paint (build-time / SSR bundle)

Until the bundle loads, the SDK serves your in-code defaults — which can flash before the
resolved values arrive. Hand the SDK a bundle up front so the first render is already correct:

- **SSR:** fetch on the server (`loadTrafficalBundle` from `@traffical/svelte/sveltekit`, or
  `fetchBundle` from `@traffical/react/server`) and pass it through as `localConfig` /
  `initialBundle` (see the SSR sections above).
- **SPA / mobile (build-time):** fetch the bundle in a prebuild step and import it as `localConfig`:

```bash
# prebuild step — write the bundle to a file the app imports as localConfig
curl -s -H "Authorization: Bearer $TRAFFICAL_API_KEY" \
  "https://sdk.traffical.io/v1/config/$PROJECT_ID?env=$ENV" > src/traffical-bundle.json
```

Either way the SDK keeps refreshing in the background, so the embedded bundle only removes the
initial flash — dashboard changes still land within the refresh interval.

## `identify()` and anonymous users

Before login, the browser and React Native SDKs bucket the user by an auto-generated stable id.
On login, switch to your real identity so they're bucketed consistently with your backend:

```tsx
import { useTrafficalClient } from "@traffical/react";

function onLogin(user) {
  const { client } = useTrafficalClient();
  client.identify(user.id); // re-buckets this session; subscribe with client.onIdentityChange(fn)
}
```

Because the unit key changes, the user may move to a different variant after login — that's
expected. Server SDKs have no anonymous id; always pass `unitKey` explicitly.

## Plugins (advanced)

All SDKs accept `plugins: [...]` in `config`. `createDebugPlugin()` (from `@traffical/js-client`)
powers the Traffical DevTools overlay; a custom plugin implements `onDecision` / `onExposure` /
`onTrack` to observe the event stream (e.g. to feed a debug panel). Optional — not needed for a
normal integration.

```typescript
import { createDebugPlugin } from "@traffical/js-client";
// pass in the provider/client config: plugins: [createDebugPlugin({ instanceId: "my-app" })]
```

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
