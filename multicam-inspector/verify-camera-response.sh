#!/bin/bash
set -euo pipefail

echo "🔍 Verifying Camera API Responses for RUR"
echo "=========================================="

CAMERA_NAME="RUR"
CAM_IP="10.20.1.210"
HANGAR_HOST="hangar_sisjon_vpn"
CAM_USER="admin"
CAM_PASS="H4anGar0NeC4amAdmin"
FORWARD_PORT=8083

# SSH connection settings
CONTROL_PATH="$HOME/.ssh/cm-%r@%h:%p"
SSH_OPTS="-o StrictHostKeyChecking=no -o ControlMaster=auto -o ControlPath=$CONTROL_PATH -o ControlPersist=60"

setup_connection() {
    echo "Setting up connection..."
    ssh ${SSH_OPTS} "${HANGAR_HOST}" true
    
    # Kill existing socat
    ssh ${SSH_OPTS} "${HANGAR_HOST}" bash -c "pkill -f 'socat.*:${FORWARD_PORT}' 2>/dev/null || true; sleep 1"
    
    # Start tunnel
    run_id="$$_$(date +%s)"
    pidfile="/tmp/socat_${FORWARD_PORT}_${run_id}.pid"
    
    ssh ${SSH_OPTS} "${HANGAR_HOST}" bash -c "
        nohup socat tcp-listen:${FORWARD_PORT},reuseaddr,fork tcp:${CAM_IP}:443 >/dev/null 2>&1 & 
        echo \$! > ${pidfile}
        sleep 1
    "
    sleep 2
    echo "pidfile:${pidfile}"
}

cleanup_connection() {
    local pidfile="$1"
    ssh ${SSH_OPTS} "${HANGAR_HOST}" bash -c "
        if [ -f ${pidfile} ]; then
            pid=\$(cat ${pidfile} 2>/dev/null || true)
            if [ -n \"\$pid\" ]; then 
                kill \$pid 2>/dev/null || true
            fi
            rm -f ${pidfile}
        fi
    " 2>/dev/null || true
}

test_command() {
    local command_name="$1"
    local json_payload="$2"
    local api_url="https://${HANGAR_HOST}:${FORWARD_PORT}/cgi-bin/api.cgi?user=${CAM_USER}&password=${CAM_PASS}"
    
    echo ""
    echo "🧪 Testing: $command_name"
    echo "Command: $json_payload"
    
    response=$(curl -sSLk --fail --connect-timeout 5 --max-time 15 -X POST \
         -H "Content-Type: application/json" \
         -d "$json_payload" \
         "$api_url" 2>&1)
    
    echo "Raw response: $response"
    
    # Check for error codes
    if echo "$response" | grep -q '"code"[[:space:]]*:[[:space:]]*0'; then
        echo "✅ API Response: SUCCESS (code: 0)"
    elif echo "$response" | grep -q '"code"[[:space:]]*:[[:space:]]*1'; then
        echo "❌ API Response: ERROR (code: 1)"
        echo "$response" | grep -o '"detail"[[:space:]]*:[[:space:]]*"[^"]*"' || echo "No error detail"
    else
        echo "❓ API Response: UNKNOWN"
    fi
    
    # Look for specific response codes
    if echo "$response" | grep -q '"rspCode"[[:space:]]*:[[:space:]]*200'; then
        echo "✅ Operation Response: SUCCESS (rspCode: 200)"
    elif echo "$response" | grep -q '"rspCode"'; then
        rsp_code=$(echo "$response" | grep -o '"rspCode"[[:space:]]*:[[:space:]]*[0-9-]*' | grep -o '[0-9-]*$')
        echo "❌ Operation Response: ERROR (rspCode: $rsp_code)"
    else
        echo "❓ Operation Response: NO rspCode found"
    fi
}

# Setup
pidfile_info=$(setup_connection)
pidfile=$(echo "$pidfile_info" | grep "pidfile:" | cut -d: -f2)
api_url="https://${HANGAR_HOST}:${FORWARD_PORT}/cgi-bin/api.cgi?user=${CAM_USER}&password=${CAM_PASS}"

echo "✅ Connection established"

# Test 1: Get current zoom/focus status
test_command "Get ZoomFocus Status" \
    '[{"cmd":"GetZoomFocus","action":1,"param":{"channel":0}}]'

# Test 2: Get autofocus status
test_command "Get AutoFocus Status" \
    '[{"cmd":"GetAutoFocus","action":1,"param":{"channel":0}}]'

# Test 3: Try a simple zoom command
test_command "Zoom Out Command" \
    '[{"cmd":"StartZoomFocus","action":0,"param":{"ZoomFocus":{"channel":0,"op":"ZoomDec","pos":1}}}]'

sleep 2

# Test 4: Get zoom status again to see if it changed
test_command "Get ZoomFocus Status After Zoom" \
    '[{"cmd":"GetZoomFocus","action":1,"param":{"channel":0}}]'

# Test 5: Try a focus command
test_command "Focus Far Command" \
    '[{"cmd":"StartZoomFocus","action":0,"param":{"ZoomFocus":{"channel":0,"op":"FocusFar","pos":5}}}]'

sleep 2

# Test 6: Get zoom status again after focus
test_command "Get ZoomFocus Status After Focus" \
    '[{"cmd":"GetZoomFocus","action":1,"param":{"channel":0}}]'

# Test 7: Check what other capabilities this camera has
test_command "Get All Capabilities" \
    '[{"cmd":"GetAbility","action":1,"param":{}}]'

# Cleanup
cleanup_connection "$pidfile"

echo ""
echo "🎯 Analysis:"
echo "1. Look for SUCCESS vs ERROR responses above"
echo "2. Compare 'ZoomFocus Status' before and after commands to see if values changed"
echo "3. If commands succeed but values don't change, the camera motor might be broken"
echo "4. If commands fail, we need different API parameters"