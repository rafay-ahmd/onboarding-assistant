# Request queue integration contract (mock v1)

This document describes the original browser-local queue, mounted only for the CMS draft at `/planner?profile=cms-developer`. The shared SQLite portal at `/` now has a separate platform API and temporary account/group/admin stubs; see [the implemented platform contract](hackathon-plan.md#implemented-platform-contract-track-a). Migrating this entitlement queue into that backend remains Rafay's work. No automatic email-based import connects the two stores.

This increment is a browser-local simulation. It sends no messages, calls no APIs and creates no real tickets. It changes neither the existing manual access state nor setup completion. No server mutation endpoints were added.

## Ownership boundary

Identity/dashboard work can reuse the queue domain functions in `web/request-queue.mjs`. `web/request-queue-ui.mjs` is a small UI adapter mounted by app.mjs only in CMS draft mode. Dealertrack uses web/live-requests.mjs and the current single-operator Slack backend; it does not read the local mock queue. `web/mock-slack-adapter.mjs` is the explicit simulation provider.

For this prototype, email + profile ID + entitlement ID identifies a request and prevents a second record for the same access, including after reload. This is not an authentication boundary or a cross-device guarantee. Future persistence must use a backend-authorized immutable employee ID, tenant/profile/entitlement scope, and a unique constraint. Email changes represent a different identity in the mock. Different browser tabs are refreshed through storage events; localStorage is not a transactional multi-user database.

## Record and state

The v1 record includes provider=`mock`, schemaVersion, UUID, deduplication key, employee snapshot, entitlement ID/name, reviewed text, business justification, status, attempt count, receipt, ticket, outstanding question, answer, timestamps and event history.

The reviewed text is immutable once queued. Changing the hire form does not silently rewrite existing requests. Resetting the mock queue clears all employees' simulated requests, after confirmation; it does not clear the manual access tracker.

States and normal transitions:

    draft -> message-sent -> ticket-created -> granted -> verified
                     -> waiting-for-answer -> message-sent
                     -> denied
    draft -> failed -> message-sent
    draft -> delivery-unknown -> message-sent (receipt reconciliation)

Only a confirmed pre-delivery failure can retry. An uncertain result has no resend action; the demo reconciles to the same deterministic mock receipt. The mock can also deny from waiting-for-answer or ticket-created. Invalid transitions are rejected by the domain layer.

`verified` in this queue means simulated verification only. It must never unblock the real access/setup tracker. Fictional ticket keys begin DEMO- and have no live link. Real customer requests need provider-specific ticket references, independent of message/thread references.

## Adapter seam

The current synchronous mock adapter provides:

- `send(request, scenario)`: accepted + receipt, confirmed failure, or unknown delivery.
- `findReceipt(request)`: deterministic mock channel/thread receipt, including after reload.

The future real transport should live on the authenticated backend, use approved credentials, and expose an asynchronous application service. Do not put Slack tokens in the browser or simply substitute a live fetch into the mock adapter. The UI should await submission status from the service and handle per-request results; no blind batch retries.

Before real implementation, agree with the identity/backend stream on actor authorization, immutable employee IDs, persistence, endpoint shapes, idempotency storage, audit data retention and event correlation. Every submission must preserve its reviewed payload and destination. Correlate incoming events by known channel/thread and provider IDs, not a loose text match. Deduplicate provider events and distinguish sent messages, tickets, grants and verified access.

## Confirmed destination rules

- Helpdesk entitlements: individual request per entitlement with a business justification.
- Dealertrack admin rights now use main’s connected-account Slack flow; CMS admin uses the separately confirmed #helpdesk route in its local mock queue. These stores/identities are never combined.
- Team-routed items: remain manual until the destination is confirmed.
- AWS: required group must be supplied and confirmed; do not assume one group suits every role.

### CMS draft profile

The profile selector reloads the dashboard with a fixed catalog entry. Manual plans are isolated per profile; the existing shared mock queue key and record schema are unchanged. Queue filtering/deduplication still includes profile ID and normalized email. `githubRepository`, optional `githubTeam`/`githubMirrorUser`, and `subteam` are hire-form data; it does not replace immutable hire IDs needed by the future backend.

CMS Atlassian retains the documented OET form route. GitHub organization/repository requests support an Access Request ticket or #helpdesk post, per the GitHub Access guide. Per user confirmation, specific repository access and required local admin use separate posts in #helpdesk and can be simulated, alongside SonarQube and New Relic. Team-routed AWS and artifact items cannot enter this queue. Repository requests require the target repository/permission and GitHub username; a team/AD group or example GitHub user may be supplied if known. Do not invent a group; a supplied prefix-only `CMS-GH-` or wildcard value is rejected. Team names may contain spaces. Allow up to six hours for GitHub changes to fully sync before asking ET to verify; this does not authorize resend or duplicate requests. AWS/VPN needs depend on subteam. Request wording comes from the selected profile. CMS Windows/WSL, Visual Studio Code and mandatory admin are confirmed; remaining subteam requirements need review. See [CMS profile handoff](cms-profile.md).

## Still open

Slack app approval/scopes, helpdesk acceptance of bot-originated requests, on-behalf-of identity, supported ticket API/authentication, and pre-day-one account availability remain unconfirmed. The connected Codex Slack tool is not an application integration credential.

## Test/demo

1. Use a fictional hire and open Review mock request on Trader Jira.
2. Edit the business justification, review the preview, and add it to the queue.
3. Repeat to confirm duplicate prevention.
4. Send to the mock adapter; simulate a follow-up, reply, ticket creation, grant and verification.
5. Queue another entitlement to exercise denial, a known failure/retry, and uncertain delivery/reconciliation.
6. Reload: queue records persist. Change employee email: another employee's records are not shown.
7. Verify real access counts and setup blockers remain unchanged by simulated outcomes.

Run `node --test tests/*.test.mjs` for domain and existing model tests. Live end-to-end testing requires an approved test process and explicit authorization; development of the integration does not authorize real access requests.

## Access-card projection

createRequestQueue accepts onChange(requests) and exposes getRequests() for the current employee/profile. The dashboard uses accessCardStatus to update card badges and separate actual/mock counts immediately, on reload, on identity changes and on storage events. This is display synchronization only. Actual access dropdown values and real setup dependencies remain independent.
