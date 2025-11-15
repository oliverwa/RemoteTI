#!/bin/bash
set -euo pipefail

echo "🎯 Testing CORRECT API Commands for RUR Camera"
echo "============================================="
echo "Current focus position: 200 (range: 0-233)"
echo "Current zoom position: 15 (range: 0-28)"
echo ""

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
    
    response=$(curl -sSLk --fail --connect-timeout 5 --max-time 15 -X POST \
         -H "Content-Type: application/json" \
         -d "$json_payload" \
         "$api_url" 2>&1)
    
    if echo "$response" | grep -q '"code"[[:space:]]*:[[:space:]]*0'; then
        echo "✅ SUCCESS: $command_name worked!"
        return 0
    else
        echo "❌ FAILED: $command_name failed"
        echo "Response: $response"
        return 1
    fi
}

get_status() {
    local api_url="https://${HANGAR_HOST}:${FORWARD_PORT}/cgi-bin/api.cgi?user=${CAM_USER}&password=${CAM_PASS}"
    
    response=$(curl -sSLk --fail --connect-timeout 5 --max-time 15 -X POST \
         -H "Content-Type: application/json" \
         -d '[{"cmd":"GetZoomFocus","action":1,"param":{"channel":0}}]' \
         "$api_url" 2>&1)
    
    focus_pos=$(echo "$response" | grep -o '"focus"[[:space:]]*:[[:space:]]*{[^}]*"pos"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*$')
    zoom_pos=$(echo "$response" | grep -o '"zoom"[[:space:]]*:[[:space:]]*{[^}]*"pos"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*$')
    
    echo "📊 Current Status: Focus=$focus_pos, Zoom=$zoom_pos"
}

# Setup
pidfile_info=$(setup_connection)
pidfile=$(echo "$pidfile_info" | grep "pidfile:" | cut -d: -f2)

echo "✅ Connection established"

# Get initial status
get_status

# Method 1: Try absolute position setting instead of relative movement
echo ""
echo "🔧 Method 1: Set Absolute Focus Position"
test_command "Set Focus to 150" \
    '[{"cmd":"SetZoomFocus","action":0,"param":{"ZoomFocus":{"channel":0,"focus":{"pos":150}}}}]'

sleep 2
get_status

# Method 2: Try absolute position setting to a different value
test_command "Set Focus to 250" \
    '[{"cmd":"SetZoomFocus","action":0,"param":{"ZoomFocus":{"channel":0,"focus":{"pos":250}}}}]'

sleep 2
get_status

# Method 3: Try zoom absolute positioning
test_command "Set Zoom to 20" \
    '[{"cmd":"SetZoomFocus","action":0,"param":{"ZoomFocus":{"channel":0,"zoom":{"pos":20}}}}]'

sleep 2
get_status

# Method 4: Try zoom back to original
test_command "Set Zoom back to 15" \
    '[{"cmd":"SetZoomFocus","action":0,"param":{"ZoomFocus":{"channel":0,"zoom":{"pos":15}}}}]'

sleep 2
get_status

# Method 5: Try setting both zoom and focus together
test_command "Set Both Focus=200 and Zoom=15" \
    '[{"cmd":"SetZoomFocus","action":0,"param":{"ZoomFocus":{"channel":0,"focus":{"pos":200},"zoom":{"pos":15}}}}]'

sleep 2
get_status

# Cleanup
cleanup_connection "$pidfile"

echo ""
echo "🎯 Results Summary:"
echo "- If you saw position changes above, the camera motors work!"
echo "- If positions changed but no visual change in stream, there might be a hardware issue"
echo "- If all commands succeeded, we found the correct API format!"