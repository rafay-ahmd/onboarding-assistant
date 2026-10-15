# Onboarding workspace flows

## 01 / Your onboarding plan

Enter name, work email, start date, EM, GitHub username and AWS group → save automatically in this browser → use details in form/team drafts and prefill GitHub/AWS request details. The connected Slack account remains the requester. This form does not create an account or submit requests automatically.

## Access requests

Access readiness = verified permissions / all profile permissions. A linked Slack record takes precedence over its manual record. Sent messages and approved tickets are not counted as completed access.

Helpdesk route: Review request → enter justification/details → continue to full message review → edit any message text → save changes OR explicitly send to Slack → message sent → sync replies → answer questions in a styled reply dialog → sync again → detected ticket link → open helpdesk using your login → check actual access → confirm verification.

Admin rights: open required service-desk form → submit there → save ticket link and manually update status → verify actual access. Team-owned access: confirm owner → use draft → manually track status and verification.

No background polling or direct helpdesk ticket-status API is implemented. A network-uncertain send cannot be blindly resent. Backend requests retain the connected account and one entitlement key even when message wording is edited.

## Workstation checks

Run the PowerShell readiness checker separately → inspect local inventory → generate JSON report → import report → review ready/missing/blocked/unverified results → resolve findings → rerun and import a fresh report. Import does not grant access or complete setup steps.

## Setup journey

Review prerequisites and dependency blockers → verify required access → manually perform the documented step → check its verification criteria → record completion → next dependent steps become ready. Removing a prerequisite invalidates downstream recorded completion. Nothing on this page runs setup.bat or installs dependencies.

Slack verification updates the saved plan/setup prerequisites only when the configured connected-account email matches the plan email. Other records remain isolated.

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
    A1 -->|Admin form or team owner| A9[Submit externally and track manually]
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
  P2 -. Prefills details .-> A2
  A8 -. Matching plan identity updates prerequisites .-> S1
  W3 -. Findings guide setup .-> S2
```
