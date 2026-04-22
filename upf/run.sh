#!/bin/sh
set -eu
: "${POD_IP:?POD_IP is required}"
sed "s/\${POD_IP}/${POD_IP}/g" /etc/open5gs/upf.yaml.in > /tmp/upf.yaml
exec open5gs-upfd -c /tmp/upf.yaml
