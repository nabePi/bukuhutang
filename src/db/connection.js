const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbInstances = new Map();

function getConnection(tenantId = 'default') {
  const dbPath = tenantId === 'default' 
    ? (process.env.DB_PATH || path.join(__dirname, '../../data/bukuhutang.db'))
    : tenantId === 'admin'
    ? path.join(__dirname, '../../data/admin.db')
    : path.join(__dirname, `../../data/tenants/${tenantId}.db`);
    
  // Ensure tenant directory exists
  if (tenantId !== 'default') {
    const tenantDir = path.dirname(dbPath);
    if (!fs.existsSync(tenantDir)) {
      fs.mkdirSync(tenantDir, { recursive: true });
    }
  }
  
  if (!dbInstances.has(dbPath)) {
    dbInstances.set(dbPath, new Database(dbPath));
    dbInstances.get(dbPath).pragma('journal_mode = WAL');
  }
  
  return dbInstances.get(dbPath);
}

function closeAllConnections() {
  for (const [path, db] of dbInstances) {
    try {
      db.close();
    } catch (error) {
      console.error(`Error closing database ${path}:`, error);
    }
  }
  dbInstances.clear();
}

module.exports = { getConnection, closeAllConnections };
