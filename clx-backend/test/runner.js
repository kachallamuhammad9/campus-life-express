const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const backendDir = path.resolve(__dirname, '..');
const testDir = __dirname;
const testFiles = fs.readdirSync(testDir)
  .filter(f => f.endsWith('.test.js'))
  .map(f => path.join(testDir, f));

console.log(`Running ${testFiles.length} test suites in clx-backend...`);
let allPassed = true;
let totalSuites = testFiles.length;
let passedSuites = 0;

const nodeModulesPath = [
  path.join(backendDir, 'node_modules'),
  path.resolve(__dirname, '../../node_modules'),
  path.resolve('node_modules')
].join(path.delimiter);

for (const file of testFiles) {
  const relPath = path.relative(backendDir, file);
  try {
    execSync(`node --test "${file}"`, {
      cwd: backendDir,
      env: {
        ...process.env,
        NODE_PATH: nodeModulesPath,
        JWT_SECRET: process.env.JWT_SECRET || 'clx-dev-test-jwt-secret-key-32-chars-dandalin',
        NODE_ENV: 'test',
        SUPPRESS_DB_WARNING: 'true'
      },
      stdio: 'inherit'
    });
    passedSuites++;
  } catch (err) {
    allPassed = false;
    console.error(`❌ Suite failed: ${relPath}`);
  }
}

console.log(`\n========================================`);
console.log(`Test Summary: ${passedSuites}/${totalSuites} test suites passed.`);
console.log(`========================================\n`);

if (!allPassed) {
  process.exit(1);
}
