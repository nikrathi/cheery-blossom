#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT_DIR"
python3 scripts/generate_ticket_manifest.py
mkdir -p .swift-cache
SWIFT_MODULECACHE_PATH="$ROOT_DIR/.swift-cache" \
CLANG_MODULE_CACHE_PATH="$ROOT_DIR/.swift-cache" \
swift scripts/render_tickets.swift
