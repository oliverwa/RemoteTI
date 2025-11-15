#!/bin/bash
set -euo pipefail

echo "🔍 Simple Camera Status Monitor"
echo "==============================="
echo "This will poll the RUR camera status every 2 seconds"
echo "Use your camera app's manual controls and watch for changes!"
echo ""

CAMERA_IP="10.20.1.210"
HANGAR_HOST="hangar_sisjon_vpn"
CAM_USER="admin"
CAM_PASS="H4anGar0NeC4amAdmin"
FORWARD_PORT=8083

# SSH connection settings
CONTROL_PATH="$HOME/.ssh/cm-%r@%h:%p"
SSH_OPTS="-o StrictHostKeyChecking=no -o ControlMaster=auto -o ControlPath=${CONTROL_PATH} -o ControlPersist=60"

echo "Setting up connection..."
ssh ${SSH_OPTS} "${HANGAR_HOST}" true

# Kill existing socat processes and start new one
ssh ${SSH_OPTS} "${HANGAR_HOST}" "pkill -f 'socat.*:${FORWARD_PORT}' 2>/dev/null || true; sleep 1"

run_id="$$_$(date +%s)"
pidfile="/tmp/socat_${FORWARD_PORT}_${run_id}.pid"

ssh ${SSH_OPTS} "${HANGAR_HOST}" "nohup socat tcp-listen:${FORWARD_PORT},reuseaddr,fork tcp:${CAMERA_IP}:443 >/dev/null 2>&1 & echo \$! > ${pidfile}; sleep 1"

sleep 2

api_url="https://${HANGAR_HOST}:${FORWARD_PORT}/cgi-bin/api.cgi?user=${CAM_USER}&password=${CAM_PASS}"

echo "✅ Connected to camera"
echo ""
echo "🎯 NOW USE YOUR CAMERA APP'S MANUAL CONTROLS!"
echo "📊 Watching for status changes..."
echo ""

# Get initial status
get_status() {
    curl -sSLk --fail --connect-timeout 3 --max-time 8 -X POST \
         -H "Content-Type: application/json" \
         -d '[{"cmd":"GetZoomFocus","action":1,"param":{"channel":0}}]' \
         "$api_url" 2>/dev/null | \
    python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    focus = data[0]['value']['ZoomFocus']['focus']['pos']
    zoom = data[0]['value']['ZoomFocus']['zoom']['pos']  
    print(f'Focus={focus}, Zoom={zoom}')
except:
    print('Error parsing response')
" 2>/dev/null || echo "Error getting status"
}

last_status=$(get_status)
echo "Initial status: $last_status"

count=0
while true; do
    sleep 2
    count=$((count + 1))
    
    current_status=$(get_status)
    
    if [[ "$current_status" != "$last_status" && "$current_status" != "Error getting status" ]]; then
        echo ""
        echo "🔥 CHANGE DETECTED at $(date '+%H:%M:%S')!"
        echo "   Old: $last_status"
        echo "   New: $current_status"
        echo ""
        last_status="$current_status"
    else
        # Show we're still monitoring
        if [ $((count % 10)) -eq 0 ]; then
            echo "⏳ Still monitoring... (${count}x2=${$((count*2))}s elapsed) - Current: $current_status"
        fi
    fi
done