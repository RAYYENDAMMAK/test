#!/bin/sh
set -eu
: "${POD_IP:?POD_IP is required}"
sed "s/\${POD_IP}/${POD_IP}/g" /etc/open5gs/amf.yaml.in > /tmp/amf.yaml
exec open5gs-amfd -c /tmp/amf.yaml
