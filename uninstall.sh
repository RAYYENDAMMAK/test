#!/bin/bash
# Remove 5G Core deployment
set -e

export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

echo "Removing 5G Core from Kubernetes..."
kubectl delete namespace open5gs --ignore-not-found=true

read -p "Also uninstall k3s completely? [y/N] " ans
if [[ "$ans" =~ ^[Yy]$ ]]; then
  /usr/local/bin/k3s-uninstall.sh 2>/dev/null || true
  rm -f /usr/local/bin/5gcore-status /usr/local/bin/5gcore-logs /usr/local/bin/5gcore-restart
  echo "k3s removed."
fi

echo "Done."
