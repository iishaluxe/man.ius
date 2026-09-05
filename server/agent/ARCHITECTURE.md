# Agent module map (as of the execution-loop-fix + intelligence archive)

This file exists so nobody — including me in a future session — has to
re-derive this by grepping the whole tree again. It answers one question
per module: is this actually reachable from the running app?

## LIVE (imported by the tRPC router or the client)

- `server/agent/execution.ts` — `CapabilityBroker`, `ExecutionRouter`
- `server/agent/e2bAdapter.ts` — the only real execution adapter
- `server/agent/modelGateway.ts` — plan/act/observe/verify LLM calls
- `server/agent/policy.ts` — the actual trust boundary (approvals, budgets)
- `server/agent/registry.ts` — capability + execution target definitions
- `server/agent/taskRunner.ts` — the loop that runs a persisted plan
- `server/agent/ownerAlerts.ts` — notification helper
- `server/db.ts`, `server/routers/agent.ts`, `client/src/pages/Home.tsx`

## TESTED BY THE CORE SUITE, BUT NOT WIRED INTO THE ROUTER

- `server/agent/orchestrator.ts` — imported directly by `server/agent/agent.test.ts`
  (`actionFingerprint`, `isStuck`, `nextLoopDirective`). **Do not move this
  file without also updating `agent.test.ts`** — that import is a live tie,
  not dead weight, even though the router never calls it.

## ARCHIVED (moved, verified safe — zero external references either direction)

- `server/agent/intelligence/` → **moved to** `server/agent/_archive/intelligence/`
  (`modelRegistry.ts`, `adaptiveModelRouter.ts`, `modelProfile.ts`,
  `routingTypes.ts`, `index.ts`, plus its test). This was checked two ways
  before moving: (1) nothing outside the folder imports from it, (2)
  every import inside every one of its files is a sibling `"./..."`
  reference — none reach outside the folder. That combination is what
  made it safe to relocate with zero import-path edits. It is exactly the
  model registry + adaptive router from the original roadmap list — fully
  built and tested, just not called from anywhere yet. This is the
  natural starting point for step 4 (re-integration).

## NOT YET MOVED — genuinely tangled, needs care, not neglect

These import from each other in a way that isn't a clean tree:
`runtime/` → `context/`, `planning/`; `session/` → `context/`, `loop/`,
`orchestration/`, `planning/`; `orchestration/` → `execution`, `runtime/`;
`planning/` → `context/`, `loop/`, `orchestration/`, `modelGateway`,
`registry`; `context/` → `runtime/`. Several of those are circular at
the folder level. `autonomousAgent.ts` and `planner.ts` both pull in
from `runtime/` (types and classes, not just type-only in `autonomousAgent.ts`'s
case), so they move with that cluster, not independently.

**Why this isn't archived yet:** moving a tangled cluster safely means
rewriting every cross-reference's relative path in a coordinated way
across ~70 files, with no automated tooling here to verify each one
compiles against real types (no network access to install dependencies
and run `tsc` for real). Doing that blind risks a checked-in, silently
broken subtree — worse than leaving it visibly in place and documented.

**What happens to it instead:** it gets moved as part of step 4, one
subsystem at a time, at the exact moment we're already rewriting its
imports on purpose to wire it into the live runner. Folding "relocate"
into "re-integrate" is strictly safer than doing a blind move now and a
rewire later.
