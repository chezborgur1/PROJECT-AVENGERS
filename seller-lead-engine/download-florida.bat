@echo off
REM Downloads Florida's free DBPR contractor licence files and the Sunbiz quarterly
REM business file, then imports the businesses in your metros. Run setup.bat once first.
cd /d "%~dp0"
call npm run engine -- download florida --import
echo.
pause
