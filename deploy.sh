#!/bin/bash
# Deploy Open5GS 5G Core on Kubernetes
set -e

echo "Deploying Open5GS 5G Core..."

# Apply all manifests via kustomize
kubectl apply -k .

echo ""
echo "Waiting for MongoDB to be ready..."
kubectl rollout status statefulset/mongodb -n open5gs --timeout=120s

echo ""
echo "Deployment complete. Check status with:"
echo "  kubectl get pods -n open5gs"
echo "  kubectl get svc -n open5gs"
