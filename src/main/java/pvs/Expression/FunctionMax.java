package pvs.Expression;

public class FunctionMax implements UserFunction{
  public String getName(Object o){
    return "max";
  }

  public int getNumVariables(Object o){
    return 2;
  }

  public double compute(double v[], Object o){
    return (v[0] > v[1])? v[0]: v[1];
  }
}
