@echo off
cd /d "%~dp0"
call .venv\Scripts\activate
python -m uvicorn backend.main:app --reload --port 8000
