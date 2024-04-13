package pvs.Expression;

public class FunctionMin implements UserFunction{
  public String getName(Object o){
    return "min";
  }

  public int getNumVariables(Object o){
    return 2;
  }

  public double compute(double v[], Object o){
    return (v[0] < v[1])? v[0]: v[1];
  }
}
