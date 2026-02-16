#!/usr/bin/env node

/**
 * Credential Security Test Suite
 * Tests to ensure no hardcoded credentials remain in the codebase
 * and that environment variables are properly configured
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Colors for terminal output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  reset: '\x1b[0m'
};

let testsPassed = 0;
let testsFailed = 0;

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function runTest(name, testFn) {
  process.stdout.write(`Testing: ${name}... `);
  try {
    const result = testFn();
    if (result === true) {
      log('✅ PASSED', colors.green);
      testsPassed++;
    } else {
      log(`❌ FAILED: ${result}`, colors.red);
      testsFailed++;
    }
  } catch (error) {
    log(`❌ ERROR: ${error.message}`, colors.red);
    testsFailed++;
  }
}

// Test 1: Check for hardcoded passwords in source files
runTest('No hardcoded passwords in JavaScript files', () => {
  const files = [
    'server.js',
    'config.js',
    'server/auth.js',
    'server/auth-simple.js',
    'server/hangars.js'
  ];
  
  const hardcodedPatterns = [
    /password:\s*['"]FJjf93\/#['"]/,
    /password:\s*['"]H4anGar0NeC4amAdmin['"]/,
    /password:\s*['"][^'"]*['"]/  // Any literal password string
  ];
  
  for (const file of files) {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) continue;
    
    const content = fs.readFileSync(filePath, 'utf8');
    
    for (const pattern of hardcodedPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        // Check if it's using environment variables
        const line = matches[0];
        if (!line.includes('process.env') && !line.includes('defaultPassword')) {
          return `Found hardcoded password in ${file}: ${line}`;
        }
      }
    }
  }
  return true;
});

// Test 2: Check environment variables are loaded
runTest('Environment variables are properly configured', () => {
  require('dotenv').config();
  
  const requiredVars = [
    'HANGAR_SYSTEM_USERNAME',
    'HANGAR_SYSTEM_PASSWORD',
    'CAMERA_ADMIN_USERNAME',
    'CAMERA_ADMIN_PASSWORD'
  ];
  
  const missing = [];
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }
  
  if (missing.length > 0) {
    return `Missing environment variables: ${missing.join(', ')}`;
  }
  return true;
});

// Test 3: Check production .env file has placeholders
runTest('Production .env has secure placeholders', () => {
  const prodEnvPath = path.join(__dirname, '.env.production');
  if (!fs.existsSync(prodEnvPath)) {
    return '.env.production file not found';
  }
  
  const content = fs.readFileSync(prodEnvPath, 'utf8');
  
  // Check for weak/default passwords
  const weakPatterns = [
    /HANGAR_SYSTEM_PASSWORD=FJjf93/,
    /CAMERA_ADMIN_PASSWORD=H4anGar0NeC4am/,
  ];
  
  for (const pattern of weakPatterns) {
    if (pattern.test(content)) {
      return 'Production .env contains actual passwords instead of placeholders';
    }
  }
  
  // Check that placeholders exist
  if (!content.includes('CHANGE_THIS')) {
    return 'Production .env should have CHANGE_THIS placeholders for credentials';
  }
  
  return true;
});

// Test 4: Check config.js uses environment variables
runTest('Config.js uses environment variables', () => {
  const configPath = path.join(__dirname, 'config.js');
  const content = fs.readFileSync(configPath, 'utf8');
  
  // Check that credentials section uses process.env
  if (!content.includes('process.env.CAMERA_ADMIN_USERNAME')) {
    return 'config.js not using environment variable for camera username';
  }
  if (!content.includes('process.env.HANGAR_SYSTEM_USERNAME')) {
    return 'config.js not using environment variable for hangar username';
  }
  
  return true;
});

// Test 5: Server can start with environment variables
runTest('Server starts with environment credentials', () => {
  try {
    // Try to start the server briefly
    const output = execSync('timeout 1 node server.js 2>&1', {
      encoding: 'utf8',
      stdio: 'pipe'
    }).toString();
    
    // Check for successful startup messages
    if (output.includes('server started') || output.includes('Configuration loaded')) {
      return true;
    }
    return 'Server may have startup issues';
  } catch (error) {
    // Timeout is expected, check if server started before timeout
    const output = error.stdout ? error.stdout.toString() : '';
    if (output.includes('server started') || output.includes('Configuration loaded')) {
      return true;
    }
    return 'Server failed to start properly';
  }
});

// Test 6: No credentials in git history (for new commits)
runTest('No credentials in uncommitted changes', () => {
  try {
    const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' });
    if (!gitStatus) {
      return true; // No changes
    }
    
    // Check diff for sensitive patterns
    const diff = execSync('git diff', { encoding: 'utf8' });
    const sensitivePatterns = [
      /\+.*password.*FJjf93/,
      /\+.*password.*H4anGar0NeC4am/,
    ];
    
    for (const pattern of sensitivePatterns) {
      if (pattern.test(diff)) {
        return 'Sensitive credentials found in uncommitted changes';
      }
    }
    
    return true;
  } catch (error) {
    return true; // Git not available or no repo
  }
});

// Test 7: Check server.js uses environment variables
runTest('Server.js uses environment variables', () => {
  const serverPath = path.join(__dirname, 'server.js');
  const content = fs.readFileSync(serverPath, 'utf8');
  
  // Check that getHangarConfig uses process.env
  if (!content.includes('process.env.HANGAR_SYSTEM_USERNAME')) {
    return 'server.js not using environment variable for hangar username';
  }
  if (!content.includes('process.env.HANGAR_SYSTEM_PASSWORD')) {
    return 'server.js not using environment variable for hangar password';
  }
  
  return true;
});

// Test 8: Validate credential strength recommendations
runTest('Check for credential strength guidelines', () => {
  const prodEnvPath = path.join(__dirname, '.env.production');
  const content = fs.readFileSync(prodEnvPath, 'utf8');
  
  // Check for security comments
  if (!content.includes('MUST CHANGE') || !content.includes('STRONG')) {
    return 'Production .env should include strong password requirements';
  }
  
  return true;
});

// Summary
console.log('\n' + '='.repeat(50));
log(`Test Results:`, colors.blue);
log(`✅ Passed: ${testsPassed}`, colors.green);
if (testsFailed > 0) {
  log(`❌ Failed: ${testsFailed}`, colors.red);
} else {
  log(`🎉 All tests passed! Credentials are properly secured.`, colors.green);
}
console.log('='.repeat(50));

// Exit with appropriate code
process.exit(testsFailed > 0 ? 1 : 0);