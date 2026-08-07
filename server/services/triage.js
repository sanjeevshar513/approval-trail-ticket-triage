const { runQuery, getQuery, allQuery } = require('../db/database');
const { runTriage } = require('../adapters/gemini');
const { dispatchEmail } = require('../adapters/email');
const crypto = require('crypto');

// 1. Ingest/Create Ticket
async function createTicket(name, email, subject, description) {
  if (!name || !email || !subject || !description) {
    throw new Error('All support ticket fields are required.');
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const status = 'Pending Triage';

  // Save ticket to DB
  await runQuery(
    `INSERT INTO tickets (id, email, name, subject, description, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, email, name, subject, description, status, createdAt]
  );

  // Trigger background AI triage asynchronously
  // We run it and let it handle errors without blocking the customer response
  triggerTriage(id).catch((err) => console.error(`Background triage failed for ticket ${id}:`, err.message));

  return id;
}

// 2. Triage background job
async function triggerTriage(ticketId) {
  const ticket = await getQuery('SELECT * FROM tickets WHERE id = ?', [ticketId]);
  if (!ticket) throw new Error(`Ticket ${ticketId} not found.`);

  try {
    // Run Gemini model prediction
    const aiDecision = await runTriage(ticket);

    const timestamp = new Date().toISOString();
    const actionType = 'AI_TRIAGE';
    const logStatus = 'Pending Approval';
    const decisionString = JSON.stringify({
      category: aiDecision.category,
      priority: aiDecision.priority,
      draftResponse: aiDecision.draftResponse
    });

    // Invariant AD-3: Write to audit_trail BEFORE updating ticket state to Pending Approval
    await runQuery(
      `INSERT INTO audit_trail (timestamp, ticket_id, action_type, decision, confidence, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [timestamp, ticketId, actionType, decisionString, aiDecision.categoryConfidence, logStatus]
    );

    // Update ticket state to Pending Approval
    await runQuery('UPDATE tickets SET status = ? WHERE id = ?', ['Pending Approval', ticketId]);
    console.log(`[TRIAGE-OK] Ticket ${ticketId} triaged. Logged and marked Pending Approval.`);
  } catch (err) {
    console.error(`AI triage engine failed for ticket ${ticketId}:`, err.message);
    await runQuery('UPDATE tickets SET status = ? WHERE id = ?', ['Pending Triage', ticketId]);
  }
}

// 3. Human-in-the-Loop Action Approval and Send
async function approveTicket(ticketId, agentName, finalCategory, finalPriority, finalDraft) {
  if (!agentName) {
    throw new Error('Support agent signature is required for manual approvals.');
  }

  const ticket = await getQuery('SELECT * FROM tickets WHERE id = ?', [ticketId]);
  if (!ticket) throw new Error(`Ticket ${ticketId} not found.`);

  if (ticket.status !== 'Pending Approval') {
    throw new Error(`Ticket is not in Pending Approval status. Current status: ${ticket.status}`);
  }

  // Get initial AI triage decision from logs to verify confidence and detect overrides
  const initialLog = await getQuery(
    `SELECT * FROM audit_trail WHERE ticket_id = ? AND action_type = 'AI_TRIAGE' ORDER BY id DESC LIMIT 1`,
    [ticketId]
  );
  if (!initialLog) {
    throw new Error('Validation Breach: Missing initial AI decision logs.');
  }

  const aiData = JSON.parse(initialLog.decision);
  const isOverride = aiData.category !== finalCategory || aiData.priority !== finalPriority || aiData.draftResponse !== finalDraft;

  // Dispatch Email utilizing agent signature check (Enforcing HITL AD-1)
  await dispatchEmail(ticketId, ticket.email, `RE: ${ticket.subject}`, finalDraft, agentName);

  const timestamp = new Date().toISOString();
  const actionType = isOverride ? 'HUMAN_OVERRIDE' : 'HUMAN_APPROVAL';
  const approvalDecision = JSON.stringify({
    category: finalCategory,
    priority: finalPriority,
    draftResponse: finalDraft,
    approvedBy: agentName
  });

  // Log post-action human approval to audit trail
  await runQuery(
    `INSERT INTO audit_trail (timestamp, ticket_id, action_type, decision, confidence, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [timestamp, ticketId, actionType, approvalDecision, 1.0, 'Approved']
  );

  // Update ticket to Resolved
  await runQuery('UPDATE tickets SET status = ? WHERE id = ?', ['Resolved', ticketId]);

  console.log(`[APPROVAL-OK] Ticket ${ticketId} resolved and logged to audit trail by ${agentName}.`);
}

module.exports = {
  createTicket,
  triggerTriage,
  approveTicket
};
