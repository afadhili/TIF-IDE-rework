#!/bin/bash

# Nama image dan tag
IMAGE_NAME="collab-terminal-image"
TAG="latest"

# Cek apakah image sudah ada
if docker image inspect ${IMAGE_NAME}:${TAG} > /dev/null 2>&1; then
    echo "✅ Image '${IMAGE_NAME}:${TAG}' sudah ada. Skip build."
else
# build terminal image
    echo "Building '${IMAGE_NAME}:${TAG}'..."
    docker build -t ${IMAGE_NAME}:${TAG} -f Dockerfile.terminal .

    # Cek hasil build
    if [ $? -eq 0 ]; then
        echo "✅ Build sukses untuk '${IMAGE_NAME}:${TAG}'."
    else
        echo "❌ Build gagal."
        exit 1
    fi
fi

# docker compose
docker compose up --build
