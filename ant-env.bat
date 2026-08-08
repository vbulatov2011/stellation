@echo off
rem Shared environment setup for the ant-*.bat scripts.
rem Finds a JDK and an Ant installation, and leaves ANT_CMD pointing at ant.bat.
rem Not meant to be run on its own - the other scripts do:  call ant-env.bat

rem ---- JDK -------------------------------------------------------------------
rem Ant needs javac, so a JRE is not enough. This is the usual failure:
rem without JAVA_HOME on a JDK, Ant reports "Unable to find a javac compiler".
if defined JAVA_HOME if exist "%JAVA_HOME%\bin\javac.exe" goto :jdk_ok
set "JAVA_HOME="
for /d %%d in ("C:\Program Files\Java\jdk*") do if exist "%%d\bin\javac.exe" set "JAVA_HOME=%%d"
if not defined JAVA_HOME (
  for /d %%d in ("C:\Program Files\Eclipse Adoptium\jdk*") do if exist "%%d\bin\javac.exe" set "JAVA_HOME=%%d"
)
if not defined JAVA_HOME (
  echo ERROR: no JDK found. Install a JDK ^(8 or later^), or set JAVA_HOME yourself.
  exit /b 1
)
:jdk_ok

rem ---- Ant -------------------------------------------------------------------
set "ANT_CMD="
if defined ANT_HOME if exist "%ANT_HOME%\bin\ant.bat" goto :ant_ok
set "ANT_HOME="
if exist "D:\home\utils\apache-ant-1.10.5\bin\ant.bat" set "ANT_HOME=D:\home\utils\apache-ant-1.10.5"
if not defined ANT_HOME (
  for /d %%d in ("D:\home\utils\apache-ant-*") do if exist "%%d\bin\ant.bat" set "ANT_HOME=%%d"
)
if not defined ANT_HOME (
  for /d %%d in ("C:\apache-ant-*") do if exist "%%d\bin\ant.bat" set "ANT_HOME=%%d"
)
if not defined ANT_HOME (
  for /d %%d in ("C:\Program Files\apache-ant-*") do if exist "%%d\bin\ant.bat" set "ANT_HOME=%%d"
)
if not defined ANT_HOME (
  rem last resort: ant already on PATH
  for %%p in (ant.bat) do if not "%%~$PATH:p"=="" set "ANT_CMD=%%~$PATH:p"
)
:ant_ok
if defined ANT_HOME set "ANT_CMD=%ANT_HOME%\bin\ant.bat"
if not defined ANT_CMD (
  echo ERROR: Ant not found. Set ANT_HOME to your Apache Ant folder.
  exit /b 1
)

echo JAVA_HOME=%JAVA_HOME%
echo ANT_HOME=%ANT_HOME%
echo.
exit /b 0
