#!/usr/bin/env bash
cd "$(dirname "$0")"
source .venv/bin/activate
python -m uvicorn backend.main:app --reload --port 8000
