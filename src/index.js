require('dotenv').config();

const fs = require('fs');
const path = require('path');
const app = require('./api/server');
const whatsappClient = require('./whatsapp/client');
const MessageHandler = require('./whatsapp/handler');

const PORT = process.env.PORT || 3000;

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

  // Connect to WhatsApp
  await whatsappClient.connect();
  global.whatsappClient = whatsappClient;
  
  // Setup message handler for incoming WA
  const handler = new MessageHandler(whatsappClient);
  whatsappClient.onMessage((msg) => handler.handle(msg));

  // Start API server
  app.listen(PORT, () => {
    console.log(`📡 API Server running on port ${PORT}`);
    console.log(`🔗 OpenClaw webhook: http://localhost:${PORT}/api/openclaw/webhook`);
    console.log('✅ BukuHutang ready for OpenClaw orchestration!');
  });
}

main().catch(console.error);
