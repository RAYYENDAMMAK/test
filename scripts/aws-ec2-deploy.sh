#!/usr/bin/env bash
# =============================================================================
#  AWS EC2 Deployment Script — IEEE 5G Core Testbed
#
#  Provisions an EC2 instance with Security Groups, optional extra ENIs
#  for Multus (N2/N3/N6 separation), and boots with cloud-init user-data
#  that auto-installs the 5G Core.
#
#  Prerequisites:
#    - AWS CLI v2 installed and configured (aws configure)
#    - An existing EC2 Key Pair in the target region
#
#  Usage:
#    chmod +x scripts/aws-ec2-deploy.sh
#    ./scripts/aws-ec2-deploy.sh
#
#  Environment overrides:
#    AWS_REGION       AWS region            (default: eu-west-3 / Paris)
#    INSTANCE_TYPE    EC2 instance type     (default: c5.xlarge)
#    KEY_NAME         EC2 key pair name     (required)
#    VPC_ID           Existing VPC ID       (default: default VPC)
#    SUBNET_ID        Subnet for instance   (default: first available)
#    MULTUS_ENIs      Attach extra ENIs     (default: true)
#    SLIM_MODE        Disable Grafana/Prom  (default: false)
#    REPO_URL         Git repo URL          (default: ieee-testbed repo)
#    BRANCH           Git branch            (default: master)
# =============================================================================
set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
step()    { echo -e "\n${BOLD}▶ $*${NC}"; }

# ── Configuration ─────────────────────────────────────────────────────────────
AWS_REGION="${AWS_REGION:-eu-west-3}"
INSTANCE_TYPE="${INSTANCE_TYPE:-c5.xlarge}"
KEY_NAME="${KEY_NAME:-}"
VPC_ID="${VPC_ID:-}"
SUBNET_ID="${SUBNET_ID:-}"
MULTUS_ENIs="${MULTUS_ENIs:-true}"
SLIM_MODE="${SLIM_MODE:-false}"
REPO_URL="${REPO_URL:-https://github.com/ieee-testbed/ieee_5g_core.git}"
BRANCH="${BRANCH:-master}"
DISK_SIZE_GB="${DISK_SIZE_GB:-80}"
TAG_PROJECT="ieee-5g-core"
TAG_ENV="${TAG_ENV:-testbed}"

# ── Banner ─────────────────────────────────────────────────────────────────────
echo -e "${BOLD}"
cat <<'EOF'
  _____ ____     ____
 | ____/ ___|   / ___|___  _ __ ___
 |  _|| |      | |   / _ \| '__/ _ \
 | |__| |___   | |__| (_) | | |  __/
 |_____\____|   \____\___/|_|  \___|
  AWS EC2 Deployment — IEEE 5G Core Testbed
EOF
echo -e "${NC}"

# ── Validate prerequisites ────────────────────────────────────────────────────
step "Validating prerequisites"

command -v aws &>/dev/null || error "AWS CLI not found. Install: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html"
aws sts get-caller-identity &>/dev/null || error "AWS credentials not configured. Run: aws configure"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
info "AWS Account: $ACCOUNT_ID  Region: $AWS_REGION"

[[ -z "$KEY_NAME" ]] && error "KEY_NAME is required. Set: export KEY_NAME=your-ec2-keypair"

# ── Instance type recommendation ─────────────────────────────────────────────
step "Instance type check"

case "$INSTANCE_TYPE" in
  c5.large)
    warn "c5.large has only 4 GB RAM — tight for the full stack."
    warn "MongoDB + 10 NFs + k3s need ~3.5 GB. SLIM_MODE will be enabled automatically."
    SLIM_MODE="true"
    info "Enabling SLIM_MODE (disabling Grafana + Prometheus to free RAM)"
    ;;
  c5.xlarge)
    info "c5.xlarge: 4 vCPU / 8 GB — minimum recommended for full stack ✓"
    ;;
  c5.2xlarge)
    info "c5.2xlarge: 8 vCPU / 16 GB — recommended for testbed with gNBs ✓"
    ;;
  c5.4xlarge|c5.9xlarge|c5.18xlarge)
    info "$INSTANCE_TYPE — plenty of headroom ✓"
    ;;
  *)
    warn "Unknown instance type $INSTANCE_TYPE — proceeding, but verify RAM ≥ 8 GB"
    ;;
esac

# ── Resolve VPC and Subnet ────────────────────────────────────────────────────
step "Resolving VPC and subnet"

if [[ -z "$VPC_ID" ]]; then
  VPC_ID=$(aws ec2 describe-vpcs \
    --region "$AWS_REGION" \
    --filters Name=isDefault,Values=true \
    --query 'Vpcs[0].VpcId' --output text)
  [[ "$VPC_ID" == "None" || -z "$VPC_ID" ]] && error "No default VPC found. Set VPC_ID explicitly."
  info "Using default VPC: $VPC_ID"
fi

if [[ -z "$SUBNET_ID" ]]; then
  SUBNET_ID=$(aws ec2 describe-subnets \
    --region "$AWS_REGION" \
    --filters Name=vpc-id,Values="$VPC_ID" \
    --query 'Subnets[0].SubnetId' --output text)
  [[ "$SUBNET_ID" == "None" || -z "$SUBNET_ID" ]] && error "No subnet found in VPC $VPC_ID. Set SUBNET_ID explicitly."
  info "Using subnet: $SUBNET_ID"
fi

# ── Get Ubuntu 24.04 LTS AMI (region-aware, via SSM parameter) ───────────────
step "Resolving Ubuntu 24.04 LTS AMI"

AMI_ID=$(aws ssm get-parameter \
  --region "$AWS_REGION" \
  --name "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id" \
  --query "Parameter.Value" --output text 2>/dev/null || true)

# Fallback: query EC2 directly
if [[ -z "$AMI_ID" || "$AMI_ID" == "None" ]]; then
  AMI_ID=$(aws ec2 describe-images \
    --region "$AWS_REGION" \
    --owners 099720109477 \
    --filters \
      "Name=name,Values=ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*" \
      "Name=state,Values=available" \
    --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
    --output text)
fi

[[ -z "$AMI_ID" || "$AMI_ID" == "None" ]] && error "Could not resolve Ubuntu 24.04 AMI in $AWS_REGION"
info "Ubuntu 24.04 LTS AMI: $AMI_ID"

# ── Create Security Group ─────────────────────────────────────────────────────
step "Creating Security Group"

SG_NAME="ieee-5g-core-sg-$(date +%s)"
SG_ID=$(aws ec2 create-security-group \
  --region "$AWS_REGION" \
  --group-name "$SG_NAME" \
  --description "IEEE 5G Core Testbed — NF + Dashboard ports" \
  --vpc-id "$VPC_ID" \
  --query 'GroupId' --output text)
info "Created Security Group: $SG_ID"

aws ec2 create-tags --region "$AWS_REGION" \
  --resources "$SG_ID" \
  --tags Key=Name,Value="$SG_NAME" Key=Project,Value="$TAG_PROJECT" Key=Env,Value="$TAG_ENV"

# SSH
aws ec2 authorize-security-group-ingress --region "$AWS_REGION" --group-id "$SG_ID" \
  --ip-permissions '[{"IpProtocol":"tcp","FromPort":22,"ToPort":22,"IpRanges":[{"CidrIp":"0.0.0.0/0","Description":"SSH"}]}]'

# Dashboard UI
aws ec2 authorize-security-group-ingress --region "$AWS_REGION" --group-id "$SG_ID" \
  --ip-permissions '[{"IpProtocol":"tcp","FromPort":8080,"ToPort":8080,"IpRanges":[{"CidrIp":"0.0.0.0/0","Description":"5G Core Dashboard"}]}]'

# NGAP N2 — SCTP/38412 (protocol 132)
aws ec2 authorize-security-group-ingress --region "$AWS_REGION" --group-id "$SG_ID" \
  --ip-permissions '[{"IpProtocol":"132","FromPort":38412,"ToPort":38412,"IpRanges":[{"CidrIp":"0.0.0.0/0","Description":"NGAP N2 SCTP"}]}]'

# GTP-U N3 — UDP/2152
aws ec2 authorize-security-group-ingress --region "$AWS_REGION" --group-id "$SG_ID" \
  --ip-permissions '[{"IpProtocol":"udp","FromPort":2152,"ToPort":2152,"IpRanges":[{"CidrIp":"0.0.0.0/0","Description":"GTP-U N3"}]}]'

# PFCP N4 — UDP/8805
aws ec2 authorize-security-group-ingress --region "$AWS_REGION" --group-id "$SG_ID" \
  --ip-permissions '[{"IpProtocol":"udp","FromPort":8805,"ToPort":8805,"IpRanges":[{"CidrIp":"0.0.0.0/0","Description":"PFCP N4"}]}]'

# SBI — TCP/7777
aws ec2 authorize-security-group-ingress --region "$AWS_REGION" --group-id "$SG_ID" \
  --ip-permissions '[{"IpProtocol":"tcp","FromPort":7777,"ToPort":7777,"IpRanges":[{"CidrIp":"0.0.0.0/0","Description":"SBI"}]}]'

# NodePort range (for kubectl port-forward and k3s NodePorts)
aws ec2 authorize-security-group-ingress --region "$AWS_REGION" --group-id "$SG_ID" \
  --ip-permissions '[{"IpProtocol":"tcp","FromPort":30000,"ToPort":32767,"IpRanges":[{"CidrIp":"0.0.0.0/0","Description":"K8s NodePorts"}]}]'

success "Security Group configured with all 5G ports"

# ── Build user-data ───────────────────────────────────────────────────────────
step "Preparing user-data"

USERDATA=$(cat <<USERDATA
#!/bin/bash
exec > /var/log/ieee-5g-install.log 2>&1
set -euo pipefail

# ── System setup ──────────────────────────────────────────────────────────────
export DEBIAN_FRONTEND=noninteractive
hostnamectl set-hostname ieee-5g-core
apt-get update -qq
apt-get install -y -qq git curl wget jq unzip

# ── Clone repo ────────────────────────────────────────────────────────────────
git clone --branch ${BRANCH} ${REPO_URL} /opt/ieee_5g_core
cd /opt/ieee_5g_core

# ── AWS-specific: patch Multus NADs to use ipvlan (macvlan not supported on EC2 ENIs) ──
sed -i 's/"type": *"macvlan"/"type": "ipvlan"/g' multus/01-nad-n2.yaml multus/02-nad-n3.yaml multus/04-nad-n6.yaml
sed -i 's/"mode": *"bridge"/"mode": "l2"/g'       multus/01-nad-n2.yaml multus/02-nad-n3.yaml multus/04-nad-n6.yaml

# ── Slim mode: disable Grafana + Prometheus to save RAM ──────────────────────
SLIM_MODE="${SLIM_MODE}"
if [[ "\$SLIM_MODE" == "true" ]]; then
  grep -v "prometheus\|grafana" kustomization.yaml > kustomization.yaml.tmp
  mv kustomization.yaml.tmp kustomization.yaml
  echo "[slim] Grafana and Prometheus disabled to conserve RAM on c5.large"
fi

# ── Run installer ─────────────────────────────────────────────────────────────
bash /opt/ieee_5g_core/install.sh

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "============================================="
echo " IEEE 5G Core installation complete!"
echo " Dashboard: http://\$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):8080"
echo " Log:       /var/log/ieee-5g-install.log"
echo "============================================="
USERDATA
)

# ── Launch EC2 instance ───────────────────────────────────────────────────────
step "Launching EC2 instance ($INSTANCE_TYPE)"

INSTANCE_ID=$(aws ec2 run-instances \
  --region "$AWS_REGION" \
  --image-id "$AMI_ID" \
  --instance-type "$INSTANCE_TYPE" \
  --key-name "$KEY_NAME" \
  --security-group-ids "$SG_ID" \
  --subnet-id "$SUBNET_ID" \
  --associate-public-ip-address \
  --block-device-mappings "[{
    \"DeviceName\":\"/dev/sda1\",
    \"Ebs\":{
      \"VolumeSize\":${DISK_SIZE_GB},
      \"VolumeType\":\"gp3\",
      \"Iops\":3000,
      \"Throughput\":125,
      \"DeleteOnTermination\":true
    }
  }]" \
  --user-data "$USERDATA" \
  --metadata-options "HttpTokens=required,HttpEndpoint=enabled" \
  --tag-specifications \
    "ResourceType=instance,Tags=[{Key=Name,Value=ieee-5g-core},{Key=Project,Value=${TAG_PROJECT}},{Key=Env,Value=${TAG_ENV}}]" \
    "ResourceType=volume,Tags=[{Key=Name,Value=ieee-5g-core-root},{Key=Project,Value=${TAG_PROJECT}}]" \
  --query 'Instances[0].InstanceId' --output text)

info "Instance launched: $INSTANCE_ID"

# ── Wait for instance to be running ──────────────────────────────────────────
step "Waiting for instance to be running"
aws ec2 wait instance-running --region "$AWS_REGION" --instance-ids "$INSTANCE_ID"

PUBLIC_IP=$(aws ec2 describe-instances \
  --region "$AWS_REGION" \
  --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)

success "Instance running: $INSTANCE_ID  →  $PUBLIC_IP"

# ── Attach extra ENIs for Multus (N2/N3 and N6) ──────────────────────────────
if [[ "$MULTUS_ENIs" == "true" ]]; then
  step "Attaching extra ENIs for Multus (N2/N3 + N6)"

  # ENI 1: N2/N3 RAN network (eth1)
  ENI1=$(aws ec2 create-network-interface \
    --region "$AWS_REGION" \
    --subnet-id "$SUBNET_ID" \
    --description "ieee-5g-core N2/N3 RAN interface" \
    --groups "$SG_ID" \
    --tag-specifications "ResourceType=network-interface,Tags=[{Key=Name,Value=5gcore-n2n3},{Key=Project,Value=${TAG_PROJECT}}]" \
    --query 'NetworkInterface.NetworkInterfaceId' --output text)
  aws ec2 attach-network-interface \
    --region "$AWS_REGION" \
    --instance-id "$INSTANCE_ID" \
    --network-interface-id "$ENI1" \
    --device-index 1
  # Ensure ENI is deleted when instance terminates
  aws ec2 modify-network-interface-attribute \
    --region "$AWS_REGION" \
    --network-interface-id "$ENI1" \
    --attachment "AttachmentId=$(aws ec2 describe-network-interfaces \
      --region "$AWS_REGION" \
      --network-interface-ids "$ENI1" \
      --query 'NetworkInterfaces[0].Attachment.AttachmentId' --output text),DeleteOnTermination=true"
  info "ENI 1 (N2/N3) attached: $ENI1 → eth1"

  # ENI 2: N6 Data Network (eth2)
  ENI2=$(aws ec2 create-network-interface \
    --region "$AWS_REGION" \
    --subnet-id "$SUBNET_ID" \
    --description "ieee-5g-core N6 Data Network interface" \
    --groups "$SG_ID" \
    --tag-specifications "ResourceType=network-interface,Tags=[{Key=Name,Value=5gcore-n6},{Key=Project,Value=${TAG_PROJECT}}]" \
    --query 'NetworkInterface.NetworkInterfaceId' --output text)
  aws ec2 attach-network-interface \
    --region "$AWS_REGION" \
    --instance-id "$INSTANCE_ID" \
    --network-interface-id "$ENI2" \
    --device-index 2
  aws ec2 modify-network-interface-attribute \
    --region "$AWS_REGION" \
    --network-interface-id "$ENI2" \
    --attachment "AttachmentId=$(aws ec2 describe-network-interfaces \
      --region "$AWS_REGION" \
      --network-interface-ids "$ENI2" \
      --query 'NetworkInterfaces[0].Attachment.AttachmentId' --output text),DeleteOnTermination=true"
  info "ENI 2 (N6) attached: $ENI2 → eth2"
  success "Multus ENIs attached (eth1=N2/N3, eth2=N6)"
fi

# ── Save deployment info ──────────────────────────────────────────────────────
DEPLOY_INFO="deploy-${INSTANCE_ID}.txt"
cat > "$DEPLOY_INFO" <<INFO
IEEE 5G Core — AWS EC2 Deployment
===================================
Date         : $(date -u +"%Y-%m-%d %H:%M UTC")
Instance ID  : $INSTANCE_ID
Instance Type: $INSTANCE_TYPE
Region       : $AWS_REGION
Public IP    : $PUBLIC_IP
AMI          : $AMI_ID (Ubuntu 24.04 LTS)
Security Group: $SG_ID
Disk         : ${DISK_SIZE_GB} GB gp3
Slim Mode    : $SLIM_MODE
Multus ENIs  : $MULTUS_ENIs
Repo         : $REPO_URL (branch: $BRANCH)

Access
------
SSH      : ssh -i ~/.ssh/${KEY_NAME}.pem ubuntu@${PUBLIC_IP}
Dashboard: http://${PUBLIC_IP}:8080  (admin / admin123)
Grafana  : http://${PUBLIC_IP}:3000  (disabled in slim mode)

gNB Connection (N2/NGAP)
------------------------
AMF IP   : ${PUBLIC_IP}  (or eth1 IP if using Multus)
Port     : 38412
Protocol : SCTP
MCC/MNC  : 001/01
TAC      : 1

Install log (on instance):
  ssh ubuntu@${PUBLIC_IP} -i ~/.ssh/${KEY_NAME}.pem
  sudo tail -f /var/log/ieee-5g-install.log
INFO
info "Deployment info saved: $DEPLOY_INFO"

# ── Final summary ─────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║   EC2 instance launched — installation running in background ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Instance:    ${CYAN}$INSTANCE_ID${NC}  ($INSTANCE_TYPE)"
echo -e "  Public IP:   ${CYAN}$PUBLIC_IP${NC}"
echo -e "  Region:      ${CYAN}$AWS_REGION${NC}"
echo ""
echo -e "  ${BOLD}Monitor installation (takes ~10 min):${NC}"
echo -e "  ${YELLOW}ssh -i ~/.ssh/${KEY_NAME}.pem ubuntu@${PUBLIC_IP}${NC}"
echo -e "  ${YELLOW}sudo tail -f /var/log/ieee-5g-install.log${NC}"
echo ""
echo -e "  ${BOLD}Dashboard (ready after install):${NC}"
echo -e "  ${CYAN}http://${PUBLIC_IP}:8080${NC}  →  admin / admin123"
echo ""
if [[ "$SLIM_MODE" == "true" ]]; then
  echo -e "  ${YELLOW}[Slim Mode]${NC} Grafana and Prometheus disabled (c5.large RAM limit)"
  echo -e "  To enable later: upgrade to c5.xlarge and re-run with SLIM_MODE=false"
  echo ""
fi
echo -e "  Deployment details saved to: ${YELLOW}${DEPLOY_INFO}${NC}"
echo ""
