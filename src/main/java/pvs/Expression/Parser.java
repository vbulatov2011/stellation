
package pvs.Expression;

import java.io.IOException;
import java.io.StreamTokenizer;
import java.io.StringBufferInputStream;
import java.util.Enumeration;
import java.util.Hashtable;
import java.util.Vector;

import pvs.utils.Comparator;
import pvs.utils.QSort;
/** 
  Parses strings representing mathematical formulas with variables.
  The following operators, in descending order of precedence, are
  defined:

  <UL>
  <LI>Unary minus (-x)
  <LI>^ (raise to a power)
  <LI>* /
  <LI>+ -
  <LI>= 
  </UL>

  ^ , = associates right-to-left; other operators associate left-to-right.

  <P>These functions are defined: 
    abs(x), acos(x), asin(x), atan(x), 
    ceil(x), cos(x), exp(x), floor(x), 
    log(x), round(x), sin(x), sqrt(x), 
    tan(x).  Each requires one argument enclosed in parentheses.
    atan2(x,y)

  <P>Whitespace outside identifiers is ignored.

  <P>The syntax-error messages aren't very informative, unfortunately.
  IWBNI it indicated where in the input string the parse failed, but 
  that'd be kind of a pain since our scanner is a StreamTokenizer.  A
  hook for that info should've been built into StreamTokenizer.

  <P>Examples:
  <UL>
  <LI>42
  <LI>2-3
  <LI>cos(x^2) + sin(x^2)
  <LI>a=atan2(x,y)
  <UL>
 */
public class Parser {

  StreamTokenizer tokens;
  Hashtable variables;
  Hashtable userFunctionTable = new Hashtable();
  String input;

  static final String helpString = 
    "Calculator: calculates simple expressions in C-like sintax\n"+
    "expression can contain\n"+
    " if(cond){expr},  if(cond){expr1}else{espr2}, while(cond){expr}\n" + 
    " numerical terms, variables, operationms (+,-,/,*,^), \n"+
    " functions (abs(x), acos(x), asin(x), atan(x), ceil(x), cos(x),\n"+
    "            exp(x), floor(x), log(x), round(x), sin(x), sqrt(x),\n"+
    "            tan(x), atan2(x,y), log10(x), J0(x),J1(x),Y0(x),Y1(x),\n";
  //"            Fac(x), Gamma(x), sinh(x), cosh(x), tanh(x), asinh(x),\n"+
  //  "            acosh(x),atanh(x),Erf(x),Erfc(x),Normal(x),\n"+
  //  "            poisson(n,x),Poissonc(n,x), ChiSq(x,y), ChiSqc(x,y), \n"+
  //  "            Igam(x,y), Igamc(x,y), Jn(n,x), Yn(n,x)\n"+
  //  " if(cond){expr},  if(cond){expr1}else{espr2}, while(cond){expr}\n";    

  static final boolean DEBUG=false;
  /**
    parses string and returns expression, which may be used for 
    calculations
   */
  public Expr parse (String input) throws Syntax_error {
    this.input = input;
    tokens = new StreamTokenizer (new StringBufferInputStream (input));
    tokens.ordinaryChar ('/');
    tokens.ordinaryChar ('-');

    variables = new Hashtable ();
    // we always have one token already parsed 
    next (); 
    Expr expr = parseMultilineExpr();
    //
    // we should keep all variables together with expression, not 
    // in parser
    //
    expr.setVariables(variables);
    return expr;
  }
  
  /**
   * Return the variable named `name', used during parsing  
   */
  private Variable getVariable (String name) {
    Variable result = (Variable) variables.get (name);
    if (result == null)
      variables.put (name, result = new Variable (name));
    return result;
  }


  /**
   * Register user function for calculations
   */
  public void registerFunction(UserFunction uf){
    userFunctionTable.put(uf.getName(null),new UserFunctionData(uf, null));
  }


  static final String vars[] = new String[]{"x","y","z","u","v","w","v7","v8","v9","v10"};

  public String getHelp(){

    Vector uf = new Vector();
    for(Enumeration elem = userFunctionTable.elements(); elem.hasMoreElements(); ){
      UserFunctionData ud = (UserFunctionData)elem.nextElement();
      uf.add(ud.uf);
    }
    QSort.quickSort(uf, 0, uf.size()-1, new UserFunctionComparator());
    
    StringBuffer sb = new StringBuffer();
    sb.append(helpString);
    sb.append("functions: ");    
    for(int i=0; i < uf.size(); i++){
      UserFunction f = (UserFunction)uf.elementAt(i);
      sb.append(f.getName(null));
      sb.append("(");
      for(int v = 0; v < f.getNumVariables(null); v++){
        sb.append(vars[v]);
        sb.append(' ');
      }
      sb.append(")\n");
    }
    return sb.toString();
  }

  private Expr parseMultilineExpr() throws Syntax_error {

    Expr expr = parse_expr (0);
    
    if(tokens.ttype == ';'){ // may be it is multiline expression 
      MultilineExpr mexpr = new MultilineExpr(expr);
      while(true){
	next();
	if (tokens.ttype == StreamTokenizer.TT_EOF ||
	    tokens.ttype == '}' || tokens.ttype == ')'){
	  expr = mexpr;
	  break;
	}
	mexpr.addExpr(parse_expr (0));
	if(tokens.ttype == ';'){
	  continue;
	} else 
	  throw new Syntax_error ("Sintax error: " + input);
      }
    } else {
      if (tokens.ttype != StreamTokenizer.TT_EOF)
	throw new Syntax_error ("Sintax error: " + input);
    } 
    return expr;
  }  

  private void next () {
    try { 
      tokens.nextToken (); 
      if(DEBUG){
	switch(tokens.ttype){
	case StreamTokenizer.TT_WORD:
	  System.err.println("next:"+tokens.sval); break;
	case StreamTokenizer.TT_NUMBER:
	  System.err.println("next:"+tokens.nval); break;
	case StreamTokenizer.TT_EOF:
	  System.err.println("next: EOF"); break;
	default:
	  System.err.println("next:"+(char)tokens.ttype); break;	
	}
      }
    }
    catch (IOException e) { 
      throw new RuntimeException ("I/O error: " + e); 
    }
  }

  private void _expect (int ttype) throws Syntax_error {
    if (tokens.ttype != ttype){
      throw new Syntax_error ("'" + (char) ttype + "' expected,");
    }
    next ();
  }
  private void expect (int ttype, String after)  throws Syntax_error {
    if (tokens.ttype != ttype){
      throw new Syntax_error ("'" + (char) ttype + "' expected after '" + after + "'");
    }
    next ();
  }

  private Expr parse_expr (int precedence) throws Syntax_error {
    Expr expr = parse_factor ();
  loop: for (;;) {
      int l, r, rator;   

      // The operator precedence table.
      // l = left precedence, r = right precedence, rator = operator.
      // Higher precedence values mean tighter binding of arguments.
      // To associate left-to-right, let r = l+1;
      // to associate right-to-left, let r = l.

      switch (tokens.ttype) {
      case '=': l = 5;  r = 5;  rator = Expr.ASSIGN; break;
      case '+': l = 10; r = 11; rator = Expr.ADD; break;
      case '-': l = 10; r = 11; rator = Expr.SUB; break;
	
      case '*': l = 20; r = 21; rator = Expr.MUL; break;
      case '/': l = 20; r = 21; rator = Expr.DIV; break;
	
      case '^': l = 30; r = 30; rator = Expr.POW; break; 
	
      default: break loop;
      }

      if (l < precedence)
	break loop;

      next ();
      expr = Expr.make_app2 (rator, expr, parse_expr (r));
    }
    return expr;
  }

  static String[] procs = {
    "abs", "acos", "asin", "atan", 
    "ceil", "cos", "exp", "floor", 
    "log", "round", "sin", "sqrt", 
    "tan"
  };
  static int[] rators = {
    Expr.ABS, Expr.ACOS, Expr.ASIN, Expr.ATAN, 
    Expr.CEIL, Expr.COS, Expr.EXP, Expr.FLOOR,
    Expr.LOG, Expr.ROUND, Expr.SIN, Expr.SQRT, 
    Expr.TAN
  };

  static String[] procs2 = {
    "atan2"
  };
  static int[] rators2 = {
    Expr.ATAN2
  };

  private double parseNumber() throws Syntax_error{
    double number = tokens.nval;
    next ();      
    // try to read number with exponent
    if((tokens.ttype == StreamTokenizer.TT_WORD) && 
       (tokens.sval.startsWith("e")||tokens.sval.equals("E")||
	tokens.sval.equals("d")||tokens.sval.equals("D"))){
      double exponent = 0;
      if(tokens.sval.length() == 1){ // just one character
	next ();
	if(tokens.ttype == StreamTokenizer.TT_NUMBER){
	  exponent = tokens.nval;
	} else if(tokens.ttype == '+'){
	  next();
	  if(tokens.ttype == StreamTokenizer.TT_NUMBER)
	    exponent = tokens.nval;
	  else 
	    throw new Syntax_error ("bad number");	    
	} else if(tokens.ttype == '-'){
	  next();
	  if(tokens.ttype == StreamTokenizer.TT_NUMBER)
	    exponent = -tokens.nval;
	  else 
	    throw new Syntax_error ("bad number");	    	  
	}
      } else {
	exponent = Double.valueOf(tokens.sval.substring(1)).doubleValue();
      }
      number *= Math.pow(10,exponent);
    } else {
      tokens.pushBack(); // there is not continuation
    }
    return number;
  }

  private Expr parse_factor () throws Syntax_error {
    switch (tokens.ttype) {
    case StreamTokenizer.TT_NUMBER: {
      Expr lit = Expr.make_literal (parseNumber());
      next ();
      return lit;
    }
    case StreamTokenizer.TT_WORD: {
      // if
      if(tokens.sval.equals("if")){
	next ();
	expect ('(', tokens.sval);
	Expr condition = parse_expr (0);
	expect (')', "if(");
	expect ('{', "if()");
	Expr body = parseMultilineExpr();
	expect ('}', "if(){");	
	if(tokens.ttype == StreamTokenizer.TT_WORD && 
	   tokens.sval.equals("else")){
	  next();
	  expect ('{', "else");
	  Expr body_else = parseMultilineExpr();
	  expect ('}', "else{");	
	  return new ExprIfElse(condition, body, body_else);
	} else {
	  return new ExprIf(condition, body);
	}
      }
      // while
      if(tokens.sval.equals("while")){
	next ();
	expect ('(', "while");
	Expr condition = parse_expr (0);
	expect (')',"while(");
	expect ('{',"while()");
	Expr body = parseMultilineExpr();
	expect ('}',"while(){");	
	return new ExprWhile(condition, body);
      }
      // one variable functions
      for (int i = 0; i < procs.length; ++i)
	if (procs [i].equals (tokens.sval)) {
	  next ();
	  expect ('(', procs [i]);
	  Expr rand = parse_expr (0);
	  expect (')', "(");
	  return Expr.make_app1 (rators [i], rand);
	}
      // two variable functions
      for (int i = 0; i < procs2.length; ++i)
	if (procs2 [i].equals (tokens.sval)) {
	  next ();
	  expect ('(',procs2 [i]);
	  Expr rand0 = parse_expr (0);
	  //System.out.println(rand0);
	  expect (',',procs2[i] + "(var");
	  Expr rand1 = parse_expr (0);
	  System.out.println(rand1);
	  expect (')',procs2[i] + "(var1,var2");
	  return Expr.make_app2 (rators2 [i], rand0,rand1);
	}
      // used defined functions
      UserFunctionData ufd = 
	(UserFunctionData)userFunctionTable.get(tokens.sval);
      if(ufd != null){
	int dim = ufd.uf.getNumVariables(ufd.data);
	next ();
	Expr expr[] = new Expr[dim];
	expect ('(', ufd.uf.getName(null));
	for(int i=0; i < dim; i++){
	  expr[i] = parse_expr (0);
	  if(i < dim-1)
	    expect (',',ufd.uf.getName(ufd.data) + "(var");
	  else 
	    expect (')',ufd.uf.getName(ufd.data) + "(var1, ..., varn");
	}
	return Expr.make_appUf (ufd, expr);
      }

      // it should be new variable then
      Expr v = Expr.make_var_ref (getVariable(tokens.sval));
      next ();
      return v;
    }
    case '(': {
      next ();
      Expr enclosed = parse_expr (0);
      expect (')', "{expression");
      return enclosed;
    }
    case '-': 
      next ();
      return Expr.make_app1 (Expr.NEG, parse_factor ());
    default:
      throw new Syntax_error ("Expected a factor, but got: " + 
			      (char)(tokens.ttype));
    }
  }

  class UserFunctionComparator implements Comparator {

    public int compare(Object o1, Object o2){

      UserFunction uf1 = (UserFunction)o1;
      UserFunction uf2 = (UserFunction)o2;
      return uf1.getName(null).compareToIgnoreCase(uf2.getName(null));
    }
    
  }

}
