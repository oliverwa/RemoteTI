#!/usr/bin/env bash
# macOS Bash 3-kompatibelt: Kör en gång, stödjer sub-sekunds-delay
set -euo pipefail

################################
# Interaktiva frågor
################################
read -r -p "Vilken hangar-host? (t.ex. hangar_sisjon_vpn): " HANGAR_HOST
while [[ -z "${HANGAR_HOST}" ]]; do
  read -r -p "Hangar-host får inte vara tom. Ange värde: " HANGAR_HOST
done

read -r -p "Vilken drönare? (t.ex. bender): " DRONE_NAME
while [[ -z "${DRONE_NAME}" ]]; do
  read -r -p "Drönarnamn får inte vara tomt. Ange värde: " DRONE_NAME
done

################################
# Konfiguration
################################
CAM_USER="admin"
CAM_PASS="H4anGar0NeC4amAdmin"

CAM_BASE="10.20.1"
FORWARD_PORT=8083
DELAY_BETWEEN_CAMERAS=0.5   # Du kan sätta 0.5, 0.3, etc.

# Ny mappstruktur: ~/hangar_snapshots/<hangar>/<drönare>_<YYMMDD_HHMMSS>
RUN_STAMP="$(date +'%y%m%d_%H%M%S')"
OUT_DIR="${HOME}/hangar_snapshots/${HANGAR_HOST}/${DRONE_NAME}_${RUN_STAMP}"

CURL_CONNECT_TIMEOUT=3
CURL_TOTAL_TIMEOUT=30
CURL_RETRIES=0

CONTROL_PATH="${HOME}/.ssh/cm-%r@%h:%p"
SSH_OPTS="-o StrictHostKeyChecking=no -o ControlMaster=auto -o ControlPath=${CONTROL_PATH} -o ControlPersist=60"

################################
# Hjälpfunktioner
################################
cam_name_from_last() {
  case "$1" in
    208) echo "FDR" ;;
    209) echo "FUR" ;;
    210) echo "RUR" ;;
    211) echo "RDR" ;;
    212) echo "FDL" ;;
    213) echo "FUL" ;;
    214) echo "RUL" ;;
    215) echo "RDL" ;;
    *)   echo "UNK" ;;
  esac
}

remote_port_busy() {
  ssh ${SSH_OPTS} "${HANGAR_HOST}" bash -lc "
    true; set -euo pipefail
    PORT=${FORWARD_PORT}
    if command -v ss >/dev/null 2>&1; then
      ss -lnt | awk '{print \$4}' | grep -q \":\${PORT}\$\" && exit 0 || exit 1
    elif command -v netstat >/dev/null 2>&1; then
      netstat -lnt 2>/dev/null | awk '{print \$4}' | grep -q \":\${PORT}\$\" && exit 0 || exit 1
    else
      exit 1
    fi
  " >/dev/null 2>&1
}

start_socat_safe() {
  local cam_ip="$1"
  local run_id="$2"

  if remote_port_busy; then
    echo "BUSY"
    return 0
  fi

  ssh ${SSH_OPTS} "${HANGAR_HOST}" bash -lc "
    true; set -euo pipefail
    pidfile=\"/tmp/socat_${FORWARD_PORT}_${run_id}.pid\"
    nohup socat tcp-listen:${FORWARD_PORT},reuseaddr,fork tcp:${cam_ip}:443 >/dev/null 2>&1 & echo \$! > \"\$pidfile\"
    sleep 0.5
    echo OK
  "
}

stop_socat_safe() {
  local run_id="$1"
  ssh ${SSH_OPTS} "${HANGAR_HOST}" bash -lc "
    true; set -euo pipefail
    pidfile=\"/tmp/socat_${FORWARD_PORT}_${run_id}.pid\"
    if [ -f \"\$pidfile\" ]; then
      pid=\$(cat \"\$pidfile\" || true)
      if [ -n \"\$pid\" ]; then kill \"\$pid\" 2>/dev/null || true; fi
      rm -f \"\$pidfile\" || true
    fi
  " || true
}

fetch_snapshot() {
  local outfile="$1"
  local url="https://${HANGAR_HOST}:${FORWARD_PORT}/cgi-bin/api.cgi?cmd=Snap&channel=0&rs=wuuPhkmUCeI9WG7C&user=${CAM_USER}&password=${CAM_PASS}"
  curl -sSLk --fail \
       --connect-timeout "${CURL_CONNECT_TIMEOUT}" \
       --max-time "${CURL_TOTAL_TIMEOUT}" \
       --retry "${CURL_RETRIES}" --retry-delay 1 \
       -o "${outfile}" "${url}"
}

################################
# Körning
################################
mkdir -p "${OUT_DIR}"

echo "Öppnar SSH-kontrollkanal till ${HANGAR_HOST} (du kan behöva ange lösenord)..."
ssh ${SSH_OPTS} "${HANGAR_HOST}" true || {
  echo "Kunde inte ansluta till ${HANGAR_HOST}. Kontrollera nät/VPN/SSH." >&2
  exit 1
}

echo "Hämtar EN bild per kamera (.208–.215) med ${DELAY_BETWEEN_CAMERAS}s mellanrum."
echo "Utkatalog: ${OUT_DIR}"
echo

for last in 208 209 210 211 212 213 214 215; do
  cam_name="$(cam_name_from_last "${last}")"
  cam_ip="${CAM_BASE}.${last}"
  ts="$(date +'%y%m%d_%H%M%S')"
  outfile="${OUT_DIR}/${cam_name}_${ts}.jpg"

  RUN_ID="run_$$_${last}_$(date +%s)"

  echo "[$(date +'%H:%M:%S')] ${cam_name} (${cam_ip}) -> ${outfile}"

  result="$(start_socat_safe "${cam_ip}" "${RUN_ID}")" || result="ERR"
  if [[ "${result}" == "BUSY" ]]; then
    echo "   ⏭  Port ${FORWARD_PORT} är upptagen på ${HANGAR_HOST}, hoppar över."
    sleep "${DELAY_BETWEEN_CAMERAS}"
    continue
  elif [[ "${result}" != "OK" ]]; then
    echo "   ⚠️  Kunde inte starta socat för ${cam_ip}, hoppar över."
    sleep "${DELAY_BETWEEN_CAMERAS}"
    continue
  fi

  if fetch_snapshot "${outfile}"; then
    echo "   ✔ Sparad: ${outfile}"
  else
    echo "   ⚠️  Misslyckades att hämta från ${cam_ip}"
    rm -f "${outfile}" || true
  fi

  stop_socat_safe "${RUN_ID}"
  sleep "${DELAY_BETWEEN_CAMERAS}"
done

echo
echo "Klart."

ssh -O exit -o ControlPath="${CONTROL_PATH}" "${HANGAR_HOST}" >/dev/null 2>&1 || true
