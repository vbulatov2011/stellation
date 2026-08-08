#!/bin/bash
#
# Compile and run the original Stellation desktop app (the ex-applet).
# Works on macOS/Linux and in Git Bash on Windows.
#
# Usage:  ./run.bash [-i <off-file>] [-y <stellation symmetry>]

set -e
cd "$( dirname "${BASH_SOURCE[0]}" )"

# ---- locate a JDK (a JRE is not enough, we need javac) ----------------------
if [ -n "$JAVA_HOME" ] && [ -x "$JAVA_HOME/bin/javac" ]; then
  JAVAC="$JAVA_HOME/bin/javac"
  JAVA="$JAVA_HOME/bin/java"
elif command -v javac > /dev/null; then
  JAVAC=javac
  JAVA=java
else
  # Git Bash on Windows: JAVA_HOME is often unset and only a JRE is on PATH
  JDK=$( ls -d "/c/Program Files/Java"/jdk* "/c/Program Files/Eclipse Adoptium"/jdk* 2>/dev/null | tail -1 )
  if [ -z "$JDK" ]; then
    echo "ERROR: no JDK found. Install a JDK (8 or later) or set JAVA_HOME."
    exit 1
  fi
  JAVAC="$JDK/bin/javac"
  JAVA="$JDK/bin/java"
fi
echo "Using: $JAVAC"

# ---- compile src/main/java + src/ui/java into bin/ --------------------------
# NOTE: src/jsweet is deliberately excluded - those are stub classes that
# shadow java.awt/java.io for the Javascript transpile only.
mkdir -p bin
SOURCES=$( mktemp )
find src/main/java src/ui/java -name '*.java' > "$SOURCES"
"$JAVAC" -nowarn -encoding UTF-8 -d bin "@$SOURCES"
rm -f "$SOURCES"

# ---- run --------------------------------------------------------------------
# resources/ must be on the classpath: the code loads /images/off/*.off and
# /images/poly/*.gif via getResourceAsStream.
case "$( uname -s )" in
  MINGW*|MSYS*|CYGWIN*) CP="bin;resources" ;;
  *)                    CP="bin:resources" ;;
esac

"$JAVA" -Xmx512M -cp "$CP" pvs.polyhedra.stellation.ui.StellationMain "$@"
