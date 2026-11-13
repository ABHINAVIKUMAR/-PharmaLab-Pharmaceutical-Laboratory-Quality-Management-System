#!/usr/bin/env bash
# One-time setup for macOS / Linux.
set -e
cd "$(dirname "$0")"
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r backend/requirements.txt
[ -f .env ] || cp .env.example .env
[ -f frontend/.env ] || cp frontend/.env.example frontend/.env
(cd frontend && npm install)
echo "Setup complete. Run ./run-backend.sh and, in a second terminal, ./run-frontend.sh"
