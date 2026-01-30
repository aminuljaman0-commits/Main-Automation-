const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();
app.use(express.json());

// --- CONFIGURATION ---
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const SYNC_PASSWORD = process.env.SYNC_PASSWORD;
const RULES_FILE_PATH = path.join(__dirname, 'rules.json');

// --- LOAD RULES FROM FILE ---
let automationRules = [];
try {
  if (fs.existsSync(RULES_FILE_PATH)) {
    const rawData = fs.readFileSync(RULES_FILE_PATH);
    automationRules = JSON.parse(rawData);
    console.log('Rules loaded from rules.json');
  } else {
    console.log('rules.json not found, starting with empty rules.');
  }
} catch (error) {
  console.error('Error loading rules:', error);
}

// --- API ENDPOINTS ---

// 1. Webhook Verification (for Facebook)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// 2. Message Handling (for Facebook)
app.post('/webhook', (req, res) => {
  const body = req.body;
  if (body.object === 'page') {
    body.entry.forEach(entry => {
      const webhookEvent = entry.messaging[0];
      if (webhookEvent.message && webhookEvent.message.text) {
        const senderId = webhookEvent.sender.id;
        const receivedMessage = webhookEvent.message.text.toLowerCase();
        
        const matchedRule = automationRules.find(rule => 
          receivedMessage.includes(rule.triggerKeyword.toLowerCase())
        );

        if (matchedRule) {
          sendTextMessage(senderId, matchedRule.textMessage);
        }
      }
    });
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

// 3. Update Rules Endpoint (for Dashboard Sync)
app.post('/update-rules', (req, res) => {
  const { password, rules } = req.body;

  if (password !== SYNC_PASSWORD) {
    return res.status(403).json({ message: 'Invalid sync password' });
  }
  if (!Array.isArray(rules)) {
    return res.status(400).json({ message: 'Invalid rules format' });
  }

  try {
    fs.writeFileSync(RULES_FILE_PATH, JSON.stringify(rules, null, 2));
    automationRules = rules; // Update in-memory rules
    console.log('Rules updated successfully!');
    res.status(200).json({ message: 'Rules updated successfully' });
  } catch (error) {
    console.error('Error saving rules:', error);
    res.status(500).json({ message: 'Failed to save rules on server' });
  }
});

// --- HELPER FUNCTION ---
async function sendTextMessage(recipientId, messageText) {
  const messageData = { recipient: { id: recipientId }, message: { text: messageText } };
  try {
    await axios.post('https://graph.facebook.com/v19.0/me/messages?access_token=' + PAGE_ACCESS_TOKEN, messageData);
  } catch (error) {
    console.error('Unable to send message:', error.response.data);
  }
}

app.listen(process.env.PORT || 3000, () => console.log('Server is live!'));
