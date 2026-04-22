#!/bin/sh
set -eu
: "${POD_IP:?POD_IP is required}"
sed "s/\${POD_IP}/${POD_IP}/g" /etc/open5gs/nrf.yaml.in > /tmp/nrf.yaml
exec open5gs-nrfd -c /tmp/nrf.yaml
