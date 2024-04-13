package pvs.Expression;

public class FunctionSpline implements UserFunction{

  public String getName(Object o){

    return "spline";

  }

  public int getNumVariables(Object o){
    return 5;
  }

  public double compute(double v[], Object o){

    double f0 = v[0];
    double f1 = v[1];
    double d0 = v[2];
    double d1 = v[3];
    double x  = v[4];
    //TODO - calculates spline connecting 2 points with given 
    // values and derivatives of function in x = 0 and x = 1;

    return x*(1-x)*(1-x);

  }
}
