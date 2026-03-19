#!/bin/bash
# Remove Open5GS 5G Core from Kubernetes
kubectl delete -k . --ignore-not-found=true
kubectl delete namespace open5gs --ignore-not-found=true
echo "Teardown complete."
