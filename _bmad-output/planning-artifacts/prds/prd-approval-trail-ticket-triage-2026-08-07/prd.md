---
title: Approval-Trail Ticket Triage
status: final
created: 2026-08-07
updated: 2026-08-07
---

# PRD: Approval-Trail Ticket Triage

## 0. Document Purpose
This Product Requirement Document (PRD) outlines the technical and operational specifications for the **Approval-Trail Ticket Triage** platform. It acts as the single source of truth for Product Managers, UX Designers, System Architects, and Software Engineers. The glossary-anchored vocabulary guarantees that downstream workflows utilize terms exactly. Features are grouped with globally stable functional requirements (FR) IDs to allow cross-cutting references and simple automated test alignments. Every architectural decision is guided by strict human-in-the-loop and audit safety invariants.

## 1. Vision
**Approval-Trail Ticket Triage** is a high-trust, AI-augmented customer support ticketing application. It leverages the advanced capabilities of the Gemini API to instantly analyze, classify, prioritize, and draft responses for incoming support tickets. 

Crucially, the system operates on a strict **human-in-the-loop (HITL)** model: no automated actions (such as sending emails or changing ticket status) can occur without explicit human approval. To ensure total transparency and compliance, every AI-proposed decision, human override, and approval event is immutably logged to an append-only Audit Trail. This balances the rapid throughput of AI with the safety, accountability, and empathy of human agents.

## 2. Target User

### 2.1 Jobs To Be Done (JTBD)
* **Sarah (Customer):** "When I have a product issue, I want to submit a ticket easily and get a fast, accurate, and helpful response so I can resolve my problem and get back to work."
* **Alex (Support Agent):** "When triage duties are heavy, I want Gemini to categorize, prioritize, and draft initial responses so I can quickly review, polish, and approve them without starting from scratch."
* **David (Compliance Auditor):** "When validating support operations, I want a complete, tamper-proof audit trail of what Gemini decided, what confidence it had, and what the human actually approved so we have full accountability and traceability."

### 2.2 Non-Users (v1)
* **Automated Bots / AI Agents (Outbound):** Automated systems seeking to directly ingest tickets and auto-reply without a human review layer are blocked in v1.
* **External API Integrators:** Standard customers who wish to access triage results via direct webhooks or third-party APIs without utilizing our Agent Web dashboard are out of scope.

### 2.3 Key User Journeys

* **UJ-1. Sarah submits a complex bug ticket.**
  * **Persona + context:** Sarah is a busy SaaS client encountering an integration error.
  * **Entry state:** Unauthenticated public Web UI form.
  * **Path:** Sarah fills in her email, name, subject ("Integration failing with HTTP 500"), and detailed description. She clicks "Submit".
  * **Climax:** She sees a confirmation screen showing her ticket has been received with ID `#1024`.
  * **Resolution:** An automated "Ticket Received" confirmation is shown on the screen. Behind the scenes, Gemini instantly starts triaging.

* **UJ-2. Alex reviews and approves a Gemini-drafted response.**
  * **Persona + context:** Alex is a Support Agent managing a heavy queue of billing and technical tickets.
  * **Entry state:** Authenticated Web UI Dashboard.
  * **Path:** Alex opens the queue, clicks on Ticket `#1024`. He sees:
    * Gemini Classification: `Technical Bug` (Confidence: 94%)
    * Gemini Priority: `High` (Confidence: 89%)
    * Gemini Drafted Response: A polite 3-paragraph explanation of integration logs.
  * **Climax:** Alex reviews the draft, finds it excellent, adds a quick personalized sign-off, and clicks **"Approve & Send"**.
  * **Resolution:** The response is dispatched to Sarah. The ticket status updates to `Resolved`. The Audit Trail logs: timestamp, ticket ID (`#1024`), AI decision details, AI confidence, human adjustments, and final `Approved` status.

* **UJ-3. David audits AI accuracy and overrides.**
  * **Persona + context:** David is the Support QA Lead / Compliance Auditor.
  * **Entry state:** Authenticated Admin panel (Audit Trail viewer).
  * **Path:** David filters the logs for tickets with "High Priority" and reviews cases where Support Agents edited the AI drafts before sending.
  * **Climax:** He exports a CSV showing that 92% of Gemini drafts were approved with minimal edits, verifying high AI utility.
  * **Resolution:** David presents the compliance report to the director, showing a tamper-proof record of all automated suggestions and human-approved actions.

## 3. Glossary

* **Ticket** — An incoming support request containing the submitter's name, email, subject, detailed description, unique ID, submission timestamp, and current status (`Pending Triage`, `Pending Approval`, `Resolved`).
* **Triage** — The automated background process that triggers immediately upon Ticket creation. It uses Gemini AI to analyze the ticket text, determine a Ticket Category, select a Ticket Priority, and draft a response.
* **Ticket Category** — The classification assigned to a ticket. Crucially, Ticket Categories are **configuration-driven** (defined in an external config file) and **never hardcoded** in the application source code.
* **Ticket Priority** — The level of urgency associated with the ticket, chosen from predefined values: `Low`, `Medium`, or `High`.
* **Gemini Triage Decision** — The raw output generated by Gemini AI for a specific ticket, which includes: proposed Category, proposed Priority, a confidence score (0% to 100%) for both, and a fully written Draft Response.
* **Audit Trail (Approval Trail)** — An immutable, append-only chronological log that captures every single AI decision and human action. Every entry includes: timestamp, ticket ID, the type of decision, the AI confidence score, human overrides, and the final dispatch status.
* **Human-in-the-Loop (HITL) Approval** — The mandatory workflow step where a Support Agent reviews a ticket's Gemini Triage Decision and must click "Approve" (with or without manual edits) before any external response is dispatched.

## 4. Features

### 4.1 Public Support Ticket Submission (Customer Interface)
**Description:** A clean, unauthenticated public web form where customers can submit a help request. Upon submission, a new ticket is written to the database with a state of `Pending Triage`. Realizes UJ-1.

#### FR-1: Create Ticket
Customer can enter their email address, name, subject, and detailed description. All fields are required.
* **Consequences (testable):** 
  * System returns a distinct Ticket ID (e.g., `#1024`) and displays a success page to the user.
  * Database records the ticket with status `Pending Triage` and timestamps the submission.

---

### 4.2 Gemini AI Automated Triage (Backend Engine)
**Description:** A background job or event listener triggered by a new Ticket. It pulls categories from the config file, invokes Gemini AI, logs the proposed decision to the Audit Trail *before* any action, and updates the ticket to `Pending Approval`. Realizes UJ-2.

#### FR-2: Dynamic Category Resolution
The system must load categories from an external configuration file (e.g. `config.toml` or `categories.json`). The application code **must not hardcode** any category names.
* **Consequences (testable):**
  * Adding a new category to the configuration file instantly makes it available for Gemini AI's classification prompt and the human interface.

#### FR-3: Gemini AI Triage Run
The system must invoke the Gemini API, passing the ticket's subject and description alongside the allowed configuration categories. It retrieves: predicted Category, predicted Priority, confidence scores, and a draft email response.
* **Consequences (testable):**
  * The response is generated within 5 seconds of submission.

#### FR-4: AI Decision Logging (Pre-action Log)
The system **must log every AI decision to the approval trail before acting**. It must write the initial `Gemini Triage Decision` to the Audit Trail with a status of `Pending Approval` *prior* to displaying the recommendations to the Support Agent.
* **Consequences (testable):**
  * Attempting to view a ticket in the dashboard without an existing audit trail entry for that ticket ID throws an error.

---

### 4.3 Support Agent Dashboard & HITL Approval (Agent Interface)
**Description:** An authenticated dashboard where Support Agents view tickets in `Pending Approval` state, see Gemini's recommendations (confidence scores highlighted), and must explicitly approve or edit the response before sending. Realizes UJ-2.

#### FR-5: Queue Dashboard
Support Agent can view a list of all tickets marked `Pending Approval`, sorted by Ticket Priority and submission time. Gemini's classification, priority, and confidence scores are visible on the list.
* **Consequences (testable):**
  * System successfully displays the categories loaded from the configuration file alongside AI confidence percentages.

#### FR-6: HitL Response Editor
Support Agent can click a ticket to view the customer's text side-by-side with Gemini's proposed classification, priority, and Draft Response. Support Agent can edit the Draft Response text, modify the Priority, or change the Category using a dropdown containing the configuration-defined list.
* **Consequences (testable):**
  * Modification changes the visual draft but does not modify the raw, initially logged Gemini decision in the Audit Trail.

#### FR-7: Approval Action & Despatch
Support Agent can click "Approve & Send" to finalize and send the response. **No automated sending of any draft response can occur without human approval.**
* **Consequences (testable):**
  * Tapping "Approve & Send" triggers a mock email dispatch and sets the ticket status to `Resolved`.
  * Tapping "Approve & Send" writes a final log to the Audit Trail containing the timestamp, agent ID, the final category/priority, any edits made, and status `Approved`.

---

### 4.4 Compliance Audit Trail Viewer (Auditor Interface)
**Description:** A secure, read-only interface displaying the immutable, chronological log of all AI-triage decisions and human approvals. Realizes UJ-3.

#### FR-8: Audit Log Feed
Authorized Auditor can view an append-only chronological feed of all log records containing: Timestamp, Ticket ID, Action Type (`AI_TRIAGE`, `HUMAN_APPROVAL`, `HUMAN_OVERRIDE`), Details (category, priority, confidence, edits), and Status.
* **Consequences (testable):**
  * Log feed displays chronological entries. Attempts to edit or delete any row in this table are disallowed by the schema and database-level constraints.

#### FR-9: Export Capabilities
Auditor can download the filtered audit log as a CSV file.
* **Consequences (testable):**
  * Tapping "Export CSV" generates and downloads a well-formatted CSV containing all matching audit log columns.

## 5. Non-Goals (Explicit)
* **Fully Automated Dispatch:** The system will **never** send an AI-drafted reply to a customer without human review and a physical "Approve" button press by an agent.
* **Third-Party Ticket Integrations:** We will not integrate with third-party ticketing platforms (e.g., Zendesk, Jira Service Desk, Salesforce Service Cloud) in v1. The app is a standalone, end-to-end web system.
* **Custom AI Model Training/Fine-Tuning:** We will not train or fine-tune models. We will rely on prompt engineering with the robust foundation models of Gemini.
* **Multi-Language Support:** The initial release will only support tickets and drafts written in English.

## 6. MVP Scope

### 6.1 In Scope
* Publicly accessible web form for customers to submit tickets.
* Config-driven ticket classification categories (definable in JSON/TOML, no hardcoding).
* Automatic Gemini AI triage running in the background immediately after ticket submission.
* Mandatory AI pre-action decision logging to the Audit Trail.
* Support Agent queue showing ticket priorities and confidence ratings.
* Human-in-the-Loop review screen allowing agents to edit draft responses, alter categories/priorities, and approve for sending.
* Dispatch simulation (mock email delivery showing exactly what response is sent).
* Compliance Audit Trail viewer displaying all logging events in chronological, read-only format.
* Export Audit Trail to CSV.

### 6.2 Out of Scope for MVP
* Actual SMTP server integration for sending real outbound emails (a UI-based simulation/mock box is sufficient and safer for testing).
* Automated SLA (Service Level Agreement) timer alerts and notifications.
* Live chat or phone-based ticketing channels.
* Advanced Agent collision detection (preventing two agents from reviewing the same ticket at once).

## 7. Success Metrics

### 7.1 Primary Metrics
* **SM-1: Average Triage-to-Dispatch Time**
  * *Definition:* The duration from when a customer submits a ticket to when an agent clicks "Approve & Send".
  * *Target:* Under 2 minutes average (down from traditional 15-30 mins manually).
  * *Validates:* FR-5, FR-6, FR-7.
* **SM-2: Gemini Categorization Match Rate**
  * *Definition:* The percentage of tickets where the human agent approves Gemini's predicted Category without overriding/changing it.
  * *Target:* >= 85%.
  * *Validates:* FR-2, FR-3.

### 7.2 Secondary Metrics
* **SM-3: Draft Edit Distance**
  * *Definition:* The percentage of characters modified in the Gemini AI Draft Response by the Support Agent before clicking "Approve & Send".
  * *Target:* <= 15% modification on average, indicating extremely high-utility draft generation.
  * *Validates:* FR-6.

### 7.3 Counter-Metrics
* **SM-C1: Automated Sending Audits**
  * *Definition:* The count of emails sent directly to customers by the system without an associated human approval signature in the Audit Trail.
  * *Target:* **0 (Zero)**. Any number above zero indicates a critical security breach/bypass of the human-in-the-loop safety requirement.
  * *Validates:* FR-7.

## 8. Open Questions
1. **Config File Format:** Should we utilize standard `.toml` or `.json` for configuring categories? (TOML is easier for human modification; JSON is standard for node/JS environments).
2. **Audit Trail Data Store:** For strict auditing, should the Audit Trail be written to a dedicated database table with strict DB-level insert-only permissions, or a local text file?
3. **Response Dispatch System:** Should we structure the mock email system to eventually support AWS SES or SendGrid with minimal friction?

## 9. Assumptions Index
* **[ASSUMPTION-1] config.toml resolution:** The development team will store allowed ticket categories in a configuration file within the server directories, resolved dynamically during runtime.
* **[ASSUMPTION-2] Audit Trail permissions:** The database schema or backend code will enforce write-only (append-only) constraints on the Audit Trail table, preventing delete/update statements from being executed by standard users or Support Agents.
* **[ASSUMPTION-3] Gemini API latency:** The system assumes that Gemini API triage runs completed in the background take less than 5 seconds, which is acceptable for asynchronous backend processing.

---

## Adapt-In Menu

### Cross-Cutting NFRs
* **NFR-1 (Security):** Standard authentication required for the Support Agent Dashboard and Auditor Viewer. No anonymous access is permitted to ticket data or audit trails.
* **NFR-2 (Observability):** Triage process errors (such as Gemini API failures, rate limiting, or network timeouts) must write details to server logs and fall back gracefully, flagging the ticket as `Pending Triage (Error)` without blocking the agent's queue.
* **NFR-3 (Audit Trail Invariant):** Any attempt to alter, delete, or wipe rows in the Audit Trail must immediately trigger a severe security exception logged to standard error output.
