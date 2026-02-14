require('dotenv').config();

const fs = require('fs');
const path = require('path');
const app = require('./api/server');
const whatsappClient = require('./whatsapp/client');
const MessageHandler = require('./whatsapp/handler');
const { runPolicyMigration } = require('../scripts/migrate-policy');

const PORT = process.env.PORT || 3006;
const MOCK_MODE = process.env.MOCK_MODE === 'true';
const ADMIN_PHONE = process.env.ADMIN_PHONE_NUMBER || '081254653452';

async function main() {
  console.log('🚀 Starting BukuHutang Single Admin Mode...');
  console.log(`📱 Admin Phone: ${ADMIN_PHONE}`);
  
  // Run policy migration
  try {
    runPolicyMigration();
  } catch (error) {
    console.error('Policy migration failed:', error.message);
  }

  // Ensure directories exist
  const dirs = ['data', 'data/agreements', 'auth_info_baileys'];
  dirs.forEach(dir => {
    const dirPath = path.join(__dirname, '..', dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  });

  if (!MOCK_MODE) {
    // Single WhatsApp session for admin
    console.log('🔗 Connecting WhatsApp for admin...');
    
    const handler = new MessageHandler(whatsappClient);
    whatsappClient.onMessage(async (msg) => {
      await handler.handle(msg);
    });
    
    await whatsappClient.connect();
    console.log('✅ WhatsApp connected (Single Admin Mode)');
    
    // Make client available globally for API
    global.whatsappClient = whatsappClient;
  } else {
    console.log('📍 MOCK MODE: WhatsApp connection skipped');
    // Create mock WhatsApp client for API testing
    global.whatsappClient = {
      sendMessage: async (jid, text) => {
        console.log(`[MOCK WA] To: ${jid}, Message: ${text}`);
        return { key: { id: 'mock-msg-id' } };
      }
    };
  }

  // Start API server (listen on all interfaces)
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`📡 API Server running on port ${PORT}`);
    console.log(`🔗 Admin Dashboard: http://0.0.0.0:${PORT}/admin`);
    console.log(`🔗 OpenClaw webhook: http://0.0.0.0:${PORT}/api/openclaw/webhook`);
    console.log('✅ BukuHutang Single Admin Mode ready!');
  });
}

main().catch(console.error);
