
import { java } from "./j4ts-2.1.0-SNAPSHOT/bundle.js"

// This shim is necessary because the j4ts library does not implement PrintStream.printf().
//  See build.bash to see how this gets injected into the runtime, and how from-java.js
//   gets patched up to use it, using sed.

export const badPrintf = ( str, ...args ) =>
{
  java.lang.System.out.print( str );
  args .map( arg => java.lang.System.out.print( ' ' + arg ) );
  java.lang.System.out .println();
}
