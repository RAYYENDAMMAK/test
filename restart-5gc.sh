#!/bin/bash

NAMESPACE="open5gs"

echo "Restarting Open5GS Control Plane..."
kubectl rollout restart deployment/nrf -n $NAMESPACE
kubectl rollout restart deployment/scp -n $NAMESPACE
kubectl rollout restart deployment/amf -n $NAMESPACE
kubectl rollout restart deployment/smf -n $NAMESPACE
kubectl rollout restart deployment/ausf -n $NAMESPACE
kubectl rollout restart deployment/udm -n $NAMESPACE
kubectl rollout restart deployment/udr -n $NAMESPACE
kubectl rollout restart deployment/pcf -n $NAMESPACE
kubectl rollout restart deployment/nssf -n $NAMESPACE
kubectl rollout restart deployment/bsf -n $NAMESPACE
kubectl rollout restart deployment/webui -n $NAMESPACE

echo "Restarting User Plane (UPF)..."
kubectl rollout restart deployment/upf -n $NAMESPACE

echo "Restarting MongoDB..."
# MongoDB is a StatefulSet
kubectl delete pods -l app=mongodb -n $NAMESPACE

# gNB is a StatefulSet
kubectl delete pods -l app=ueransim-gnb -n $NAMESPACE

echo "Restarting UERANSIM..."
kubectl rollout restart deployment/ueransim-ue -n $NAMESPACE


echo "Waiting for pods to be ready..."
kubectl get pods -n $NAMESPACE -w
