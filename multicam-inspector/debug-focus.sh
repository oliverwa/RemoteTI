#!/bin/bash
set -euo pipefail

echo "🔍 Debug Focus Test for RUR Camera"
echo "=================================="

CAMERA_NAME="RUR"
CAM_IP="10.20.1.210"
HANGAR_HOST="hangar_sisjon_vpn"
CAM_USER="admin"
CAM_PASS="H4anGar0NeC4amAdmin"
FORWARD_PORT=8083

# SSH connection settings
CONTROL_PATH="$HOME/.ssh/cm-%r@%h:%p"
SSH_OPTS="-o StrictHostKeyChecking=no -o ControlMaster=auto -o ControlPath=$CONTROL_PATH -o ControlPersist=60"

echo "1. Testing SSH connection..."
ssh ${SSH_OPTS} "${HANGAR_HOST}" true || {
    echo "❌ Cannot connect to ${HANGAR_HOST}"
    exit 1
}
echo "✅ SSH connection successful"

echo ""
echo "2. Setting up tunnel..."
# Kill existing socat processes
ssh ${SSH_OPTS} "${HANGAR_HOST}" bash -c "
    pids=\$(ps aux | grep \"socat.*:${FORWARD_PORT}\" | grep -v grep | awk '{print \$2}')
    if [ -n \"\$pids\" ]; then
        echo \"Killing existing socat processes: \$pids\"
        kill \$pids 2>/dev/null || true
        sleep 1
    fi
" 2>/dev/null || true

# Start tunnel
run_id="$$_$(date +%s)"
pidfile="/tmp/socat_${FORWARD_PORT}_${run_id}.pid"

ssh ${SSH_OPTS} "${HANGAR_HOST}" bash -c "
    nohup socat tcp-listen:${FORWARD_PORT},reuseaddr,fork tcp:${CAM_IP}:443 >/dev/null 2>&1 & 
    echo \$! > ${pidfile}
    sleep 0.5
"

sleep 2
echo "✅ Tunnel established"

api_url="https://${HANGAR_HOST}:${FORWARD_PORT}/cgi-bin/api.cgi?user=${CAM_USER}&password=${CAM_PASS}"

echo ""
echo "3. Testing API connectivity..."
# Test basic API call
response=$(curl -sSLk --fail --connect-timeout 5 --max-time 15 \
    "${api_url}" 2>&1 || echo "API_ERROR")

if [[ "$response" == "API_ERROR" ]]; then
    echo "❌ Cannot reach camera API"
else
    echo "✅ Camera API accessible"
fi

echo ""
echo "4. Getting current camera status..."
# Get device info
curl -sSLk --fail --connect-timeout 5 --max-time 15 -X POST \
     -H "Content-Type: application/json" \
     -d '[{"cmd":"GetDevInfo","action":1,"param":{}}]' \
     "${api_url}" 2>/dev/null | jq . || echo "Could not get device info"

echo ""
echo "5. Getting current autofocus status..."
# Get current autofocus settings
curl -sSLk --fail --connect-timeout 5 --max-time 15 -X POST \
     -H "Content-Type: application/json" \
     -d '[{"cmd":"GetAutoFocus","action":1,"param":{"channel":0}}]' \
     "${api_url}" 2>/dev/null | jq . || echo "Could not get autofocus status"

echo ""
echo "6. Testing autofocus reset with detailed output..."
echo "Disabling autofocus..."
disable_response=$(curl -sSLk --fail --connect-timeout 5 --max-time 15 -X POST \
     -H "Content-Type: application/json" \
     -d '[{"cmd":"SetAutoFocus","action":0,"param":{"AutoFocus":{"channel":0,"disable":1}}}]' \
     "${api_url}" 2>&1 || echo "DISABLE_ERROR")
echo "Disable response: $disable_response"

sleep 1

echo "Enabling autofocus..."
enable_response=$(curl -sSLk --fail --connect-timeout 5 --max-time 15 -X POST \
     -H "Content-Type: application/json" \
     -d '[{"cmd":"SetAutoFocus","action":0,"param":{"AutoFocus":{"channel":0,"disable":0}}}]' \
     "${api_url}" 2>&1 || echo "ENABLE_ERROR")
echo "Enable response: $enable_response"

echo ""
echo "7. Testing direct autofocus trigger..."
trigger_response=$(curl -sSLk --fail --connect-timeout 5 --max-time 15 -X POST \
     -H "Content-Type: application/json" \
     -d '[{"cmd":"PtzCtrl","action":0,"param":{"channel":0,"op":"AutoFocus","speed":4}}]' \
     "${api_url}" 2>&1 || echo "TRIGGER_ERROR")
echo "Trigger response: $trigger_response"

echo ""
echo "8. Testing alternative autofocus command..."
alt_response=$(curl -sSLk --fail --connect-timeout 5 --max-time 15 -X POST \
     -H "Content-Type: application/json" \
     -d '[{"cmd":"StartZoomFocus","action":0,"param":{"ZoomFocus":{"channel":0,"op":"AutoFocus","pos":1}}}]' \
     "${api_url}" 2>&1 || echo "ALT_ERROR")
echo "Alternative response: $alt_response"

echo ""
echo "9. Cleaning up..."
# Clean up tunnel
ssh ${SSH_OPTS} "${HANGAR_HOST}" bash -c "
    if [ -f ${pidfile} ]; then
        pid=\$(cat ${pidfile} 2>/dev/null || true)
        if [ -n \"\$pid\" ]; then 
            kill \$pid 2>/dev/null || true
        fi
        rm -f ${pidfile}
    fi
" 2>/dev/null || true

echo "✅ Debug test completed"
echo ""
echo "📋 Summary:"
echo "- Check the responses above for error codes"
echo "- Look for 'rval':0 which indicates success"
echo "- Watch your camera stream during this test to see if focus changed"