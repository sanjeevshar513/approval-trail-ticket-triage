require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { initializeDatabase, allQuery, getQuery } = require('./db/database');
const { createTicket, approveTicket, triggerTriage } = require('./services/triage');
const { getCategories } = require('./adapters/gemini');

// Initialize Express App
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Dynamic Configuration Invariant (AD-2) - Verify category configuration at startup
try {
  const loadedCategories = getCategories();
  console.log('[CONFIG] Successfully validated categories configuration:', loadedCategories);
} catch (error) {
  console.error('[CRITICAL] Server failed to start due to invalid or missing categories.json config.');
  process.exit(1); // Crash immediately at startup
}

// Initialize SQLite database
initializeDatabase();

// API Endpoints

// 1. Submit Ticket (FR-1)
app.post('/api/tickets', async (req, res) => {
  const { name, email, subject, description } = req.body;
  try {
    const ticketId = await createTicket(name, email, subject, description);
    await triggerTriage(ticketId);
    res.status(201).json({ success: true, ticketId, message: 'Ticket received and triaged by Gemini.' });
  } catch (error) {
    console.error('Ticket submission / AI triage error:', error.message);
    res.status(500).json({ success: false, error: 'AI analysis failed, please try again: ' + error.message });
  }
});

// 2. Fetch pending approval queue (FR-5)
app.get('/api/tickets/pending', async (req, res) => {
  try {
    const sql = `
      SELECT t.*, a.id as audit_log_id, a.decision, a.confidence
      FROM tickets t
      JOIN audit_trail a ON t.id = a.ticket_id
      WHERE t.status = 'Pending Approval' AND a.action_type = 'AI_TRIAGE'
      ORDER BY t.created_at ASC
    `;
    const rows = await allQuery(sql);

    // Parse AI decisions for frontend
    const parsedRows = rows.map((row) => {
      const decision = JSON.parse(row.decision);
      return {
        id: row.id,
        name: row.name,
        email: row.email,
        subject: row.subject,
        description: row.description,
        status: row.status,
        createdAt: row.created_at,
        aiCategory: decision.category,
        aiPriority: decision.priority,
        aiDraftResponse: decision.draftResponse,
        confidence: row.confidence
      };
    });

    res.json({ success: true, queue: parsedRows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Fetch single ticket audit trails and details (FR-6)
app.get('/api/tickets/:id', async (req, res) => {
  const ticketId = req.params.id;
  try {
    const ticket = await getQuery('SELECT * FROM tickets WHERE id = ?', [ticketId]);
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found.' });
    }

    const logs = await allQuery(
      'SELECT * FROM audit_trail WHERE ticket_id = ? ORDER BY id ASC',
      [ticketId]
    );

    // Invariant AD-3 verification: Display error if trying to access dashboard details before AI pre-action logs exist
    if (logs.length === 0) {
      return res.status(422).json({
        success: false,
        error: 'Pre-action Audit Invariant Breach: No logged decisions exist for this ticket yet.'
      });
    }

    res.json({ success: true, ticket, logs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Manual HITL Action Approval & Dispatch (FR-7)
app.post('/api/tickets/:id/approve', async (req, res) => {
  const ticketId = req.params.id;
  const { agentName, category, priority, draftResponse } = req.body;
  try {
    await approveTicket(ticketId, agentName, category, priority, draftResponse);
    res.json({ success: true, message: 'Response approved, logged, and mock dispatched successfully.' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 5. Read-Only Auditor Feed (FR-8)
app.get('/api/audit-trail', async (req, res) => {
  try {
    const sql = `
      SELECT a.*, t.subject, t.email
      FROM audit_trail a
      JOIN tickets t ON a.ticket_id = t.id
      ORDER BY a.timestamp DESC
    `;
    const rows = await allQuery(sql);
    res.json({ success: true, logs: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. Live Dashboard Statistics API
app.get('/api/stats', async (req, res) => {
  try {
    const configCategories = getCategories();

    // Total tickets count
    const totalRow = await getQuery('SELECT COUNT(*) as count FROM tickets');
    const totalTickets = totalRow ? totalRow.count : 0;

    // Pending approval count
    const pendingRow = await getQuery("SELECT COUNT(*) as count FROM tickets WHERE status = 'Pending Approval'");
    const pendingTickets = pendingRow ? pendingRow.count : 0;

    // Reviewed tickets join logs
    const reviewedLogs = await allQuery(
      `SELECT a.*, t.created_at 
       FROM audit_trail a
       JOIN tickets t ON a.ticket_id = t.id
       WHERE a.action_type IN ('HUMAN_APPROVAL', 'HUMAN_OVERRIDE')`
    );

    const reviewedTicketsCount = reviewedLogs.length;
    let approvedCount = 0;
    let overriddenCount = 0;
    let totalTurnaroundMs = 0;

    reviewedLogs.forEach((log) => {
      if (log.action_type === 'HUMAN_APPROVAL') {
        approvedCount++;
      } else if (log.action_type === 'HUMAN_OVERRIDE') {
        overriddenCount++;
      }

      const createdTime = new Date(log.created_at).getTime();
      const approvedTime = new Date(log.timestamp).getTime();
      if (!isNaN(createdTime) && !isNaN(approvedTime) && approvedTime >= createdTime) {
        totalTurnaroundMs += (approvedTime - createdTime);
      }
    });

    const approvalRate = reviewedTicketsCount > 0 
      ? Math.round((approvedCount / reviewedTicketsCount) * 100) 
      : 0;

    const avgTurnaroundMs = reviewedTicketsCount > 0 ? totalTurnaroundMs / reviewedTicketsCount : 0;
    const avgTurnaroundMinutes = (avgTurnaroundMs / (1000 * 60)).toFixed(1);

    // Category breakdown initialized with config-driven categories
    const categoryCounts = {};
    configCategories.forEach(cat => {
      categoryCounts[cat] = 0;
    });

    // Query latest category decision per ticket
    const ticketCategories = await allQuery(`
      SELECT a.ticket_id, a.decision
      FROM audit_trail a
      INNER JOIN (
        SELECT ticket_id, MAX(id) as max_id
        FROM audit_trail
        GROUP BY ticket_id
      ) latest ON a.id = latest.max_id
    `);

    ticketCategories.forEach(row => {
      try {
        const dec = JSON.parse(row.decision);
        if (dec && dec.category) {
          if (Object.prototype.hasOwnProperty.call(categoryCounts, dec.category)) {
            categoryCounts[dec.category]++;
          } else {
            categoryCounts[dec.category] = 1;
          }
        }
      } catch (e) {
        // Skip malformed JSON entries
      }
    });

    res.json({
      success: true,
      stats: {
        totalTickets,
        reviewedTickets: reviewedTicketsCount,
        pendingTickets,
        approvedCount,
        overriddenCount,
        approvalRate,
        avgTurnaroundMinutes: parseFloat(avgTurnaroundMinutes),
        categoryBreakdown: categoryCounts,
        categories: configCategories
      }
    });
  } catch (error) {
    console.error('Stats computation error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. Auditor CSV Log Exporter (FR-9)
app.get('/api/audit-trail/export', async (req, res) => {
  try {
    const sql = `
      SELECT a.id, a.timestamp, a.ticket_id, a.action_type, a.decision, a.confidence, a.status
      FROM audit_trail a
      ORDER BY a.timestamp DESC
    `;
    const rows = await allQuery(sql);

    // Generate CSV raw output
    const headers = ['Log ID', 'Timestamp', 'Ticket ID', 'Action Type', 'AI Confidence', 'Status', 'Decision JSON'];
    const csvRows = [headers.join(',')];

    for (const row of rows) {
      // Escape strings containing commas
      const escapedId = `"${row.id}"`;
      const escapedTime = `"${row.timestamp}"`;
      const escapedTicketId = `"${row.ticket_id}"`;
      const escapedType = `"${row.action_type}"`;
      const escapedConfidence = `"${row.confidence || ''}"`;
      const escapedStatus = `"${row.status}"`;
      const escapedDecision = `"${row.decision.replace(/"/g, '""')}"`;

      csvRows.push([escapedId, escapedTime, escapedTicketId, escapedType, escapedConfidence, escapedStatus, escapedDecision].join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=audit-trail-export.csv');
    res.send(csvRows.join('\n'));
  } catch (error) {
    res.status(500).send('Failed to export audit trail: ' + error.message);
  }
});

// Health Check Endpoints for Railway / Cloud Deployment Platform Health Checks
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend views directories
app.use(express.static(path.join(__dirname, 'views')));

// Launch Server if executed directly
if (require.main === module) {
  const host = process.env.HOST || '0.0.0.0';
  app.listen(port, host, () => {
    console.log(`[BOOT] Server successfully listening on http://${host}:${port}`);
  });
}

module.exports = app;
