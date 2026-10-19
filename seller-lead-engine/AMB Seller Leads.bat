@echo off
REM Opens the AMB Seller Leads app: one window with a button for every step.
REM Run setup.bat (in the folder above) once first. Keep the black window open
REM while you use the app; close it to stop.
title AMB Seller Leads (keep this window open)
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is missing. Run setup.bat in the folder above first. & pause & exit /b 1)
if not exist node_modules (echo First time: installing, this takes a minute... & call npm install || (pause & exit /b 1))
call npm run engine -- app
pause
