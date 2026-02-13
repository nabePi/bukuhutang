require('dotenv').config();

const whatsappClient = require('./whatsapp/client');
const MessageHandler = require('./whatsapp/handler');
const reminderWorker = require('./workers/reminderWorker');
const scheduler = require('./cron/scheduler');

async function main() {
  console.log('Starting BukuHutang...');

  await whatsappClient.connect();
  
  const handler = new MessageHandler(whatsappClient);
  whatsappClient.onMessage((msg) => handler.handle(msg));

  scheduler.start();

  console.log('BukuHutang is running!');
}

main().catch(console.error);
