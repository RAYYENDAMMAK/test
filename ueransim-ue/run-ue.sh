#!/bin/sh
set -eu

GNB_RLS_IP="$(getent ahostsv4 ueransim-gnb-0.ueransim-gnb.open5gs.svc.cluster.local | awk 'NR==1 {print $1}')"

if [ -z "${GNB_RLS_IP}" ]; then
  echo "Failed to resolve ueransim-gnb-0.ueransim-gnb.open5gs.svc.cluster.local" >&2
  exit 1
fi

export GNB_RLS_IP
: "${UE_COUNT:=1}"

envsubst < /etc/ueransim/ue-template.yaml > /tmp/ue.yaml

echo "Starting ${UE_COUNT} UE(s)..."
exec nr-ue -c /tmp/ue.yaml -n "${UE_COUNT}" -l
