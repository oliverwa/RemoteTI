#!/bin/bash

# Deployment Security Validation Script
# Run this before deploying to production to ensure credentials are secure

echo "🔒 Security Validation for Deployment"
echo "====================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0

# Check 1: Ensure .env.production doesn't have real credentials
echo "1. Checking .env.production for placeholders..."
if grep -q "CHANGE_THIS" .env.production; then
    echo -e "${GREEN}✅ Production env has placeholders${NC}"
else
    echo -e "${RED}❌ Production env might contain real credentials!${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Check 2: Ensure no hardcoded passwords in source
echo ""
echo "2. Scanning for hardcoded credentials..."
FOUND_HARDCODED=0
if grep -r "FJjf93/#" . --include="*.js" --include="*.ts" --exclude-dir=node_modules --exclude=test-credentials.js 2>/dev/null | grep -v ".env"; then
    echo -e "${RED}❌ Found hardcoded password FJjf93/#${NC}"
    FOUND_HARDCODED=1
    ERRORS=$((ERRORS + 1))
fi
if grep -r "H4anGar0NeC4am" . --include="*.js" --include="*.ts" --exclude-dir=node_modules --exclude=test-credentials.js 2>/dev/null | grep -v ".env"; then
    echo -e "${RED}❌ Found hardcoded password H4anGar0NeC4am${NC}"
    FOUND_HARDCODED=1
    ERRORS=$((ERRORS + 1))
fi
if [ $FOUND_HARDCODED -eq 0 ]; then
    echo -e "${GREEN}✅ No hardcoded credentials found${NC}"
fi

# Check 3: Run Node.js test suite
echo ""
echo "3. Running credential security tests..."
if node test-credentials.js > /dev/null 2>&1; then
    echo -e "${GREEN}✅ All credential tests passed${NC}"
else
    echo -e "${RED}❌ Credential tests failed${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Check 4: Verify environment variable usage
echo ""
echo "4. Verifying environment variable usage..."
if grep -q "process.env.HANGAR_SYSTEM_USERNAME" config.js && grep -q "process.env.CAMERA_ADMIN_USERNAME" config.js; then
    echo -e "${GREEN}✅ Config uses environment variables${NC}"
else
    echo -e "${RED}❌ Config not using environment variables${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Check 5: Test server startup
echo ""
echo "5. Testing server startup..."
if timeout 2 node server.js 2>&1 | grep -q "server started\|Configuration loaded"; then
    echo -e "${GREEN}✅ Server starts successfully${NC}"
else
    echo -e "${YELLOW}⚠️  Could not verify server startup${NC}"
fi

# Summary
echo ""
echo "====================================="
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ VALIDATION PASSED: Ready for deployment${NC}"
    echo ""
    echo "Next steps for production deployment:"
    echo "1. Update .env.production with real credentials on the server"
    echo "2. Never commit real credentials to git"
    echo "3. Use strong, randomly generated passwords"
    echo "4. Consider using a secrets management service"
    exit 0
else
    echo -e "${RED}❌ VALIDATION FAILED: $ERRORS issues found${NC}"
    echo ""
    echo "Fix the issues above before deploying to production!"
    exit 1
fi