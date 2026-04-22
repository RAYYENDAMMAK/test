#!/bin/sh
set -eu
: "${POD_IP:?POD_IP is required}"
NRF_IP="$(getent ahostsv4 nrf-svc | awk 'NR==1 {print $1}')"
SCP_IP="$(getent ahostsv4 scp-svc | awk 'NR==1 {print $1}')"
sed "s/\${POD_IP}/${POD_IP}/g; s/\${NRF_IP}/${NRF_IP}/g; s/\${SCP_IP}/${SCP_IP}/g" /etc/open5gs/nssf.yaml.in > /tmp/nssf.yaml
exec open5gs-nssfd -c /tmp/nssf.yaml
