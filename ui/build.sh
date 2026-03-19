#!/bin/bash
# Build and push 5G Core UI Docker image
set -e

IMAGE_NAME=${IMAGE_NAME:-"core-ui"}
TAG=${TAG:-"latest"}

echo "Building 5G Core UI image: ${IMAGE_NAME}:${TAG}"
docker build -t "${IMAGE_NAME}:${TAG}" .

echo ""
echo "Build complete. To load into k3s/kind:"
echo "  k3s ctr images import <(docker save ${IMAGE_NAME}:${TAG})"
echo "  kind load docker-image ${IMAGE_NAME}:${TAG}"
echo ""
echo "To push to registry:"
echo "  docker tag ${IMAGE_NAME}:${TAG} your-registry/${IMAGE_NAME}:${TAG}"
echo "  docker push your-registry/${IMAGE_NAME}:${TAG}"
