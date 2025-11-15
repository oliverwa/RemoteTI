#!/bin/bash
set -euo pipefail

echo "🔧 Final Motor Test - Checking if Commands Actually Change Internal Values"
echo "========================================================================"

CAMERA_NAME="RUR"
CAM_IP="10.20.1.210"
HANGAR_HOST="hangar_sisjon_vpn"
CAM_USER="admin"
CAM_PASS="H4anGar0NeC4amAdmin"
FORWARD_PORT=8083

# SSH connection settings
CONTROL_PATH="$HOME/.ssh/cm-%r@%h:%p"
SSH_OPTS="-o StrictHostKeyChecking=no -o ControlMaster=auto -o ControlPath=$CONTROL_PATH -o ControlPersist=60"

echo "Setting up connection..."
ssh ${SSH_OPTS} "${HANGAR_HOST}" true
ssh ${SSH_OPTS} "${HANGAR_HOST}" bash -c "pkill -f 'socat.*:${FORWARD_PORT}' 2>/dev/null || true; sleep 1"

run_id="$$_$(date +%s)"
pidfile="/tmp/socat_${FORWARD_PORT}_${run_id}.pid"

ssh ${SSH_OPTS} "${HANGAR_HOST}" bash -c "
    nohup socat tcp-listen:${FORWARD_PORT},reuseaddr,fork tcp:${CAM_IP}:443 >/dev/null 2>&1 & 
    echo \$! > ${pidfile}
    sleep 1
"
sleep 2

api_url="https://${HANGAR_HOST}:${FORWARD_PORT}/cgi-bin/api.cgi?user=${CAM_USER}&password=${CAM_PASS}"

get_positions() {
    local label="$1"
    response=$(curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \
         -H "Content-Type: application/json" \
         -d '[{"cmd":"GetZoomFocus","action":1,"param":{"channel":0}}]' \
         "$api_url" 2>&1)
    
    focus_pos=$(echo "$response" | grep -o '"focus"[[:space:]]*:[[:space:]]*{[^}]*"pos"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*$' || echo "unknown")
    zoom_pos=$(echo "$response" | grep -o '"zoom"[[:space:]]*:[[:space:]]*{[^}]*"pos"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*$' || echo "unknown")
    
    echo "$label: Focus=$focus_pos, Zoom=$zoom_pos"
}

send_command() {
    local cmd_name="$1"
    local json_cmd="$2"
    
    echo ""
    echo "🔧 Testing: $cmd_name"
    echo "Command: $json_cmd"
    
    response=$(curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \
         -H "Content-Type: application/json" \
         -d "$json_cmd" \
         "$api_url" 2>&1)
    
    if echo "$response" | grep -q '"code"[[:space:]]*:[[:space:]]*0'; then
        echo "✅ API accepted command"
    else
        echo "❌ API rejected command"
        echo "Response: $response"
    fi
}

echo "✅ Connection established"

echo ""
echo "📊 BASELINE POSITIONS:"
get_positions "Initial"

# Test 1: Focus change
send_command "Set Focus to 150" \
    '[{"cmd":"SetZoomFocus","action":0,"param":{"ZoomFocus":{"channel":0,"focus":{"pos":150}}}}]'
sleep 3
get_positions "After focus to 150"

# Test 2: Focus change to different value
send_command "Set Focus to 50" \
    '[{"cmd":"SetZoomFocus","action":0,"param":{"ZoomFocus":{"channel":0,"focus":{"pos":50}}}}]'
sleep 3
get_positions "After focus to 50"

# Test 3: Zoom change
send_command "Set Zoom to 25" \
    '[{"cmd":"SetZoomFocus","action":0,"param":{"ZoomFocus":{"channel":0,"zoom":{"pos":25}}}}]'
sleep 3
get_positions "After zoom to 25"

# Test 4: Return to original values
send_command "Return to original (Focus=200, Zoom=15)" \
    '[{"cmd":"SetZoomFocus","action":0,"param":{"ZoomFocus":{"channel":0,"focus":{"pos":200},"zoom":{"pos":15}}}}]'
sleep 3
get_positions "After return to original"

# Cleanup
ssh ${SSH_OPTS} "${HANGAR_HOST}" bash -c "
    if [ -f ${pidfile} ]; then
        pid=\$(cat ${pidfile} 2>/dev/null || true)
        if [ -n \"\$pid\" ]; then 
            kill \$pid 2>/dev/null || true
        fi
        rm -f ${pidfile}
    fi
" 2>/dev/null || true

echo ""
echo "🎯 ANALYSIS:"
echo "1. If the position values CHANGED above, the API commands work but motors are broken"
echo "2. If the position values STAYED THE SAME, the camera is ignoring the commands"
echo "3. If values changed but you saw no visual movement, the RUR camera has a hardware issue"