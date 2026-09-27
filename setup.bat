@echo off
REM PROJECT AVENGERS one-click setup (Windows). Double-click this file.
where node >nul 2>nul || (echo Node.js is missing. Install the LTS version from https://nodejs.org then run this again. & start https://nodejs.org & pause & exit /b 1)
cd /d "%~dp0amb-material-bot"
call npm install || (pause & exit /b 1)
if not exist .env copy .env.example .env >nul
if not exist requests\live-requests.csv copy requests\high-priority-requests.csv requests\live-requests.csv >nul
call npm run demo
echo.
echo Done. Next steps:
echo  1. Open amb-material-bot\.env in Notepad and add your ANTHROPIC_API_KEY
echo  2. Put reference models in amb-material-bot\references\model-templates
echo  3. Put past CIMs in amb-material-bot\references\cims
start "" "%~dp0amb-material-bot\references"
start "" "%~dp0amb-material-bot\output"
pause
