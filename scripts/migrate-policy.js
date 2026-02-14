const fs = require('fs');
const path = require('path');
const { getConnection } = require('../src/db/connection');

function runPolicyMigration() {
  const db = getConnection();
  
  console.log('🔄 Running policy table migration...');
  
  // Read migration file
  const migrationPath = path.join(__dirname, '..', 'migrations', '006_create_policy_table.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  
  // Split into individual statements
  const statements = sql.split(';').filter(s => s.trim());
  
  db.transaction(() => {
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          db.exec(statement);
        } catch (error) {
          // Ignore "already exists" errors
          if (!error.message.includes('already exists')) {
            throw error;
          }
        }
      }
    }
  })();
  
  console.log('✅ Policy table migration complete');
}

// Run if called directly
if (require.main === module) {
  runPolicyMigration();
}

module.exports = { runPolicyMigration };
