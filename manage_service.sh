#!/usr/bin/env bash
set -uo pipefail

PORT="${PORT:-3000}"
BASE_URL="http://localhost:$PORT"
LOG_DIR="logs"
PID_FILE=".url2md.pid"
MODE="${MODE:-docker}"  # docker | local

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

usage() {
  cat << 'EOF'
Usage: ./manage_service.sh <command> [options]

Commands:
  start               Start the service
  stop                Stop the service
  restart             Restart the service
  status              Show service status
  health              Check service health
  logs                Show recent logs (follow with -f)
  shell               Open a shell in the running container (docker mode)

Options:
  --local             Use local Node.js instead of Docker
  --port <n>          Override port (default: 3000)

Environment:
  MODE=docker|local   Runtime mode (default: docker)
  PORT=<n>            Port number

Examples:
  ./manage_service.sh start
  ./manage_service.sh start --local
  ./manage_service.sh logs -f
  ./manage_service.sh health
  ./manage_service.sh stop
EOF
}

# ── Parse flags ──
COMMAND=""
FOLLOW=""
for arg in "$@"; do
  case "$arg" in
    --local)  MODE="local" ;;
    --port)   shift; PORT="$1" ;;
    -f|--follow) FOLLOW="yes" ;;
    -h|--help) usage; exit 0 ;;
    *) COMMAND="$arg" ;;
  esac
  shift 2>/dev/null || true
done
BASE_URL="http://localhost:$PORT"

# ── Helpers ──
is_docker() { [ "$MODE" = "docker" ]; }

container_running() {
  docker compose ps --format json 2>/dev/null | python3 -c "
import sys,json
for line in sys.stdin:
  try:
    d=json.loads(line)
    if d.get('State')=='running' or d.get('State')=='exited':
      print(d['State']); sys.exit(0)
  except: pass
" 2>/dev/null | grep -q running
}

local_running() {
  [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

is_running() {
  if is_docker; then container_running; else local_running; fi
}

print_status() {
  local label="$1" value="$2" color="${3:-$NC}"
  printf "  ${BOLD}%-14s${NC} ${color}%s${NC}\n" "$label" "$value"
}

# ══════════════════════════════════════════════════════════════
cmd_start() {
  echo -e "${BOLD}Starting url2md service (${MODE} mode)...${NC}"

  if is_running; then
    echo -e "${YELLOW}Service is already running.${NC}"
    cmd_status
    return 0
  fi

  if is_docker; then
    if ! docker compose version > /dev/null 2>&1; then
      echo -e "${RED}Docker Compose not found. Install Docker or use --local.${NC}"
      exit 1
    fi
    docker compose up -d --build
  else
    mkdir -p "$LOG_DIR"
    nohup node src/server.js > "$LOG_DIR/url2md.log" 2>&1 &
    echo $! > "$PID_FILE"
    echo -e "  PID: $(cat "$PID_FILE")"
  fi

  echo -ne "  Waiting for service"
  for i in $(seq 1 30); do
    if curl -sf "$BASE_URL/api/health" > /dev/null 2>&1; then
      echo -e "\n${GREEN}  Service is ready on :$PORT${NC}"
      cmd_health
      return 0
    fi
    echo -n "."
    sleep 1
  done
  echo -e "\n${RED}  Timed out waiting for service.${NC}"
  exit 1
}

# ══════════════════════════════════════════════════════════════
cmd_stop() {
  echo -e "${BOLD}Stopping url2md service...${NC}"

  if ! is_running; then
    echo -e "${YELLOW}Service is not running.${NC}"
    return 0
  fi

  if is_docker; then
    docker compose down
  else
    local pid
    pid=$(cat "$PID_FILE" 2>/dev/null)
    if [ -n "$pid" ]; then
      kill "$pid" 2>/dev/null
      rm -f "$PID_FILE"
    fi
  fi

  echo -e "${GREEN}  Service stopped.${NC}"
}

# ══════════════════════════════════════════════════════════════
cmd_restart() {
  cmd_stop
  sleep 1
  cmd_start
}

# ══════════════════════════════════════════════════════════════
cmd_status() {
  echo -e "${BOLD}Service Status${NC}"
  echo ""

  if is_docker; then
    if container_running; then
      print_status "Mode:" "docker" "$GREEN"
      print_status "State:" "running" "$GREEN"
      docker compose ps --format json 2>/dev/null | python3 -c "
import sys,json
for line in sys.stdin:
  try:
    d=json.loads(line)
    print(f'  Container:     {d.get(\"Name\",\"?\")}')
    print(f'  Image:         {d.get(\"Image\",\"?\")}')
    state=d.get('Health','')
    if state: print(f'  Health:        {state}')
  except: pass
" 2>/dev/null
    else
      print_status "Mode:" "docker" "$CYAN"
      print_status "State:" "stopped" "$RED"
    fi
  else
    if local_running; then
      local pid
      pid=$(cat "$PID_FILE")
      print_status "Mode:" "local" "$GREEN"
      print_status "State:" "running" "$GREEN"
      print_status "PID:" "$pid" "$GREEN"
      print_status "Log:" "$LOG_DIR/url2md.log"
    else
      print_status "Mode:" "local" "$CYAN"
      print_status "State:" "stopped" "$RED"
      [ -f "$PID_FILE" ] && rm -f "$PID_FILE"
    fi
  fi

  echo ""
  if curl -sf "$BASE_URL/api/health" > /dev/null 2>&1; then
    print_status "Endpoint:" "$BASE_URL" "$GREEN"
  else
    print_status "Endpoint:" "$BASE_URL (unreachable)" "$RED"
  fi
}

# ══════════════════════════════════════════════════════════════
cmd_health() {
  local resp
  resp=$(curl -sf "$BASE_URL/api/health" 2>/dev/null)

  if [ -z "$resp" ]; then
    echo -e "${RED}Service unreachable at $BASE_URL${NC}"
    exit 1
  fi

  echo "$resp" | python3 -c "
import sys, json

d = json.load(sys.stdin)
w = d.get('workers', {})
m = d.get('memory', {})
status = d.get('status', 'unknown')

color = '\033[0;32m' if status == 'ok' else '\033[0;31m'
reset = '\033[0m'
bold  = '\033[1m'

print(f'{bold}Health Check{reset}')
print()
print(f'  {bold}Status{reset}       {color}{status}{reset}')
print(f'  {bold}Workers{reset}      {w.get(\"total\",\"?\")} total, {w.get(\"available\",\"?\")} available, {w.get(\"busy\",\"?\")} busy, {w.get(\"queued\",\"?\")} queued')
print(f'  {bold}Memory{reset}       {m.get(\"rss\",\"?\")} RSS, {m.get(\"heapUsed\",\"?\")} heap')
print(f'  {bold}Uptime{reset}       {d.get(\"uptime\",0):.1f}s')
print(f'  {bold}Endpoint{reset}     $BASE_URL')
"
}

# ══════════════════════════════════════════════════════════════
cmd_logs() {
  if is_docker; then
    if [ -n "$FOLLOW" ]; then
      docker compose logs -f --tail=50
    else
      docker compose logs --tail=50
    fi
  else
    if [ ! -f "$LOG_DIR/url2md.log" ]; then
      echo -e "${YELLOW}No log file found at $LOG_DIR/url2md.log${NC}"
      exit 1
    fi
    if [ -n "$FOLLOW" ]; then
      tail -f "$LOG_DIR/url2md.log"
    else
      tail -50 "$LOG_DIR/url2md.log"
    fi
  fi
}

# ══════════════════════════════════════════════════════════════
cmd_shell() {
  if ! is_docker; then
    echo -e "${RED}Shell command is only available in docker mode.${NC}"
    exit 1
  fi
  if ! container_running; then
    echo -e "${RED}Container is not running.${NC}"
    exit 1
  fi
  docker compose exec url2md /bin/sh
}

# ══════════════════════════════════════════════════════════════
case "${COMMAND:-}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_restart ;;
  status)  cmd_status ;;
  health)  cmd_health ;;
  logs)    cmd_logs ;;
  shell)   cmd_shell ;;
  "")      usage ;;
  *)       echo -e "${RED}Unknown command: $COMMAND${NC}"; usage; exit 1 ;;
esac
