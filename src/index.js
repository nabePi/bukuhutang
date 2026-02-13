require('dotenv').config();

const whatsappClient = require('./whatsapp/client');
const MessageHandler = require('./whatsapp/handler');
const reminderWorker = require('./workers/reminderWorker');
const scheduler = require('./cron/scheduler');

// Initialize data directory
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('Starting BukuHutang...');
  
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
  
  const handler = new MessageHandler(whatsappClient);
  whatsappClient.onMessage((msg) => handler.handle(msg));

  scheduler.start();

  console.log('BukuHutang is running!');
  console.log('Features: Piutang/Hutang tracking, Loan Agreements with Installments');
}

main().catch(console.error);
