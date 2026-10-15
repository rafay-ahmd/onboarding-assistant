# Onboarding Assistant prototype

Hackathon 26: Automate Onboarding for NewHires. A local request planner, dependency checklist, and read-only Dealertrack Windows inventory checker. Dealertrack and CMS profiles are **drafts for engineering-manager review**, not authoritative entitlement policies. An AutoTrader profile is not implemented yet.

For the three-person POC work split, implemented API/data contracts, delivery evidence and remaining integration work, see [the hackathon delivery plan](docs/hackathon-plan.md). Its current baseline and checked work packages distinguish delivered features from pending work.

## Start the dashboard

From this directory with Node.js 24 or newer available (built-in `node:sqlite`; no npm install required):

```powershell
node server.mjs
```

Open http://127.0.0.1:4173 for the shared team portal. It seeds fictional Toronto/Berlin hires and actors, persists data in Git-ignored `data/onboarding.sqlite`, and provides the local API described in [the delivery plan](docs/hackathon-plan.md#implemented-platform-contract-track-a). The server binds only to loopback. The portal has no machine-execution endpoint or external submission. The separate Dealertrack planner can send real Slack messages after review when configured.

Open the profile circle at the top right to switch fictional accounts. The selected account stays active across reloads in that tab. EMs enter first and last name separately and create hires; network operators see their location's queue and record AD ID/work email/laptop ID, then queue and advance mock provisioning. Hires see a personal progress page. Use **Refresh** to see another session's updates. Account switching is demo impersonation, not authentication; backend role/location checks apply to the selected actor. Temporary platform stubs simulate Jira tickets, groups and admin access until Rafay replaces them. MCP remains Sameer's track.

`npm run seed` restores any missing fictional fixtures without clearing existing data. To reset only this app's demo database, stop the server and run `npm run reset:demo`, then restart. Reset deletes this app's local hires, actors, commands and activity; it does not clear browser-local planner data. Schema migrations run automatically on startup.

Demo roles: **Alex Example is the EM; Vibgy Joseph is the Toronto new hire**. Startup updates the original fictional seed labels without deleting onboarding progress. The legacy EM actor ID remains `em-vibgy` for API compatibility; resolve its displayed name through actor discovery.

The account switcher also includes **Pugazh** (CMS engineering manager, `em-pugazh`) and **Sameer Mehta** (his CMS developer demo hire). Choose Pugazh to see Sameer's plan and the seeded **CMS developer** profile; choose Sameer and open **Access planner & workstation checks** for the linked CMS recipe. That recipe covers Windows/WSL, VS Code, CMS GitHub and manual setup dependencies. CMS has no inventory checker or live Slack submission. Toronto, the November 2 demo start date and `sameer@example.invalid` are fictional demo values. The managed profile seeds only `TR-AP-GitHub-CMS` and required admin; AWS/VPN/repository groups require team review. Startup or `npm run seed` adds missing demo records without resetting saved progress or profile edits. Refresh the browser after seeding an already-running server.

For the presentation, UI actions use normal product wording (Provision access, Create ticket, Grant access) and omit “mock” badges. These still execute only the local simulations described above; provider flags and real-access verification remain separate.

Account saves require valid unsaved edits; reverting the fields disables Save again. New-hire creation requires a completed valid form, and replies require nonempty text. Successful saves reset the form's change baseline; failed saves preserve edits for retry. The local planner continues to autosave its fields.

Provision access queues group assignments and any required admin request. Once queued, the button reads Access queued and is disabled; pending groups read Awaiting assignment. The current temporary workflow advances through the network team's Mark assigned/Record failure actions, rather than a background directory worker.

Share the committed seed code and migrations, not `data/onboarding.sqlite`. Each contributor runs `npm start` to create the same fictional starting accounts in their own local DB. Changes made in one developer's DB are not synced to others; a single shared server/database would be needed for everyone to see the same live edits.

### EM-managed onboarding profiles

In an EM workspace, open **Manage onboarding profiles** to create or edit a profile with one AD-group list and a default admin requirement. All EMs share the catalogue; network and hire roles cannot change it. Network operators configure **Location AD group defaults** for their assigned location. Both settings live in SQLite (schema v3). Migration combines the previous per-location profile lists without losing groups or changing existing onboarding plans.

When creating a hire, the profile prefills its groups and admin requirement. An EM can adjust those values for that hire; the network team's location groups are always added automatically, with duplicates removed. Each plan snapshots both sets of groups and their revisions, so later edits affect only new hires. Save stays disabled until valid edits exist; stale revisions are rejected. Use Refresh before retrying a conflicting edit. Normal startup and seed preserve saved defaults. These templates configure the shared portal; the separate Slack planner's entitlement/workstation recipe remains in `profiles/dealertrack-developer.json`.

### Existing local planner

Open http://127.0.0.1:4173/planner for the separate access planner and workstation checks. Its existing browser records are preserved and are not imported into shared hires. Backend entitlement submission remains pending Rafay's integration; its reserved API returns `501 WORKFLOW_PENDING`.

Dealertrack uses the connected Slack account and its request dialogs; no hire-details form is shown. CMS has a separate browser-local hire form and draft queue, without a Slack connection. CMS queue outcomes never verify actual access or unblock real setup. Both profiles preserve their own browser-local manual plan. Imported reports stay in memory only.

## Choose a team profile

Use the profile selector, or open `http://127.0.0.1:4173/planner?profile=cms-developer` for CMS. Dealertrack remains the default. Each profile stores its own manual plan; the existing Dealertrack storage key is preserved. Profile selection reloads the page and discards any in-memory report, but preserves saved plans. This is not multi-user persistence; clear the selected plan before changing hires.

The CMS draft separates GitHub organization membership from repository-team access and uses documented CMS GitHub, SonarQube, New Relic and artifact mappings. The user confirmed Windows with WSL, Visual Studio Code, mandatory local admin and the `TR-AP-GitHub-CMS` Okta group. Specific repository access and local admin requests go to `#helpdesk`; repository details are required, while a team/AD group or example GitHub user can help ET resolve access. GitHub organization and repository access may use an Access Request ticket or `#helpdesk` post; changes may take up to six hours to fully sync. AWS/VPN needs depend on the subteam. Tool applicability, exact repositories, SDK/runtime versions and smoke-test criteria still need CMS EM/subteam review. The Setup journey starts with a manually recorded EM review. Windows/WSL/VS Code verification requires actual admin access marked verified; mock grants do not unblock it. Other conditional access cards remain candidates, not a requirement to request every tool.

CMS Atlassian requests retain the OET form route and cannot enter the mock Slack queue. GitHub organization/repository requests offer ticket and #helpdesk routes; required admin uses #helpdesk. CMS helpdesk drafts support the local simulation; no posts are sent for CMS. Dealertrack retains main’s live Slack flow. CMS ticket bookmarks accept the documented `autoscout24.atlassian.net` service-desk host as well as the existing helpdesk host. There is no ticket-status synchronization.

The inventory script and fictional reports remain Dealertrack-only. CMS hides inventory import/demo controls and rejects Dealertrack reports; it has no inventory checker or setup executor. See [CMS profile evidence, review checklist and handoff](docs/cms-profile.md). CMS evidence cites the [documentation site](https://docs.services.as24.tech/onboarding/) and records user-confirmed requirements separately. The [GitHub Access guide](https://autoscout24.atlassian.net/wiki/spaces/SelfServ/pages/1719238689/GitHub+Access) supplies request routes and the six-hour synchronization window. The [GitHub setup guide](https://autoscout24.atlassian.net/wiki/spaces/PO/pages/2818506803/GitHub+access) supplies authenticator-app 2FA, post-confirmation SSO, GitHub CLI via Company Portal/SelfService and a home-folder Code checkout outside synced locations. Its programme-wide tool list remains draft guidance pending CMS applicability review.

## Inspect this workstation

```powershell
pwsh -NoProfile -File .\scripts\Test-OnboardingReadiness.ps1
```

The only intended filesystem mutation is writing `reports/readiness.json` (and creating its output directory if necessary). The checker inspects process elevation, commands on PATH, Visual Studio components, framework reference assemblies, expected Oracle/repository paths, LFS asset sizes, shared DLL presence, and IIS application mappings where permitted. It does not run setup.bat, install software, edit IIS, restore packages, build projects, access remote services, authenticate, or read configuration contents/credentials. The report omits employee identity and raw inventory command output. Reports are Git-ignored.

The checker does not require elevation. A normal process is reported as **unverified**, not as proof that admin entitlement is missing. Denied inventory is **blocked**. Expected-path checks do not establish functionality, architecture, DLL compatibility, or archive integrity. IIS settings beyond mappings need separate verification. Authentication, VPN connectivity, database permissions, and application smoke testing remain unverified.

Optional path overrides:

```powershell
pwsh -NoProfile -File .\scripts\Test-OnboardingReadiness.ps1 -SourceRoot C:\dtnsourcecode -OracleRoot C:\Oracle\product\11.2.0\client_1 -OutputPath .\reports\readiness.json
```

Import the generated JSON in the Workstation checks tab. Imports are labelled with inspection time; imported data is not independent proof of the current machine's state. Readiness checks do not automatically change access status or setup completion.

Use an approved PowerShell runtime (`pwsh` is PowerShell 7). If company PowerShell policy prevents execution, use the approved IT process. No execution-policy bypass is needed or built into this prototype. On this workstation, Windows PowerShell blocked the script; the already configured PowerShell 7 runtime ran it under its existing policy. No policy settings were changed.

## Demo and tests

- Use the fictional demo hire to generate individual requests with no live submission.
- Load the healthy-inventory or missing-prerequisites report; both are explicitly labelled fictional.
- Verify dependency behavior: admin **granted** does not unblock Oracle until changed to **verified**. Recording Oracle completion and verifying GitHub unblocks the setup review step.
- Run `node --test tests/*.test.mjs` for routing, dependency, import-validation, and ticket-link checks.
- Test future installation stages in an approved disposable Windows VM with snapshots, never by undoing the existing workstation.

## Deliberately pending integrations

Confirm Slack app approval, helpdesk bot acceptance of app-originated/on-behalf-of messages, supported service-desk APIs/authentication, and pre-start account availability. The EM must approve required entitlements, groups, owners, and verification criteria. This version does not assert those capabilities exist.

Future setup execution needs explicit stage selection and recoverability. The upstream batch script replaces machine.config and tnsnames.ora and skips existing app pools; simply wrapping it does not make reruns safe or resumable.

## Evidence

- [Setup repository](https://github.com/vit100-trader/dev-workstation-setup), reviewed main commit `ee03d3ac7cf0c1abd5bbfbff23da4ee2ccb0dc57`.
- [Workstation setup guide](https://trader.atlassian.net/wiki/spaces/DE/pages/4212031615/Dealertrack+Developer+Workstation+Setup), reviewed version 34.
- [Okta VPN guide](https://trader.atlassian.net/wiki/spaces/CLOUD/pages/4891476045/AWS+Client+VPN+Transition+to+AS24+Okta+Authentication).
- Local Setup chats and the user's firsthand helpdesk experience: separate messages for access, dedicated admin form, slow admin approval, AWS group, and missing application test-user access.

The current batch script lists 49 clones despite documentation saying 50. Historical Confluence sections contain different drive paths; this prototype uses the repository's C:\dtnsourcecode / C:\inetpub baseline. QA branch names and actual entitlements must be confirmed before future execution.


## Mock access-request queue

Access cards routed to helpdesk now offer **Review mock request**. Complete the employee details, edit the business justification, review the generated message and queue it. The queue supports simulated message delivery, follow-up questions/replies, ticket creation, grant, verification, denial and known-failure retries. Uncertain delivery requires reconciliation rather than another send.

Everything is labelled MOCK: no Slack connection, messages, real tickets or permission changes. Simulation never updates the real manual access tracker or setup completion. Dealertrack admin rights follow the current connected-account Slack flow; CMS admin rights use the separate local draft queue. Team-routed items remain outside the queue.

Mock requests are stored separately in browser localStorage, keyed by profile, normalized email and entitlement. Duplicate requests are blocked even after reload. Reset mock queue clears all simulated requests across employees after confirmation. It does not clear the manual plan. This storage is not authenticated, transactional across tabs, shared across devices or production-ready.

See [request queue integration contract](docs/request-queue-contract.md) for the module boundary and the pending agreement with the identity/backend stream. No mutation endpoints or credentials were added to server.mjs; it only serves four additional static assets.

Access-card badges automatically reflect the current employee’s mock queue state, including after reload. They are labelled Mock; the dropdown explicitly records actual access manually. The summary separates actual and mock verification counts. Resetting the mock queue restores the badges to actual tracked statuses. Simulated progress does not unblock real setup dependencies.

For a queued mock request, its access card shows one automatic request-status field that follows every queue transition. The separate real-access manual record is collapsed by default. Existing records are preserved. Refresh the page to load updated UI code.


## Direct Slack integration (local demo)

Slack requests are integrated into the helpdesk access cards. Its requester is the authenticated Slack user, never the fictional hire form. The backend uses a user OAuth token to send as that user and read their request threads. Tokens stay in the server process and are never returned to the browser.

Start with approved credentials in your environment:

    SLACK_USER_TOKEN       required user OAuth token
    SLACK_TEAM_ID          defaults to AutoScout24 workspace
    SLACK_USER_ID          optional expected user identity
    SLACK_CHANNEL_ID       defaults to the confirmed helpdesk channel
    SLACK_ACTOR_EMAIL      optional configured email for matching real verification to the current form
    ONBOARDING_DATA_DIR    optional local data directory

Use scripts/Start-WithSlack.ps1 to enter a token through a hidden prompt and launch Node. Supply -NodePath if Node is not on PATH. The token is removed from the wrapper environment when Node exits; nothing is saved by the wrapper. Avoid pasting credentials in chat or shell command arguments.

Prepare an individual request, review the immutable message and target channel, then explicitly confirm before sending. This creates REAL Slack messages. Admin rights still use their dedicated form. Requests, receipts and thread replies persist locally outside the repository by default in ~/.onboarding-assistant/slack-requests.json; never commit that data. This is a single-operator localhost demo, not the partner's multi-user auth service.

Use Sync Slack replies to read the exact recorded thread. Bot-generated ticket references are detected, including rich Slack blocks. Follow-up questions are displayed and replies require review. Approval text is not treated as verified access: use Confirm my access works after checking it yourself. Where the configured actor email matches the form, this explicit real verification updates the manual access tracker.

A successful Slack send is not proof Remy accepted the request. Missing scopes and channel membership errors are shown. Network-uncertain delivery has no resend action. The server checkpoints before sending to avoid blind retries after a crash. No real helpdesk requests are sent by automated tests.


## Integrated access flow (October 15, 2026)

The Dealertrack planner now uses real Slack requests directly on access cards: Review request → save draft → review and send → sync replies / reply → confirm access works. The standalone Live Slack requests panel and all simulation controls are removed from the Dealertrack interface. Existing simulated browser data is ignored; it is never migrated into real requests. Historical mock modules and tests remain development fixtures only. The connection bar identifies the authenticated requester independently of the onboarding form. No automatic grant or verification is inferred from Slack text. Admin rights retain the dedicated form. Reports come from the actual workstation checker; sample report buttons and fictional hire filling are removed.


## Request review and readiness update

The access tab shows a progress bar based on verified permissions, not messages sent or approvals. Linked Slack status takes precedence over a manual record. Full-message editing, save-draft and explicit send use a styled dialog; replies and actual verification also use dialogs. The server accepts draft edits only before delivery and sends the exact final reviewed text. No external request is created by preparing or saving a draft. See docs/page-flows.md for all page workflows.

The merged app serves the SQLite portal at `/` and the Slack-enabled planner at `/planner`. Their actors and stores remain separate. Portal actions require saved account details, pending assignments or the appropriate request state; AD ID is read-only after provisioning starts. Slack actions require a connection, valid message/details and an eligible request state; Save changes requires edits, and uncertain replies cannot be resent. Automated checks do not send Slack messages.

## Current access-only screen (October 15, 2026)

The Dealertrack onboarding details form is removed pending the incoming role-based dashboards. Request identity comes from the connected Slack account; GitHub username and AWS group are entered inside their individual request dialogs. Legacy saved hire fields remain stored for compatibility but are not used by this screen. Local admin rights now use the same helpdesk Slack review/edit/send/sync/verify flow as the other helpdesk entitlements; no separate admin form link or manager field is shown. This UI routing change does not establish that the external helpdesk bot accepts the route. App-generated messages may be filtered by helpdesk; successful submission alone does not imply a response or ticket.

The current screen is single-operator. Explicitly verified own Slack records update local access/setup prerequisites without depending on a removed hire email field. When multi-user dashboards arrive, replace this local state mapping with backend-authorized hire/account records; never apply one connected user’s verification across hires. This section supersedes earlier form/admin-route UI descriptions.

## CMS integration with the portal and Slack planner

CMS profile selection is available at `/planner?profile=cms-developer`; `/` is the SQLite role-based portal. The catalogue now seeds a managed `cms-developer` profile and linked Pugazh/Sameer demo accounts; the richer static CMS recipe remains a separate record. The live Slack backend remains Dealertrack-specific. CMS does not mount the live Slack client or make `/api/slack/` requests. Switching back to Dealertrack restores its connected-account request dialogs, readiness bar, admin Slack route and report import, without showing the CMS form or local queue. Historical mock modules remain fixtures for Dealertrack and supply CMS’s local draft simulation only.


## Hire-linked Slack workflow (October 15, 2026)

The portal link now opens `/planner?hireId=<immutable-id>` using the tab’s selected demo actor. Scoped `/api/hires/:id/slack/{status,requests,requests/:id/action}` endpoints use the existing platform role/scope checks and the platform SQLite requests repository. Live mutations additionally require the self-only hire actor and an explicit stored Slack team/user binding; names or email matching never establish the binding. EM/network actors see the derived shared Slack access summary through the normal hire detail API, but cannot impersonate the hire to submit through their current role. Demo actor switching remains deliberately impersonatable, not SSO.

An additional seeded Rafay Ahmed demo hire is bound explicitly to workspace TT299RP8X / user U0BUMD5CNP9. Its start date and requested directory group are fictional demo requirements. No token is stored in source or SQLite. Vibgy and other hires are not bound to this Slack account; their live submission is disabled. Using another person’s Slack identity requires their authorization. No real send is performed by seeding or loading the page.

The adapter stores provider=slack, kind=entitlement records under each hire, with short SQLite transactions and an in-flight checkpoint before external sends. Generic simulated provider actions reject Slack records. Portal summaries count the profile’s helpdesk-routed permissions; the planner’s broader total also includes manual/team-owned permissions. Both display explicit verified counts. Network provisioning stubs and account/device progress remain separate. The existing simulated admin workflow is not converted into a real Slack send.

Legacy standalone `/planner` JSON requests remain available and are not silently imported into a hire. Browser-local manual statuses, setup notes and imported reports are isolated under a hire-specific key; they are not yet shared workstation state in SQLite. Backend Slack verification is reflected in that hire’s local setup dependencies. The profile-based dashboard must use hire IDs, not a global localStorage plan or email.

`ONBOARDING_DATABASE_PATH` optionally selects a SQLite file for an isolated demo server. Default storage remains data/onboarding.sqlite. `createApp({slackCall})` is a no-network test seam. Provisioning workflow hooks remain synchronous; external Slack IO runs in its separate async service adapter.


## PR #4 and hire-linked Slack integration

Integrated main 99847b8 with the saved hire-linked Slack changes. Preserve schema v3, EM-managed profile defaults, location group snapshots and the standalone CMS recipe/local queue. CMS does not mount the Dealertrack Slack service or accept Dealertrack inventory. The portal’s managed profiles and the static recipe catalog are distinct: unmapped managed profiles do not receive a guessed Dealertrack template or Slack summary.

Linked planners resolve the static recipe from the hire’s persisted profile ID, lock the selector and isolate local notes by hire ID and profile; they do not let a query parameter switch a Dealertrack hire into CMS. Unmapped managed profiles show an explicit unavailable-template message. Standalone CMS retains its existing profile-specific storage and local draft flow. Dealertrack retains the prior hire-local storage keys and connected-account guards. No CMS request is submitted through the Dealertrack Slack namespace.


UI spacing update: the planner uses a separate top navigation row and the selected hire as the page heading; profile hints explain assigned/locked recipes. The portal keeps Refresh and its load feedback in one compact toolbar, removes the duplicate personal-view list heading, and groups hire identity/date and Slack access progress with consistent spacing. Shared progress headings style only the percentage as a large number. No workflow, provider or persistence contracts change.


Dealertrack sent Slack requests now offer an explicit browser-only Demo continuation: fictional approval, then fictional verification. A separate demo progress bar and setup dependency/completion preview never update real Slack requests, SQLite summaries, actual access, saved setup completion, or workstation reports. Reset per request, exit the preview, or reload to discard it. CMS does not use this continuation.

Demo continuation also updates the access card’s primary badge to Demo · approved / Demo · verified, while the adjacent note retains the real Slack status. Reset restores the live badge.

Completed Dealertrack access cards collapse into an expandable summary, retaining their original order. The next unfinished card is highlighted; demo verification moves focus there. Expanding a completed card retains its Slack details and preview reset control.

While demo continuation is active, the main access readiness bar and total show the preview, explicitly labelled Demo. Its detail retains the real verified count. Exiting or resetting restores actual progress; the portal summary remains real-only.
