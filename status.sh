#!/bin/bash
# Show status of Open5GS deployment
echo "=== Pods ==="
kubectl get pods -n open5gs -o wide

echo ""
echo "=== Services ==="
kubectl get svc -n open5gs

echo ""
echo "=== Events (last 20) ==="
kubectl get events -n open5gs --sort-by='.lastTimestamp' | tail -20
