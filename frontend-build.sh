#!/bin/bash

# change this to specify where this application will be served from
# it not in a parameter yet for risk management
INSTALL_DIR="/srv/com.githubkpis/static/"

echo "Building the Frontend with a clean docker create-react-app build,"
echo " and installing on $INSTALL_DIR. Edit this script to change."

# Uncomment to refresh
git pull || return

# Build
cp -a frontend.Dockerfile.dockerignore .dockerignore
docker build -f frontend.Dockerfile -t githubkpis-frontend .
rm -f .dockerignore

# Install
mkdir -p "$INSTALL_DIR"
rm -fr "$INSTALL_DIR/static"
# instantiate a container and extract the files into the installation directory
docker create -ti --name githubkpis-frontend-dummy githubkpis-frontend:latest bash
docker cp githubkpis-frontend-dummy:/app/build/. "$INSTALL_DIR"
docker rm -f githubkpis-frontend-dummy

# verify the files to be present
echo "Contents of:"
ls -d --color=yes "$INSTALL_DIR"
echo
ls -l --color=yes "$INSTALL_DIR"
echo
