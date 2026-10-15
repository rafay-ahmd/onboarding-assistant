# Local onboarding MCP adapter

The stdio adapter exposes eight tools against the same HTTP API as the dashboard. It never opens SQLite, calls Slack or installs software. The current backend simulates external account/group/admin provisioning; an empty blocker list does not establish real application readiness. The static CMS planner template is separate from the SQLite profiles discovered by this adapter.

## Install and start

Use Node 24+ and run from the repository root:

```sh
npm ci
npm start
```

Keep that backend process running. Open `http://127.0.0.1:4173/` for the role-based dashboard. If it was started before a route change/rebase, restart it; editing files does not reload the server's in-memory routes. Never reset an existing database just to restart the server.

The adapter uses the official MCP SDK v2, pinned in `package-lock.json`: server SDK and Zod are runtime dependencies; the client SDK is a development dependency for smoke tests. The dashboard itself still runs without these dependencies, but MCP and the complete test suite require `npm ci`. Sources: [official SDK server guide](https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-server), [client guide](https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-client).

Discover fictional actor IDs using `GET /api/demo/actors`, or inspect the dashboard's fictional account switcher. Known seed actors are `em-vibgy` (displayed as Alex Example), `em-other`, `network-toronto` and `network-berlin`. Do not infer permissions from a display name. Each hire has its own `hire-<hireId>` actor.

Configure one actor per adapter process:

| Environment variable | Required / default |
| --- | --- |
| `ONBOARDING_DEMO_ACTOR_ID` | Required; immutable actor ID from backend discovery |
| `ONBOARDING_API_URL` | Optional; defaults to `http://127.0.0.1:4173`; only `http://127.0.0.1[:port]` or `http://localhost[:port]` origins are accepted |
| `ONBOARDING_MCP_TIMEOUT_MS` | Optional; defaults to `5000`; integer from 1 through 60000 |

No API keys, passwords or Slack credentials are needed. These actor IDs deliberately impersonate fictional local demo actors; they are not production authentication. The HTTP backend resolves permissions and locations. No tool accepts an actor/role override.

Start the adapter through an MCP host using `node /absolute/path/to/onboarding-assistant/mcp/index.mjs`. Use the Node executable visible to that host; WSL and native Windows need matching executable/script paths. The host and API server must be able to reach the same loopback address. Do not expose this demo over a public listener to work around environment separation.

The adapter reserves stdout for protocol messages and stderr for diagnostics. Running `ONBOARDING_DEMO_ACTOR_ID=em-vibgy node mcp/index.mjs` directly in a terminal waits for an MCP client; it is not an interactive command prompt. Use the Node entrypoint directly in host configuration rather than `npm run mcp`, whose normal script banner would share stdout. `npm run --silent mcp` is available for manual transport troubleshooting.

## Connect from Codex

The following uses the CLI's stdio registration and environment flags, documented in [official OpenAI MCP configuration guidance](https://learn.chatgpt.com/docs/extend/mcp?surface=cli). Replace the script path with your checkout's absolute path. These commands change your local MCP configuration; they are setup instructions, not actions performed by the implementation.

```sh
codex mcp add onboarding-em --env ONBOARDING_DEMO_ACTOR_ID=em-vibgy --env ONBOARDING_API_URL=http://127.0.0.1:4173 -- node /absolute/path/to/onboarding-assistant/mcp/index.mjs
codex mcp add onboarding-network --env ONBOARDING_DEMO_ACTOR_ID=network-toronto --env ONBOARDING_API_URL=http://127.0.0.1:4173 -- node /absolute/path/to/onboarding-assistant/mcp/index.mjs
codex mcp list
```

Use `/mcp` in a CLI session to inspect the available servers. Use the EM connection for hire creation and the network connection for account/provisioning commands. Each server keeps its own configured actor even when both connections are present. Host tool names may be qualified by connection name. Registering the tools does not start the HTTP backend; keep `npm start` running separately. Fresh Codex CLI sessions have exercised the tools end to end in the [Sameer CMS rehearsal](demo.md).

For that personalized demo, configure `onboarding-em` with `em-pugazh` rather than `em-vibgy`, and add `onboarding-me` using Sameer's actual `hire-<hireId>` actor from discovery. The CMS fixtures require the separate demo-account increment described in the demo guide. The locally configured connections have been verified; the generic commands above remain installation examples. Use a Node executable visible to the host; the local registration used an absolute executable path without adding it to application source. Start a fresh CLI session after registration, or restart the desktop/IDE MCP connection as described in the official guidance. A running chat does not necessarily gain new tool names immediately. `Auth: Unsupported` in `codex mcp list` describes this stdio server's lack of OAuth support, not a failed protocol connection; fixed demo actors provide only the documented local impersonation.

## Tool contract

Tool inputs use the API's camelCase field names. Unknown input fields are rejected before HTTP. All mutation tools require an explicit `idempotencyKey` of 1–200 visible ASCII characters without spaces. IDs come from the backend; do not invent a managed profile ID from the static planner catalogue.

| Tool | Arguments | Backend operation / scope |
| --- | --- | --- |
| `get_my_onboarding` | `{}` | `GET /api/me/onboarding`; hire-only, resolves immutable self mapping |
| `get_profile_requirements` | optional `hireId`; omit for own hire | `GET /api/me/onboarding/requirements` or `/api/hires/:id/requirements`; own hire or existing manager/network visibility |
| `list_profiles` | `{}` | `GET /api/profiles`; EM only |
| `list_hires` | optional nonnegative integer `offset` | `GET /api/hires`; EM's hires, network's locations or hire self; follow `nextOffset` |
| `create_hire` | `firstName`, `lastName`, ISO `startDate`, `location`, `profileId`, `idempotencyKey`; optional `email`, `requestedGroups`, `adminRequired` | `POST /api/hires`; EM only; backend assigns manager |
| `get_onboarding_status` | `hireId` | `GET /api/hires/:id`; same visibility scope |
| `record_account_details` | `hireId`, `adId`, valid `workEmail`, `laptopId`, `idempotencyKey` | `PUT /api/hires/:id/account`; assigned network actor only |
| `provision_access` | `hireId`, `idempotencyKey` | `POST /api/hires/:id/provision` with `{}`; assigned network actor; requires account |

Omit `requestedGroups`/`adminRequired` to use a saved profile's defaults. The backend always adds the network location groups and snapshots the effective requirements. If provided, `requestedGroups` requires 1–60 explicit names and overrides only the profile portion; it cannot suppress mandatory location defaults. Email may be empty or omitted before account creation.

Example create call, using a profile ID returned by `list_profiles`:

```json
{
  "firstName": "Casey",
  "lastName": "Example",
  "startDate": "2026-11-03",
  "location": "Toronto",
  "profileId": "dealertrack-developer",
  "idempotencyKey": "demo-casey-create-v1"
}
```

Results include `data` unchanged from the backend and `context` naming the actor and local-demo/simulated boundary. They are returned both as structured content and JSON text. Status includes backend-derived `blockers`, `events`, requests, account and assignments; the adapter does not recalculate business rules. Events follow the backend's current history limit. The backend labels real readiness as unassessed.

The eight tools do not manage profiles/location defaults, advance provider outcomes, submit portal entitlements or access the live Slack namespace. Use the dashboard for configuration, ticket actions, assignment success/failure/retry and admin grant/verification. Portal entitlement creation remains Track B work and is not exposed as a working tool.

## Idempotency and failures

Use one key per intended mutation. After a timeout, lost connection, cancellation or unreadable response, the backend may already have committed the command. Retry with the **same key and unchanged arguments**, never a newly generated key for that same intent. There are no automatic adapter retries. Successful idempotent replays return the original saved response, so follow with `get_onboarding_status` for current progress.

Tool errors use `isError: true` with structured `error.code`, `message` and HTTP `status` where available. Mutation errors also include the key, `outcomeUnknown` and retry guidance. Correct rejected input/role problems before retrying; a key already bound to another payload produces `IDEMPOTENCY_CONFLICT`. A new intentional edit uses a new key.

Unavailable backend, timeout and invalid-envelope errors are labelled `BACKEND_UNAVAILABLE`, `BACKEND_TIMEOUT` and `BACKEND_PROTOCOL_ERROR`. They do not include raw transport messages or response bodies. Redirects are refused. Invalid startup config exits with stderr guidance and no protocol output.

## Verify

```sh
npm run test:mcp
npm test
```

Where process isolation is unavailable, use `node --test --test-isolation=none tests/*.test.mjs`. Integration tests need loopback sockets and the stdio/startup tests spawn Node processes. Tests use temporary/in-memory stores, fictional identities and backend stubs; they do not reset the running demo database or call Slack. They cover fixtures, eight-tool discovery, input rejection, backend errors, role/location/self restrictions, defaults, deduplication, provider failure/retry, exact API/status parity, persistence after a real SQLite restart, protocol handshake and stdout discipline.

For a repeatable presentation walkthrough, see [the demo script](demo.md).

## New-hire reads

`get_my_onboarding` needs no arguments. The backend resolves the configured hire actor's immutable self mapping and returns the same detail as `get_onboarding_status`. Manager/network actors receive `403 FORBIDDEN`; they must select a visible hire explicitly.

`get_profile_requirements` also needs no arguments for a hire. Managers/network operators pass a visible `hireId`. It returns `hire`, `assignedRequirements` (the saved profile/location revisions, groups and admin requirement), and `guidance` (the matching static recipe, including workstation baseline, access request fields/routes, setup dependencies, sources, review status and open questions). Later profile edits do not rewrite the assigned snapshot. The recipe is reference guidance rather than a policy granting every access candidate. Unknown/custom managed profile IDs return their assigned snapshot with `recipeAvailable: false` and `guidance: null`; matching names or groups never select another team's recipe. These are read-only HTTP services usable by the dashboard as well as MCP.

Ask Codex: “Use onboarding-me/get_my_onboarding and get_profile_requirements to explain my CMS onboarding and what I need to confirm with Pugazh. I do not know my internal hire ID.”

## Useful next tools (proposed, not implemented)

| Priority | Tool | Benefit and dependency |
| --- | --- | --- |
| 2 | `retry_failed_assignment` | Let the assigned network operator retry one failed group through the existing action endpoint, with an explicit idempotency key. It must not rerun successful groups or mark real access verified. |
| 2 | `preview_access_request` | Produce a per-entitlement draft and identify missing repo/team/GitHub details without submitting anything. Agree the shared drafting contract with the workflow stream first. |
| 3 | `create_profile` / `update_profile` and location-default tools | Configure future hires through Codex using existing endpoints, EM/network permissions and revision checks. Existing hire snapshots remain unchanged. |

Do not add a separate blocker-summary tool solely to repeat `get_onboarding_status`; Codex can already explain its returned blockers. Exposing live request submission, verification or workstation execution is separate work with its own backend contracts and explicit review flow. The current eight tools do not perform those actions.
