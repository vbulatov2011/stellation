// Put the expression evaluator through its paces.

// Sample usage:

// $ java expr.Test '3.14159 * x^2' 0 4 1
// 0
// 3.14159
// 12.5664
// 28.2743
// 50.2654
//
// $ java expr.Test 'sin (pi/4 * x)' 0 4 1
// 0
// 0.707107
// 1
// 0.707107
// 1.22461e-16

package pvs.Expression;

public class Test {
  public static void main (String[] args) {
    Parser parser = new Parser();
    parser.registerFunction(new FunctionMin());
    parser.registerFunction(new FunctionSin());
    FunctionSpec fs = new FunctionSpec();
    fs.registerFunctions(parser);

    if(args.length > 0){
      Expr expr = null;
      try { expr = parser.parse (args [0]); }
      catch (Syntax_error e) {
	e.printStackTrace(System.err);
	return;
      }

      System.out.println(expr);
      
      double low  = Double.valueOf (args [1]).doubleValue ();
      double high = Double.valueOf (args [2]).doubleValue ();
      double step = Double.valueOf (args [3]).doubleValue ();
      
      Variable x = expr.getVariable ("x");
      
      for (double xval = low; xval <= high; xval += step) {
	x.setValue (xval);
	System.out.println (expr.value());
      }
    } else {
      try {
	Expr expr1 = parser.parse ("x*y*sin(x)*sin(y)");
	Variable x = expr1.getVariable ("x");
	Variable y = expr1.getVariable ("y");
	System.out.println(expr1);

	long t0 = System.currentTimeMillis();    
	
	for(int i = 0; i < 1000; i++)
	  for(int j = 0; j < 100; j++){
	    x.setValue (i*0.1);
	    y.setValue (j*0.1);
	    expr1.value();
	  }
	System.out.println("expr1: "+ 
			   Double.toString((System.currentTimeMillis() - t0)/1.e5)+
			   "ms");
	// result 5000 ms

	Expr expr2 = parser.parse ("x*y*Sin(x)*Sin(y)");
	System.out.println(expr2);
	Variable xx = expr2.getVariable ("x");
	Variable yy = expr2.getVariable ("y");

	t0 = System.currentTimeMillis();    
	
	for(int i = 0; i < 1000; i++)
	  for(int j = 0; j < 100; j++){
	    xx.setValue (i*0.1);
	    yy.setValue (j*0.1);
	    expr2.value();
	  }
	System.out.println("expr2: "+ 
			   Double.toString((System.currentTimeMillis() - t0)/1.e5)+
			   "ms");
	// result 6000 ms

	t0 = System.currentTimeMillis();    
	for(int i=0;i < 1000; i++){
	  Expr expr3 = parser.parse ("x*y*Sin(x)*Sin(y)");
	}
	System.out.println("parsing: "+ 
			   ((double)(System.currentTimeMillis() - t0)/1.e3) + "ms");

      } catch (Exception e){
	e.printStackTrace(System.err);
      }
    }
  }
}
