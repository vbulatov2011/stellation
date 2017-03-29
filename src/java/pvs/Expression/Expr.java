// Mathematical expressions.
// Copyright 1996 by Darius Bacon; see the file COPYING.

// 14May96: added constant folding

package pvs.Expression;

import java.util.Hashtable;
import java.util.Vector;

/**
 * A mathematical expression, built out of literal numbers, variables,
 * arithmetic operators, and elementary functions.  The operator names
 * are from java.lang.Math.
 */
public abstract class Expr {

  /** @return the value given the current variable values */
  public abstract double value ();

  /** Binary operator. */  public static final int ASSIGN = 0;  
  /** Binary operator. */  public static final int ADD = 1;  
  /** Binary operator. */  public static final int SUB = 2;
  /** Binary operator. */  public static final int MUL = 3;
  /** Binary operator. */  public static final int DIV = 4;
  /** Binary operator. */  public static final int POW = 5;

  /** Binary operator. */  public static final int ATAN2 = 6;
  
  /** Unary operator. */        public static final int ABS   = 100;
  /** Unary operator. */        public static final int ACOS  = 101;
  /** Unary operator. */        public static final int ASIN  = 102;
  /** Unary operator. */        public static final int ATAN  = 103;
  /** Unary operator. */        public static final int CEIL  = 104;
  /** Unary operator. */        public static final int COS   = 105;
  /** Unary operator. */        public static final int EXP   = 106;
  /** Unary operator. */        public static final int FLOOR = 107;
  /** Unary operator. */        public static final int LOG   = 108;
  /** Unary minus operator. */  public static final int NEG   = 109;
  /** Unary operator. */        public static final int ROUND = 110;
  /** Unary operator. */        public static final int SIN   = 111;
  /** Unary operator. */        public static final int SQRT  = 112;
  /** Unary operator. */        public static final int TAN   = 113;

  public static Expr make_literal (double v) { 
    return new Literal (v); 
  }
  public static Expr make_var_ref (Variable var) {
    return new Var_ref (var);
  }
  /** 
   * @param rator unary operator
   * @param rand operand
   */
  public static Expr make_app1 (int rator, Expr rand) {
    Expr app = new App1 (rator, rand);
    return rand instanceof Literal ? new Literal (app.value ()) : app;
  }
  /** 
   * @param rator binary operator
   * @param rand0 left operand
   * @param rand1 right operand
   */
  public static Expr make_app2 (int rator, Expr rand0, Expr rand1) {
    Expr app = new App2 (rator, rand0, rand1);
    return rand0 instanceof Literal && rand1 instanceof Literal
	     ? new Literal (app.value ()) 
	     : app;
  }

  /** 
   * @param user defined function
   * @param rand[] array of operands
   */
  public static Expr make_appUf (UserFunctionData ufd, Expr[] rand) {
    Expr app = new AppUf (ufd, rand);
    return app;
  }

  /**
    set of all variables employed in this expression
   */
  Hashtable variables;
  /**
    is called by parser at the end of parsing
    to assign variables table to this Expr
   */  
  void setVariables( Hashtable _variables){
    variables = _variables;
  }
  
  /**
   * Return the variable named `name'.  
   */
  public  Variable getVariable (String name) {
    Variable result = (Variable) variables.get (name);
    if (result == null)
      variables.put (name, result = new Variable (name));
    return result;
  }
  
}

// These classes are all private to this module so that I can get rid
// of them later.  For applets you want to use as few classes as
// possible to avoid http connections at load time; it'd be profitable
// to replace all these subtypes with bytecodes for a stack machine,
// or perhaps a type that's the union of all of them (see class Node
// in java/demo/SpreadSheet/SpreadSheet.java).

class Literal extends Expr {
  double v;
  Literal (double _v) { v = _v; }
  public double value () { return v; }
  public String toString(){
    return "("+v+")";
  }
}

class Var_ref extends Expr {
  Variable var;
  Var_ref (Variable _var) { var = _var; }
  public double value () { return var.value (); }
  public String toString(){
    return var.toString();
  }
}

class App1 extends Expr {
  int rator;
  Expr rand;

  App1 (int rator, Expr rand) { 
    this.rator = rator; this.rand = rand; 
  }

  public double value () {
    double arg = rand.value ();
    switch (rator) {
    case ABS:   return Math.abs (arg);
    case ACOS:  return Math.acos (arg);
    case ASIN:  return Math.asin (arg);
    case ATAN:  return Math.atan (arg);
    case CEIL:  return Math.ceil (arg);
    case COS:   return Math.cos (arg);
    case EXP:   return Math.exp (arg);
    case FLOOR: return Math.floor (arg);
    case LOG:   return Math.log (arg);
    case NEG:   return -arg;
    case ROUND: return Math.round (arg);
    case SIN:   return Math.sin (arg);
    case SQRT:  return Math.sqrt (arg);
    case TAN:   return Math.tan (arg);
    default: throw new RuntimeException ("BUG: bad rator");
    }
  }

  public String toString(){
    switch (rator) {
    case ABS:   return "abs("+rand+")";
    case ACOS:  return "acos("+rand+")";
    case ASIN:  return "asin("+rand+")";
    case ATAN:  return "atan("+rand+")";
    case CEIL:  return "ceil("+rand+")";
    case COS:   return "cos("+rand+")";
    case EXP:   return "exp("+rand+")";
    case FLOOR: return "floor("+rand+")";
    case LOG:   return "log("+rand+")";
    case NEG:   return "(-"+rand+")";
    case ROUND: return "round("+rand+")";
    case SIN:   return "sin("+rand+")";
    case SQRT:  return "sqrt("+rand+")";
    case TAN:   return "tan("+rand+")";
    default: return "";
    }
  }
}

class App2 extends Expr {
  int rator;
  Expr rand0, rand1;

  App2 (int rator, Expr rand0, Expr rand1) { 
    this.rator = rator; this.rand0 = rand0; this.rand1 = rand1;
  }
  public double value () {
    double arg0 = rand0.value ();
    double arg1 = rand1.value ();
    switch (rator) {
    case ASSIGN:  
      if(rand0 instanceof Var_ref)
	((Var_ref)rand0).var.setValue(arg1);
      return arg1;
    case ADD:  return arg0 + arg1;
    case SUB:  return arg0 - arg1;
    case MUL:  return arg0 * arg1;
    case DIV:  return arg0 / arg1;   // check for division by 0?
    case POW:  return Math.pow (arg0, arg1);
    case ATAN2:  return Math.atan2 (arg0, arg1);
    default: throw new RuntimeException ("BUG: bad rator");
    }
  }
  public String toString(){
    switch(rator){
    case ASSIGN:  return "("+rand0 + "=" + rand1+")";
    case ADD:  return "("+rand0 + "+" + rand1+")";
    case SUB:  return "("+rand0 + "-" + rand1+")";
    case MUL:  return "("+rand0 + "*" + rand1+")";
    case DIV:  return "("+rand0 + "/" + rand1+")"; 
    case POW:  return "("+rand0 + "^" + rand1+")";
    case ATAN2:  return "atan2("+rand0 + "," + rand1+")";
    default: return "";
    }
  }
}

class AppUf extends Expr {
  UserFunction uf;
  Object data;
  
  Expr rand[];
  double arg[];

  AppUf (UserFunctionData ufd, Expr rand[]) { 
    this.uf = ufd.uf;
    this.data = ufd.data;
    this.rand = rand;
    arg = new double[rand.length];
  }

  public double value () {
    switch(rand.length){
    default:             // dirty trick to spedup
      for(int i=2;i < rand.length; i++)
	arg[i] = rand[i].value ();      
    case 2: 
      arg[1] = rand[1].value ();
    case 1:
      arg[0] = rand[0].value ();
    case 0:
    }      
    return uf.compute(arg,data);
  }

  public String toString(){
    StringBuffer buf = new StringBuffer();
    buf.append(uf.getName(data));
    buf.append("(");
    for(int i= 0; i < rand.length;i++ ){
      buf.append(rand[i]);
      if(i < rand.length-1)
	buf.append(",");
      else 
	buf.append(")");	
    }
    return buf.toString();
  }
}

/**
  calculates a sequence of expressions
  return result of last expression in the chain
 */
class MultilineExpr extends Expr {
  Vector exprs;
  
  MultilineExpr(Expr expr) { 
    exprs = new Vector(2);
    exprs.addElement(expr);
  }

  void addExpr(Expr expr) { 
    exprs.addElement(expr);
  }

  public double value () {
    double result = 0;
    for(int i=0;i < exprs.size();i++){
      result = ((Expr)exprs.elementAt(i)).value(); 
    }
    return result;
  }

  public String toString(){
    StringBuffer buf = new StringBuffer();
    for(int i=0;i < exprs.size();i++){
      buf.append(exprs.elementAt(i).toString()); 
      buf.append(";\n");
    }
    return buf.toString();
  }
}

/**
  calculates expression of type: 
  if(condition){ 
    expression 
  }
  it returns value of  expression if condition > 0.0  
  and 0.0 otherwise  
 */
class ExprIf extends Expr {
  Expr condition, body;
  
  ExprIf(Expr condition, Expr body) { 
    this.condition = condition;
    this.body = body;
  }

  public double value () {
    if(condition.value() > 0)
      return body.value();
    else 
      return 0.0;
  }

  public String toString(){
    return "if("+condition+"){\n" + body + "}\n"; 
  }
}

/**
  calculates expression of type:
  if(condition){ 
    expression1 
  } else {
    expression2 
  } 
  it returns value of  expression1 if condition > 0.0  
  and value of expression2 otherwise  
 */
class ExprIfElse extends Expr {
  Expr condition, body1, body2;
  
  ExprIfElse(Expr condition, Expr body1, Expr body2) { 
    this.condition = condition;
    this.body1 = body1;
    this.body2 = body2;
  }

  public double value () {
    if(condition.value() > 0)
      return body1.value();
    else 
      return body2.value();
  }

  public String toString(){
    return "if("+condition+"){\n" + body1 + "} else {\n"+body2+"}\n"; 
  }
}

/**
  calculates expression of type:
  while(condition){ 
    expression
  }
  
  it evaluates expression as many time as condition > 0.0  
  and returns value of expression at last cycle
  in case if expression have been never evaluated
  it will return 0.0
 */
class ExprWhile extends Expr {
  Expr condition, body;
  
  ExprWhile(Expr condition, Expr body) { 
    this.condition = condition;
    this.body = body;
  }

  public double value () {
    double result = 0.0;
    while(condition.value() > 0)
      result =  body.value();
    return result;
  }
  
  public String toString(){
    return "while("+condition+"){\n" + body + "}\n"; 
  }
}
