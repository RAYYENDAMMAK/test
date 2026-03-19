#!/bin/bash
# =============================================================================
#  5G Core Single-Server Installer
#  Open5GS + Custom UI on k3s (Lightweight Kubernetes)
#
#  Supported: Ubuntu 20.04 / 22.04 / 24.04, Debian 11/12
#  Requirements: 4+ vCPU, 8+ GB RAM, 40+ GB disk, root/sudo
#
#  Usage:
#    chmod +x install.sh
#    sudo ./install.sh
# =============================================================================

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
step()    { echo -e "\n${BOLD}${BLUE}▶ $*${NC}"; }

# ── Configuration (override via env) ─────────────────────────────────────────
NAMESPACE="${NAMESPACE:-open5gs}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32 2>/dev/null || echo 'change-me-in-production')}"
K3S_VERSION="${K3S_VERSION:-v1.35.1+k3s1}"
UI_IMAGE="${UI_IMAGE:-5gcore-ui:latest}"
INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/tmp/5gcore-install.log"

# ── Banner ────────────────────────────────────────────────────────────────────
echo -e "${BOLD}"
cat <<'EOF'
  ____  ____    ____
 | ___|/ ___|  / ___|___  _ __ ___
 |___ \| |  _ | |   / _ \| '__/ _ \
  ___) | |_| || |__| (_) | | |  __/
 |____/ \____|  \____\___/|_|  \___|
  5G Core — Single Server Installer
  Open5GS on k3s + Custom UI
EOF
echo -e "${NC}"

# ── Pre-flight checks ─────────────────────────────────────────────────────────
step "Pre-flight checks"

[[ $EUID -ne 0 ]] && error "Please run as root: sudo ./install.sh"

# OS detection
if [[ -f /etc/os-release ]]; then
  source /etc/os-release
  OS_ID="${ID}"
  OS_VERSION="${VERSION_ID}"
  info "Detected OS: ${PRETTY_NAME}"
else
  error "Cannot detect OS. Supported: Ubuntu 20.04+, Debian 11+"
fi

[[ "$OS_ID" != "ubuntu" && "$OS_ID" != "debian" ]] && \
  warn "Tested on Ubuntu/Debian. Proceeding anyway..."

# RAM check
TOTAL_RAM_GB=$(awk '/MemTotal/ {printf "%.0f", $2/1024/1024}' /proc/meminfo)
info "RAM: ${TOTAL_RAM_GB} GB"
[[ $TOTAL_RAM_GB -lt 6 ]] && warn "Recommended 8 GB RAM. You have ${TOTAL_RAM_GB} GB — may be tight."

# CPU check
CPU_CORES=$(nproc)
info "CPU cores: ${CPU_CORES}"
[[ $CPU_CORES -lt 4 ]] && warn "Recommended 4+ CPU cores. You have ${CPU_CORES}."

# Disk check
DISK_FREE_GB=$(df -BG / | awk 'NR==2 {print $4}' | tr -d G)
info "Free disk: ${DISK_FREE_GB} GB"
[[ $DISK_FREE_GB -lt 20 ]] && error "Need at least 20 GB free disk. Have ${DISK_FREE_GB} GB."

# Get server IP
SERVER_IP=$(hostname -I | awk '{print $1}')
info "Server IP: ${SERVER_IP}"

success "Pre-flight checks passed"

# ── Step 1: System packages ───────────────────────────────────────────────────
step "Installing system packages"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >> "$LOG_FILE" 2>&1
apt-get install -y -qq \
  curl wget git jq openssl ca-certificates gnupg lsb-release \
  net-tools iproute2 iptables nftables \
  linux-modules-extra-$(uname -r) 2>/dev/null || true \
  >> "$LOG_FILE" 2>&1

success "System packages installed"

# ── Step 2: Kernel modules for 5G UPF ────────────────────────────────────────
step "Configuring kernel modules for 5G UPF"

# Load required modules
for mod in tun xt_MASQUERADE nf_nat nf_conntrack ip_tables; do
  modprobe "$mod" 2>/dev/null || warn "Module $mod not available (may be built-in)"
done

# GTP module (may not be available on all kernels)
modprobe gtp 2>/dev/null || warn "GTP kernel module not available — UPF will use userspace GTP"

# Persist modules
cat > /etc/modules-load.d/5gcore.conf <<EOF
tun
xt_MASQUERADE
nf_nat
nf_conntrack
ip_tables
EOF

# Enable IP forwarding
cat > /etc/sysctl.d/99-5gcore.conf <<EOF
net.ipv4.ip_forward = 1
net.ipv6.conf.all.forwarding = 1
net.ipv4.conf.all.rp_filter = 0
net.ipv4.conf.default.rp_filter = 0
EOF
sysctl -p /etc/sysctl.d/99-5gcore.conf >> "$LOG_FILE" 2>&1

success "Kernel configured for 5G"

# ── Step 3: Docker (for building UI image) ────────────────────────────────────
step "Installing Docker"

if command -v docker &>/dev/null; then
  info "Docker already installed: $(docker --version)"
else
  curl -fsSL https://get.docker.com | sh >> "$LOG_FILE" 2>&1
  systemctl enable docker --now >> "$LOG_FILE" 2>&1
  success "Docker installed"
fi

# ── Step 4: k3s ───────────────────────────────────────────────────────────────
step "Installing k3s (lightweight Kubernetes)"

if command -v k3s &>/dev/null && k3s kubectl get nodes &>/dev/null 2>&1; then
  info "k3s already running: $(k3s --version | head -1)"
else
  info "Installing k3s ${K3S_VERSION}..."
  curl -sfL https://get.k3s.io | \
    INSTALL_K3S_VERSION="$K3S_VERSION" \
    INSTALL_K3S_EXEC="server \
      --disable=traefik \
      --write-kubeconfig-mode=644 \
      --node-name=5gcore-node" \
    sh - >> "$LOG_FILE" 2>&1

  # Wait for k3s to be ready
  info "Waiting for k3s to be ready..."
  for i in $(seq 1 30); do
    if k3s kubectl get nodes &>/dev/null 2>&1; then
      break
    fi
    sleep 3
  done

  success "k3s installed and running"
fi

# Set up kubeconfig
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
echo "export KUBECONFIG=/etc/rancher/k3s/k3s.yaml" >> /etc/environment

# Alias for convenience
if ! grep -q "alias kubectl=" /etc/bash.bashrc 2>/dev/null; then
  echo "alias kubectl='k3s kubectl'" >> /etc/bash.bashrc
fi

info "Kubernetes nodes:"
k3s kubectl get nodes

# ── Step 5: Install kubectl + kustomize ───────────────────────────────────────
step "Installing kubectl and kustomize"

# kubectl symlink
if ! command -v kubectl &>/dev/null; then
  ln -sf /usr/local/bin/k3s /usr/local/bin/kubectl
  info "kubectl linked to k3s"
fi

# kustomize
if ! command -v kustomize &>/dev/null; then
  curl -s "https://raw.githubusercontent.com/kubernetes-sigs/kustomize/master/hack/install_kustomize.sh" | \
    bash -s -- /usr/local/bin >> "$LOG_FILE" 2>&1
  success "kustomize installed"
else
  info "kustomize already installed"
fi

# ── Step 6: Build UI Docker image ─────────────────────────────────────────────
step "Building 5G Core UI image"

if [[ -d "$INSTALL_DIR/ui" ]]; then
  cd "$INSTALL_DIR/ui"

  # Check if Node.js is available for build, otherwise use Docker
  if command -v node &>/dev/null; then
    NODE_VER=$(node --version)
    info "Using Node.js $NODE_VER to build"
  else
    info "Node.js not found — will use Docker multi-stage build"
  fi

  info "Building Docker image: $UI_IMAGE (this may take a few minutes)..."
  docker build -t "$UI_IMAGE" . >> "$LOG_FILE" 2>&1

  # Import into k3s containerd
  info "Importing image into k3s containerd..."
  docker save "$UI_IMAGE" | k3s ctr images import - >> "$LOG_FILE" 2>&1

  cd "$INSTALL_DIR"
  success "UI image built and imported"
else
  warn "ui/ directory not found — skipping UI image build"
fi

# ── Step 7: Create namespace and secrets ─────────────────────────────────────
step "Creating namespace and configuration"

k3s kubectl apply -f - <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: ${NAMESPACE}
EOF

# Create secret for UI auth
k3s kubectl create secret generic core-ui-secrets \
  --namespace="$NAMESPACE" \
  --from-literal=ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  --from-literal=JWT_SECRET="$JWT_SECRET" \
  --dry-run=client -o yaml | k3s kubectl apply -f - >> "$LOG_FILE" 2>&1

success "Namespace and secrets created"

# ── Step 8: Update kustomization for single-node ──────────────────────────────
step "Configuring single-node deployment"

# Patch UI deployment to use the secret
cat > "$INSTALL_DIR/ui/k8s/env-patch.yaml" <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: core-ui
  namespace: ${NAMESPACE}
spec:
  template:
    spec:
      containers:
        - name: core-ui
          envFrom:
            - secretRef:
                name: core-ui-secrets
          image: ${UI_IMAGE}
          imagePullPolicy: Never
EOF

# Patch MongoDB to use k3s local-path storage class
cat > "$INSTALL_DIR/mongodb/storage-patch.yaml" <<EOF
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mongodb
  namespace: ${NAMESPACE}
spec:
  volumeClaimTemplates:
    - metadata:
        name: mongo-data
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: local-path
        resources:
          requests:
            storage: 10Gi
EOF

success "Single-node configuration applied"

# ── Step 9: Deploy 5G Core ────────────────────────────────────────────────────
step "Deploying Open5GS 5G Core"

cd "$INSTALL_DIR"

# Apply with kustomize
k3s kubectl apply -k . >> "$LOG_FILE" 2>&1 || {
  # Fallback: apply manifests directly
  warn "kustomize apply failed, trying direct apply..."
  for f in namespace.yaml mongodb/statefulset.yaml mongodb/service.yaml \
    nrf/configmap.yaml nrf/deployment.yaml nrf/service.yaml \
    ausf/configmap.yaml ausf/deployment.yaml ausf/service.yaml \
    udm/configmap.yaml udm/deployment.yaml udm/service.yaml \
    udr/configmap.yaml udr/deployment.yaml udr/service.yaml \
    pcf/configmap.yaml pcf/deployment.yaml pcf/service.yaml \
    nssf/configmap.yaml nssf/deployment.yaml nssf/service.yaml \
    bsf/configmap.yaml bsf/deployment.yaml bsf/service.yaml \
    amf/configmap.yaml amf/deployment.yaml amf/service.yaml \
    smf/configmap.yaml smf/deployment.yaml smf/service.yaml \
    upf/configmap.yaml upf/deployment.yaml upf/service.yaml \
    ui/k8s/rbac.yaml ui/k8s/deployment.yaml ui/k8s/service.yaml \
    ui/k8s/prometheus.yaml ui/k8s/grafana.yaml; do
    [[ -f "$f" ]] && k3s kubectl apply -f "$f" >> "$LOG_FILE" 2>&1 || true
  done
}

success "5G Core manifests applied"

# ── Step 10: Wait for core services ──────────────────────────────────────────
step "Waiting for services to start"

info "Waiting for MongoDB..."
k3s kubectl rollout status statefulset/mongodb -n "$NAMESPACE" --timeout=180s >> "$LOG_FILE" 2>&1 || \
  warn "MongoDB may still be starting..."

info "Waiting for NRF..."
k3s kubectl rollout status deployment/nrf -n "$NAMESPACE" --timeout=120s >> "$LOG_FILE" 2>&1 || \
  warn "NRF may still be starting..."

info "Waiting for AMF..."
k3s kubectl rollout status deployment/amf -n "$NAMESPACE" --timeout=120s >> "$LOG_FILE" 2>&1 || \
  warn "AMF may still be starting..."

info "Waiting for UI..."
k3s kubectl rollout status deployment/core-ui -n "$NAMESPACE" --timeout=120s >> "$LOG_FILE" 2>&1 || \
  warn "UI may still be starting..."

# ── Step 11: Get access info ──────────────────────────────────────────────────
step "Getting service endpoints"

sleep 5  # Let LoadBalancer IPs settle

UI_PORT=$(k3s kubectl get svc core-ui-svc -n "$NAMESPACE" \
  -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null || echo "80")

GRAFANA_PORT=$(k3s kubectl get svc grafana-svc -n "$NAMESPACE" \
  -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null || echo "3000")

AMF_IP=$(k3s kubectl get svc amf-svc -n "$NAMESPACE" \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "$SERVER_IP")

# ── Create management scripts ─────────────────────────────────────────────────
step "Creating management scripts"

cat > /usr/local/bin/5gcore-status <<'SCRIPT'
#!/bin/bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
echo ""
echo "=== 5G Core Status ==="
k3s kubectl get pods -n open5gs -o wide
echo ""
echo "=== Services ==="
k3s kubectl get svc -n open5gs
SCRIPT
chmod +x /usr/local/bin/5gcore-status

cat > /usr/local/bin/5gcore-logs <<'SCRIPT'
#!/bin/bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
NF="${1:-amf}"
echo "=== Logs for $NF ==="
k3s kubectl logs -n open5gs -l app="$NF" --tail=100 -f
SCRIPT
chmod +x /usr/local/bin/5gcore-logs

cat > /usr/local/bin/5gcore-restart <<'SCRIPT'
#!/bin/bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
NF="${1:-}"
if [[ -z "$NF" ]]; then
  echo "Usage: 5gcore-restart <nf-name>"
  echo "NFs: nrf ausf udm udr pcf nssf bsf amf smf upf"
  exit 1
fi
echo "Restarting $NF..."
k3s kubectl rollout restart deployment/"$NF" -n open5gs
k3s kubectl rollout status deployment/"$NF" -n open5gs
SCRIPT
chmod +x /usr/local/bin/5gcore-restart

success "Management scripts installed"

# ── Final summary ─────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║        5G Core Installation Complete!                    ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BOLD}Access URLs:${NC}"
echo -e "  ${CYAN}5G Core UI:${NC}      http://${SERVER_IP}:${UI_PORT}"
echo -e "  ${CYAN}Grafana:${NC}         http://${SERVER_IP}:${GRAFANA_PORT}"
echo -e "  ${CYAN}Prometheus:${NC}      http://${SERVER_IP}:9090"
echo ""
echo -e "${BOLD}Login Credentials:${NC}"
echo -e "  Username: ${YELLOW}admin${NC}"
echo -e "  Password: ${YELLOW}${ADMIN_PASSWORD}${NC}"
echo ""
echo -e "${BOLD}gNB/RAN Connection:${NC}"
echo -e "  AMF N2 (NGAP): ${CYAN}${AMF_IP}:38412${NC} (SCTP)"
echo -e "  PLMN:          ${CYAN}MCC=001, MNC=01${NC}"
echo -e "  TAC:           ${CYAN}1${NC}"
echo -e "  S-NSSAI:       ${CYAN}SST=1, SD=000001${NC}"
echo ""
echo -e "${BOLD}Management Commands:${NC}"
echo -e "  ${YELLOW}5gcore-status${NC}              # Show all pod/service status"
echo -e "  ${YELLOW}5gcore-logs amf${NC}            # Stream AMF logs"
echo -e "  ${YELLOW}5gcore-restart smf${NC}         # Restart a NF"
echo -e "  ${YELLOW}k3s kubectl get pods -n open5gs${NC}"
echo ""
echo -e "${BOLD}Install log:${NC} ${LOG_FILE}"
echo ""
echo -e "${YELLOW}Note:${NC} UPF may take an extra minute to initialize the TUN interface."
echo -e "      Run ${YELLOW}5gcore-status${NC} to check readiness."
echo ""
