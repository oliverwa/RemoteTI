#!/usr/bin/env bash
# Camera autofocus script: camera_autofocus.sh <hangar> <camera_name> <camera_ip> [port]
set -euo pipefail

if [ $# -lt 3 ] || [ $# -gt 4 ]; then
    echo "Usage: $0 <hangar> <camera_name> <camera_ip> [port]"
    echo "Example: $0 hangar_sisjon_vpn FDR 10.20.1.208"
    echo "Example: $0 hangar_sisjon_vpn FDR 10.20.1.208 8084"
    exit 1
fi

HANGAR_HOST="$1"
CAMERA_NAME="$2"
CAM_IP="$3"
CUSTOM_PORT="${4:-}"

# Configuration
CAM_USER="admin"
CAM_PASS="H4anGar0NeC4amAdmin"
FORWARD_PORT="${CUSTOM_PORT:-8083}"

echo "=== Autofocus for ${CAMERA_NAME} ==="
echo "Camera IP: ${CAM_IP}"
echo "Via hangar: ${HANGAR_HOST}"
echo "Port: ${FORWARD_PORT}"

# SSH options
SSH_OPTS="-o ConnectTimeout=10 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"

# Functions
start_tunnel() {
    local pidfile=$1
    ssh ${SSH_OPTS} -f \
        "${HANGAR_HOST}" \
        "socat TCP-LISTEN:${FORWARD_PORT},fork,reuseaddr TCP:${CAM_IP}:80 </dev/null >/dev/null 2>&1 & 
        echo \$! > ${pidfile}
        sleep 0.5
    "
}

stop_tunnel() {
    local pidfile=$1
    ssh ${SSH_OPTS} "${HANGAR_HOST}" "
        if [ -f ${pidfile} ]; then
            kill \$(cat ${pidfile}) 2>/dev/null || true
            rm ${pidfile}
        fi
        pkill -f 'socat.*${FORWARD_PORT}' 2>/dev/null || true
    " 2>/dev/null || true
}

trigger_autofocus() {
    local cam_name="$1"
    local api_url="https://${HANGAR_HOST}:${FORWARD_PORT}/api.cgi?user=${CAM_USER}&password=${CAM_PASS}"
    
    # Get current zoom position first
    echo "Getting current zoom position..."
    local current_zoom_response=$(curl -sSLk --fail \
         --connect-timeout 3 \
         --max-time 10 \
         -X POST \
         -H "Content-Type: application/json" \
         -d '[{"cmd":"GetZoomFocus","action":0,"param":{"channel":0}}]' \
         "${api_url}" 2>/dev/null || echo "error")
    
    # Extract current zoom position (default to 15 if can't get it)
    local current_zoom=15
    if [[ "$current_zoom_response" != "error" ]]; then
        current_zoom=$(echo "$current_zoom_response" | grep -o '"zoom"[[:space:]]*:[[:space:]]*{[^}]*"pos"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*$' || echo "15")
    fi
    
    echo "Current zoom position: $current_zoom"
    
    # Calculate temporary zoom position for autofocus trigger
    local temp_zoom=$((current_zoom + 5))
    if [ $temp_zoom -gt 28 ]; then
        temp_zoom=$((current_zoom - 5))
    fi
    if [ $temp_zoom -lt 1 ]; then
        temp_zoom=$((current_zoom + 5))
    fi
    
    echo "Zooming to position $temp_zoom to trigger autofocus..."
    
    # Use working StartZoomFocus with ZoomPos operation
    curl -sSLk --fail \
         --connect-timeout 5 \
         --max-time 10 \
         -X POST \
         -H "Content-Type: application/json" \
         -d "[{\"cmd\":\"StartZoomFocus\",\"action\":0,\"param\":{\"ZoomFocus\":{\"channel\":0,\"pos\":$temp_zoom,\"op\":\"ZoomPos\"}}}]" \
         "${api_url}" >/dev/null 2>&1 || true

    # Wait for zoom change and autofocus trigger
    echo "Waiting for autofocus to trigger..."
    sleep 5
    
    echo "Returning to original zoom position $current_zoom..."
    
    # Return to original zoom position using working method
    curl -sSLk --fail \
         --connect-timeout 5 \
         --max-time 10 \
         -X POST \
         -H "Content-Type: application/json" \
         -d "[{\"cmd\":\"StartZoomFocus\",\"action\":0,\"param\":{\"ZoomFocus\":{\"channel\":0,\"pos\":$current_zoom,\"op\":\"ZoomPos\"}}}]" \
         "${api_url}" >/dev/null 2>&1 || true

    # Wait for autofocus to complete
    echo "Waiting for focus to stabilize..."
    sleep 6
    echo "✅ Autofocus completed for ${cam_name}"
}

# Main execution
echo "Establishing SSH connection..."
ssh ${SSH_OPTS} "${HANGAR_HOST}" true || {
    echo "❌ Cannot connect to ${HANGAR_HOST}"
    exit 1
}

# Clean up any existing tunnel on this port
echo "Cleaning up existing processes..."
stop_tunnel "/tmp/autofocus_tunnel_${FORWARD_PORT}.pid"
sleep 1

# Start tunnel
pidfile="/tmp/autofocus_tunnel_${FORWARD_PORT}.pid"
echo "Starting tunnel for ${CAM_IP}..."
start_tunnel "$pidfile"
sleep 1

# Trigger autofocus
trigger_autofocus "${CAMERA_NAME}"

# Clean up tunnel
echo "Cleaning up tunnel..."
stop_tunnel "$pidfile"

echo "✅ Autofocus operation completed successfully!"