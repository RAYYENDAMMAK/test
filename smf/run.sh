#!/bin/sh
set -eu
: "${POD_IP:?POD_IP is required}"
SCP_IP="$(getent ahostsv4 scp-svc | awk 'NR==1 {print $1}')"
UPF_IP="$(getent ahostsv4 upf-svc | awk 'NR==1 {print $1}')"
sed "s/\${POD_IP}/${POD_IP}/g; s/\${SCP_IP}/${SCP_IP}/g; s/\${UPF_IP}/${UPF_IP}/g" /etc/open5gs/smf.yaml.in > /tmp/smf.yaml
exec open5gs-smfd -c /tmp/smf.yaml
