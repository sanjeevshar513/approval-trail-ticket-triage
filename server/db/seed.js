const { initializeDatabase, runQuery, getQuery } = require('./database');
const { getCategories } = require('../adapters/gemini');
const crypto = require('crypto');

async function seedDatabase() {
  console.log('[SEED] Initializing database schema...');
  initializeDatabase();

  // Brief pause for SQLite async schema initialization
  await new Promise((resolve) => setTimeout(resolve, 300));

  try {
    // Check if tickets table is already populated
    const existing = await getQuery('SELECT COUNT(*) as count FROM tickets');
    if (existing && existing.count > 0) {
      console.log(`[SEED] Database already contains ${existing.count} tickets. Skipping seed script execution.`);
      process.exit(0);
    }

    // Verify config-driven categories (Invariant AD-2 / Agent Rule 1)
    const allowedCategories = getCategories();
    console.log('[SEED] Validated config-driven categories:', allowedCategories);

    const catAccount = allowedCategories.find(c => c.toLowerCase().includes('account')) || allowedCategories[0];
    const catBilling = allowedCategories.find(c => c.toLowerCase().includes('billing')) || allowedCategories[0];
    const catBug = allowedCategories.find(c => c.toLowerCase().includes('bug') || c.toLowerCase().includes('tech')) || allowedCategories[0];
    const catFeature = allowedCategories.find(c => c.toLowerCase().includes('feature')) || allowedCategories[0];

    const now = Date.now();
    const isoString = (offsetMinutes = 0) => new Date(now - offsetMinutes * 60 * 1000).toISOString();

    const sampleTickets = [
      // 1. Pending Approval - Account Access
      {
        id: crypto.randomUUID(),
        name: 'Alice Vance',
        email: 'alice@blackmesa.org',
        subject: 'Unable to reset account password via magic link',
        description: 'I requested a password reset email twice today, but clicking the magic link leads to an expired token error page immediately.',
        status: 'Pending Approval',
        createdAt: isoString(45),
        aiCategory: catAccount,
        aiPriority: 'High',
        confidence: 0.94,
        draftResponse: 'Hello Alice,\n\nThank you for reporting this issue with password reset magic links. We have refreshed your security token. Please try requesting a new reset link now or let us know if the issue persists.\n\nBest regards,\nAccounts Support Team'
      },
      // 2. Pending Approval - Billing
      {
        id: crypto.randomUUID(),
        name: 'Marcus Brody',
        email: 'marcus@museum.edu',
        subject: 'Double charged for annual subscription renewal',
        description: 'My credit card statement shows two identical charges of $199.00 on August 5th. Please refund the duplicate transaction.',
        status: 'Pending Approval',
        createdAt: isoString(35),
        aiCategory: catBilling,
        aiPriority: 'High',
        confidence: 0.98,
        draftResponse: 'Hello Marcus,\n\nWe apologize for the duplicate charge on your account. I have initiated a refund for the second $199.00 transaction. It should reflect on your statement within 3-5 business days.\n\nBest regards,\nBilling Support Team'
      },
      // 3. Pending Approval - Technical Bug
      {
        id: crypto.randomUUID(),
        name: 'Elena Rostova',
        email: 'elena@techcorp.io',
        subject: 'CSV export truncates special characters in UTF-8',
        description: 'When exporting the audit logs to CSV, non-ASCII accent characters like "é" and "ñ" get garbled into replacement symbols.',
        status: 'Pending Approval',
        createdAt: isoString(25),
        aiCategory: catBug,
        aiPriority: 'Medium',
        confidence: 0.89,
        draftResponse: 'Hello Elena,\n\nThank you for bringing this UTF-8 encoding issue to our attention. Our engineering team is adding explicit UTF-8 BOM headers to the CSV exporter to resolve character garbling.\n\nBest regards,\nEngineering Support Team'
      },
      // 4. Pending Approval - Feature Request
      {
        id: crypto.randomUUID(),
        name: 'Devon Miles',
        email: 'devon@foundation.org',
        subject: 'Add Dark Mode theme toggle to dashboard',
        description: 'Our support team works late shifts and would greatly appreciate a native dark mode theme option in the agent queue panel.',
        status: 'Pending Approval',
        createdAt: isoString(15),
        aiCategory: catFeature,
        aiPriority: 'Low',
        confidence: 0.91,
        draftResponse: 'Hello Devon,\n\nThank you for suggesting dark mode support! We have logged this request with our UI product design team for inclusion in an upcoming release cycle.\n\nBest regards,\nProduct Design Team'
      },
      // 5. Pending Approval - Technical Bug
      {
        id: crypto.randomUUID(),
        name: 'Sarah Connor',
        email: 'sarah@skynet.com',
        subject: 'API returns HTTP 500 error when uploading large JSON payload',
        description: 'Every POST request to /api/tickets with payloads larger than 50KB fails with an unhandled server error.',
        status: 'Pending Approval',
        createdAt: isoString(10),
        aiCategory: catBug,
        aiPriority: 'High',
        confidence: 0.95,
        draftResponse: 'Hello Sarah,\n\nThank you for the detailed bug report. We identified a request body parser limit configuration issue and are releasing a hotfix shortly.\n\nBest regards,\nPlatform Engineering Team'
      },
      // 6. Pending Triage - Account Access
      {
        id: crypto.randomUUID(),
        name: 'Arthur Pendelton',
        email: 'arthur@camelot.co',
        subject: 'Need tax invoice for Q3 billing',
        description: 'Please send the official VAT invoice for our Q3 corporate billing payment made last week.',
        status: 'Pending Triage',
        createdAt: isoString(8)
      },
      // 7. Pending Triage - Technical Bug
      {
        id: crypto.randomUUID(),
        name: 'Claire Dearing',
        email: 'claire@dpn.org',
        subject: 'SSO login redirect loop with Okta SAML',
        description: 'Users authenticating via SAML 2.0 Okta integration get trapped in a redirect loop after entering credentials.',
        status: 'Pending Triage',
        createdAt: isoString(5)
      },
      // 8. Pending Triage - Feature Request
      {
        id: crypto.randomUUID(),
        name: 'Hugo Reyes',
        email: 'hugo@numbers48.com',
        subject: 'Webhook notification delivery delay',
        description: 'Webhook events for ticket status updates are arriving 15 to 20 minutes after the actual action occurred.',
        status: 'Pending Triage',
        createdAt: isoString(2)
      },
      // 9. Resolved - Approved by Agent Alex
      {
        id: crypto.randomUUID(),
        name: 'John Connor',
        email: 'john@resistance.net',
        subject: 'Updated payment method not reflecting on account',
        description: 'I updated my billing card details yesterday, but the portal still displays my old expired Visa card.',
        status: 'Resolved',
        createdAt: isoString(120),
        aiCategory: catBilling,
        aiPriority: 'High',
        confidence: 0.92,
        draftResponse: 'Hello John,\n\nWe updated your default payment profile to your new card. You can verify this now in your account billing settings.',
        humanAction: {
          actionType: 'HUMAN_APPROVAL',
          agentName: 'Agent Alex',
          category: catBilling,
          priority: 'High',
          draftResponse: 'Hello John,\n\nWe updated your default payment profile to your new card. You can verify this now in your account billing settings.\n\nBest regards,\nAgent Alex'
        }
      },
      // 10. Resolved - Overridden by Agent Jordan
      {
        id: crypto.randomUUID(),
        name: 'David Lightman',
        email: 'david@wopr.org',
        subject: 'Requesting bulk export API endpoint',
        description: 'We need a REST API endpoint to dump all ticket metrics into our internal analytics data lake nightly.',
        status: 'Resolved',
        createdAt: isoString(180),
        aiCategory: catAccount,
        aiPriority: 'Low',
        confidence: 0.75,
        draftResponse: 'Hello David,\n\nThank you for your inquiry regarding export options.',
        humanAction: {
          actionType: 'HUMAN_OVERRIDE',
          agentName: 'Agent Jordan',
          category: catFeature,
          priority: 'Medium',
          draftResponse: 'Hello David,\n\nWe have escalated your bulk export API requirement to our Enterprise Integrations product manager.\n\nBest regards,\nAgent Jordan'
        }
      }
    ];

    let ticketsCount = 0;
    let auditCount = 0;

    for (const ticket of sampleTickets) {
      // Insert Ticket
      await runQuery(
        `INSERT INTO tickets (id, email, name, subject, description, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [ticket.id, ticket.email, ticket.name, ticket.subject, ticket.description, ticket.status, ticket.createdAt]
      );
      ticketsCount++;

      // Insert AI Triage log for tickets that underwent triage
      if (ticket.aiCategory) {
        const aiDecisionJSON = JSON.stringify({
          category: ticket.aiCategory,
          priority: ticket.aiPriority,
          draftResponse: ticket.draftResponse
        });
        await runQuery(
          `INSERT INTO audit_trail (timestamp, ticket_id, action_type, decision, confidence, status)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [ticket.createdAt, ticket.id, 'AI_TRIAGE', aiDecisionJSON, ticket.confidence, 'Pending Approval']
        );
        auditCount++;
      }

      // Insert Human Action log for Resolved tickets
      if (ticket.humanAction) {
        const humanDecisionJSON = JSON.stringify({
          category: ticket.humanAction.category,
          priority: ticket.humanAction.priority,
          draftResponse: ticket.humanAction.draftResponse,
          approvedBy: ticket.humanAction.agentName
        });
        const approvalTime = new Date(new Date(ticket.createdAt).getTime() + 10 * 60 * 1000).toISOString();
        await runQuery(
          `INSERT INTO audit_trail (timestamp, ticket_id, action_type, decision, confidence, status)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [approvalTime, ticket.id, ticket.humanAction.actionType, humanDecisionJSON, 1.0, 'Approved']
        );
        auditCount++;
      }
    }

    console.log(`[SEED SUCCESS] Successfully inserted ${ticketsCount} tickets and ${auditCount} audit trail compliance logs.`);
    process.exit(0);
  } catch (error) {
    console.error('[SEED ERROR] Failed to seed database:', error.message);
    process.exit(1);
  }
}

seedDatabase();
