FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    ca-certificates \
    cmake \
    gcc \
    gettext-base \
    git \
    g++ \
    iproute2 \
    iputils-ping \
    libsctp-dev \
    lksctp-tools \
    make \
    net-tools \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt

RUN git clone --depth 1 https://github.com/aligungr/UERANSIM.git

WORKDIR /opt/UERANSIM

RUN make -j"$(nproc)"

ENV PATH="/opt/UERANSIM/build:${PATH}"

CMD ["/bin/sh"]
