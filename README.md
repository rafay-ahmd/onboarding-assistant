# Dealertrack onboarding prototype

Hackathon 26: Automate Onboarding for NewHires. A local request planner, dependency checklist, and read-only Windows inventory checker. The Dealertrack profile is a **draft for engineering-manager review**, not an authoritative entitlement policy.

For the three-person POC work split, shared API/data contracts, milestones and acceptance checks, see [the hackathon delivery plan](docs/hackathon-plan.md). That document describes pending work, not currently implemented features.

## Start the dashboard

From this directory with Node.js available:

```powershell
node server.mjs
```

Open http://127.0.0.1:4173. No package installation is needed. The server binds only to loopback and serves a fixed list of static assets. It has no submission API or machine-execution endpoint.

Enter employee details, prepare individual access-request drafts, open the admin-rights form, and record ticket links/status manually. Granting and verification are separate states. Plans are stored in this browser's localStorage; clear the plan before switching employees. Imported reports stay in memory only. Demo actions use fictional identities and reports. No messages or tickets are sent.

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

Everything is labelled MOCK: no Slack connection, messages, real tickets or permission changes. Simulation never updates the real manual access tracker or setup completion. Admin-rights and team-routed items remain outside the Slack queue.

Mock requests are stored separately in browser localStorage, keyed by profile, normalized email and entitlement. Duplicate requests are blocked even after reload. Reset mock queue clears all simulated requests across employees after confirmation. It does not clear the manual plan. This storage is not authenticated, transactional across tabs, shared across devices or production-ready.

See [request queue integration contract](docs/request-queue-contract.md) for the module boundary and the pending agreement with the identity/backend stream. No mutation endpoints or credentials were added to server.mjs; it only serves four additional static assets.

Access-card badges automatically reflect the current employee’s mock queue state, including after reload. They are labelled Mock; the dropdown explicitly records actual access manually. The summary separates actual and mock verification counts. Resetting the mock queue restores the badges to actual tracked statuses. Simulated progress does not unblock real setup dependencies.

For a queued mock request, its access card shows one automatic request-status field that follows every queue transition. The separate real-access manual record is collapsed by default. Existing records are preserved. Refresh the page to load updated UI code.
