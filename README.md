# Approval-Trail Ticket Triage

> AI-powered customer support ticket classification and response drafting with a mandatory human approval gate and immutable audit logging.

---

## Problem Statement

Manual triage of incoming customer support tickets is time-consuming, inconsistent, and creates long response delays for support teams. Fully automated AI auto-responders introduce significant risks by sending unverified or inaccurate responses directly to customers. 

This platform solves the problem by leveraging Google Gemini AI to instantly analyze, categorize, and draft resolution responses for incoming tickets, while enforcing a strict **Human-in-the-Loop (HITL)** approval gate. No response is ever sent to a customer without explicit human review, digital signature, and immutable audit logging.

---

## Key Features

* **AI-Assisted Triage**: Uses Google Gemini AI to analyze ticket text, assign a priority level (`Low`, `Medium`, `High`), suggest a category, and draft a professional response.
* **Human Approval Gate**: Every ticket verdict requires human review. Support agents can accept or override AI suggestions before any customer response is dispatched.
* **Immutable Audit Trail**: SQLite database triggers physically block `UPDATE` and `DELETE` queries on the audit trail table, ensuring an immutable log of all AI predictions and human agent decisions.
* **Config-Driven Categories**: Ticket categories are dynamically configured via `server/config/categories.json` rather than hardcoded, maintaining modularity.
* **Real-Time Performance Dashboard**: Displays live metrics including total tickets processed, human approval rate (% approved vs overridden), average turnaround time, and category distribution.
* **Auditor CSV Exporter**: Generates raw CSV log downloads (`/api/audit-trail/export`) for external compliance audits.

---

## Tech Stack

* **Backend Framework**: Node.js & Express.js (v5)
* **AI Integration**: Google Gen AI SDK (`@google/generative-ai` with `gemini-2.5-flash` model, with built-in mock fallback)
* **Database**: SQLite3 (`sqlite3`) with custom SQL immutability triggers
* **Frontend**: HTML5, Vanilla JavaScript, Tailwind CSS (via CDN), FontAwesome Icons
* **Testing & Tools**: Jest, `cross-env`, `dotenv`

---

## How to Run Locally

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/sanjeevshar513/approval-trail-ticket-triage.git
   cd approval-trail-ticket-triage
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory:
   ```env
   PORT=3000
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
   *(Note: If `GEMINI_API_KEY` is omitted or set to `MOCK`, the application gracefully falls back to intelligent mock triage mode).*

4. **Seed Sample Demo Data (Optional)**:
   ```bash
   npm run seed
   ```

5. **Start the Application**:
   ```bash
   npm start
   ```
   Access the web interface at `http://localhost:3000`.

---

## How to Run Tests

Run the unit and invariant test suite with Jest:

```bash
npm test
```

---

## Architecture Overview

1. **Submission**: A customer submits a ticket via the Customer Portal. The server persists the ticket with status `Pending Triage`.
2. **AI Triage**: The backend calls the Gemini API to classify the ticket category, determine priority, and draft a response. It logs an `AI_TRIAGE` entry into the `audit_trail` table and updates the ticket status to `Pending Approval`.
3. **Human Review & Approval**: The ticket appears in the Agent Approval Queue. A human support agent reviews the AI draft, modifies any fields if necessary, and enters their digital signature to approve.
4. **Compliance Dispatch**: The server mock-dispatches the approved email response, writes a `HUMAN_APPROVAL` or `HUMAN_OVERRIDE` record to the audit trail, and marks the ticket as `Resolved`.

---

## Screenshots

### Customer Ticket Submission Portal
<img width="1920" height="1200" alt="Screenshot 2026-08-08 131023" src="https://github.com/user-attachments/assets/5cab1188-63b8-4cdc-925b-fecd3ea23c50" />
<img width="1920" height="1200" alt="Screenshot 2026-08-08 131459" src="https://github.com/user-attachments/assets/a88d10fc-1247-4cb7-b3ee-6416ab8f3b3b" />


### Agent Approval Queue & HITL Response Editor
<img width="1920" height="1200" alt="Screenshot 2026-08-08 131621" src="https://github.com/user-attachments/assets/ccc64cef-eaaa-47f1-bb08-176c7fa59f4b" />



### Real-Time Performance & Triage Dashboard
<img width="1920" height="1200" alt="Screenshot 2026-08-08 131850" src="https://github.com/user-attachments/assets/68a35952-38c3-44da-bc23-ac0dcbd07c1f" />


### Compliance Audit Trail Viewer
<img width="1920" height="1200" alt="Screenshot 2026-08-08 131949" src="https://github.com/user-attachments/assets/74c38f65-2199-44f6-8708-a8ef4a63a6be" />

