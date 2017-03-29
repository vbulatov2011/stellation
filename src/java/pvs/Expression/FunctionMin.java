package pvs.Expression;

public class FunctionMin implements UserFunction{
  public String getName(Object o){
    return "min";
  }

  public int getNumVariables(Object o){
    return 2;
  }

  public double compute(double var[], Object o){
    return (var[0] < var[1])? var[0]: var[1];
  }
}
