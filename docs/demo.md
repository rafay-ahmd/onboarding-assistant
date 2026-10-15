# MCP onboarding demo

This walkthrough uses fictional hires and the portal's simulated providers. It sends no real tickets or messages and performs no workstation setup. Keep the separate `/planner` live Slack flow out of this demo.

## Prepare

1. Use Node 24+, run `npm ci`, then `npm start`. Open `http://127.0.0.1:4173/`.
2. Follow [MCP setup](mcp.md) to configure an EM connection (`em-vibgy`, displayed as Alex Example) and a Toronto network connection (`network-toronto`). Both use the same API URL. Do not change actors through tool arguments.
3. In the EM dashboard, create or select a **Fictional CMS demo** profile with groups `DEMO-CMS-DEVELOPERS` and `DEMO-CMS-REPO`, with admin required. Record its generated ID through `list_profiles`. These are fictional groups, not CMS policy or actual AD groups. The static `cms-developer` planner template does not become a SQLite profile automatically.
4. Switch the dashboard to the Toronto network account. Set its location default to `DEMO-TORONTO-NETWORK`. Existing hires keep their previous snapshots; these settings apply to new plans.
5. Use a new run suffix such as `demo-01` for new intended commands. Keep every key stable when demonstrating a retry of the same command. Do not paste real hire records or secrets.

## Create through MCP; inspect in the dashboard

Ask the EM connection:

> List onboarding profiles, then create Casey Example in Toronto using the Fictional CMS demo profile, starting 2026-11-03. Leave the pre-account email empty and use the saved profile defaults. Use idempotency key demo-01-casey-create. Return the hire ID and blockers.

Expected: one saved hire with separate first/last names, profile groups plus the Toronto location group, `adminRequired: true`, and a pending account request. No work email is fabricated. Save the returned hire ID for the remaining steps.

Switch the dashboard to Alex Example (EM) and click Refresh. Casey appears with the same requirements and blockers. Repeat the same MCP create call with identical arguments/key: it returns the same hire ID and does not create another person. Changing a name while retaining that key produces a conflict.

## Record details and queue provisioning

First ask the Toronto network connection to provision Casey before recording account details, using `demo-01-casey-early-provision`.

Expected: `409 ACCOUNT_REQUIRED`, with no assignments created. This is a deliberate rejected command, not uncertain delivery.

Then ask the network connection:

> Record Casey's AD ID as DEMO-CASEY, work email as casey@example.invalid and laptop ID as DEMO-CASEY-LT. Use key demo-01-casey-account. Then provision access using key demo-01-casey-provision.

Expected: account recording completes the simulated account request. Provisioning queues three group assignments and one separate admin request. Repeating provisioning does not duplicate successful or pending assignments. No real AD account or admin entitlement is created.

In the Toronto network dashboard, Refresh and select Casey. Confirm the same account/device details, pending assignments and admin request. The Berlin network actor must not see or update Casey. An EM tool call cannot record account details or provision access.

## Fail one group, retry it and explain blockers

Use the network dashboard to mark two groups assigned and record failure for the third. Ask the EM connection:

> Get Casey's current onboarding status. Explain the blockers returned by the backend and identify the failed assignment. Do not claim the workstation is ready.

Expected: the failed group and outstanding admin request remain visible. The adapter reports persisted backend blockers rather than inferring completion from a ticket or approval.

Retry the failed group in the dashboard, then mark it assigned. Successful groups are not rerun. Advance the separate admin request through Create ticket → Grant → Verify. Ask MCP for current status again: the simulated onboarding blockers are empty; `realReadiness` remains unassessed. The hire's self-only dashboard shows the same account and provisioning progress.

Provider simulation controls deliberately remain in the dashboard for this six-tool scope. Do not ask the model to invent an action tool, call Slack or execute workstation commands to complete the journey.

## Show the optional-admin branch

Create Jordan Example using the same profile and Toronto location, but explicitly set `adminRequired: false`; use `demo-01-jordan-create`. Record distinct fictional account/device details and provision under new keys. Expected: group assignments are queued, but no admin request is created. Profile/location defaults still apply.

## Persistence and recovery

Stop and restart only the backend process, then refresh the dashboard and call `get_onboarding_status` again. Account details, profile/location snapshots, requests, assignments and event history remain. MCP can keep running while the backend restarts; it reports unavailable/timeout errors if called during the outage. On an uncertain mutation result, reuse the original key and arguments. Always retrieve current status after a mutation replay because the saved response can be older than the current record.

`list_hires` returns a page and `nextOffset`; follow that offset if the demo database has more hires than fit on one page.

## Reset and exit

The smoke tests use temporary stores and require no reset of your working demo. To clear a deliberately disposable demo database, stop the backend and run `npm run reset:demo`, then restart. This deletes all local portal demo hires, profiles, location defaults and command history; it does not reset workstation configuration or the separate planner/Slack stores. Recreate the fictional CMS profile/location defaults after a reset. Otherwise, retain the database and use new fictional names/run keys for a later presentation.

Stop the MCP host connections when finished. MCP setup and the SDK smoke tests are implemented; the actual presenter should rehearse the host-session prompts once before the hackathon demo.
