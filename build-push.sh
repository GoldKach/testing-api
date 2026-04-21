#!/bin/bash

# GitHub Container Registry push script
# Usage: ./build-push.sh [frontend|backend|all]

set -e

REGISTRY="ghcr.io/goldkach"
IMAGE_NAME="investment-platform"

VERSION=${1:-latest}

build_frontend() {
    echo "Building frontend..."
    cd ../goldkach-investment-web-system
    
    docker build \
        --build-arg NEXT_PUBLIC_API_URL=https://api.goldkach.co.ug/api/v1 \
        --build-arg NEXT_PUBLIC_RECAPTCHA_SITE_KEY=6LcUgGwsAAAAADH_gT_AzLYN2hDzUWk2N5-rpE7G \
        -t ${REGISTRY}/${IMAGE_NAME}-frontend:${VERSION} \
        -t ${REGISTRY}/${IMAGE_NAME}-frontend:latest \
        .
    
    echo "Pushing frontend to ${REGISTRY}..."
    docker push ${REGISTRY}/${IMAGE_NAME}-frontend:${VERSION}
    docker push ${REGISTRY}/${IMAGE_NAME}-frontend:latest
    
    cd - > /dev/null
}

build_backend() {
    echo "Building backend..."
    
    docker build \
        -t ${REGISTRY}/${IMAGE_NAME}-backend:${VERSION} \
        -t ${REGISTRY}/${IMAGE_NAME}-backend:latest \
        .
    
    echo "Pushing backend to ${REGISTRY}..."
    docker push ${REGISTRY}/${IMAGE_NAME}-backend:${VERSION}
    docker push ${REGISTRY}/${IMAGE_NAME}-backend:latest
}

case "${1:-all}" in
    frontend)
        build_frontend
        ;;
    backend)
        build_backend
        ;;
    all)
        build_backend
        build_frontend
        ;;
    *)
        echo "Usage: $0 [frontend|backend|all]"
        exit 1
        ;;
esac

echo "Done! Images pushed to ${REGISTRY}"