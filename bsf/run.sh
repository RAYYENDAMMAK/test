#!/bin/sh
set -eu
: "${POD_IP:?POD_IP is required}"
SCP_IP="$(getent ahostsv4 scp-svc | awk 'NR==1 {print $1}')"
sed "s/\${POD_IP}/${POD_IP}/g; s/\${SCP_IP}/${SCP_IP}/g" /etc/open5gs/bsf.yaml.in > /tmp/bsf.yaml
exec open5gs-bsfd -c /tmp/bsf.yaml
