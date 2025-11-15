#!/bin/bash
set -euo pipefail

echo "🔍 Testing Correct Reolink API Format"
echo "===================================="

CAMERA_IP="10.20.1.210"
HANGAR_HOST="hangar_sisjon_vpn"
CAM_USER="admin"
CAM_PASS="H4anGar0NeC4amAdmin"
FORWARD_PORT=8083

# SSH connection settings
CONTROL_PATH="$HOME/.ssh/cm-%r@%h:%p"
SSH_OPTS="-o StrictHostKeyChecking=no -o ControlMaster=auto -o ControlPath=$CONTROL_PATH -o ControlPersist=60"

echo "Setting up connection..."
ssh ${SSH_OPTS} "${HANGAR_HOST}" true

# Kill existing socat processes and start new one
ssh ${SSH_OPTS} "${HANGAR_HOST}" "pkill -f 'socat.*:${FORWARD_PORT}' 2>/dev/null || true; sleep 1"

run_id="$$_$(date +%s)"
pidfile="/tmp/socat_${FORWARD_PORT}_${run_id}.pid"

ssh ${SSH_OPTS} "${HANGAR_HOST}" "nohup socat tcp-listen:${FORWARD_PORT},reuseaddr,fork tcp:${CAMERA_IP}:443 >/dev/null 2>&1 & echo \$! > ${pidfile}; sleep 1"

sleep 2

echo "✅ Connected to camera"

# Method 1: Test token-based authentication (need to get token first)
echo ""
echo "🔐 Testing token authentication..."

# First, try to get a token using login
login_url="https://${HANGAR_HOST}:${FORWARD_PORT}/api.cgi?cmd=Login"
echo "Getting login token..."

login_response=$(curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \
     -H "Content-Type: application/json" \
     -d "[{\"cmd\":\"Login\",\"param\":{\"User\":{\"userName\":\"${CAM_USER}\",\"password\":\"${CAM_PASS}\"}}}]" \
     "$login_url" 2>/dev/null || echo "error")

echo "Login response: $login_response"

# If we can extract a token, use it
if [[ "$login_response" != "error" ]]; then
    # Try to extract token (it might be in different formats)
    token=$(echo "$login_response" | grep -o '"token":"[^"]*"' | sed 's/"token":"\([^"]*\)"/\1/' || echo "")
    
    if [ -n "$token" ]; then
        echo "✅ Got token: $token"
        
        # Test GetAutoFocus with correct format
        echo ""
        echo "📊 Testing GetAutoFocus with token..."
        
        token_url="https://${HANGAR_HOST}:${FORWARD_PORT}/api.cgi?cmd=GetAutoFocus&token=${token}"
        response=$(curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \
             -H "Content-Type: application/json" \
             -d '[{"cmd":"GetAutoFocus","action":1,"param":{"channel":0}}]' \
             "$token_url" 2>/dev/null || echo "error")
        
        echo "GetAutoFocus response: $response"
        
        # Test SetAutoFocus to enable autofocus
        echo ""
        echo "🎯 Testing SetAutoFocus (enable) with token..."
        
        token_url="https://${HANGAR_HOST}:${FORWARD_PORT}/api.cgi?cmd=SetAutoFocus&token=${token}"
        response=$(curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \
             -H "Content-Type: application/json" \
             -d '[{"cmd":"SetAutoFocus","action":0,"param":{"AutoFocus":{"channel":0,"disable":0}}}]' \
             "$token_url" 2>/dev/null || echo "error")
        
        echo "SetAutoFocus (enable) response: $response"
        
        # Test GetZoomFocus with correct action value
        echo ""
        echo "🔍 Testing GetZoomFocus with token and correct action..."
        
        token_url="https://${HANGAR_HOST}:${FORWARD_PORT}/api.cgi?cmd=GetZoomFocus&token=${token}"
        response=$(curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \
             -H "Content-Type: application/json" \
             -d '[{"cmd":"GetZoomFocus","action":0,"param":{"channel":0}}]' \
             "$token_url" 2>/dev/null || echo "error")
        
        echo "GetZoomFocus response: $response"
        
    else
        echo "❌ Could not extract token from login response"
    fi
else
    echo "❌ Login failed"
fi

# Method 2: Test if old URL format still works but with corrected API calls  
echo ""
echo "🔄 Testing fallback with old URL format but corrected parameters..."

old_url="https://${HANGAR_HOST}:${FORWARD_PORT}/cgi-bin/api.cgi?user=${CAM_USER}&password=${CAM_PASS}"

# Test GetAutoFocus with action:1 (as per docs)
echo "Testing GetAutoFocus with action:1..."
response=$(curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \
     -H "Content-Type: application/json" \
     -d '[{"cmd":"GetAutoFocus","action":1,"param":{"channel":0}}]' \
     "$old_url" 2>/dev/null || echo "error")

echo "GetAutoFocus (action:1) response: $response"

# Test GetZoomFocus with action:0 (as per docs)
echo "Testing GetZoomFocus with action:0..."
response=$(curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \
     -H "Content-Type: application/json" \
     -d '[{"cmd":"GetZoomFocus","action":0,"param":{"channel":0}}]' \
     "$old_url" 2>/dev/null || echo "error")

echo "GetZoomFocus (action:0) response: $response"

echo ""
echo "🧹 Cleanup..."
ssh ${SSH_OPTS} "${HANGAR_HOST}" "kill \$(cat ${pidfile} 2>/dev/null) 2>/dev/null || true; rm -f ${pidfile}" 2>/dev/null || true

echo "✅ Test completed!"