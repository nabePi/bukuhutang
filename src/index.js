require('dotenv').config();

const fs = require('fs');
const path = require('path');
const app = require('./api/server');

const PORT = process.env.PORT || 3000;
const MOCK_MODE = process.env.MOCK_MODE === 'true';

async function main() {
  console.log('🚀 Starting BukuHutang with OpenClaw Integration...');
  
  // Ensure directories exist
  const dirs = ['data', 'data/agreements'];
  dirs.forEach(dir => {
    const dirPath = path.join(__dirname, '..', dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  });

  if (!MOCK_MODE) {
    // Only load WhatsApp if not in mock mode
    const whatsappClient = require('./whatsapp/client');
    const MessageHandler = require('./whatsapp/handler');
    
    // Connect to WhatsApp
    await whatsappClient.connect();
    global.whatsappClient = whatsappClient;
    
    // Setup message handler for incoming WA
    const handler = new MessageHandler(whatsappClient);
    whatsappClient.onMessage((msg) => handler.handle(msg));
  } else {
    console.log('📍 MOCK MODE: WhatsApp connection skipped');
    // Create a mock WhatsApp client for API testing
    global.whatsappClient = {
      sendMessage: async (jid, text) => {
        console.log(`[MOCK WA] To: ${jid}, Message: ${text}`);
        return { key: { id: 'mock-msg-id' } };
      }
    };
  }

  // Start API server
  app.listen(PORT, () => {
    console.log(`📡 API Server running on port ${PORT}`);
    console.log(`🔗 OpenClaw webhook: http://localhost:${PORT}/api/openclaw/webhook`);
    console.log('✅ BukuHutang ready for OpenClaw orchestration!');
  });
}

main().catch(console.error);
