@echo off
cd /d "%~dp0"
echo Opportunity Hub - local server on http://localhost:5173
start "" http://localhost:5173/calibrate.html
npx --yes serve -l 5173 .
