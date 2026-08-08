@echo off
rem Compile and run the original Stellation desktop app (the ex-applet).
rem Usage:  run.bat [-i <off-file>] [-y <stellation symmetry>]

setlocal enabledelayedexpansion
cd /d "%~dp0"

rem ---- locate a JDK (a JRE is not enough, we need javac) ----------------------
set "JDK="
if defined JAVA_HOME if exist "%JAVA_HOME%\bin\javac.exe" set "JDK=%JAVA_HOME%"
if not defined JDK (
  for /d %%d in ("C:\Program Files\Java\jdk*") do if exist "%%d\bin\javac.exe" set "JDK=%%d"
)
if not defined JDK (
  for /d %%d in ("C:\Program Files\Eclipse Adoptium\jdk*") do if exist "%%d\bin\javac.exe" set "JDK=%%d"
)
if not defined JDK (
  echo ERROR: no JDK found. Install a JDK ^(8 or later^) or set JAVA_HOME.
  exit /b 1
)
echo Using JDK: !JDK!

rem ---- compile src/main/java + src/ui/java into bin/ --------------------------
rem NOTE: src/jsweet is deliberately excluded - those are stub classes that
rem shadow java.awt/java.io for the Javascript transpile only.
if not exist bin mkdir bin
dir /s /b "src\main\java\*.java"  > "%TEMP%\stellation-sources.txt"
dir /s /b "src\ui\java\*.java"   >> "%TEMP%\stellation-sources.txt"

"!JDK!\bin\javac.exe" -nowarn -encoding UTF-8 -d bin "@%TEMP%\stellation-sources.txt"
if errorlevel 1 (
  echo ERROR: compilation failed.
  exit /b 1
)

rem ---- run -------------------------------------------------------------------
rem resources/ must be on the classpath: the code loads /images/off/*.off and
rem /images/poly/*.gif via getResourceAsStream.
"!JDK!\bin\java.exe" -Xmx512M -cp "bin;resources" pvs.polyhedra.stellation.ui.StellationMain %*
