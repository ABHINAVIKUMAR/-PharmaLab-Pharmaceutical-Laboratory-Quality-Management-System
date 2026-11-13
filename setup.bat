@echo off
REM One-time setup for Windows: Python virtual env + backend deps + frontend deps.
cd /d "%~dp0"
if not exist .venv ( python -m venv .venv )
call .venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r backend\requirements.txt || goto :error
if not exist .env ( copy .env.example .env )
if not exist frontend\.env ( copy frontend\.env.example frontend\.env )
cd frontend
call npm install || goto :error
cd ..
echo.
echo Setup complete.  Now run  run-backend.bat  and, in a second terminal,  run-frontend.bat
goto :eof
:error
echo Setup failed - see the messages above.
exit /b 1
