# CMS draft profile and integration handoff

Status: draft for CMS engineering-manager review. Reviewed October 15, 2026 against platform-docs revision `e05c5338699c3645774f9c5336b32d2d31be47ed`. Source links below point to the documentation site. This combines documentation evidence with user-confirmed CMS requirements. It is not live verification of any entitlement or authenticated EM approval. GitHub request guidance follows the [GitHub Access page](https://autoscout24.atlassian.net/wiki/spaces/SelfServ/pages/1719238689/GitHub+Access). Account/CLI/workspace guidance follows the [GitHub setup page](https://autoscout24.atlassian.net/wiki/spaces/PO/pages/2818506803/GitHub+access), which is a draft for review, published from commit `368cccfa52da520f663ca2a4e77e482ad74f5072`. Its canonical repository source is `projects/product-transformers/site/pages/onboarding/before-you-start.md`; the programme access owner/request route is still pending there. Citations point to the pages, not local repository paths.

## Evidence and proposed mapping

| Requirement | Documented mapping / route | Source |
| --- | --- | --- |
| Company identity | Okta/MFA, company email and communication tools; confirm account availability | [Account setup](https://docs.services.as24.tech/onboarding/account-setup/) |
| GitHub organization | `tdr-cms`, provisioned through `TR-AP-GitHub-CMS`; invitation acceptance and organization SSO are separate | [GitHub user management](https://docs.services.as24.tech/products/github/user-management/) |
| Repository membership | Access Request ticket or #helpdesk post naming repository/permission and preferably team/AD group or an example user; allow up to six hours for full sync | [GitHub Access](https://autoscout24.atlassian.net/wiki/spaces/SelfServ/pages/1719238689/GitHub+Access) |
| Artifact access | `https://traderca.jfrog.io` for `tdr-cms`; exact package feeds require team confirmation | [FASt instances](https://docs.services.as24.tech/products/fast/) |
| SonarQube | `TR-AP-SonarQube-CMS-Developers` through helpdesk if required; PowerUsers reserved for EMs/leads | [SonarQube permissions](https://docs.services.as24.tech/products/sonarqube/permissions/) |
| New Relic | `TR-AP-NEWRELIC-CMS-Developers` through helpdesk for standard access if required; Full Platform separately justified | [New Relic access](https://docs.services.as24.tech/products/new-relic/access/) |
| Atlassian | General OET application `Atlassian(Jira/Confluence)`; confirm CMS projects/spaces | [Tool access](https://docs.services.as24.tech/onboarding/as24-tools-access/) |
| Grafana | CMS-specific mappings exist, using New Relic-named groups, but general onboarding labels Grafana early access; no mandatory standalone request added | [Grafana mappings](https://docs.services.as24.tech/products/grafana/reference/access-permissions/), [tool access](https://docs.services.as24.tech/onboarding/as24-tools-access/) |
| AWS/VPN | User confirms these depend on the CMS subteam; exact accounts, roles, region and VPN needs remain unresolved | [Account setup](https://docs.services.as24.tech/onboarding/account-setup/) |
| Workstation/admin | User confirms Windows with WSL, Visual Studio Code and required local admin; admin requests are separate #helpdesk posts. General machine guide is background, not the source of this CMS confirmation | [Developer machine](https://docs.services.as24.tech/onboarding/developer-machine/) |

Confirmed by the user: the hire needs the `TR-AP-GitHub-CMS` Okta group; Windows with WSL and Visual Studio Code are the baseline; local admin is required and both machine-admin and specific-repository requests are posted in `#helpdesk`. AWS/VPN depends on subteam. Organization membership, account/2FA setup, SSO, repository access, approved CLI installation and local checkout remain separate outcomes. GitHub requests can use Access Request tickets or #helpdesk; local machine-admin requests remain separate #helpdesk posts.

The [CMS overview](https://docs.services.as24.tech/verticals/cms/) is a placeholder. The [general onboarding curriculum](https://docs.services.as24.tech/onboarding/) is useful background but does not make every platform service mandatory for CMS.

## EM review checklist

- [ ] Confirm CMS display name and the role/team this profile covers.
- [ ] Confirm which candidate tools are required, optional or irrelevant. Confirm any missing requirements such as Developer Portal, IDE licensing or team-specific systems.
- [x] Confirm CMS organization Okta group: `TR-AP-GitHub-CMS`.
- [x] Confirm repository/admin request destination: separate posts in `#helpdesk`.
- [ ] Supply repositories, branches and permission levels; include team/AD group names or an example user if known. `CMS-GH-FICTIONAL-DEMO` is only a test fixture, never an actual entitlement.
- [ ] Confirm AWS accounts, groups, region, VPN and database/test-environment access. No general playground or Dealertrack AWS group is assumed.
- [x] Confirm workstation baseline: Windows with WSL, Visual Studio Code and mandatory local admin.
- [ ] Confirm Windows/WSL versions, SDK/runtime versions and local services. Do not copy Oracle/IIS or macOS setup into CMS policy without review.
- [ ] Confirm artifact feeds and approved local credential setup. Keep tokens/passwords out of forms and requests.
- [ ] Define successful repository access, dependency restore, build and application smoke tests, including conditional prerequisites.
- [ ] Confirm routing and approvals, including whether combined Atlassian application requests suit CMS.

The UI shows these open questions and gates setup behind a manually recorded EM requirements review. This is not authenticated approval. The prototype cannot represent arbitrary conditional dependencies from the unresolved checklist; the reviewer must confirm those prerequisites before recording the relevant manual verification. Access counts describe records, not a requirement to request every candidate.


## GitHub setup sequence and source scope

1. Create a GitHub account or reuse an existing private account; use authenticator-app-only 2FA as specified by the [setup guide](https://autoscout24.atlassian.net/wiki/spaces/PO/pages/2818506803/GitHub+access).
2. Provide the GitHub username when requesting `TR-AP-GitHub-CMS` through #helpdesk or an Access Request ticket. Include repository team/AD group context or an example user whenever possible. If unsure, ask the team lead or #platform-engineering-support first.
3. After Helpdesk confirmation, complete the [CMS organization SSO workflow](https://docs.services.as24.tech/products/github/user-management/#sso-workflow). SSO links AD identity to the intended GitHub account; without it, team synchronization cannot match the user.
4. Allow **up to six hours** for changes to fully sync before asking ET to verify. The platform page’s 90-minute team-sync cycle is not an end-to-end access guarantee. Do not duplicate an access request just because synchronization is pending.
5. After approved workstation setup, install GitHub CLI through SelfService or Company Portal. If absent, ask #helpdesk to add it there. Verify CLI availability in the intended Windows/WSL workflow.
6. Sync the repository into a `Code` folder under the approved development home folder, outside Desktop, Documents and SharePoint/cloud-synced folders. Use approved tools/data, exclude customer personal data, keep tokens out of documents/chat, and request only necessary access. Ask the project lead about unclear data rules.

The draft setup page lists Confluence/Jira, ChatGPT/Codex and GitHub/repository access for programme joiners, Figma/design-library access for designers, and Node/Yarn/VPN/AWS/Docker only for assigned people whose prototype needs them. This is preserved as draft programme guidance in the profile, not automatically assigned to every CMS hire. Confirm CMS applicability and owners before adding required entitlements. There is no new ChatGPT/Codex installation or credential automation in this increment.

## Browser demo and verification

1. Start `node server.mjs`; select CMS or open `http://127.0.0.1:4173/planner?profile=cms-developer`.
2. Load the fictional hire. AWS and repository groups stay blank. Review the unresolved EM questions.
3. Confirm GitHub organization/repository cards offer Access Request form alternatives and separate mock helpdesk requests. Atlassian remains form-routed; required admin uses helpdesk; artifacts and AWS stay team-routed. Nothing posts externally.
4. On the repository-access card, verify a blank target repository blocks preparation. Enter `tdr-cms/fictional-demo — read access`; leave the group blank and verify the draft can be prepared. A fictional team name or an example GitHub username may be supplied; prefix-only `CMS-GH-` and wildcard `CMS-GH-*` are rejected.
5. Review the CMS draft, queue it, repeat to check deduplication, and exercise mock failure/retry and unknown-delivery reconciliation. Verify simulation never changes real access or setup prerequisites.
6. Open Setup journey. Only the EM review can initially be recorded. Complete account/setup-plan review; Windows/WSL/VS Code verification stays blocked until actual admin is marked verified. A simulated admin verification or actual granted state must not unblock it. Undoing actual admin verification invalidates downstream completion.
7. Open Workstation checks. CMS explains that no checker exists; Dealertrack import/demo controls are absent.
8. Switch to Dealertrack, then back to CMS and reload. Manual plans and queue projections remain isolated by profile, and Dealertrack inventory import and connected-account Slack controls return; its CMS form/local queue stay hidden. Clear the selected plan before another hire; queue reset affects all profiles/employees in this browser.
9. Run `node --test tests/*.test.mjs` for model, queue and profile regressions.

Verified for this increment: all 22 model/queue/profile tests passed using Node 24 with `--test-isolation=none`. A Chromium smoke run passed profile switching and saved-plan isolation, CMS request wording, optional-team/example-user validation, ticket/helpdesk routing, duplicate prevention, known-failure retry, uncertain-delivery reconciliation, mock-versus-real dependency isolation, EM review undo, OET bookmarks, inventory scoping, reload/two-page persistence and a 390-pixel mobile viewport without horizontal overflow. Follow-up browser checks also passed the confirmed Windows/WSL/VS Code baseline, required-admin mock failure/retry, actual-admin verification/revocation gating, example-user field persistence, GitHub ticket/helpdesk alternatives and reviewed source/draft-status display. These checks use fictional identities and local simulation only; they do not verify live CMS access or application readiness.

## Next delivery steps by owner

| Owner | Next concrete deliverable |
| --- | --- |
| Vigby | Confirm profile discovery/API shapes; preserve these profile IDs and distinguish candidates from approved per-hire requirements; implement SQLite, identity and scoped backend services under the delivery plan |
| Rafay | Map approved exact groups to mock assignments; preserve form/team/helpdesk routing, profile-scoped deduplication, and mock-versus-real isolation; supply deterministic action/failure/retry fixtures |
| Sameer | Agree action fixtures and status/blocker responses, then implement MCP against the shared API; demonstrate CMS selection, missing-repository blockers and subteam-specific AWS requirements with fictional data |

Freeze runtime, action payloads, account-ticket completion behavior, retry operations and profile discovery before implementing independent clients. The CMS increment does not extend the existing SQLite portal, backend roles/provisioning or live Slack adapter to CMS; the platform now supports independently managed SQLite profiles, while the Slack adapter remains Dealertrack-specific. The static CMS planner template is not automatically seeded or mapped into the SQLite catalogue. MCP remains pending. AutoTrader still needs a separate evidence-backed profile.

## Integration with current main

The SQLite role portal remains at `/`. The CMS draft is now at `/planner?profile=cms-developer`. Dealertrack retains main’s live Slack access-only screen and readiness bar; its admin request is helpdesk-routed in current main. The CMS form/local queue mount only in CMS mode and never call `/api/slack/`; simulated queue verification stays separate from actual manual verification. There are no sample-report buttons in either planner mode. Existing backend API/action contracts and stores are preserved, with only the static CMS/catalog asset routes added.

Rebase verification against main `e76c55d`: all 45 model, queue, profile, platform, HTTP and mocked Slack tests passed. An in-memory-server Chromium run verified the portal, CMS draft persistence/deduplication/failure-retry/admin gating, zero CMS Slack calls, Dealertrack connected-account dialogs/admin/progress, cross-profile identity isolation, report scoping and mobile layout. No real Slack calls or access requests were made.

Second rebase verification against main `1ec3ce3`: all 53 tests passed, including the new EM-managed profile/location-default migration, authorization, revision and snapshot tests. CMS planner tests now live in `tests/cms-profile.test.mjs`; main’s `tests/profiles.test.mjs` remains unchanged. The in-memory Chromium integration check passed again without real Slack calls.

## CMS demo accounts and portal entry

On `feat/cms-demo-accounts`, the SQLite catalogue now seeds `cms-developer`, using only the confirmed `TR-AP-GitHub-CMS` group and required admin. The richer recipe remains in the static profile and retains its documented review questions. AWS/VPN and specific repository groups are not added automatically. Existing EM edits to the managed profile are preserved, and existing plans retain their requirement snapshots.

The account switcher includes Pugazh (`em-pugazh`) as EM and Sameer Mehta as his self-only CMS developer hire. Toronto, the demo start date and `.invalid` email are fictional fixtures; neither account has a Slack identity binding. Normal startup or `npm run seed` adds these records without resetting account/provisioning progress, existing Dealertrack hires or browser-local plans. Choose Pugazh to inspect Sameer's shared portal plan; choose Sameer and follow **Access planner & workstation checks** to the assigned CMS recipe. Portal links now depend on recipe availability rather than live Slack support, so CMS is reachable while its requests remain local drafts.

Verification: all 63 tests pass on the standalone CMS branch based on main, including CMS manager/self/location isolation, confirmed defaults, denied Slack access and SQLite restart/reseed preservation. The earlier combined check passed 76 tests with the separate MCP work included. A read-only Chromium check against the running app verified Pugazh's queue, the CMS profile option, Sameer's linked planner, assigned/locked profile, confirmed baseline, setup journey, reload and mobile layout. It made no Slack calls and changed no access statuses. This supersedes the earlier pending CMS portal handoff above; the six-tool MCP adapter remains on the separate `feat/mcp-onboarding-tools` branch, while real CMS integrations and approved subteam requirements remain pending.
