const fs = require('fs');
const path = require('path');

// Memory store for sent mock dispatches
const sentEmails = [];

// Clean send dispatcher - strict AD-1 human approved check
async function dispatchEmail(ticketId, recipient, subject, body, agentSignature) {
  if (!agentSignature) {
    throw new Error('Strict Invariant Breach: Zero automated outbound dispatches permitted without agent review and signature.');
  }

  console.log(`[DISPATCH] Verification passed. Human agent ${agentSignature} approved ticket ${ticketId}. Sending email...`);
  
  const outboundMail = {
    ticketId,
    recipient,
    subject,
    body,
    dispatchedAt: new Date().toISOString(),
    agentSignature
  };

  sentEmails.push(outboundMail);

  // Write mock output log for audit checks
  const mockMailLog = path.resolve(__dirname, 'mock_emails_sent.json');
  try {
    fs.writeFileSync(mockMailLog, JSON.stringify(sentEmails, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to log mock email dispatch to file:', error.message);
  }

  return outboundMail;
}

function getSentEmails() {
  return sentEmails;
}

module.exports = {
  dispatchEmail,
  getSentEmails
};
