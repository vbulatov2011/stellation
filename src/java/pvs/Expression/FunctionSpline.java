package pvs.Expression;

public class FunctionSpline implements UserFunction{

  public String getName(Object o){

    return "spline";

  }

  public int getNumVariables(Object o){
    return 5;
  }

  public double compute(double var[], Object o){

    double f0 = var[0];
    double f1 = var[1];
    double d0 = var[2];
    double d1 = var[3];
    double x  = var[4];
    //TODO - calculates spline connecting 2 points with given 
    // values and derivatives of function in x = 0 and x = 1;

    return x*(1-x)*(1-x);

  }
}
