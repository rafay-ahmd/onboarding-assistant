# Three-person hackathon delivery plan

Date: October 15, 2026. Status: implementation plan; capabilities below are pending unless listed as existing.

## Goal and demo

Deliver a local onboarding portal backed by SQLite, with mocked external services and an MCP interface. An engineering manager (EM) creates a hire; the network team records account/device details; the app tracks simulated provisioning and access requests. Both the dashboard and Codex use the same backend rules and data.

Target demo:

1. Through Codex/MCP, an EM creates a fictional hire with location, manager, start date, profile, requested groups and admin requirement.
2. The app creates one fictional Jira account-creation ticket and assigns the hire to the network queue for that location.
3. A network operator opens the dashboard and records AD ID, work email and laptop ID.
4. The operator starts mock AD-group provisioning. One group fails; retry succeeds without duplicating successful assignments.
5. An admin-required hire receives a separate mock admin request. A second hire without this requirement skips it.
6. Codex explains remaining blockers. The hire dashboard shows the same progress and event history.
7. Restart the server and reload two browser sessions: hires, tickets and outcomes remain available.

All tickets, assignments and service responses in this demo are explicitly simulated. Simulated completion must not change the existing real-access verification or workstation setup prerequisites.

## Current baseline

- Buildless browser app; `server.mjs` serves static assets and GET requests only.
- Draft Dealertrack profile, hire-details form, manual access tracker and setup dependency checklist.
- Browser-local mock helpdesk queue with delivery, follow-up, fictional tickets, denial, retry and reconciliation.
- Read-only workstation inventory script and JSON report import.
- No shared DB, role workflow, account provisioning or MCP server yet.

Reuse these modules rather than rebuilding them. Read [the queue contract](request-queue-contract.md) before changing queue persistence or state transitions.

## Ownership and file boundaries

| Track | Owner | Deliverables | Primary files/directories |
| --- | --- | --- | --- |
| A: platform and dashboards | Vibgy | SQLite, migrations, API, seeded actors, role/location checks, EM/network/hire screens, integration wiring | `server.mjs`, `backend/db/`, `backend/api/`, `backend/services/`, existing `web/` dashboard files |
| B: workflow and mocks | Rafay | Account ticket lifecycle, mock AD assignment, conditional admin requests, existing queue backend integration, failure/retry behavior | `backend/workflows/`, `backend/providers/`, `web/request-queue*.mjs`, `web/mock-slack-adapter.mjs`, related tests |
| C: MCP and demo | Sameer | MCP tool schemas/adapter, configuration instructions, smoke tests and demo script | `mcp/`, `tests/mcp*.test.mjs`, `docs/mcp.md`, `docs/demo.md` |

These are proposed new directories, not existing modules. Track A owns shared server wiring and DB schema. Track B supplies workflow functions and repository requirements; A wires them into the service/API layer. Track C consumes the API and does not write directly to SQLite. Agree edits to shared files before starting; use separate branches and small integration PRs.

## POC scope

- One local Node process owns SQLite; bind HTTP to loopback.
- Seed fictional EM, network and hire actors. A demo actor selector replaces SSO and is clearly labelled as impersonation for this local demo.
- Enforce permissions and network-location scope in backend services; UI filtering alone is insufficient. Demo identity is not production authentication.
- Mock Jira, AD, admin service desk and optional Slack using deterministic responses. No credentials or external submissions are required.
- Explicit user actions advance simulations. No background scheduler or real provisioning is needed.
- Preserve manual real-access records and existing readiness checks.
- Defer SSO, live integrations, workstation installations, remote management and production deployment.

## Shared contract: freeze before parallel implementation

Spend the first 30 minutes agreeing this section. Treat changes as explicit contract updates in this document and tests. Examples below are proposed v1 shapes.

### Data

| Record | Required fields / constraints |
| --- | --- |
| Actor | `id`, `role` (`em`, `network`, `hire`), permitted locations; hire actors map to one `hireId` |
| Hire | immutable UUID `id`, `name`, optional pre-account `email`, `startDate`, `managerId`, `location`, `profileId`, `requestedGroups`, `adminRequired`, timestamps |
| Account details | `hireId` (unique), `adId`, `workEmail`, `laptopId`, `updatedBy`, timestamp |
| Request | UUID, `hireId`, `profileId`, `kind` (`account`, `entitlement`, `admin`), optional `entitlementId`, `provider=mock`, reviewed payload, status, fictional ticket/receipt, attempt count |
| Group assignment | UUID, `hireId`, group identifier, `provider=mock`, status (`pending`, `succeeded`, `failed`), attempt count, error |
| Event | UUID, `hireId`, resource ID, actor ID, event type, timestamp, safe structured detail |

Use foreign keys and unique constraints: one account request per hire; one entitlement request per hire/profile/entitlement; one admin request per hire; one assignment per hire/group. Email is editable data, never the persistent identity key.

Use a transactional command/idempotency record keyed by actor, operation and `Idempotency-Key`; save the response with the resulting mutations. Same key/payload returns the original result; same key/different payload returns a conflict. Hire creation needs this in addition to resource uniqueness so a retried create does not create a second hire.

Actual manual access states, simulated request states and setup completion remain separate records. Do not reinterpret mock `verified` as actual access. Account ticket completion and group assignment success also remain separate outcomes.

### Application services and HTTP

Track A owns the following public service boundary. Services accept a resolved demo actor, validate permissions and invoke Track B workflows. The HTTP layer translates requests; MCP calls HTTP so both clients get the same behavior.

| Operation | Proposed endpoint | Actor / behavior |
| --- | --- | --- |
| Discover demo actors | `GET /api/demo/actors` | Local demo fixtures only |
| Create hire | `POST /api/hires` | EM; atomically saves hire, pending account request and event |
| List hires | `GET /api/hires` | EM: own hires; network: assigned locations; hire: self |
| Get hire | `GET /api/hires/:id` | Same scope; returns account, requests, assignments, events and derived blockers |
| Record account | `PUT /api/hires/:id/account` | Assigned network actor; validates all three account fields |
| Start provisioning | `POST /api/hires/:id/provision` | Assigned network actor; requires recorded account and explicit groups; queues missing group assignments and conditional admin request |
| Prepare entitlement | `POST /api/hires/:id/requests` | Owning EM or self; validates profile routing, required fields and reviewed justification |
| Advance request | `POST /api/requests/:id/actions` | Explicit mock action, including send, ticket, question, answer, grant, verify, deny or reconcile; preserve queue transition rules |
| Advance assignment | `POST /api/assignments/:id/actions` | Assigned network actor; simulate success/failure or retry a failed assignment |

For request actions, the owning EM or hire may send/reply; assigned network actors advance simulated provider outcomes. Authorization applies to every resource lookup, including action endpoints.

Pass the selected demo actor through `X-Demo-Actor-Id`; resolve it against server seed data, never trust a client-supplied role/location. This header is intentionally impersonatable in the local POC. MCP selects a configured actor per session; it must not accept arbitrary role escalation as a tool argument.

Responses: `{ data: ... }`; errors: `{ error: { code, message } }`. Use 400 for invalid input, 403 for forbidden actions, 404 for missing resources, 409 for invalid transitions/idempotency conflicts. Mutations accept `Idempotency-Key`. Return `provider: "mock"` on simulated resources. Specify exact action payloads and fixture responses in contract tests before implementing clients.

Creating a hire only needs pre-account details; work email is not required yet. Existing entitlement drafting may still require work email. Block those requests with an explanatory blocker until the account is recorded. Never silently invent an email or group.

### Workflow boundaries

- Hire creation stores a pending account request. An explicit mock ticket action gives it a `DEMO-` reference; no live URL.
- Recording account details completes the simulated account-creation step and adds an event; it does not claim an AD account was verified externally.
- Provisioning creates missing assignment records and, when `adminRequired=true`, a separate admin request. Repeated calls return existing records.
- Group failures remain visible and retryable. Successful assignments are not rerun. Persist transitions and events atomically.
- Reuse existing queue transitions: delivery is not ticket creation; grant is not verification; unknown delivery requires reconciliation rather than resend.
- Admin requests remain separate from the Slack queue and retain the dedicated-form route. Team-routed entitlements remain manual.
- Derive blockers from persisted records: missing account fields, pending account ticket, failed/pending groups, outstanding admin/access requests. Keep simulated onboarding progress distinct from real workstation readiness.

## Work packages

### A — platform and dashboards

- [ ] Confirm a supported Node version and SQLite library/runtime with the team; document setup and commit the dependency lockfile if dependencies are added.
- [ ] Add migrations, repositories, transactions and fictional seed/reset commands. Ignore DB files and sidecars; reset affects only this app's local demo database.
- [ ] Implement actor resolution, role/location checks, service boundary and HTTP contract.
- [ ] Build multi-hire EM create/list view, location-scoped network queue/account editor, and hire progress view.
- [ ] Connect dashboard to API persistence. Keep existing browser-local data isolated; do not auto-import ambiguous records into shared hires.
- [ ] Provide an early working API slice and fixtures to B/C. Add restart-persistence and authorization tests.

### B — workflow and mocked services

- [ ] Implement deterministic mock account-ticket, AD-group and admin providers with success/failure scenarios.
- [ ] Supply workflows that operate through injected repositories; no second DB connection or standalone schema ownership.
- [ ] Adapt existing mock request domain to immutable hire IDs and durable records without losing reviewed payload, history or deduplication.
- [ ] Implement provisioning prerequisites, conditional admin request and retry semantics.
- [ ] Coordinate queue UI changes with A; preserve actual/manual state isolation.
- [ ] Test duplicate commands, missing account/group data, failure/retry, unknown delivery/reconciliation and admin-required/optional branches.
- [ ] Stretch: persist a mock reminder event; never send a real Slack message.

### C — MCP and demo

- [ ] Implement a local stdio MCP adapter using the supported MCP SDK; document install/start/configuration and the configured demo actor.
- [ ] Expose `list_hires`, `create_hire`, `get_onboarding_status`, `record_account_details`, and `provision_access` against the agreed HTTP API.
- [ ] Mutating tools accept an explicit idempotency key; preserve it across retries. Return useful validation/blocker errors and clear simulation labels.
- [ ] Keep stdout reserved for MCP messages; diagnostics go to stderr. Report backend unavailability clearly.
- [ ] Start against fixture API responses while A builds persistence. Then test the real local API, actor restrictions and duplicate mutations.
- [ ] Write a short demo script with expected results, fictional data and reset instructions.

## Integration milestones

| Gate | Deliverable | Exit check |
| --- | --- | --- |
| 0: contract | All three agree schemas, routes/actions, sample payloads, runtime and file ownership | Each track can work against the same fixtures |
| 1: vertical slice | A: persisted create/list; B: mock account workflow; C: list/create tools | Hire created through MCP appears in the dashboard |
| 2: complete journey | Network details, group assignments, admin branching, shared status | Target demo steps 1–6 work; failures explain what to do next |
| 3: demo ready | Persistence, permissions, retry tests, documentation | Restart retains data; two sessions agree; demo completes reliably |

Integrate at each gate rather than waiting for three completed branches. Cut Slack reminders first, then visual polish and additional profiles. Keep the complete onboarding journey, shared persistence and MCP parity.

## Acceptance and handoff

- [ ] Existing model/queue tests pass; simulated outcomes never unblock real setup.
- [ ] New backend tests cover unauthorized cross-hire/cross-location access and invalid transitions.
- [ ] Duplicate create/provision/request commands return existing results; account email edits do not create a new identity.
- [ ] Restart retains hires, account details, requests, assignments and event history.
- [ ] Dashboard and MCP show identical derived blockers for the same actor/hire.
- [ ] Browser checks cover each role, two hires, location filtering, admin branching and a failed group retry.
- [ ] All seed/demo artifacts are fictional; no credentials, machine reports or DB files are committed.
- [ ] README documents runtime, start/test/seed/reset commands and MCP setup. Update AGENTS.md as capabilities become implemented.

Baseline tests: `node --test tests/*.test.mjs`. If the local sandbox blocks test child processes, use `node --test --test-isolation=none tests/model.test.mjs tests/request-queue.test.mjs` on a Node version supporting that flag. New tests should be included in the normal test command as they are added.

Each PR should state its track, contract changes, tests run and any remaining mock behavior. This plan authorizes no live service submissions and does not claim the pending features already exist.
