# CMS onboarding demo: Sameer joins Pugazh’s team

Use Sameer Mehta as the new hire, Pugazh as the engineering manager and Toronto’s network actor for account/device work. All provider actions below are local simulations. They send no Slack messages or actual tickets and do not verify real access or install software.

## Prepare

1. Use Node 24+, run `npm ci`, then keep `npm start` running at `http://127.0.0.1:4173/`.
2. The Sameer/Pugazh fixtures and managed CMS profile come from [the CMS demo-account increment](https://github.com/rafay-ahmd/onboarding-assistant/pull/6). They have already been seeded in the working demo database. A fresh database on the MCP branch alone does not contain these fixtures until that increment is integrated. Stop if the actors/profile are absent; do not silently use another person’s identity or a Dealertrack profile.
3. Discover actors with `GET /api/demo/actors`. Use `em-pugazh`, `network-toronto`, and Sameer’s generated `hire-<hireId>` actor. Copy the existing hire ID; do not call `create_hire` to create Sameer again.
4. Follow [MCP setup](mcp.md). For this rehearsal, `onboarding-em` is Pugazh, `onboarding-network` is Toronto’s network role and `onboarding-me` is Sameer’s self-only role. Each connection keeps its actor fixed.
5. Through `list_profiles`, confirm `cms-developer`, group `TR-AP-GitHub-CMS` and admin required. Leave AWS/VPN/repository groups unset until the team confirms them. Demo location, start date, email and machine IDs are fictional.

## 1. New hire sees the plan

Ask Codex:

> Use onboarding-me/get_my_onboarding with no arguments, then get_profile_requirements with no arguments. I am Sameer Mehta, joining CMS under Pugazh. Show my requirements, current blockers and who needs to act. Do not change anything.

Expected: exactly one visible hire, managed profile `cms-developer`, the confirmed GitHub group and required admin. Initially the plan needs account/device details, account-request completion, group provisioning and a separate admin request. A manager’s view must return the same plan data.

## 2. Demonstrate role and prerequisite checks

Trying `provision_access` through `onboarding-me` must return `403 FORBIDDEN`. This tool is assigned-network work; the hire cannot provision their own plan. Trying through `onboarding-network` before recording account details must return `409 ACCOUNT_REQUIRED`. Rejected calls create no assignments.

Do not repeat the before-account prerequisite example after the account is recorded: the plan has already advanced.

## 3. Network records details through Codex

Ask Codex:

> Use onboarding-network to record account details for my existing Sameer hire: AD ID DEMO-SAMEER, work email sameer@example.invalid and laptop DEMO-SAMEER-LT. Use idempotency key sameer-demo-account-20261015-v1. Replay precisely the same call once, then queue provisioning with key sameer-demo-provision-20261015-v1 and replay that call once too. Do not create another hire or change other plans.

Expected: account request completed; exactly one `TR-AP-GitHub-CMS` assignment and one separate admin request queued. Replays keep the same hire/resource IDs. The backend stores original command receipts, so follow replays with `get_onboarding_status` for current progress.

Switch the dashboard to Toronto’s network account, select Sameer and Refresh. The account/device details and pending work match the tool results. The hire and manager connections cannot perform these network mutations.

## 4. Failure/retry and admin approval in the dashboard

In the network dashboard, record failure for Sameer’s pending GitHub-group assignment. Ask Codex through `onboarding-me` to explain the returned failed-group blocker and outstanding admin request.

Click Retry failed group, then Mark assigned. Only the failed group is retried. Advance the separate simulated admin request through Create ticket → Grant access → Verify access. These provider actions remain dashboard operations; no action tools should be invented by Codex.

Expected: the group succeeds with two attempts, admin is verified and account request is completed. The simulated blockers become empty. The portal still reports real workstation readiness as unassessed.

## 5. Hire and manager agree

Ask Codex:

> Through onboarding-me, inspect my current status. Compare it with onboarding-em’s status for the same Sameer hire. Explain what the local workflow completed and what has not been verified on my real workstation.

Switch the dashboard between Pugazh and Sameer and Refresh; both see the same shared account/group/admin progress. Refreshing or starting a fresh Codex session retains those SQLite records. The automated integration suite separately tests a real SQLite backend restart and durable command receipts.

## Rehearsed result

On October 15, 2026, fresh Codex CLI sessions loaded the three configured stdio servers and called their tools against the running app. Sameer’s self-only restriction, denied self-provisioning, missing-account prerequisite, account replay and provisioning deduplication were exercised through Codex. A browser then exercised Sameer’s group failure/retry and simulated admin ticket/grant/verification, checked manager/hire parity and reloaded the completed plan. Browser Slack requests were blocked; none were attempted. No real access or workstation readiness was verified.

The working demo has already advanced through those steps. Replaying saved mutation keys returns the original receipt; inspect fresh status rather than expecting the initial blockers to reappear. Do not reset the working database to repeat the presentation. For a clean start, use a deliberately disposable database with the fixture increments integrated, re-discover its generated hire ID and update the self connection. Resetting changes IDs and invalidates a previously configured self actor. Do not commit a local database or generated hire IDs.

The eight-tool adapter still includes `create_hire` for the manager’s separate new-plan scenario; it is deliberately skipped when demoing Sameer’s existing plan.

The subsequent read-only Codex rehearsal used `get_my_onboarding {}` and `get_profile_requirements {}` without a supplied hire ID. Codex resolved Sameer correctly, explained Windows/WSL/VS Code, the assigned GitHub group and required admin, returned repository request fields/routes and documentation links, and kept AWS/VPN decisions and programme checklist applicability open. Pugazh's explicit-hire requirements view agreed with the self view. No plan data was changed by those tools.
