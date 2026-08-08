#!/usr/bin/env bash
set -e

echo "===================================================="
echo "  Starting Shell Build & Setup Pipeline             "
echo "===================================================="

# 1. Install dependencies
echo "[BUILD] Installing npm packages..."
npm install

# 2. Run test suite
echo "[BUILD] Running test suite..."
npm test

# 3. Run node build validator script
echo "[BUILD] Executing build validator..."
npm run build

echo "===================================================="
echo "  Build & Setup completed successfully!             "
echo "  Run 'npm start' to launch server.                 "
echo "===================================================="
