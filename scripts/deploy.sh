#!/bin/bash
set -e

echo "🚀 Deploying BukuHutang..."

# Pull latest code
git pull origin main

# Install dependencies
npm ci --production

# Run migrations
npm run db:migrate

# Restart with PM2 (if using PM2)
if command -v pm2 &> /dev/null; then
  pm2 restart bukuhutang || pm2 start src/index.js --name bukuhutang
else
  # Or use Docker
  docker-compose -f docker-compose.prod.yml down
  docker-compose -f docker-compose.prod.yml up -d --build
fi

echo "✅ Deployment complete!"
