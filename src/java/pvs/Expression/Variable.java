// Variables associate values with names.
// Copyright 1996 by Darius Bacon; see the file COPYING.

// 01Jun96: made `make' synchronized.

package pvs.Expression;

/**
 * Variables associate values with names.
 */
public class Variable {

  String name;
  double val;

  public Variable (String _name) { name = _name; val = 0; }

  public String toString () { return name; }
  public double value () { return val; }
  public void setValue (double _val) { val = _val; }
}
