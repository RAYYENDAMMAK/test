# Open5GS — built from official Ubuntu PPA
# All NF binaries in one image; NF selected via deployment command.
#
# Builds: open5gs:local
# Usage:  command: ["open5gs-amfd", "-c", "/etc/open5gs/amf.yaml"]

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Install Open5GS from the official PPA (Ubuntu 24.04 / noble)
RUN apt-get update -qq && \
    apt-get install -y -qq \
        software-properties-common \
        gnupg curl wget ca-certificates \
        iproute2 iptables iputils-ping net-tools && \
    add-apt-repository -y ppa:open5gs/latest && \
    apt-get update -qq && \
    apt-get install -y -qq --no-install-recommends open5gs && \
    rm -rf /var/lib/apt/lists/*

# Verify all expected NF binaries are present
RUN for nf in nrf scp ausf udm udr pcf nssf bsf amf smf upf; do \
      test -f /usr/bin/open5gs-${nf}d || \
        { echo "ERROR: open5gs-${nf}d not found"; exit 1; }; \
    done && echo "All NF binaries OK"

# Default configs are installed at /etc/open5gs/ by the package.
# They are overridden by ConfigMap mounts in Kubernetes.

CMD ["/bin/sh"]
