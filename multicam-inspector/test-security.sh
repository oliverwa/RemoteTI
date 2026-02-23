#!/bin/bash

# Security Test Script for MultiCam Inspector
# This script tests that security features are properly implemented

echo "================================================"
echo "🔒 Security Features Test Suite"
echo "================================================"
echo ""

API_URL="${1:-http://localhost:5001}"
echo "Testing against: $API_URL"
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASS=0
FAIL=0

# Test function
run_test() {
    local test_name="$1"
    local command="$2"
    local expected_result="$3"
    
    echo -n "Testing: $test_name ... "
    
    result=$(eval "$command" 2>&1)
    
    if [[ "$expected_result" == "SHOULD_FAIL" ]]; then
        if [[ $? -ne 0 ]] || [[ "$result" == *"error"* ]] || [[ "$result" == *"Error"* ]] || [[ "$result" == *"404"* ]] || [[ "$result" == *"400"* ]]; then
            echo -e "${GREEN}✓ PASS${NC} (correctly rejected)"
            ((PASS++))
        else
            echo -e "${RED}✗ FAIL${NC} (should have been rejected)"
            echo "  Response: $result"
            ((FAIL++))
        fi
    else
        if [[ $? -eq 0 ]] && [[ "$result" != *"error"* ]]; then
            echo -e "${GREEN}✓ PASS${NC}"
            ((PASS++))
        else
            echo -e "${RED}✗ FAIL${NC}"
            echo "  Response: $result"
            ((FAIL++))
        fi
    fi
}

echo "🧪 1. PATH TRAVERSAL TESTS"
echo "----------------------------"

# Test path traversal attempts
run_test "Path traversal with ../" \
    "curl -s '$API_URL/api/sessions/../../../etc/passwd'" \
    "SHOULD_FAIL"

run_test "Path traversal with encoded ../" \
    "curl -s '$API_URL/api/sessions/%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd'" \
    "SHOULD_FAIL"

run_test "Path with tilde" \
    "curl -s '$API_URL/api/sessions/~/root/secret'" \
    "SHOULD_FAIL"

run_test "Valid session path format" \
    "curl -s '$API_URL/api/sessions/hangar_sisjon/test_session_123' | head -1" \
    "SHOULD_WORK"

echo ""
echo "🧪 2. ENVIRONMENT VARIABLE TESTS"
echo "-----------------------------------"

# Test if camera password is required
echo -n "Testing: Camera password environment check ... "
if grep -q "CAMERA_PASSWORD" camera_fetch.sh 2>/dev/null && grep -q "environment variable" camera_fetch.sh 2>/dev/null; then
    echo -e "${GREEN}✓ PASS${NC} (script checks for CAMERA_PASSWORD)"
    ((PASS++))
else
    echo -e "${RED}✗ FAIL${NC} (script doesn't check for CAMERA_PASSWORD)"
    ((FAIL++))
fi

# Test if hardcoded password exists
echo -n "Testing: No hardcoded passwords ... "
if grep -r "H4anGar0NeC4amAdmin" . --exclude-dir=node_modules --exclude-dir=.git --exclude="*.md" 2>/dev/null | grep -v "^Binary"; then
    echo -e "${RED}✗ FAIL${NC} (hardcoded password found!)"
    ((FAIL++))
else
    echo -e "${GREEN}✓ PASS${NC} (no hardcoded passwords)"
    ((PASS++))
fi

echo ""
echo "🧪 3. INPUT VALIDATION TESTS"
echo "------------------------------"

# Test invalid characters in session paths
run_test "Session with shell injection attempt" \
    "curl -s '$API_URL/api/sessions/hangar;\$(whoami)' | head -1" \
    "SHOULD_FAIL"

run_test "Session with SQL injection attempt" \
    "curl -s \"$API_URL/api/sessions/hangar' OR '1'='1\" | head -1" \
    "SHOULD_FAIL"

run_test "Session with special characters" \
    "curl -s '$API_URL/api/sessions/hangar@#$%/session!@#' | head -1" \
    "SHOULD_FAIL"

echo ""
echo "🧪 4. FILE ACCESS TESTS"
echo "------------------------"

# Test accessing files outside data directory
run_test "Access server.js via path traversal" \
    "curl -s '$API_URL/api/image/../../../server.js' | head -1" \
    "SHOULD_FAIL"

run_test "Access package.json via path traversal" \
    "curl -s '$API_URL/api/image/../../../package.json' | head -1" \
    "SHOULD_FAIL"

echo ""
echo "🧪 5. AUTHENTICATION TESTS"
echo "---------------------------"

# Test protected endpoints without auth
run_test "Access protected endpoint without token" \
    "curl -s -w '%{http_code}' -o /dev/null '$API_URL/api/users'" \
    "SHOULD_FAIL"

echo ""
echo "🧪 6. CAMERA FETCH SCRIPT TEST"
echo "--------------------------------"

# Test camera_fetch.sh without password
echo -n "Testing: camera_fetch.sh without CAMERA_PASSWORD ... "
unset CAMERA_PASSWORD
output=$(./camera_fetch.sh hangar_test drone_test FDR 10.20.1.208 2>&1 || true)
if [[ "$output" == *"CAMERA_PASSWORD environment variable is not set"* ]]; then
    echo -e "${GREEN}✓ PASS${NC} (correctly requires password)"
    ((PASS++))
else
    echo -e "${RED}✗ FAIL${NC} (should require CAMERA_PASSWORD)"
    ((FAIL++))
fi

echo ""
echo "🧪 7. SERVER SECURITY CHECKS"
echo "-----------------------------"

# Check if server has security functions
echo -n "Testing: Server has sanitizePath function ... "
if grep -q "function sanitizePath" server.js 2>/dev/null; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ FAIL${NC} (security function missing)"
    ((FAIL++))
fi

echo -n "Testing: Server has isValidSessionPath function ... "
if grep -q "function isValidSessionPath" server.js 2>/dev/null; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ FAIL${NC} (validation function missing)"
    ((FAIL++))
fi

echo ""
echo "================================================"
echo "📊 TEST RESULTS"
echo "================================================"
echo -e "Passed: ${GREEN}$PASS${NC}"
echo -e "Failed: ${RED}$FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}✅ All security tests passed!${NC}"
    echo "Your application has proper security measures in place."
    exit 0
else
    echo -e "${YELLOW}⚠️ Some security tests failed.${NC}"
    echo "Please review the failures above and fix any security issues."
    exit 1
fi