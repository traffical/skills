---
name: traffical-changes
description: Operate-time companion for Traffical Changes — read, propose, and (where the resolver permits) execute. Use when a Traffical change, experiment, canary, or rollout is already RUNNING and someone asks how it is doing or what should happen next — change/experiment status, reading evidence and recommendations (continue/advance/pause/rollback/complete), "should we ship / advance / roll back?", guardrail breaches and failing health checks, rollout monitoring, the decision log / audit trail, measurement plans, runtime estimates ("how much longer does this experiment need?"), project-level change KPIs, AND governed lifecycle operation: proposing or executing transitions, recording assessments and annotations, refreshing evidence, and requesting approval. Connects via MCP (api.traffical.io/mcp) or the management API with a mgmt:read key for reads; writes need changes:propose / changes:operate / defaults:promote. NOT for build-time work — adding feature flags or parameters, SDK integration, scaffolding experiments, or config-as-code belong to the `traffical` skill.
---

# Traffical Changes — Operate-Time Read & Operate Surface

A **Change** in Traffical is product intent with a lifecycle: "we are changing this
behavior — is it safe? is it better? what did we learn? did it become the default?"
This skill is for **operating** changes that already exist: reading status, evidence,
and the decision log, proposing or executing lifecycle transitions under governance,
and telling a human what should happen next.

For **building** — defining parameters, integrating SDKs, tracking events, config-as-code —
use the sibling `traffical` skill instead.

## The hard rule: you read and propose; the resolver decides if you may execute; humans own approvals

The surface is governed by **least privilege**, not "read-only by construction." What
you can do is bounded in three layers, each narrower than the last:

1. **Scope** — your token's durable ceiling: `changes:propose` (suggest only),
   `changes:operate` (execute resolver-permitted transitions), `defaults:promote`
   (promote-to-default / complete-with-default). A read-only `mgmt:read` token has no
   write scope and stays read-only — nothing changes for existing connections.
2. **The autonomy resolver** — the runtime gate. Even with `changes:operate`, every
   transition is evaluated per the change's **risk class**, the action's **direction**
   (safe vs risk-increasing), unresolved **guardrail breaches**, and whether **measured
   evidence** meets the plan's minimums. The resolver returns `execute` *or* `propose`.
   `effective ≤ scope`, always — the resolver only ever narrows.
3. **`MCP_WRITE_MODE`** — a global/per-org master: `off` rejects all writes;
   `advisory` caps **everything** at `propose` (nothing executes); `execute` lets the
   resolver's `execute` decisions actually fire.

The boundary that does **not** move:

- **Approvals are dashboard-only.** There is **no `approve` tool**. When the resolver
  (or `MCP_WRITE_MODE`) yields `propose`, you create a pending proposal and point the
  human at the **transition console** on the change's page (https://dashboard.traffical.io).
  A human approves *intent*; the system re-checks *safety* at the moment of execution.
- **Never claim an outcome you didn't get.** `request_transition` tells you whether it
  `executed`, `proposed`, or was `blocked` — report exactly that. Never say you advanced
  or promoted something that came back `proposed`.
- **You can never exceed the signed-in human's RBAC.** In the harness you act through
  their token; the resolver narrows from there. The system's own posture is the same:
  recommend, gate, and only auto-execute what is safe and permitted.

## Mental model

```text
Change                     why we are changing something (intent)
  ChangePhase              where the change is in its lifecycle
    Policy                 the runtime assignment executing that phase
  ChangeMeasurementPlan    how this change is measured (resolved snapshot)
  AnalysisRun              a measurement computation (process record)
    EvidenceRecord         the durable artifact analysis produces
  DecisionRecord           who/what decided, why, citing evidence
```

A change moves through phases; each phase kind asks a different question:

| Phase | Question | Typical shape |
|---|---|---|
| `setup` | What are we changing, is it ready? | No traffic; readiness checks |
| `canary` | Is this safe? | 1–5% exposure, health metrics |
| `experiment` | Is this better? | Even split, significance on a primary metric |
| `rollout` | How do we ship it? | Ramp the winner with health checks |
| `adaptive` | Can the system keep improving it? | Bandit/optimizer within guardrails |
| `complete` | Did it become the product? | Defaults updated, policies archived |

Change states: `draft`, `active`, `paused`, `completed`, `archived`. Each
traffic-bearing phase gets its **own policy** (a fresh one on advance), so each phase's
evidence stays clean and comparable.

The spine to remember: **analysis runs → evidence is produced → decisions cite
evidence.** The `DecisionRecord` log is the canonical audit trail.

## Connecting

Two ways in; both hit the same scope-gated surface at `https://api.traffical.io`.

**1. MCP (interactive agents).** A minimal streamable-HTTP MCP server lives at
`https://api.traffical.io/mcp`. OAuth discovery is standard: a 401 carries
`WWW-Authenticate` pointing at `/.well-known/oauth-protected-resource`, which names the
authorization server (WorkOS AuthKit) — MCP clients handle the flow automatically. In
the harness you act through the signed-in human's token: your ceiling is their RBAC and
scopes. `tools/list` is **scope-filtered** — you only see tools your scopes permit, so
a read-only connection lists only the read tools.

```bash
claude mcp add --transport http traffical-changes https://api.traffical.io/mcp
```

**2. API key (headless agents, scripts).** A Traffical **management API key** works as a
plain Bearer token — against the MCP endpoint *and* against the plain GET endpoints
directly. The scope decides what it can do:

```bash
curl -s -H "Authorization: Bearer $TRAFFICAL_MGMT_KEY" \
  "https://api.traffical.io/v1/changes/$CHANGE_ID/evidence"
```

| Scope | What it grants |
|---|---|
| `mgmt:read` | all the read tools/endpoints below; **no** writes |
| `changes:propose` | proposals, assessments, annotations, request-approval — **never** executes a transition |
| `changes:operate` | resolver-gated execute-or-propose of transitions; refresh evidence |
| `defaults:promote` | the highest-risk actions: promote-to-default / complete-with-default |

> **Key gotcha:** the `TRAFFICAL_API_KEY` provisioned into `.traffical/.env` by the CLI
> is a **runtime SDK key** (scopes `sdk:read`/`sdk:write`) — it cannot read changes and
> will get a 403. You need a management key with `mgmt:read` (read-only) or a write
> scope, created in the dashboard (Settings → API keys). Never fabricate a key value.

## The tools

### Read tools

The core change reads — each MCP tool maps onto a GET handler (same auth). All need a
`:read` scope (`mgmt:read` covers them):

| MCP tool | GET endpoint | Returns |
|---|---|---|
| `list_changes(projectId, state?)` | `/v1/projects/{projectId}/changes?state=` | Changes in the project, filterable by state |
| `get_change(changeId)` | `/v1/changes/{changeId}` | Change detail: intent, state, phases, current phase, placement |
| `get_change_evidence(changeId)` | `/v1/changes/{changeId}/evidence` | Evidence records, newest first |
| `get_change_decisions(changeId, limit?)` | `/v1/changes/{changeId}/decisions` | The merged decision log (change + phase scoped) |
| `get_measurement_plan(changeId)` | `/v1/changes/{changeId}/measurement-plans` | The resolved measurement plan(s): primary metric, guardrails, phase rules, approval state |
| `preview_transition(changeId, kind?)` | `/v1/changes/{changeId}/transitions/preview` | The next transition: readiness checks, blockers, ranked `planOptions`, runtime estimates |
| `get_change_stats(projectId, windowDays?)` | `/v1/projects/{projectId}/change-stats?windowDays=` | The project's "four numbers" (below) |

Governance-aware and program-level reads:

| MCP tool | Required scope | Returns |
|---|---|---|
| `get_autonomy(changeId)` | `changes:read` | The **resolver's read face**: per kind, what you may do on this change *now* and why — `execute`/`propose`, the scope ceiling, risk class, direction, matrix base, vetoes, evidence gate, fail-closed. Call this before proposing/executing. |
| `list_attention(projectId)` | `changes:read` | The project's "what needs me?" queue: stalled canaries, degraded rollouts, actionable recommendations (pause/rollback/advance/complete), and **pending proposals/approvals**. |
| `get_project_decisions(projectId)` | `changes:read` | Project-wide decision log ("what changed while I slept"). |
| `get_ai_overview(projectId)` | `projects:read` | Program-level summary: changes by state, adaptive policy counts, recent decisions. |
| `list_parameters(projectId)` / `get_parameter(parameterId)` | `parameters:read` | Setup assistant; `get_parameter` also surfaces surface bindings. |
| `list_metrics(projectId)` / `get_metric(metricId)` | `metrics:read` | Analyst; `get_metric` can include a per-policy snapshot. |
| `get_policy_health(policyId)` | `policies:read` | Rollout watcher. |
| `list_surfaces(projectId)` | `surfaces:read` | Measurement planning. |
| `list_measurement_protocols(projectId)` / `get_measurement_protocol(protocolId)` | `protocols:read` | Measurement planning. |

One REST-only endpoint worth knowing:

| | GET endpoint | Returns |
|---|---|---|
| Runtime estimate | `/v1/changes/{changeId}/runtime-estimate` | "Needs ~N more days at current traffic" for the running canary/experiment — `{ estimatedRemainingDays, basis, warnings, observedUnitsPerDay, requiredRemainingSample }` |

Transition kinds for `preview_transition`: `start`, `advance`, `promote`, `complete`,
`revert`. Omit `kind` to preview the natural next step.

### Write tools (governed)

Only visible when your token carries the scope. Every write is stamped on the audit
spine as *"Agent, on behalf of `<human>`, via MCP."*

| MCP tool | Required scope | Effect |
|---|---|---|
| `request_transition(changeId, kind?, mode?, reason?, selectedAllocationId?)` | `changes:operate` (`defaults:promote` for promote / complete-with-default) | The single transition tool. The resolver decides `execute` vs `propose` (§ Autonomy). Pass `mode:'propose'` to force a human checkpoint even on an auto-eligible action. `reason` is required for `revert`; `selectedAllocationId` for `promote`. **Idempotent on retry.** |
| `submit_assessment(changeId, summary, rationale?, citesEvidenceIds?)` | `changes:propose` | Records an `agent_assessment` evidence record (advisory). |
| `annotate_change(changeId, note, title?)` | `changes:propose` | Writes an `annotation` decision record. |
| `refresh_evidence(changeId)` | `changes:operate` | Recomputes the change's evidence (wraps the evidence/refresh path). |
| `request_approval(changeId, phaseId?, role?)` | `changes:propose` | Puts a transition into the human approval queue without proposing a specific auto-execution. |

There is **no `approve` tool** — approval is dashboard-only (§ The hard rule).

MCP `tools/call` example (read):

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_change_evidence",
    "arguments": { "changeId": "chg_abc123" }
  }
}
```

## Reading a change's status (the standard recipe)

1. `get_change` — state, current phase (kind + how long it has run), placement.
2. `get_change_evidence` — take the `current` records (ignore `superseded`/`invalidated`
   unless auditing); lead with `summary`, `recommendation`, `rationale`.
3. `get_change_decisions` — what has already happened and why; check for an
   unactioned `change_advance_proposed` or a recent `guardrail_breach`.
4. If the question is "what next / how long": `preview_transition` and/or
   the runtime estimate.
5. Report: current phase → latest recommendation + rationale → anything needing a
   human → link the human to the change in the dashboard.

## Proposing or executing a transition (the operate recipe)

Only with a write scope, and only after reading the evidence — never operate blind.

1. **Read first** (the recipe above): confirm the recommendation and rationale support
   the action you're considering.
2. **`get_autonomy(changeId)`** — see, per kind, whether the resolver would `execute` or
   `propose` and *why* (risk class, direction, vetoes, evidence gate). This is your
   pre-flight; it never changes anything.
3. **`request_transition(changeId, kind?, …)`** — the actual call. Inspect `outcome`:
   - `executed` — the transition fired. Report it plainly, citing the `decisionId`.
   - `proposed` — a pending proposal was created for a human. Report that you
     *proposed* (not executed), pass the `autonomy` reasoning and `blockers` through,
     and give the human the `consoleUrl`. Do **not** imply the change moved.
   - `blocked` — nothing happened; name the `blockers` and what would unblock them.
4. **When in doubt, force a checkpoint:** pass `mode:'propose'` to turn an auto-eligible
   action into a proposal a human reviews.
5. The response always carries the **full resolver reasoning** in `autonomy` — surface
   it so the human can understand and trust the decision.

Other writes: `submit_assessment` records your read of the evidence (advisory — cite the
measured records you interpret); `annotate_change` leaves a note on the audit spine;
`refresh_evidence` recomputes evidence before you re-check; `request_approval` parks a
transition in the human queue without proposing a specific auto-execution.

## Interpreting evidence

An `EvidenceRecord` is a durable, immutable artifact: a one-line `summary`, an optional
deterministic `recommendation` + `rationale`, the metric/guardrail ids involved, and a
**provenance** snapshot (measurement plan id, metric versions, assignment signal,
analysis window, significance method) so it stays interpretable months later.

**Kinds** (mapped to phase kinds):

| `kind` | What it tells you |
|---|---|
| `canary_health` | Safety: are health/guardrail metrics within bounds at low exposure? |
| `experiment_result` | The measurement claim: primary-metric effect, significance, guardrails |
| `rollout_health` | Is the ramp healthy enough to keep ramping? |
| `adaptive_status` | What the optimizer is doing within its guardrails |
| `data_quality` | Diagnostics: sample-ratio mismatch, missing events, signal problems |
| `agent_assessment` | A recorded agent/human assessment (not the deterministic engine) |

**Status:** `draft`, `current`, `superseded`, `invalidated`. A refresh creates a new
`current` record and supersedes the prior one for the same (policy, kind) — so "the
evidence" usually means the `current` set.

**Recommendations** come from a deterministic, rule-driven engine reading the
measurement plan (not an LLM):

| `recommendation` | Meaning | What to tell the human |
|---|---|---|
| `continue` | Keep collecting; gates not met yet | Nothing to do; report progress and the runtime estimate |
| `advance` | Phase gates met (e.g. canary safe, experiment significant) | Suggest advancing via the transition console |
| `pause` | Something is wrong enough to stop exposure | Flag urgently; name the breaching guardrail |
| `rollback` | The change is doing harm | Flag urgently; recommend reverting in the console |
| `complete` | Final phase done; winner ready to become the default | Suggest completing so defaults update |

Always pass the `rationale` through — it says *why* (which gate, which guardrail,
which threshold). Never invent significance or effect sizes that are not in the record.

## Decision records — the audit spine

Every lifecycle event lands in one merged, agent-readable decision log per change:
phase started/completed/skipped, advanced (or `change_advance_proposed` awaiting a
human), reverted, completed, abandoned, `guardrail_breach`, `parameter_default_updated`,
`human_approval`, `annotation`, `agent_recommendation`. Each record carries who/what
decided (system automation, human, agent), the rationale, and the **evidence record ids
it cites** — that citation chain is what makes "why did we ship this?" answerable later.

Agent-originated writes (yours, via this surface) are stamped `actorType:'agent'` with
`onBehalfOf` (the signed-in human) and `channel:'mcp'`, so the log reads *"Agent, on
behalf of Marcel, via MCP, proposed advance."* Agent, system-monitor, and human
proposals all land in **one queue with one approve path** — the dashboard console.

Phase-start/advance records also carry structured snapshots in their evidence payload:
`startChecks` (the readiness checks at start) and `planOption` (which traffic-plan
option was chosen: strategy, traffic %, bucket range, estimated days, estimate basis).

## Transition preview and plan options

`preview_transition` answers "can this change move, and how?" It returns readiness
checks, blockers (e.g. unapproved plan, no bucket space), and ranked `planOptions`:

| `strategy` | Meaning |
|---|---|
| `run_now` | The requested traffic % fits — with bucket range and a runtime estimate |
| `run_smaller` | It doesn't fit, but a smaller contiguous gap does — with the (longer) runtime estimate |
| `schedule_after` | Space frees at a known time (every holder has an end date or a computable rollout ETA) — with the start date |
| `blocked` | No option — names the holding policies/changes and what would unblock each |

Every estimate carries a `basis` — `measured` (real traffic history), `assumed`
(system defaults, e.g. 5% relative MDE / alpha 0.05 / power 0.8), or `manual` (a
human-supplied override) — plus warnings (`insufficient_data`, `assumed_baseline`,
`assumed_mde`, …). **Quote the basis and warnings whenever you quote a number.** With
under ~7 days of traffic history there is no measured volume; say so rather than
guessing. The preview accepts ephemeral `?mde=` and `?unitsPerDay=` query overrides for
what-if questions ("what if we only need to detect a 10% lift?") — nothing is persisted.

## The four numbers (`get_change_stats`)

Project-level KPIs over a trailing window (default 90 days, max 365):

1. **Time to exposure** — median hours from change creation to first traffic.
2. **Clean activation rate** — share of phase starts where every readiness check passed
   with zero warnings.
3. **Guardrail catch rate** — share of blocking guardrail breaches followed by a
   pause/revert before the phase completed.
4. **Decision-log completeness** — share of phase transitions citing at least one
   durable evidence record.

Each can be `null` when there is nothing in the window — report "no data," don't
substitute zero.

## The autonomy model (how `request_transition` decides)

The resolver is a pure function over your scope, the change, and current evidence. It
returns `execute` or `propose`. Understanding it lets you predict the outcome before you
call — and explain it afterward.

**Step 1 — direction.** Each kind is classified as **safe** (risk-decreasing) or
**risk-increasing**:

| Kind | Direction |
|---|---|
| `revert`, rollout pause / rollback / reduce-% | **safe** — always auto-eligible (you must be able to stop fast) |
| `start`, `advance`, rollout increase-% | **risk-increasing** — begins or widens exposure |
| `promote`, `complete` with `update_default` | **risk-increasing (highest)** — changes the product default for everyone |
| `complete` without a default update | safe (closing) |

**Step 2 — risk-class matrix.** Safe actions are always `auto`. Risk-increasing actions
are modulated by the change's `risk_class` (from its measurement plan):

| `risk_class` | safe | expand (start/advance/increase-%) | promote / complete-with-default |
|---|---|---|---|
| low | auto | **auto** | propose |
| medium / high / critical | auto | propose | propose |

Promote / complete-with-default are **always** a human checkpoint.

**Step 3 — the narrowing gates** (each can only downgrade `auto` → `propose`):

- **Scope ceiling.** `changes:propose` can never reach `auto`; `changes:operate` /
  `defaults:promote` can. `effective ≤ scope`.
- **Guardrail veto.** An unresolved **blocking** breach downgrades all risk-increasing
  actions to `propose` (safety actions are never vetoed — you want to pause during a
  breach). Warning-level breaches surface in the rationale but don't veto.
- **Evidence-sufficiency.** An auto risk-increasing action fires only when **measured**
  evidence (`canary_health`, `experiment_result`) meets the plan's minimums (runtime /
  sample / freshness). Thin or stale evidence → `propose`. **`agent_assessment` never
  satisfies this gate** — you cannot self-certify your own auto-advance.
- **Fail-closed.** No measurement plan ⇒ no risk class ⇒ safety stays auto, everything
  risk-increasing degrades to propose-only.
- **`MCP_WRITE_MODE`.** `advisory` caps everything at `propose`; `off` rejects.

`get_autonomy` returns this whole chain (`matrixBase`, `vetoes`, `evidenceGate`,
`failClosed`, `writeMode`) per kind; `request_transition` returns it in `autonomy`.

## Automation: who closes the loop

Each traffic-bearing phase carries an automation config, watched by a background
monitor (~15 min) consuming the recommendation engine's output:

| Setting | Options | Meaning |
|---|---|---|
| Advance | `manual` / `propose` / `auto` | Do nothing / write a proposal decision record for a human (default) / execute the transition |
| On blocking breach | `pause` / `revert` / `none` | Default: pause the phase policy |
| On warning breach | `flag` / `pause` | Default: flag as needs-attention |

Every automated action writes a `DecisionRecord` citing its evidence. So when a human
asks "why did the rollout pause itself?", the answer is in `get_change_decisions` —
find the breach record and the action that cites it.

## Do / don't

- **Do** lead with recommendation + rationale + provenance, then the numbers.
- **Do** distinguish evidence kinds: a green canary says *safe*, not *better*; only an
  `experiment_result` supports a shipping claim.
- **Do** surface `data_quality` evidence and estimate warnings prominently — a
  significant result on broken data is not a result.
- **Do** call `get_autonomy` before operating, and report `request_transition`'s
  `outcome` exactly — `executed`, `proposed`, or `blocked`. Pass the resolver's
  reasoning and any `consoleUrl` through to the human.
- **Don't** claim a transition executed when it came back `proposed` or `blocked`.
  Approval is human and dashboard-only — never imply you can approve.
- **Don't** let an `agent_assessment` you wrote stand in for measured evidence, and
  don't fabricate endpoints, tools, metrics, or numbers. Everything quotable comes from
  the tools above.

## See also

- Build-time work (parameters, SDKs, events, config-as-code): the **`traffical`** skill
- Concepts guide: https://docs.traffical.io/concepts/parameters · Dashboard: https://dashboard.traffical.io
- API overview: https://docs.traffical.io/api/overview
