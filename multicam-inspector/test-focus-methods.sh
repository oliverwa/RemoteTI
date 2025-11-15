#!/bin/bash
set -euo pipefail

echo "🎯 Testing Different Autofocus Methods for RUR Camera"
echo "====================================================="

CAMERA_NAME="RUR"
CAM_IP="10.20.1.210"
HANGAR_HOST="hangar_sisjon_vpn"
CAM_USER="admin"
CAM_PASS="H4anGar0NeC4amAdmin"
FORWARD_PORT=8083

# SSH connection settings
CONTROL_PATH="$HOME/.ssh/cm-%r@%h:%p"
SSH_OPTS="-o StrictHostKeyChecking=no -o ControlMaster=auto -o ControlPath=$CONTROL_PATH -o ControlPersist=60"

setup_tunnel() {
    echo "Setting up tunnel..."
    ssh ${SSH_OPTS} "${HANGAR_HOST}" true
    
    # Kill existing socat processes
    ssh ${SSH_OPTS} "${HANGAR_HOST}" bash -c "
        pids=\$(ps aux | grep \"socat.*:${FORWARD_PORT}\" | grep -v grep | awk '{print \$2}')
        if [ -n \"\$pids\" ]; then
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
    echo "pidfile:${pidfile}" # Return pidfile for cleanup
}

cleanup_tunnel() {
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

test_autofocus_method() {
    local method_name="$1"
    local json_payload="$2"
    local api_url="https://${HANGAR_HOST}:${FORWARD_PORT}/cgi-bin/api.cgi?user=${CAM_USER}&password=${CAM_PASS}"
    
    echo ""
    echo "🔍 Testing: $method_name"
    echo "Payload: $json_payload"
    
    response=$(curl -sSLk --fail --connect-timeout 5 --max-time 15 -X POST \
         -H "Content-Type: application/json" \
         -d "$json_payload" \
         "$api_url" 2>&1 || echo "CURL_ERROR")
    
    echo "Response: $response"
    
    if echo "$response" | grep -q '"code"[[:space:]]*:[[:space:]]*0'; then
        echo "✅ SUCCESS: $method_name worked!"
        sleep 3  # Give time for autofocus to work
        return 0
    else
        echo "❌ FAILED: $method_name failed"
        return 1
    fi
}

# Setup
pidfile_info=$(setup_tunnel)
pidfile=$(echo "$pidfile_info" | grep "pidfile:" | cut -d: -f2)

# Test different autofocus methods
echo "Testing various autofocus API calls..."

# Method 1: Basic PtzCtrl without speed parameter
test_autofocus_method "PtzCtrl Basic" \
    '[{"cmd":"PtzCtrl","action":0,"param":{"channel":0,"op":"AutoFocus"}}]'

# Method 2: ZoomFocus AutoFocus
test_autofocus_method "ZoomFocus AutoFocus" \
    '[{"cmd":"ZoomFocus","action":0,"param":{"channel":0,"op":"AutoFocus"}}]'

# Method 3: Direct focus reset (disable then enable with trigger)
echo ""
echo "🔍 Testing: Focus Reset Sequence"
test_autofocus_method "Disable AutoFocus" \
    '[{"cmd":"SetAutoFocus","action":0,"param":{"AutoFocus":{"channel":0,"disable":1}}}]'

sleep 1

test_autofocus_method "Enable AutoFocus" \
    '[{"cmd":"SetAutoFocus","action":0,"param":{"AutoFocus":{"channel":0,"disable":0}}}]'

# Method 4: PTZ with different parameters
test_autofocus_method "PTZ AutoFocus Alt" \
    '[{"cmd":"PtzCtrl","action":0,"param":{"op":"AutoFocus","speed":1}}]'

# Method 5: StartZoomFocus without pos parameter
test_autofocus_method "StartZoomFocus Simple" \
    '[{"cmd":"StartZoomFocus","action":0,"param":{"ZoomFocus":{"channel":0,"op":"AutoFocus"}}}]'

# Method 6: Try getting and setting focus position manually
echo ""
echo "🔍 Testing: Manual Focus Commands"

test_autofocus_method "Get ZoomFocus Status" \
    '[{"cmd":"GetZoomFocus","action":1,"param":{"channel":0}}]'

# Method 7: Force focus near then far to trigger autofocus
test_autofocus_method "Focus Near" \
    '[{"cmd":"StartZoomFocus","action":0,"param":{"ZoomFocus":{"channel":0,"op":"FocusNear"}}}]'

sleep 2

test_autofocus_method "Focus Far" \
    '[{"cmd":"StartZoomFocus","action":0,"param":{"ZoomFocus":{"channel":0,"op":"FocusFar"}}}]'

sleep 2

# Re-enable autofocus after manual focusing
test_autofocus_method "Re-enable AutoFocus after manual" \
    '[{"cmd":"SetAutoFocus","action":0,"param":{"AutoFocus":{"channel":0,"disable":0}}}]'

# Cleanup
cleanup_tunnel "$pidfile"

echo ""
echo "🎯 Test Summary:"
echo "Look for '✅ SUCCESS' messages above to see which methods worked"
echo "Watch your camera stream to see if any focus changes occurred"
echo "The working methods can be used in the web interface"