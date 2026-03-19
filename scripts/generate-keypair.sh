#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."

echo "Generating RSA-2048 key pair for license signing..."
openssl genrsa -out "$SCRIPT_DIR/license-private.pem" 2048
openssl rsa -in "$SCRIPT_DIR/license-private.pem" -pubout -out "$ROOT/ui/backend/src/license-public.pem"

echo ""
echo "✓ Private key: scripts/license-private.pem  ← KEEP SECRET, never commit"
echo "✓ Public key:  ui/backend/src/license-public.pem  ← commit to repo"
echo ""
echo "Next: run scripts/generate-license.js to issue a license."
