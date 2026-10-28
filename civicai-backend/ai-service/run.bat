@echo off
REM Start CivicAI FastAPI YOLOv8 detection service on port 8000
cd /d "%~dp0"
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
