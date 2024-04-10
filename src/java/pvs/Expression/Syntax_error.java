// Syntax-error exception.
// Copyright 1996 by Darius Bacon; see the file COPYING.

package pvs.Expression;

public class Syntax_error extends Exception {
  public Syntax_error (String complaint) { super (complaint); }
}
