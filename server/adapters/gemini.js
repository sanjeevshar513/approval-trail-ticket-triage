const { GoogleGenAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

// Helper to get configuration categories
function getCategories() {
  const configPath = path.resolve(__dirname, '../config/categories.json');
  try {
    const data = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(data);
    if (!parsed.categories || !Array.isArray(parsed.categories)) {
      throw new Error('Categories format is invalid.');
    }
    return parsed.categories;
  } catch (err) {
    console.error('Failed to load categories configuration:', err.message);
    throw err; // Invariant AD-2: Fail startup immediately if configuration is invalid
  }
}

// AI Triage Generator
async function runTriage(ticket) {
  if (process.env.MOCK_AI === 'true') {
    return {
      category: 'General Inquiry',
      priority: 'Medium',
      draftResponse: 'Thank you for reaching out. We have received your ticket and are reviewing it. A member of our team will follow up shortly with next steps.'
    };
  }

  const categories = getCategories();
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'MOCK' || apiKey === '') {
    console.log('No GEMINI_API_KEY provided or using mock mode. Falling back to Mock Triage.');
    return getMockTriage(ticket, categories);
  }

  try {
    // Standard initialization of Gemini AI API
    const ai = new GoogleGenAI({ apiKey });
    const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `
You are an advanced Customer Support Triage AI.
Analyze the following support ticket and classify it into exactly ONE of these allowed categories: ${categories.join(', ')}.
Assign a priority rating of exactly ONE of these: Low, Medium, High.
Also, write a polite and professional initial draft response to the customer.

Input Ticket:
Subject: "${ticket.subject}"
Description: "${ticket.description}"

Return your output strictly as a valid JSON object matching this schema exactly:
{
  "category": "String (must match one of the allowed categories)",
  "categoryConfidence": Number (between 0.0 and 1.0),
  "priority": "String (Low, Medium, or High)",
  "priorityConfidence": Number (between 0.0 and 1.0),
  "draftResponse": "String (professional email draft starting with polite salutation to ${ticket.name})"
}
Do not include markdown tags like \`\`\`json or \`\`\` around the JSON object. Return raw JSON text.
`;

    // Timeout Promise to catch hanging API requests (15s timeout)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Gemini API request timed out after 15 seconds.')), 15000);
    });

    const apiPromise = (async () => {
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanText);
    })();

    const parsed = await Promise.race([apiPromise, timeoutPromise]);

    return {
      category: parsed.category || categories[0],
      categoryConfidence: parsed.categoryConfidence || 0.8,
      priority: parsed.priority || 'Medium',
      priorityConfidence: parsed.priorityConfidence || 0.8,
      draftResponse: parsed.draftResponse || `Hello ${ticket.name},\n\nThank you for contacting support. We have received your ticket regarding: "${ticket.subject}". One of our agents will assist you shortly.`
    };
  } catch (error) {
    console.error('Gemini API execution failed or timed out:', error.message);
    if (process.env.ALLOW_FALLBACK === 'false' || process.env.TEST_FAIL_AI === 'true') {
      throw error;
    }
    // Graceful fallback to mock prediction with lower confidence flag
    const mock = getMockTriage(ticket, categories);
    mock.categoryConfidence = 0.5;
    mock.priorityConfidence = 0.5;
    return mock;
  }
}

// Graceful Mock Triage generator
function getMockTriage(ticket, categories) {
  const lowerText = (ticket.subject + ' ' + ticket.description).toLowerCase();
  
  let category = categories[0] || 'Technical Bug';
  let priority = 'Medium';
  let draftResponse = '';

  if (lowerText.includes('billing') || lowerText.includes('invoice') || lowerText.includes('charge') || lowerText.includes('card')) {
    category = 'Billing';
    priority = 'High';
    draftResponse = `Hello ${ticket.name},\n\nThank you for reaching out to us. I see that you have a query regarding billing. We would be happy to review your charges. Could you please provide the last 4 digits of your card and the invoice number so we can investigate further?\n\nBest regards,\nCustomer Support Team`;
  } else if (lowerText.includes('bug') || lowerText.includes('error') || lowerText.includes('failing') || lowerText.includes('crash') || lowerText.includes('broken')) {
    category = 'Technical Bug';
    priority = 'High';
    draftResponse = `Hello ${ticket.name},\n\nWe apologize for the technical inconvenience you're experiencing. Our engineering team has been notified about the integration logs and the error. We are currently looking into this issue and will update you as soon as we have a fix.\n\nBest regards,\nEngineering Support Team`;
  } else if (lowerText.includes('request') || lowerText.includes('feature') || lowerText.includes('wishlist') || lowerText.includes('add')) {
    category = 'Feature Request';
    priority = 'Low';
    draftResponse = `Hello ${ticket.name},\n\nThank you for suggesting this feature! We are always looking for ways to improve our platform. I have shared your request with our product management team for review in our upcoming development cycles.\n\nBest regards,\nProduct Support Team`;
  } else {
    category = 'Account Access';
    priority = 'Medium';
    draftResponse = `Hello ${ticket.name},\n\nThank you for reaching out. We have received your request regarding your account access. To verify your identity, could you please confirm the username associated with your profile?\n\nBest regards,\nAccounts Support Team`;
  }

  // Ensure category matches configuration
  if (!categories.includes(category)) {
    category = categories[0] || 'Technical Bug';
  }

  return {
    category,
    categoryConfidence: 0.92,
    priority,
    priorityConfidence: 0.88,
    draftResponse
  };
}

module.exports = {
  runTriage,
  getCategories
};
