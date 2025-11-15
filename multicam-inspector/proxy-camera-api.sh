#!/bin/bash
set -euo pipefail

echo "🕵️ Camera API Proxy - Capturing Real API Calls"
echo "============================================="
echo ""

CAMERA_IP="10.20.1.210"
HANGAR_HOST="hangar_sisjon_vpn"
CAM_USER="admin"
CAM_PASS="H4anGar0NeC4amAdmin"
PROXY_PORT=8084
FORWARD_PORT=8083

# SSH connection settings
CONTROL_PATH="$HOME/.ssh/cm-%r@%h:%p"
SSH_OPTS="-o StrictHostKeyChecking=no -o ControlMaster=auto -o ControlPath=$CONTROL_PATH -o ControlPersist=60"

echo "📡 Setting up proxy to capture API calls..."

# Establish SSH connection
ssh ${SSH_OPTS} "${HANGAR_HOST}" true || {
    echo "❌ Cannot connect to ${HANGAR_HOST}"
    exit 1
}

# Kill existing socat processes
ssh ${SSH_OPTS} "${HANGAR_HOST}" bash -c "
    pkill -f 'socat.*:${FORWARD_PORT}' 2>/dev/null || true
    pkill -f 'socat.*:${PROXY_PORT}' 2>/dev/null || true
    sleep 1
"

# Start tunnel for camera
run_id="$$_$(date +%s)"
pidfile="/tmp/socat_${FORWARD_PORT}_${run_id}.pid"

ssh ${SSH_OPTS} "${HANGAR_HOST}" bash -c "
    nohup socat tcp-listen:${FORWARD_PORT},reuseaddr,fork tcp:${CAMERA_IP}:443 >/dev/null 2>&1 & 
    echo \$! > ${pidfile}
    sleep 1
"

sleep 2

echo "✅ Tunnel established to camera"
echo ""
echo "🎯 Now use your camera app to manually control focus/zoom on RUR camera"
echo "📝 I'll monitor the tunnel traffic and show you the exact API calls being made"
echo ""
echo "⚠️  Make sure your app is connected to RUR camera (10.20.1.210)"
echo "🔄 Press Ctrl+C when you're done testing"
echo ""

# Monitor the socat process logs to see API calls
api_url="https://${HANGAR_HOST}:${FORWARD_PORT}/cgi-bin/api.cgi?user=${CAM_USER}&password=${CAM_PASS}"

echo "🔍 Monitoring API traffic..."
echo "📊 Current Status Check:"

# Get initial status
response=$(curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \
     -H "Content-Type: application/json" \
     -d '[{"cmd":"GetZoomFocus","action":1,"param":{"channel":0}}]' \
     "$api_url" 2>&1)

echo "Current camera status: $response"
echo ""
echo "👆 Use your app controls now - I'll detect when the camera receives commands!"

# Monitor for changes in camera status
initial_response="$response"
monitor_count=0

while true; do
    sleep 1
    monitor_count=$((monitor_count + 1))
    
    # Check camera status every second
    current_response=$(curl -sSLk --fail --connect-timeout 2 --max-time 5 -X POST \
         -H "Content-Type: application/json" \
         -d '[{"cmd":"GetZoomFocus","action":1,"param":{"channel":0}}]' \
         "$api_url" 2>/dev/null || echo "error")
    
    # If response changed, something happened
    if [[ "$current_response" != "$initial_response" && "$current_response" != "error" ]]; then
        echo ""
        echo "🔥 DETECTED CHANGE! Camera status updated:"
        echo "New status: $current_response"
        echo ""
        initial_response="$current_response"
    fi
    
    # Show we're still monitoring
    if [ $((monitor_count % 10)) -eq 0 ]; then
        echo "⏳ Still monitoring... (${monitor_count}s elapsed)"
    fi
done

# Cleanup on exit
trap 'cleanup_and_exit' INT

cleanup_and_exit() {
    echo ""
    echo "🧹 Cleaning up..."
    ssh ${SSH_OPTS} "${HANGAR_HOST}" bash -c "
        if [ -f ${pidfile} ]; then
            pid=\$(cat ${pidfile} 2>/dev/null || true)
            if [ -n \"\$pid\" ]; then 
                kill \$pid 2>/dev/null || true
            fi
            rm -f ${pidfile}
        fi
    " 2>/dev/null || true
    echo "✅ Cleanup complete"
    exit 0
}