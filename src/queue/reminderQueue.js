const Queue = require('bull');

const reminderQueue = new Queue('reminder queue', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  }
});

module.exports = reminderQueue;
