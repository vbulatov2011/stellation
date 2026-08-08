@echo off
rem Build (if needed) and run the app with Ant.
rem
rem   ant-run.bat
rem   ant-run.bat -i off/u27.off -y I
rem
rem -i is the .off polyhedron file, -y the stellation symmetry (default I).

setlocal
cd /d "%~dp0"

call "%~dp0ant-env.bat"
if errorlevel 1 (
  pause
  exit /b 1
)

call "%ANT_CMD%" run -Dargs="%*"
if errorlevel 1 (
  echo.
  echo RUN FAILED
  pause
  exit /b 1
)
