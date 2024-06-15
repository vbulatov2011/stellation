#!/bin/bash

banner() {
  echo ''
  echo '%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%'
  echo '%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%'
  echo '%%%%    '$1
  echo '%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%'
  echo '%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%'
  echo ''
}

banner 'Using Java 11' ########################################################################

export JAVA_HOME=`/usr/libexec/java_home -v 11`
java -version


banner 'Transpiling core Java sources with JSweet' ###########################################

rm -rf .jsweet jsweetOut

mvn clean generate-sources &> jsweet-errors.txt    # ignore the exit code, it always fails
cat jsweet-errors.txt

grep -q 'transpilation failed with 98 error(s) and 0 warning(s)' jsweet-errors.txt \
  && banner 'JSweet transpile found the expected errors' \
  || { banner 'UNEXPECTED CHANGE IN JSWEET ERRORS'; exit 1; }


banner 'Patching up the j4ts bundle as an ES6 module' ######################################

CANDIES_IN=jsweetOut/candies
CANDIES_OUT="target"

# also, working around https://github.com/cincheo/jsweet/issues/740,
#  and avoiding the warnings from esbuild about top-level eval()

mkdir -p $CANDIES_OUT/j4ts-2.1.0-SNAPSHOT
cat $CANDIES_IN/j4ts-2.1.0-SNAPSHOT/bundle.js | \
  sed \
    -e 's/^var java/export var java/' \
    -e 's=eval[(]=(0,eval)(=g' \
    -e 's/return this.size();/return this.__parent.size();/' \
  > $CANDIES_OUT/j4ts-2.1.0-SNAPSHOT/bundle.js || exit $?


banner 'Copying the Javascript shims' ######################################

cp src/js/*.js target


banner 'Patching up the main bundle as an ES6 module' ######################################

OUTJS=target/from-java.js
echo 'import { java, javaemul } from "./j4ts-2.1.0-SNAPSHOT/bundle.js"' > $OUTJS
# Make the printf shim available.. see the sed entry below, also
echo 'import { badPrintf } from "./shims.js"' >> $OUTJS

cat 'jsweetOut/js/bundle.js' | \
  sed \
    -e 's/^var pvs;/export var pvs;/' \
    -e 's/var java;//' \
    -e 's/(java || (java = {}));/(java);/' \
    -e 's/^.*\.main(null);//' \
    -e 's/=> o.printf/=> badPrintf/' \
  >> $OUTJS

