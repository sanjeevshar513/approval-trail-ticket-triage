const fs = require('fs');
const path = require('path');

async function build() {
  console.log('====================================================');
  console.log('   Approval-Trail Ticket Triage - Build & Validate  ');
  console.log('====================================================\n');

  const rootDir = path.resolve(__dirname, '..');

  // 1. Verify Configuration File (Invariant AD-2)
  console.log('[1/4] Validating configuration files...');
  const configPath = path.join(rootDir, 'server', 'config', 'categories.json');
  if (!fs.existsSync(configPath)) {
    console.error(' [ERROR] Missing required configuration file: server/config/categories.json');
    process.exit(1);
  }
  try {
    const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!configData.categories || !Array.isArray(configData.categories) || configData.categories.length === 0) {
      throw new Error('categories array must be non-empty.');
    }
    console.log('       Config valid: categories ->', configData.categories.join(', '));
  } catch (err) {
    console.error(' [ERROR] Invalid server/config/categories.json format:', err.message);
    process.exit(1);
  }

  // 2. Ensure Environment Configuration File
  console.log('\n[2/4] Checking environment variables setup...');
  const envPath = path.join(rootDir, '.env');
  const envExamplePath = path.join(rootDir, '.env.example');
  if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
    console.log('       .env not found. Creating .env from .env.example...');
    fs.copyFileSync(envExamplePath, envPath);
  }
  console.log('       Environment configuration check complete.');

  // 3. Initialize LowDB Database Storage Structure
  console.log('\n[3/4] Initializing LowDB database storage...');
  const { initializeDatabase, dbPath } = require('../server/db/database');
  await initializeDatabase();
  console.log('       Database initialized at:', dbPath);

  // 4. Verify Output Artifacts & Views
  console.log('\n[4/4] Verifying static views and static assets...');
  const viewsPath = path.join(rootDir, 'server', 'views');
  if (fs.existsSync(viewsPath)) {
    const viewFiles = fs.readdirSync(viewsPath);
    console.log('       Frontend static views found:', viewFiles.join(', '));
  } else {
    console.warn(' [WARN] server/views directory not found.');
  }

  console.log('\n====================================================');
  console.log(' BUILD SUCCESSFUL: Project ready for execution!');
  console.log('====================================================');
}

build().catch((err) => {
  console.error('\n [CRITICAL BUILD FAILURE]:', err);
  process.exit(1);
});
