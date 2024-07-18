package pvs.Expression;

public class FunctionSin implements UserFunction{
  public String getName(Object o){
    return "Sin";
  }

  public int getNumVariables(Object o){
    return 1;
  }

  public double compute(double v[], Object o){
    return Math.sin(v[0]);
  }
}
