# Implementation Review — latest platform/dashboard pull

**Verdict:** YELLOW
**Additional input or action required:** false
**Additional input or action reason:** None
**Date:** 2026-10-15 16:19 UTC
**Source:** Local committed diff 7a874ba..e76c55d20c93bbb6ab2978a6442a046c00202426
**Requirements used:** User conversation (three-person work split and subsequent admin/form cleanup); docs/hackathon-plan.md implemented Track A contract; AGENTS.md

## Overview

- Reviewed the seven commits introduced by the latest fast-forward pull, spanning 19 changed files. The working tree was clean.
- The pull adds a Node 24+ SQLite platform, persistent hire/account/group/request/event records, role/location-scoped services and HTTP API, seeded actor switching, role-specific dashboards, and guards for unavailable form/request actions.
- The shared portal is served at `/`; the existing Slack/workstation/setup page is preserved at `/planner`. Those identities, persistence stores and progress records intentionally remain separate pending workflow integration. This is a documented boundary, not an undisclosed implementation defect.

## Findings Summary

| Severity | Count |
|---|---:|
| 🔴 Blocker | 0 |
| 🟡 Important | 2 |
| 🟢 Nit | 0 |

## Findings

### 1. 🟡 Important — The new portal reintroduces the retired admin form route

**Location:** `backend/services/demo-workflows.mjs:16`; also `web/portal.mjs:138`

**Why this is wrong:** The latest user requirement routes local admin rights through the same Slack review/edit/send flow as the other permissions and removes admin-form separation. The merged platform provider still persists admin payloads with `route: 'form'`, and its dashboard explicitly describes them as “Dedicated-form route; separate from Slack.” Meanwhile the retained planner profile has `route: 'helpdesk'`. The same entitlement therefore has contradictory routing in the two current interfaces. An in-memory provisioning reproduction confirmed `portalAdminRoute: 'form'`. The older delivery-plan requirement is superseded by the later explicit user instruction.

**Fix guidance:** Align the platform admin request metadata and dashboard copy with the current entitlement routing contract, preferably using the same profile/routing source rather than another hardcoded admin branch. Retain the clearly bounded local provider until the shared queue is integrated; changing the route must not silently start sending real messages. Update the platform routing assertion and delivery plan together.

**PR comment:** The portal still queues admin access with `route: 'form'` and labels it separate from Slack, although the current profile and latest user requirement moved this entitlement to the standard Slack request flow. This brings back the separation that was just removed from the planner.

### 2. 🟡 Important — Refresh discards the selected hire outside the first page

**Location:** `web/portal.mjs:109` and `web/portal.mjs:113`; create path at `web/portal.mjs:188`

**Why this is wrong:** Ordinary refresh always fetches offset zero and replaces the loaded list with its first 50 entries. It then replaces `selectedId` with the first hire if the selected hire is outside that page. Create explicitly selects the new hire and immediately calls this refresh, so creating the 51st hire displays an unrelated existing hire instead. Likewise, selecting a hire after Load more and saving account details or taking a provisioning action returns the operator to the first record. This can misdirect the next account/provisioning action. An isolated in-memory reproduction with 51 hires confirmed that the new hire is absent from the first page and that the current selection logic loses its ID.

**Fix guidance:** Preserve selection independently of the first list page. Load the selected/new hire directly and retain it in the list, or reload enough pages to include it. Cover creation beyond page one and refresh after updating an account selected from a later page.

**PR comment:** `refresh()` resets the list to page one and replaces any selected ID not in that page. Since creation and account/action saves call it, a new or selected hire beyond the first 50 records is replaced on screen by the first hire, risking follow-up actions against the wrong record.

## Strengths

- Role/location checks run in the backend service layer and are exercised by tests; demo actor impersonation is explicitly documented rather than presented as production authentication.
- SQLite transactions combine records, events and idempotency receipts. Tests cover rollback, repeated commands, restart persistence and retry isolation.
- Live Slack remains in its own namespace with origin/CSRF checks, and incoming modal guards prevent invalid inputs and uncertain-reply resends.

## Requirements Alignment

- Track A platform and dashboard responsibilities are implemented, with a shared service seam for subsequent workflow and MCP work.
- Durable portal entitlement integration is intentionally reserved (`501 WORKFLOW_PENDING`); the existing connected-account Slack flow is not yet a hire-scoped portal workflow.
- The admin-route mismatch is the actionable deviation from the latest user-directed cleanup.
- Production SSO, live AD/Jira provisioning, background synchronization and MCP remain outside this pull's implemented scope.

## Review Notes

- **Diff base:** 7a874ba (HEAD immediately before latest pull).
- **Changed files:** 19; server routing, backend API/store/services, portal UI, request UI guards, tests and documentation.
- **Repository instructions:** Root AGENTS.md. No nested AGENTS.md or SECURITY.md found under backend, web or tests.
- **Extra files read:** Existing planner app/profile/model, Slack service/API/tests and page-flow documentation for integration context.
- **Validation:** `node --test tests/*.test.mjs`: 36 passing, zero failing. A separate scratch script used only an in-memory SQLite database to reproduce the pagination/selection behavior and current admin route.
- **Limitations:** No browser interaction was performed for this review. Pagination was validated through the actual service and the inspected UI selection logic, not an end-to-end browser reproduction. No external Slack/helpdesk requests were sent, no persistent demo database was changed, and no production/test source or Git state was modified. Earlier delivery evidence in documentation was not independently re-run beyond the current test suite.
