#!/bin/sh
set -eu
: "${POD_IP:?POD_IP is required}"
sed "s/\${POD_IP}/${POD_IP}/g" /etc/open5gs/scp.yaml.in > /tmp/scp.yaml
exec open5gs-scpd -c /tmp/scp.yaml
