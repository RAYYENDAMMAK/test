# Open5GS — built from official Ubuntu PPA
# All NF binaries in one image; NF selected via deployment command.
#
# Builds: open5gs:local
# Usage:  command: ["open5gs-amfd", "-c", "/etc/open5gs/amf.yaml"]
#
# NOTE: Ubuntu 22.04 (jammy) — the Open5GS PPA has no noble (24.04) pocket yet.

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Bring base image fully up to date first (avoids "held broken packages" conflict)
RUN apt-get update && apt-get upgrade -y

# Install prerequisites
RUN apt-get install -y \
        software-properties-common \
        gnupg curl wget ca-certificates \
        iproute2 iptables iputils-ping net-tools

# Add Open5GS PPA and install (Ubuntu 22.04 / jammy)
RUN add-apt-repository -y ppa:open5gs/latest && \
    apt-get update && \
    apt-get install -y open5gs && \
    rm -rf /var/lib/apt/lists/*

# Verify all expected NF binaries are present
RUN for nf in nrf scp ausf udm udr pcf nssf bsf amf smf upf; do \
      test -f /usr/bin/open5gs-${nf}d || \
        { echo "ERROR: open5gs-${nf}d not found"; exit 1; }; \
    done && echo "All NF binaries OK"

# Default configs are installed at /etc/open5gs/ by the package.
# They are overridden by ConfigMap mounts in Kubernetes.

CMD ["/bin/sh"]
