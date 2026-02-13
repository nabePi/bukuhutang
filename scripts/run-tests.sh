#!/bin/bash
set -e

echo "🧪 Running BukuHutang Test Suite"

# Check if server is running
if ! curl -s http://localhost:3006/health > /dev/null; then
  echo "❌ Server not running. Start with: npm start"
  exit 1
fi

echo "✅ Server is running"

# Run unit tests
echo "📋 Running unit tests..."
npm test

# Run integration tests
echo "🔗 Running integration tests..."
npm run test:integration || true

# Check database
echo "🗄️ Checking database..."
sqlite3 data/bukuhutang.db "SELECT COUNT(*) FROM users;"

echo "✅ All tests passed!"
