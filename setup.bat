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
echo.
echo Setting up the seller lead engine...
cd /d "%~dp0seller-lead-engine"
call npm install || (pause & exit /b 1)
if not exist .env copy .env.example .env >nul
if not exist config mkdir config
if not exist config\engine.config.json copy config\engine.config.example.json config\engine.config.json >nul
call npm run demo
echo.
echo Seller lead engine ready. Next steps:
echo  1. Fill in seller-lead-engine\config\engine.config.json and seller-lead-engine\.env in Notepad
echo  2. Read seller-lead-engine\docs\RUNBOOK.md. Nothing is sent until the licensing sign-off and postal address are filled in
echo  3. To open the app, double-click "AMB Seller Leads" on your desktop (or seller-lead-engine\AMB Seller Leads.bat)
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\AMB Seller Leads.lnk'); $s.TargetPath='%~dp0seller-lead-engine\AMB Seller Leads.bat'; $s.WorkingDirectory='%~dp0seller-lead-engine'; $s.Save()" >nul 2>nul && echo     Desktop shortcut added.
pause
