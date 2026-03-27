#!/usr/bin/env bash
# =============================================================================
#  IEEE 5G Core — Diagnostic Report Script
#
#  Runs a full health check and saves a report to:
#    /tmp/ieee5g-diagnostics-<timestamp>.txt
#
#  Usage:
#    sudo bash scripts/diagnostics.sh
#    sudo bash scripts/diagnostics.sh --out /path/to/report.txt
# =============================================================================

set -uo pipefail

# ── Output file ───────────────────────────────────────────────────────────────
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
OUT="${1:-}"
if [[ "$OUT" == "--out" ]]; then OUT="$2"; fi
REPORT="${OUT:-/tmp/ieee5g-diagnostics-${TIMESTAMP}.txt}"

NAMESPACE="open5gs"
KUBECTL="k3s kubectl"
command -v k3s &>/dev/null || KUBECTL="kubectl"

# ── Colors (terminal only) ────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
  CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; CYAN=''; BOLD=''; NC=''
fi

PASS="${GREEN}[PASS]${NC}"
FAIL="${RED}[FAIL]${NC}"
WARN="${YELLOW}[WARN]${NC}"
INFO="${CYAN}[INFO]${NC}"

# ── Helpers ───────────────────────────────────────────────────────────────────
section()  { echo -e "\n${BOLD}━━━ $* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }
pass()     { echo -e "  ${PASS}  $*"; }
fail()     { echo -e "  ${FAIL}  $*"; FAILURES=$((FAILURES+1)); }
warn()     { echo -e "  ${WARN}  $*"; WARNINGS=$((WARNINGS+1)); }
info()     { echo -e "  ${INFO}  $*"; }

FAILURES=0
WARNINGS=0

# ── Tee to report file ────────────────────────────────────────────────────────
exec > >(tee "$REPORT") 2>&1

echo -e "${BOLD}"
cat <<'BANNER'
  _____ ____     ____
 | ____/ ___|   / ___|___  _ __ ___
 |  _|| |      | |   / _ \| '__/ _ \
 | |__| |___   | |__| (_) | | |  __/
 |_____\____|   \____\___/|_|  \___|
  IEEE 5G Core — Diagnostic Report
BANNER
echo -e "${NC}"
echo "  Generated : $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "  Host      : $(hostname)"
echo "  Report    : $REPORT"

# =============================================================================
section "1. SYSTEM RESOURCES"
# =============================================================================

# OS
OS=$(grep PRETTY_NAME /etc/os-release 2>/dev/null | cut -d= -f2 | tr -d '"')
info "OS: $OS"

# RAM
TOTAL_RAM=$(free -m | awk '/^Mem:/{print $2}')
USED_RAM=$(free -m  | awk '/^Mem:/{print $3}')
FREE_RAM=$(free -m  | awk '/^Mem:/{print $7}')
info "RAM: ${USED_RAM}MB used / ${TOTAL_RAM}MB total (${FREE_RAM}MB available)"
if (( TOTAL_RAM < 7000 )); then
  fail "RAM < 8 GB — may cause OOM kills"
elif (( FREE_RAM < 1000 )); then
  warn "Less than 1 GB RAM free — system under pressure"
else
  pass "RAM OK (${TOTAL_RAM}MB total, ${FREE_RAM}MB free)"
fi

# CPU
CPUS=$(nproc)
info "CPU cores: $CPUS"
LOAD=$(cut -d' ' -f1 /proc/loadavg)
info "Load average (1m): $LOAD"
if (( CPUS < 2 )); then
  fail "Less than 2 CPU cores"
else
  pass "CPU OK ($CPUS cores)"
fi

# Disk
DISK_FREE=$(df -BG / | awk 'NR==2{gsub("G","",$4); print $4}')
info "Disk free on /: ${DISK_FREE} GB"
if (( DISK_FREE < 10 )); then
  fail "Less than 10 GB free disk space"
elif (( DISK_FREE < 20 )); then
  warn "Less than 20 GB free disk — consider cleanup"
else
  pass "Disk OK (${DISK_FREE} GB free)"
fi

# Kernel modules for UPF
section "2. KERNEL MODULES (UPF)"
for mod in tun xt_nat xt_MASQUERADE; do
  if lsmod | grep -q "^${mod}"; then
    pass "Module loaded: $mod"
  else
    fail "Module NOT loaded: $mod  (run: sudo modprobe $mod)"
  fi
done

# IP forwarding
IPV4_FWD=$(cat /proc/sys/net/ipv4/ip_forward)
if [[ "$IPV4_FWD" == "1" ]]; then
  pass "IP forwarding enabled"
else
  fail "IP forwarding disabled  (run: sudo sysctl -w net.ipv4.ip_forward=1)"
fi

# =============================================================================
section "3. DOCKER"
# =============================================================================
if command -v docker &>/dev/null; then
  DOCKER_VER=$(docker --version 2>/dev/null)
  pass "Docker installed: $DOCKER_VER"
  if docker info &>/dev/null 2>&1; then
    pass "Docker daemon running"
  else
    warn "Docker installed but daemon not running (not required if image already imported)"
  fi
else
  warn "Docker not installed (only needed for initial image build)"
fi

# =============================================================================
section "4. KUBERNETES (k3s)"
# =============================================================================
if ! command -v k3s &>/dev/null; then
  fail "k3s not found"
else
  K3S_VER=$(k3s --version | head -1)
  pass "k3s installed: $K3S_VER"

  if $KUBECTL get nodes &>/dev/null 2>&1; then
    pass "Kubernetes API reachable"
    echo ""
    $KUBECTL get nodes -o wide 2>/dev/null | sed 's/^/    /'
  else
    fail "Kubernetes API not reachable — is k3s running?"
  fi
fi

# =============================================================================
section "5. NAMESPACE & PODS"
# =============================================================================
if ! $KUBECTL get ns "$NAMESPACE" &>/dev/null 2>&1; then
  fail "Namespace '$NAMESPACE' does not exist — installation may not have completed"
else
  pass "Namespace '$NAMESPACE' exists"

  echo ""
  $KUBECTL get pods -n "$NAMESPACE" -o wide 2>/dev/null | sed 's/^/    /' || true
  echo ""

  # Check each expected NF
  EXPECTED_NFS="nrf ausf udm udr pcf nssf bsf amf smf upf mongodb 5gcore-ui"
  ALL_OK=true
  for nf in $EXPECTED_NFS; do
    POD=$($KUBECTL get pods -n "$NAMESPACE" -l "app=$nf" \
          --field-selector=status.phase=Running \
          -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)
    if [[ -n "$POD" ]]; then
      READY=$($KUBECTL get pod "$POD" -n "$NAMESPACE" \
              -o jsonpath='{.status.containerStatuses[0].ready}' 2>/dev/null || echo "false")
      if [[ "$READY" == "true" ]]; then
        pass "Pod OK: $nf ($POD)"
      else
        fail "Pod NOT ready: $nf ($POD)"
        ALL_OK=false
      fi
    else
      fail "Pod NOT running: $nf"
      ALL_OK=false
    fi
  done

  # CrashLoopBackOff check
  CRASH=$($KUBECTL get pods -n "$NAMESPACE" 2>/dev/null \
          | grep -c "CrashLoopBackOff" || true)
  if (( CRASH > 0 )); then
    fail "$CRASH pod(s) in CrashLoopBackOff"
  fi

  PENDING=$($KUBECTL get pods -n "$NAMESPACE" 2>/dev/null \
            | grep -c "Pending" || true)
  if (( PENDING > 0 )); then
    warn "$PENDING pod(s) still Pending"
  fi
fi

# =============================================================================
section "6. SERVICES & PORTS"
# =============================================================================
echo ""
$KUBECTL get svc -n "$NAMESPACE" 2>/dev/null | sed 's/^/    /' || true
echo ""

SERVER_IP=$(hostname -I | awk '{print $1}')
info "Server IP: $SERVER_IP"

# Dashboard
if curl -sf --max-time 5 "http://${SERVER_IP}:8080" -o /dev/null; then
  pass "Dashboard reachable: http://${SERVER_IP}:8080"
else
  fail "Dashboard NOT reachable on port 8080"
fi

# NRF SBI
NRF_RESP=$(curl -sf --max-time 5 "http://${SERVER_IP}:7777/nnrf-nfm/v1/nf-instances" 2>/dev/null || true)
if [[ -n "$NRF_RESP" ]]; then
  NF_COUNT=$(echo "$NRF_RESP" | grep -o '"nfInstanceId"' | wc -l || echo "0")
  pass "NRF SBI reachable — $NF_COUNT NF(s) registered"
else
  fail "NRF SBI not reachable on port 7777"
fi

# NGAP port (SCTP/38412) — check socket
if ss -lnp | grep -q ":38412"; then
  pass "AMF NGAP port 38412 listening (SCTP)"
else
  warn "AMF NGAP port 38412 not detected on host — may be inside pod network"
fi

# GTP-U port
if ss -lunp | grep -q ":2152"; then
  pass "UPF GTP-U port 2152 listening (UDP)"
else
  warn "UPF GTP-U port 2152 not detected on host — may be inside pod network"
fi

# =============================================================================
section "7. MONGODB"
# =============================================================================
MONGO_POD=$($KUBECTL get pods -n "$NAMESPACE" -l app=mongodb \
            -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)
if [[ -n "$MONGO_POD" ]]; then
  MONGO_PING=$($KUBECTL exec -n "$NAMESPACE" "$MONGO_POD" -- \
               mongosh --quiet --eval "db.adminCommand('ping').ok" 2>/dev/null || echo "0")
  if [[ "$MONGO_PING" == "1" ]]; then
    pass "MongoDB ping OK ($MONGO_POD)"
    # Check open5gs database
    DB_CHECK=$($KUBECTL exec -n "$NAMESPACE" "$MONGO_POD" -- \
               mongosh --quiet --eval \
               "db.getSiblingDB('open5gs').getCollectionNames().length" 2>/dev/null || echo "?")
    info "open5gs DB collections: $DB_CHECK"
  else
    fail "MongoDB ping failed"
  fi
else
  fail "MongoDB pod not found"
fi

# =============================================================================
section "8. NF LOG SNAPSHOT (last 5 lines each)"
# =============================================================================
for nf in amf smf upf; do
  POD=$($KUBECTL get pods -n "$NAMESPACE" -l "app=$nf" \
        -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)
  if [[ -n "$POD" ]]; then
    echo -e "\n  ${BOLD}$nf ($POD):${NC}"
    $KUBECTL logs -n "$NAMESPACE" "$POD" --tail=5 2>/dev/null \
      | grep -v "^$" | sed 's/^/    /' || true
  fi
done

# =============================================================================
section "9. MULTUS CNI"
# =============================================================================
if $KUBECTL get ds -n kube-system multus &>/dev/null 2>&1; then
  DESIRED=$($KUBECTL get ds -n kube-system multus \
            -o jsonpath='{.status.desiredNumberScheduled}' 2>/dev/null || echo "?")
  READY=$($KUBECTL get ds -n kube-system multus \
          -o jsonpath='{.status.numberReady}' 2>/dev/null || echo "?")
  if [[ "$DESIRED" == "$READY" ]]; then
    pass "Multus DaemonSet OK ($READY/$DESIRED ready)"
  else
    fail "Multus DaemonSet not fully ready ($READY/$DESIRED)"
  fi

  # NADs
  echo ""
  $KUBECTL get network-attachment-definitions -n "$NAMESPACE" 2>/dev/null \
    | sed 's/^/    /' || true
else
  info "Multus not installed (optional — only needed for dedicated N2/N3/N4/N6 interfaces)"
fi

# =============================================================================
section "10. SUMMARY"
# =============================================================================
echo ""
if (( FAILURES == 0 && WARNINGS == 0 )); then
  echo -e "  ${GREEN}${BOLD}ALL CHECKS PASSED${NC} — 5G Core looks healthy"
elif (( FAILURES == 0 )); then
  echo -e "  ${YELLOW}${BOLD}${WARNINGS} WARNING(S)${NC} — Core running but review warnings above"
else
  echo -e "  ${RED}${BOLD}${FAILURES} FAILURE(S)${NC}  ${YELLOW}${WARNINGS} WARNING(S)${NC}"
  echo -e "  Review the FAIL items above and fix before connecting gNBs"
fi

echo ""
echo -e "  Full report saved to: ${CYAN}${REPORT}${NC}"
echo ""
