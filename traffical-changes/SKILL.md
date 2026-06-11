---
name: traffical-changes
description: Read-only operate-time companion for Traffical Changes. Use when a Traffical change, experiment, canary, or rollout is already RUNNING and someone asks how it is doing or what should happen next — change/experiment status, reading evidence and recommendations (continue/advance/pause/rollback/complete), "should we ship / advance / roll back?", guardrail breaches and failing health checks, rollout monitoring, the decision log / audit trail, measurement plans, runtime estimates ("how much longer does this experiment need?"), and project-level change KPIs. Connects via MCP (api.traffical.io/mcp) or the management API with a mgmt:read key. NOT for build-time work — adding feature flags or parameters, SDK integration, scaffolding experiments, or config-as-code belong to the `traffical` skill.
---

# Traffical Changes — Operate-Time Read Surface

A **Change** in Traffical is product intent with a lifecycle: "we are changing this
behavior — is it safe? is it better? what did we learn? did it become the default?"
This skill is for **operating** changes that already exist: reading status, evidence,
and the decision log, and telling a human what should happen next.

For **building** — defining parameters, integrating SDKs, tracking events, config-as-code —
use the sibling `traffical` skill instead.

## The hard rule: you read, humans act

The agent surface is **read-only by construction**. Every tool and endpoint below maps
onto GET handlers behind the `mgmt:read` scope. Agent-initiated transitions, approvals,
and annotations are a future phase (Phase 6) and are **not shipped**.

- **Never claim** to have advanced, paused, reverted, approved, or completed anything.
- When action is warranted, **summarize the evidence and point the human at the
  transition console** on the change's detail page in the dashboard
  (https://app.traffical.io) — that is where start/advance/promote/revert happen.
- The system's own posture is the same: "the system recommends, a human executes."

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

Two ways in; both hit the same read-only surface at `https://api.traffical.io`.

**1. MCP (interactive agents).** A minimal streamable-HTTP MCP server lives at
`https://api.traffical.io/mcp`. OAuth discovery is standard: a 401 carries
`WWW-Authenticate` pointing at `/.well-known/oauth-protected-resource`, which names the
authorization server (WorkOS AuthKit) — MCP clients handle the flow automatically.

```bash
claude mcp add --transport http traffical-changes https://api.traffical.io/mcp
```

**2. API key (headless agents, scripts).** A Traffical **management API key with the
`mgmt:read` scope** works as a plain Bearer token — against the MCP endpoint *and*
against the plain GET endpoints directly:

```bash
curl -s -H "Authorization: Bearer $TRAFFICAL_MGMT_KEY" \
  "https://api.traffical.io/v1/changes/$CHANGE_ID/evidence"
```

> **Key gotcha:** the `TRAFFICAL_API_KEY` provisioned into `.traffical/.env` by the CLI
> is a **runtime SDK key** (scopes `sdk:read`/`sdk:write`) — it cannot read changes and
> will get a 403. You need a management key with `mgmt:read`, created in the dashboard
> (Settings → API keys; a read-only key is exactly `["mgmt:read"]`). Never fabricate a
> key value.

## The seven tools

MCP tool names and their plain-GET equivalents (same handlers, same auth):

| MCP tool | GET endpoint | Returns |
|---|---|---|
| `list_changes(projectId, state?)` | `/v1/projects/{projectId}/changes?state=` | Changes in the project, filterable by state |
| `get_change(changeId)` | `/v1/changes/{changeId}` | Change detail: intent, state, phases, current phase, placement |
| `get_change_evidence(changeId)` | `/v1/changes/{changeId}/evidence` | Evidence records, newest first |
| `get_change_decisions(changeId, limit?)` | `/v1/changes/{changeId}/decisions` | The merged decision log (change + phase scoped) |
| `get_measurement_plan(changeId)` | `/v1/changes/{changeId}/measurement-plans` | The resolved measurement plan(s): primary metric, guardrails, phase rules, approval state |
| `preview_transition(changeId, kind?)` | `/v1/changes/{changeId}/transitions/preview` | The next transition: readiness checks, blockers, ranked `planOptions`, runtime estimates |
| `get_change_stats(projectId, windowDays?)` | `/v1/projects/{projectId}/change-stats?windowDays=` | The project's "four numbers" (below) |

One more REST-only endpoint worth knowing:

| | GET endpoint | Returns |
|---|---|---|
| Runtime estimate | `/v1/changes/{changeId}/runtime-estimate` | "Needs ~N more days at current traffic" for the running canary/experiment — `{ estimatedRemainingDays, basis, warnings, observedUnitsPerDay, requiredRemainingSample }` |

Transition kinds for `preview_transition`: `start`, `advance`, `promote`, `complete`,
`revert`. Omit `kind` to preview the natural next step.

MCP `tools/call` example:

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
- **Don't** act, or imply you acted. Point at the transition console.
- **Don't** fabricate endpoints, tools, metrics, or numbers. Everything quotable comes
  from the seven tools above.

## See also

- Build-time work (parameters, SDKs, events, config-as-code): the **`traffical`** skill
- Concepts guide: https://docs.traffical.io/concepts/parameters · Dashboard: https://app.traffical.io
- API overview: https://docs.traffical.io/api/overview
