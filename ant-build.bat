@echo off
rem Build stellation-app.jar with Ant.
rem
rem   ant-build.bat          - full rebuild  (ant clean build)
rem   ant-build.bat jar      - or name any other target(s) from build.xml

setlocal
cd /d "%~dp0"

call "%~dp0ant-env.bat"
if errorlevel 1 (
  pause
  exit /b 1
)

set "TARGETS=%*"
if not defined TARGETS set "TARGETS=clean build"

call "%ANT_CMD%" %TARGETS%
if errorlevel 1 (
  echo.
  echo BUILD FAILED
  pause
  exit /b 1
)

echo.
echo Built stellation-app.jar - double-click it, or run:  java -jar stellation-app.jar
pause
