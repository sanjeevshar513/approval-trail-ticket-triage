const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

 const dbPath = process.env.NODE_ENV === 'test' ? ':memory:' : path.join(__dirname, 'triage.db');

// Connect to SQLite Database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening SQLite database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
  }
});

// Initialize Tables and Triggers
function initializeDatabase() {
  db.serialize(() => {
    // Create Tickets Table
    db.run(`
      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        subject TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('Pending Triage', 'Pending Approval', 'Resolved')),
        created_at TEXT NOT NULL
      )
    `);

    // Create Audit Trail Table
    db.run(`
      CREATE TABLE IF NOT EXISTS audit_trail (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        ticket_id TEXT NOT NULL,
        action_type TEXT NOT NULL CHECK (action_type IN ('AI_TRIAGE', 'HUMAN_APPROVAL', 'HUMAN_OVERRIDE')),
        decision TEXT NOT NULL, -- JSON formatted decision containing category, priority, draft_response
        confidence REAL, -- AI confidence score
        status TEXT NOT NULL,
        FOREIGN KEY(ticket_id) REFERENCES tickets(id)
      )
    `);

    // Create Immutable Log Triggers
    db.run(`
      CREATE TRIGGER IF NOT EXISTS block_audit_updates
      BEFORE UPDATE ON audit_trail
      BEGIN
        SELECT RAISE(FAIL, 'Updates are forbidden on audit_trail table');
      END;
    `);

    db.run(`
      CREATE TRIGGER IF NOT EXISTS block_audit_deletes
      BEFORE DELETE ON audit_trail
      BEGIN
        SELECT RAISE(FAIL, 'Deletes are forbidden on audit_trail table');
      END;
    `);

    console.log('Database tables and invariants initialized successfully.');
  });
}

// Wrap db methods in simple promises
function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function getQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function allQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

module.exports = {
  db,
  dbPath,
  initializeDatabase,
  runQuery,
  getQuery,
  allQuery
};
