#!/bin/sh
set -eu

: "${POD_IP:?POD_IP is required}"

AMF_SERVICE_IP="$(getent ahostsv4 amf-svc.open5gs.svc.cluster.local | awk 'NR==1 {print $1}')"

if [ -z "${AMF_SERVICE_IP}" ]; then
  echo "Failed to resolve amf-svc.open5gs.svc.cluster.local" >&2
  exit 1
fi

export GNB_POD_IP="${POD_IP}"
export AMF_SERVICE_IP

envsubst < /etc/ueransim/gnb-template.yaml > /tmp/gnb.yaml

exec nr-gnb -c /tmp/gnb.yaml -l
