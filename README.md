# Aegis Computer

**Aegis Computer** is an in-house autonomous-computer control plane. It is designed to accept a high-level goal, create a durable task, construct a bounded execution plan, route work through approved computer capabilities, collect evidence, apply verification gates, and deliver provenance-backed artifacts.

## What is implemented

The current application is a full-stack control-plane foundation with Manus authentication, a MySQL-compatible task store, S3-compatible artifact storage, and an owner-alert channel. The premium dark interface includes a protected operator console, goal composer, execution-target controls, model selection, budget limits, recent task ledger, safety posture, owner-alert states, and a permanently available kill switch.

The backend persists task state, structured plan steps, append-only execution events, checkpoints, approvals, artifact provenance, and policy records. It uses a provider-neutral model gateway to discover available models and generate strict JSON execution plans. Every generated plan is checkpointed and stored as a provenance-backed artifact.

| Capability | Current state |
| --- | --- |
| Natural-language task intake and budgeted task lifecycle | Implemented |
| Structured model planning and model discovery | Implemented |
| Execution-target contract for Auto, Cloud Sandbox, Persistent, and Local | Defined |
| Task events, checkpoints, approvals, and kill switch | Implemented |
| S3-compatible plan artifact storage with checksum and provenance | Implemented |
| Owner alerts for approvals, budgets, unrecoverable failure, and verified completion | Implemented |
| E2B disposable cloud-computer provisioning and scoped shell/filesystem execution | Implemented with policy gates, task checkpoints, and kill cleanup |
| Persistent workspace snapshots and resume | Requires persistent execution adapter |
| Local Windows bridge | Requires signed local connector and explicit machine allowlists |
| Browser automation runtime | Requires Playwright-capable execution adapter |
| Delegated OpenHands worker | Requires an isolated worker adapter and independent verifier |

## Trust model

The model is never the policy boundary. All capability requests are evaluated against target, side effect, and secret-handling rules before an execution adapter receives them. Raw secret values are rejected; execution adapters must receive reference identifiers and resolve them only at runtime. Local computer work and state-changing capabilities require explicit approval. The user-facing kill switch issues cancellation requests for every active task.

## Local development

Install dependencies and start the application with:

```bash
pnpm install
pnpm dev
```

Run the validation suite with:

```bash
pnpm check
pnpm test
```

The application requires the runtime environment supplied by the full-stack template for authentication, database connectivity, storage, owner alerts, and model gateway access. Do not commit `.env` files or raw credentials.

## Hosting decision and future migration

The initial prototype remains on **Manus hosting**. It uses the platform-supplied application, authentication, database, storage, alert, and model-gateway services, and the always-on worker is deliberately not enabled at this stage.

**Oracle Cloud Always Free** is the approved future migration target for the coordinator when a continuously running worker is required. The intended Oracle deployment is a self-managed Arm Linux VM running the Aegis application, durable queue/worker, database, and reverse proxy, while E2B remains the isolated provider for agent computer work. No Oracle account, credentials, infrastructure, or deployment workflow will be created until the user explicitly requests that migration.

## Production execution architecture

The web application is the **control plane**, not the place to run arbitrary untrusted software. A real computer-execution deployment should add one or more isolated adapter services behind the capability broker:

1. A disposable cloud sandbox adapter with scoped filesystems, resource limits, egress policy, and automatic cleanup.
2. A persistent workspace adapter with snapshots, checkpoint resume, and budget-aware lifecycle management.
3. A Playwright browser adapter that provides structured accessibility observations, browser traces, screenshots, and downloads.
4. A local bridge installed on an authorized machine with mutually authenticated transport, path/application allowlists, audit records, approvals, and kill switch handling.
5. A delegated-agent adapter that creates a narrow workspace handoff and runs an independent verification step before accepting any external result.

The control plane now includes an E2B cloud-sandbox adapter for disposable task sandboxes with secure defaults, scoped shell/filesystem capability execution, durable observations/checkpoints, and kill-switch cleanup. The next production stage is to move the autonomous plan → act → observe → verify → recover runtime from request handling into a durable checkpoint-resume worker.
