#!/bin/sh
# Builds dist/openvidu-meet-<version>.xpi from src/
set -e
cd "$(dirname "$0")"
VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' src/manifest.json | head -1)
mkdir -p dist
OUT="dist/openvidu-meet-$VERSION.xpi"
rm -f "$OUT"
(cd src && zip -r -q -X "../$OUT" .)
echo "$OUT"
