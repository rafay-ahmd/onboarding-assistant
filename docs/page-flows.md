# Onboarding workspace flows

## Requester identity

The initial onboarding form is temporarily removed while role-based dashboards are developed. The connected Slack account is the requester. GitHub username and AWS group are entered within each request dialog.

## Access requests

Access readiness = verified permissions / all profile permissions. A linked Slack record takes precedence over its manual record. Sent messages and approved tickets are not counted as completed access.

Helpdesk route: Review request → enter justification/details → continue to full message review → edit any message text → save changes OR explicitly send to Slack → message sent → sync replies → answer questions in a styled reply dialog → sync again → detected ticket link → open helpdesk using your login → check actual access → confirm verification.

Admin rights follow the same Slack review/edit/send/sync/verify flow. Team-owned access: contact the EM or owner → manually track status and verification.

No background polling or direct helpdesk ticket-status API is implemented. A network-uncertain send cannot be blindly resent. Backend requests retain the connected account and one entitlement key even when message wording is edited.

## Workstation checks

Run the PowerShell readiness checker separately → inspect local inventory → generate JSON report → import report → review ready/missing/blocked/unverified results → resolve findings → rerun and import a fresh report. Import does not grant access or complete setup steps.

## Setup journey

Review prerequisites and dependency blockers → verify required access → manually perform the documented step → check its verification criteria → record completion → next dependent steps become ready. Removing a prerequisite invalidates downstream recorded completion. Nothing on this page runs setup.bat or installs dependencies.

Explicit verification of the connected requester’s own Slack records updates local setup prerequisites. Role-based hire/account mapping remains pending.

```mermaid
flowchart TB
  subgraph P["01 / Your onboarding plan"]
    P1[Enter employee and team details] --> P2[Save automatically in this browser]
  end
  subgraph A["Access requests"]
    A1{Request route} -->|Slack| A2[Enter justification and required details]
    A2 --> A3[Edit full message in review modal]
    A3 -->|Save draft| A3
    A3 -->|Send to Slack| A4[Message sent]
    A4 --> A5[Manually sync replies]
    A5 -->|Question| A6[Reply in the app]
    A6 --> A5
    A5 -->|Ticket detected| A7[Open ticket on helpdesk]
    A1 -->|Team owner| A9[Submit externally and track manually]
    A7 --> A8[Check actual access and confirm verified]
    A9 --> A8
    A8 --> A10[Access readiness percentage increases]
  end
  subgraph W["Workstation checks"]
    W1[Run PowerShell checker separately] --> W2[Import generated JSON report]
    W2 --> W3[Review inventory findings]
    W3 --> W4[Resolve issues manually]
    W4 --> W1
  end
  subgraph S["Setup journey"]
    S1[Review dependency blockers] --> S2[Perform documented setup step manually]
    S2 --> S3[Check verification criteria]
    S3 --> S4[Record completion]
    S4 --> S5[Next dependent steps become ready]
    S5 --> S1
  end
  P2 -. Requester identity .-> A2
  A8 -. Verified own access updates prerequisites .-> S1
  W3 -. Findings guide setup .-> S2
```
