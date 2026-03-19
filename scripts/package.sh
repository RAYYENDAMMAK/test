#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  package.sh — Build minimal deployment package
#
#  Creates: ieee_5g_core_deploy_v{VERSION}.tar.gz
#
#  The package contains only the bootstrap entry point.
#  All manifests, configs, and source are pulled from the Git repo at deploy time.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."
VERSION=$(git -C "$ROOT" describe --tags --always 2>/dev/null || echo "dev")
REPO_URL=$(git -C "$ROOT" remote get-url origin 2>/dev/null || echo "https://github.com/ieee-testbed/ieee_5g_core.git")
BRANCH=$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "master")
PKG_NAME="ieee_5g_core_deploy_v${VERSION}"
PKG_DIR="/tmp/${PKG_NAME}"
OUT="$ROOT/${PKG_NAME}.tar.gz"

echo "Building deployment package ${PKG_NAME}..."
rm -rf "$PKG_DIR" && mkdir -p "$PKG_DIR"

# ── bootstrap.sh ──────────────────────────────────────────────────────────────
cat > "$PKG_DIR/bootstrap.sh" << BOOTSTRAP
#!/usr/bin/env bash
set -euo pipefail
# ─────────────────────────────────────────────────────────────────────────────
#  IEEE 5G Core Testbed — Bootstrap Installer
#  Version: ${VERSION}
#  Repo:    ${REPO_URL}  (branch: ${BRANCH})
# ─────────────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "\${GREEN}[✓]\${NC} \$1"; }
warn()  { echo -e "\${YELLOW}[⚠]\${NC} \$1"; }
error() { echo -e "\${RED}[✗]\${NC} \$1"; exit 1; }

REPO_URL="${REPO_URL}"
BRANCH="${BRANCH}"
INSTALL_DIR="\${INSTALL_DIR:-/opt/ieee_5g_core}"
LICENSE_DEST="/etc/ieee5g/license.jwt"

echo ""
echo "  IEEE 5G Core Testbed — Deployment Bootstrap"
echo "  ─────────────────────────────────────────────"
echo ""

# 1. Locate license file
LICENSE_SRC="\${1:-}"
if [[ -z "\$LICENSE_SRC" ]]; then
  read -rp "  Path to license.jwt: " LICENSE_SRC
fi
[[ -f "\$LICENSE_SRC" ]] || error "License file not found: \$LICENSE_SRC"

# 2. Check prerequisites
for cmd in git curl kubectl; do
  command -v "\$cmd" &>/dev/null || error "\$cmd is required but not installed."
done

# 3. Print cluster UID (for license verification info)
CLUSTER_UID=\$(kubectl get namespace kube-system -o jsonpath='{.metadata.uid}' 2>/dev/null || echo "unknown")
info "Cluster UID: \$CLUSTER_UID"

# 4. Clone or update repo
if [[ -d "\$INSTALL_DIR/.git" ]]; then
  info "Updating existing repo at \$INSTALL_DIR..."
  git -C "\$INSTALL_DIR" fetch origin
  git -C "\$INSTALL_DIR" checkout "\$BRANCH"
  git -C "\$INSTALL_DIR" pull origin "\$BRANCH"
else
  info "Cloning repo into \$INSTALL_DIR..."
  sudo mkdir -p "\$INSTALL_DIR"
  sudo chown "\$(whoami)" "\$INSTALL_DIR"
  git clone --branch "\$BRANCH" "\$REPO_URL" "\$INSTALL_DIR"
fi

# 5. Install system dependencies (k3s, tools)
info "Running system installer..."
bash "\$INSTALL_DIR/install.sh"

# 6. Install license file
info "Installing license..."
sudo mkdir -p /etc/ieee5g
sudo cp "\$LICENSE_SRC" "\$LICENSE_DEST"
sudo chmod 600 "\$LICENSE_DEST"
info "License installed at \$LICENSE_DEST"

# 7. Deploy to Kubernetes
info "Deploying 5G Core to Kubernetes..."
kubectl apply -k "\$INSTALL_DIR"

# 8. Wait for rollout
info "Waiting for core NFs to be ready..."
for deploy in nrf ausf udm udr pcf amf smf upf; do
  kubectl rollout status deployment/\$deploy -n open5gs --timeout=120s || \
    warn "\$deploy not ready yet — check: kubectl get pods -n open5gs"
done

echo ""
info "Deployment complete!"
echo ""
echo "  Dashboard:  kubectl port-forward svc/core-ui-svc 8080:80 -n open5gs"
echo "              http://localhost:8080  (admin / admin123)"
echo ""
echo "  Cluster UID for license request:"
echo "    kubectl get ns kube-system -o jsonpath='{.metadata.uid}'"
echo ""
BOOTSTRAP
chmod +x "$PKG_DIR/bootstrap.sh"

# ── README ─────────────────────────────────────────────────────────────────────
cat > "$PKG_DIR/README.txt" << README
IEEE 5G Core Testbed — Deployment Package
==========================================
Version : ${VERSION}
Repo    : ${REPO_URL}
Branch  : ${BRANCH}

REQUIREMENTS
  - Ubuntu 22.04 / 24.04 LTS (fresh install recommended)
  - 4 vCPU, 8 GB RAM minimum
  - Internet access (to pull from GitHub and container registries)
  - A valid license.jwt (contact ieee-testbed to obtain one)

GETTING YOUR LICENSE
  1. Get your cluster UID AFTER k3s is installed:
       kubectl get ns kube-system -o jsonpath='{.metadata.uid}'
  2. Send it to ieee-testbed to receive your license.jwt

INSTALLATION
  bash bootstrap.sh /path/to/license.jwt

  Or with a custom install directory:
  INSTALL_DIR=/opt/my5gcore bash bootstrap.sh license.jwt

WHAT BOOTSTRAP DOES
  1. Checks prerequisites (git, curl, kubectl)
  2. Clones ${REPO_URL} (branch: ${BRANCH})
  3. Runs install.sh  — installs k3s + system dependencies
  4. Installs license.jwt → /etc/ieee5g/license.jwt
  5. Deploys all 5G Core NFs via kubectl apply -k
  6. Waits for NRF / AUSF / UDM / UDR / PCF / AMF / SMF / UPF to be ready

AFTER INSTALLATION
  kubectl get pods -n open5gs           # check all pods running
  kubectl port-forward svc/core-ui-svc 8080:80 -n open5gs
  open http://localhost:8080            # login: admin / admin123

SUPPORT
  GitHub: ${REPO_URL}
README

# ── Build tarball ──────────────────────────────────────────────────────────────
tar -czf "$OUT" -C "/tmp" "$PKG_NAME"
rm -rf "$PKG_DIR"

SIZE=$(du -sh "$OUT" | cut -f1)
echo ""
echo "✓ Package built: ${OUT} (${SIZE})"
echo ""
echo "  Contains only:"
echo "    bootstrap.sh  — pulls repo from Git, runs install, deploys"
echo "    README.txt    — installation instructions"
echo ""
echo "  To distribute: send this tarball + a license.jwt to each site"
