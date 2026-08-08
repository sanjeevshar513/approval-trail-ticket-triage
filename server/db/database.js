const path = require('path');
const fs = require('fs');

const dbPath = process.env.NODE_ENV === 'test'
  ? path.join(__dirname, 'test_data.json')
  : path.join(__dirname, 'data.json');

let dbInstance = null;

/**
 * Ensures LowDB instance is initialized synchronously/asynchronously on demand.
 */
async function getDb() {
  if (!dbInstance) {
    const { LowSync } = await import('lowdb');
    const { JSONFileSync } = await import('lowdb/node');
    const adapter = new JSONFileSync(dbPath);
    dbInstance = new LowSync(adapter, { tickets: [], audit_trail: [] });
  }

  if (!fs.existsSync(dbPath)) {
    dbInstance.data = { tickets: [], audit_trail: [] };
    dbInstance.write();
  } else {
    try {
      dbInstance.read();
    } catch (e) {
      dbInstance.data = { tickets: [], audit_trail: [] };
      dbInstance.write();
    }
    if (!dbInstance.data || typeof dbInstance.data !== 'object') {
      dbInstance.data = { tickets: [], audit_trail: [] };
      dbInstance.write();
    }
  }

  if (!Array.isArray(dbInstance.data.tickets)) {
    dbInstance.data.tickets = [];
  }
  if (!Array.isArray(dbInstance.data.audit_trail)) {
    dbInstance.data.audit_trail = [];
  }

  return dbInstance;
}

/**
 * Initialize LowDB database storage file and schema arrays.
 */
async function initializeDatabase() {
  const instance = await getDb();
  console.log('LowDB data structures (tickets, audit_trail) initialized at:', dbPath);
  return instance;
}

/**
 * Append-only helper for audit trail to enforce immutability in JS code.
 * No update or delete functions are exposed for audit_trail.
 */
async function appendAuditTrail(entry) {
  const instance = await getDb();
  const maxId = instance.data.audit_trail.reduce((max, log) => Math.max(max, Number(log.id) || 0), 0);
  const newLog = {
    id: maxId + 1,
    timestamp: entry.timestamp,
    ticket_id: entry.ticket_id,
    action_type: entry.action_type,
    decision: entry.decision,
    confidence: entry.confidence,
    status: entry.status
  };
  instance.data.audit_trail.push(newLog);
  instance.write();
  return newLog;
}

/**
 * SQL-compatible query runner over LowDB storage.
 */
async function runQuery(sql, params = []) {
  const instance = await getDb();
  const trimmed = sql.trim();

  // Enforce audit trail immutability rule in JavaScript code
  if (/UPDATE\s+audit_trail/i.test(trimmed)) {
    throw new Error('Updates are forbidden on audit_trail table');
  }
  if (/DELETE\s+(FROM\s+)?audit_trail/i.test(trimmed)) {
    throw new Error('Deletes are forbidden on audit_trail table');
  }

  // Schema setup statements are no-ops in LowDB
  if (/^CREATE\s+/i.test(trimmed)) {
    return { changes: 0 };
  }

  // INSERT INTO tickets
  if (/^INSERT\s+INTO\s+tickets/i.test(trimmed)) {
    const [id, email, name, subject, description, status, createdAt] = params;
    const newTicket = {
      id,
      email,
      name,
      subject,
      description,
      status,
      created_at: createdAt
    };
    instance.data.tickets.push(newTicket);
    instance.write();
    return { lastID: id, changes: 1 };
  }

  // INSERT INTO audit_trail
  if (/^INSERT\s+INTO\s+audit_trail/i.test(trimmed)) {
    const [timestamp, ticketId, actionType, decision, confidence, status] = params;
    return await appendAuditTrail({
      timestamp,
      ticket_id: ticketId,
      action_type: actionType,
      decision,
      confidence,
      status
    });
  }

  // UPDATE tickets SET status = ? WHERE id = ?
  if (/^UPDATE\s+tickets/i.test(trimmed)) {
    const statusParam = params[0];
    const idParam = params[1];
    const ticket = instance.data.tickets.find((t) => t.id === idParam);
    if (ticket) {
      ticket.status = statusParam;
      instance.write();
      return { changes: 1 };
    }
    return { changes: 0 };
  }

  return { changes: 0 };
}

/**
 * SQL-compatible single-row getter over LowDB storage.
 */
async function getQuery(sql, params = []) {
  const instance = await getDb();
  const trimmed = sql.trim();

  if (/SELECT\s+COUNT\(\*\)\s+as\s+count\s+FROM\s+tickets\s+WHERE\s+status\s*=\s*['"]Pending Approval['"]/i.test(trimmed)) {
    const count = instance.data.tickets.filter((t) => t.status === 'Pending Approval').length;
    return { count };
  }

  if (/SELECT\s+COUNT\(\*\)\s+as\s+count\s+FROM\s+tickets/i.test(trimmed)) {
    return { count: instance.data.tickets.length };
  }

  if (/SELECT\s+\*\s+FROM\s+tickets\s+WHERE\s+id\s*=\s*\?/i.test(trimmed)) {
    const ticket = instance.data.tickets.find((t) => t.id === params[0]);
    return ticket ? { ...ticket } : undefined;
  }

  if (/ORDER\s+BY\s+id\s+DESC\s+LIMIT\s+1/i.test(trimmed)) {
    const ticketId = params[0];
    const logs = instance.data.audit_trail
      .filter((l) => l.ticket_id === ticketId && l.action_type === 'AI_TRIAGE')
      .sort((a, b) => b.id - a.id);
    return logs[0] ? { ...logs[0] } : undefined;
  }

  if (/SELECT\s+\*\s+FROM\s+audit_trail\s+WHERE\s+ticket_id\s*=\s*\?\s+AND\s+action_type\s*=\s*\?/i.test(trimmed)) {
    const [ticketId, actionType] = params;
    const log = instance.data.audit_trail.find((l) => l.ticket_id === ticketId && l.action_type === actionType);
    return log ? { ...log } : undefined;
  }

  if (/SELECT\s+\*\s+FROM\s+audit_trail\s+WHERE\s+ticket_id\s*=\s*\?/i.test(trimmed)) {
    const log = instance.data.audit_trail.find((l) => l.ticket_id === params[0]);
    return log ? { ...log } : undefined;
  }

  return undefined;
}

/**
 * SQL-compatible multi-row getter over LowDB storage.
 */
async function allQuery(sql, params = []) {
  const instance = await getDb();
  const trimmed = sql.trim();

  // Pending Approval Queue query
  if (/JOIN\s+audit_trail/i.test(trimmed) && /Pending Approval/i.test(trimmed)) {
    const pendingTickets = instance.data.tickets.filter((t) => t.status === 'Pending Approval');
    const results = [];
    for (const t of pendingTickets) {
      const auditLog = instance.data.audit_trail.find(
        (a) => a.ticket_id === t.id && a.action_type === 'AI_TRIAGE'
      );
      if (auditLog) {
        results.push({
          ...t,
          audit_log_id: auditLog.id,
          decision: auditLog.decision,
          confidence: auditLog.confidence
        });
      }
    }
    results.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    return results;
  }

  // Auditor Feed query
  if (/SELECT\s+a\.\*,\s*t\.subject,\s*t\.email\s+FROM\s+audit_trail\s+a\s+JOIN\s+tickets/i.test(trimmed)) {
    const results = instance.data.audit_trail.map((a) => {
      const t = instance.data.tickets.find((ticket) => ticket.id === a.ticket_id);
      return {
        ...a,
        subject: t ? t.subject : null,
        email: t ? t.email : null
      };
    });
    results.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
    return results;
  }

  // Stats reviewed logs query
  if (/a\.action_type\s+IN\s+\(['"]HUMAN_APPROVAL['"],\s*['"]HUMAN_OVERRIDE['"]\)/i.test(trimmed)) {
    const logs = instance.data.audit_trail.filter(
      (a) => a.action_type === 'HUMAN_APPROVAL' || a.action_type === 'HUMAN_OVERRIDE'
    );
    return logs.map((a) => {
      const t = instance.data.tickets.find((ticket) => ticket.id === a.ticket_id);
      return {
        ...a,
        created_at: t ? t.created_at : null
      };
    });
  }

  // Latest decision per ticket for stats
  if (/MAX\(id\)\s+as\s+max_id/i.test(trimmed) || (/SELECT\s+a\.ticket_id,\s*a\.decision/i.test(trimmed) && /GROUP BY/i.test(trimmed))) {
    const latestByTicket = {};
    for (const log of instance.data.audit_trail) {
      if (!latestByTicket[log.ticket_id] || log.id > latestByTicket[log.ticket_id].id) {
        latestByTicket[log.ticket_id] = log;
      }
    }
    return Object.values(latestByTicket).map((log) => ({
      ticket_id: log.ticket_id,
      decision: log.decision
    }));
  }

  // Export CSV query
  if (/SELECT\s+a\.id,\s*a\.timestamp/i.test(trimmed)) {
    const logs = [...instance.data.audit_trail];
    logs.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
    return logs;
  }

  // Filter audit_trail by action_type IN (?, ?)
  if (/WHERE\s+ticket_id\s*=\s*\?\s+AND\s+action_type\s+IN/i.test(trimmed)) {
    const ticketId = params[0];
    const allowedTypes = params.slice(1);
    return instance.data.audit_trail.filter(
      (l) => l.ticket_id === ticketId && allowedTypes.includes(l.action_type)
    );
  }

  // SELECT * FROM audit_trail WHERE ticket_id = ? ORDER BY id ASC
  if (/SELECT\s+\*\s+FROM\s+audit_trail\s+WHERE\s+ticket_id\s*=\s*\?/i.test(trimmed)) {
    const ticketId = params[0];
    const logs = instance.data.audit_trail.filter((l) => l.ticket_id === ticketId);
    logs.sort((a, b) => a.id - b.id);
    return logs;
  }

  // SELECT * FROM audit_trail ORDER BY timestamp DESC
  if (/SELECT\s+\*\s+FROM\s+audit_trail/i.test(trimmed)) {
    const logs = [...instance.data.audit_trail];
    logs.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
    return logs;
  }

  return [];
}

const db = {
  get data() {
    return dbInstance ? dbInstance.data : { tickets: [], audit_trail: [] };
  },
  read: async () => {
    const instance = await getDb();
    instance.read();
  },
  write: async () => {
    const instance = await getDb();
    instance.write();
  }
};

module.exports = {
  db,
  dbPath,
  initializeDatabase,
  appendAuditTrail,
  runQuery,
  getQuery,
  allQuery
};
