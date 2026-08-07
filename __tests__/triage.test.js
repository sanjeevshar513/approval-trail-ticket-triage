const fs = require('fs');
const path = require('path');
const { initializeDatabase, runQuery, getQuery, allQuery, dbPath } = require('../server/db/database');
const { createTicket, triggerTriage, approveTicket } = require('../server/services/triage');
const { getSentEmails } = require('../server/adapters/email');

describe('Approval-Trail Ticket Triage Invariant Tests', () => {
  
  beforeAll(async () => {
    // Delete database file if exists to start fresh
    if (fs.existsSync(dbPath)) {
      try {
        fs.unlinkSync(dbPath);
      } catch (err) {
        // file locked, ignoring
      }
    }
    // Initialize schema and triggers
    initializeDatabase();
    // Wait briefly for SQLite to complete file sync
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  afterAll((done) => {
    // Clean up
    const sqlitePath = path.resolve(__dirname, '../server/db/triage.db');
    if (fs.existsSync(sqlitePath)) {
      try {
        fs.unlinkSync(sqlitePath);
      } catch (err) {
        // file locked, ignoring
      }
    }
    done();
  });

  test('Invariant AD-2: Categories configuration must be present and readable', () => {
    const configPath = path.resolve(__dirname, '../server/config/categories.json');
    expect(fs.existsSync(configPath)).toBe(true);
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    expect(config.categories).toBeDefined();
    expect(Array.isArray(config.categories)).toBe(true);
    expect(config.categories.length).toBeGreaterThan(0);
  });

  test('Ticket Submission & AI Triage Pre-Action Logging (FR-1, FR-3, Invariant AD-3)', async () => {
    // 1. Submit Ticket
    const name = 'Sarah Connor';
    const email = 'sarah@skynet.com';
    const subject = 'SKynet AI Integration Error';
    const description = 'Encountering database lock issues when triggering Skynet neural logs.';
    
    const id = await createTicket(name, email, subject, description);
    expect(id).toBeDefined();

    // Verify status is Pending Triage on insert
    const ticket = await getQuery('SELECT * FROM tickets WHERE id = ?', [id]);
    expect(ticket.status).toBe('Pending Triage');

    // Run Triage trigger explicitly (as in triggerTriage)
    await triggerTriage(id);

    // 2. Verify AI Pre-Action Log matches status update
    const finalTicket = await getQuery('SELECT * FROM tickets WHERE id = ?', [id]);
    expect(finalTicket.status).toBe('Pending Approval');

    const auditLog = await getQuery('SELECT * FROM audit_trail WHERE ticket_id = ? AND action_type = ?', [id, 'AI_TRIAGE']);
    expect(auditLog).toBeDefined();
    expect(auditLog.status).toBe('Pending Approval');
    
    const decision = JSON.parse(auditLog.decision);
    expect(decision.category).toBeDefined();
    expect(decision.priority).toBeDefined();
    expect(decision.draftResponse).toBeDefined();
  });

  test('HITL Agent Approval, Mock Dispatch, & Human Post-Action Log (FR-7, Invariants AD-1)', async () => {
    // Submit a fresh ticket
    const id = await createTicket('John Connor', 'john@skynet.com', 'API Connection lost', 'Server returns HTTP 403');
    await triggerTriage(id);

    const pendingTicket = await getQuery('SELECT * FROM tickets WHERE id = ?', [id]);
    expect(pendingTicket.status).toBe('Pending Approval');

    // Human Approval and dispatch
    const agentName = 'Agent Alex';
    const finalCategory = 'Technical Bug';
    const finalPriority = 'High';
    const finalDraft = 'Hello John, we corrected the server permissions. Please try again.';

    await approveTicket(id, agentName, finalCategory, finalPriority, finalDraft);

    // 1. Verify Ticket is Resolved
    const resolvedTicket = await getQuery('SELECT * FROM tickets WHERE id = ?', [id]);
    expect(resolvedTicket.status).toBe('Resolved');

    // 2. Verify Email is Mock Sent with Agent Signature
    const sentEmails = getSentEmails();
    const sent = sentEmails.find(m => m.ticketId === id);
    expect(sent).toBeDefined();
    expect(sent.agentSignature).toBe(agentName);
    expect(sent.body).toBe(finalDraft);

    // 3. Verify Human Log written to Audit Trail
    const humanLogs = await allQuery('SELECT * FROM audit_trail WHERE ticket_id = ? AND action_type IN (?, ?)', [id, 'HUMAN_APPROVAL', 'HUMAN_OVERRIDE']);
    expect(humanLogs.length).toBeGreaterThan(0);
    expect(humanLogs[0].status).toBe('Approved');
  });

  test('Invariant AD-4: SQLite triggers physically block UPDATE and DELETE on audit_trail table', async () => {
    // Submit a ticket and generate triage logs
    const id = await createTicket('David Lightman', 'david@wopr.org', 'WOPR integration fails', 'Access denied to global thermonuclear games');
    await triggerTriage(id);

    // Verify audit log exists
    const log = await getQuery('SELECT * FROM audit_trail WHERE ticket_id = ?', [id]);
    expect(log).toBeDefined();

    // 1. Attempt to UPDATE the audit_trail row - Expect Trigger Failure
    let updateError = null;
    try {
      await runQuery('UPDATE audit_trail SET status = ? WHERE ticket_id = ?', ['Tampered', id]);
    } catch (err) {
      updateError = err;
    }
    expect(updateError).toBeDefined();
    expect(updateError.message).toContain('Updates are forbidden on audit_trail table');

    // 2. Attempt to DELETE the audit_trail row - Expect Trigger Failure
    let deleteError = null;
    try {
      await runQuery('DELETE FROM audit_trail WHERE ticket_id = ?', [id]);
    } catch (err) {
      deleteError = err;
    }
    expect(deleteError).toBeDefined();
    expect(deleteError.message).toContain('Deletes are forbidden on audit_trail table');

    // Verify row was not tampered with
    const logPostAttempt = await getQuery('SELECT * FROM audit_trail WHERE ticket_id = ?', [id]);
    expect(logPostAttempt.status).toBe('Pending Approval');
  });

});
