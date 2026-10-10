#!/usr/bin/env bash
# Build and deploy Dead Signal to https://dead-signal-game.web.app
#
# Cloud sessions have no Firebase login: they use the FIREBASE_TOKEN
# environment variable (from `firebase login:ci` on Sam's machine, stored in
# the Claude Code environment's variables — never in this repo).
set -euo pipefail
cd "$(dirname "$0")"
if command -v firebase >/dev/null 2>&1; then FB=firebase; else FB="npx --yes firebase-tools@15"; fi
TOK=()
if [ -n "${FIREBASE_TOKEN:-}" ]; then TOK=(--token "$FIREBASE_TOKEN"); fi
npm run build
$FB deploy --only hosting,firestore:rules --project dead-signal-76487 --non-interactive "${TOK[@]}"
echo "Live: https://dead-signal-game.web.app"
