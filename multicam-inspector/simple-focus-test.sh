#!/bin/bash
set -euo pipefail

echo "🎯 Simple Focus Test - Just Disable/Enable Sequence"
echo "=================================================="
echo "Watch your RUR camera stream for focus changes!"
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

echo "1. Setting up connection..."
ssh ${SSH_OPTS} "${HANGAR_HOST}" true

# Kill existing socat
ssh ${SSH_OPTS} "${HANGAR_HOST}" bash -c "pkill -f 'socat.*:${FORWARD_PORT}' 2>/dev/null || true; sleep 1"

# Start new tunnel
run_id="$$_$(date +%s)"
pidfile="/tmp/socat_${FORWARD_PORT}_${run_id}.pid"

ssh ${SSH_OPTS} "${HANGAR_HOST}" bash -c "
    nohup socat tcp-listen:${FORWARD_PORT},reuseaddr,fork tcp:${CAM_IP}:443 >/dev/null 2>&1 & 
    echo \$! > ${pidfile}
    sleep 1
"

sleep 2
api_url="https://${HANGAR_HOST}:${FORWARD_PORT}/cgi-bin/api.cgi?user=${CAM_USER}&password=${CAM_PASS}"

echo "✅ Connected to camera"
echo ""

for i in {1..3}; do
    echo "Test $i of 3 - Watch your camera stream now!"
    echo "  🔴 Disabling autofocus..."
    
    curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \
         -H "Content-Type: application/json" \
         -d '[{"cmd":"SetAutoFocus","action":0,"param":{"AutoFocus":{"channel":0,"disable":1}}}]' \
         "${api_url}" >/dev/null 2>&1
    
    sleep 2
    
    echo "  🟢 Enabling autofocus..."
    
    curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \
         -H "Content-Type: application/json" \
         -d '[{"cmd":"SetAutoFocus","action":0,"param":{"AutoFocus":{"channel":0,"disable":0}}}]' \
         "${api_url}" >/dev/null 2>&1
    
    echo "  ⏰ Waiting 5 seconds for focus to adjust..."
    sleep 5
    echo ""
done

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

echo "✅ Test completed!"
echo ""
echo "Did you see any focus changes in your camera stream?"
echo "If yes, then the disable/enable method works and should be used."
echo "If no, then this camera might have autofocus issues or doesn't support it."