package pvs.Expression;

import pvs.utils.SpecialFunction;

/**
  a little bit ridiculos class which dispatches its call to other functions
 */
public class FunctionSpec { //implements UserFunction {

  /**
    this function should be called to register all functions
    contained in this functions container
   */
  static UserFunction functions[] = new UserFunction[]{
    new FunctionLog10(),
    new FunctionJ0(),
    new FunctionJ1(),
    new FunctionY0(),
    new FunctionY1(),
    new FunctionFac(),
    new FunctionGamma(),
    new FunctionSinh(),
    new FunctionCosh(),
    new FunctionTanh(),
    new FunctionAsinh(),
    new FunctionAcosh(),
    new FunctionAtanh(),
    new FunctionErf(),
    new FunctionErfc(),
    new FunctionNormal(),
    new FunctionPoisson(),
    new FunctionPoissonc(),
    new FunctionChiSq(),
    new FunctionChiSqc(),
    new FunctionIgam(),
    new FunctionIgamc(),
    new FunctionJn(),
    new FunctionYn(),
    new FunctionMin(),
    new FunctionMax(),      
    new FunctionSpline(),      
  };

  public static void registerFunctions(Parser parser){

    for(int i=0; i < functions.length; i++){
      parser.registerFunction(functions[i]);
    }
  }
  
  //public String getName(Object o){
  //  return ((UserFunction)o).getName(null);
  //}
  //public int getNumVariables(Object o){
  //  return ((UserFunction)o).getNumVariables(null);
  //}  
  //public double compute(double var[], Object o){
  //  return ((UserFunction)o).compute(var,null);
  //}
  
}

class FunctionLog10 implements  UserFunction{
  public String getName(Object o){return "log10";}
  public int getNumVariables(Object o){return 1;}  
  public double compute(double var[], Object o){
      return Math.log(var[0])/ Math.E;
  }
}

class FunctionJ0 implements  UserFunction{
  public String getName(Object o){return "J0";}
  public int getNumVariables(Object o){return 1;}  
  public double compute(double var[], Object o){
      return SpecialFunction.j0(var[0]);
  }
}

class FunctionJ1 implements  UserFunction{
  public String getName(Object o){return "J1";}
  public int getNumVariables(Object o){return 1;}  
  public double compute(double var[], Object o){
      return SpecialFunction.j1(var[0]);
  }
}

class FunctionY0 implements  UserFunction{
  public String getName(Object o){return "Y0";}
  public int getNumVariables(Object o){return 1;}  
  public double compute(double var[], Object o){
      return SpecialFunction.y0(var[0]);
  }
}

class FunctionY1 implements  UserFunction{
  public String getName(Object o){return "Y1";}
  public int getNumVariables(Object o){return 1;}  
  public double compute(double var[], Object o){
      return SpecialFunction.y1(var[0]);
  }
}

class FunctionFac implements  UserFunction{
  public String getName(Object o){return "fac";}
  public int getNumVariables(Object o){return 1;}  
  public double compute(double var[], Object o){
      return SpecialFunction.fac(var[0]);
  }
}

class FunctionGamma implements  UserFunction{
  public String getName(Object o){return "gamma";}
  public int getNumVariables(Object o){return 1;}  
  public double compute(double var[], Object o){
      return SpecialFunction.gamma(var[0]);
  }
}

class FunctionSinh implements  UserFunction{
  public String getName(Object o){return "sinh";}
  public int getNumVariables(Object o){return 1;}  
  public double compute(double var[], Object o){
      return SpecialFunction.sinh(var[0]);
  }
}

class FunctionCosh implements  UserFunction{
  public String getName(Object o){return "cosh";}
  public int getNumVariables(Object o){return 1;}  
  public double compute(double var[], Object o){
      return SpecialFunction.cosh(var[0]);
  }
}

class FunctionTanh implements  UserFunction{
  public String getName(Object o){return "tanh";}
  public int getNumVariables(Object o){return 1;}  
  public double compute(double var[], Object o){
      return SpecialFunction.tanh(var[0]);
  }
}


class FunctionAsinh implements  UserFunction{
  public String getName(Object o){return "asinh";}
  public int getNumVariables(Object o){return 1;}  
  public double compute(double var[], Object o){
      return SpecialFunction.asinh(var[0]);
  }
}

class FunctionAcosh implements  UserFunction{
  public String getName(Object o){return "acosh";}
  public int getNumVariables(Object o){return 1;}  
  public double compute(double var[], Object o){
      return SpecialFunction.acosh(var[0]);
  }
}

class FunctionAtanh implements  UserFunction{
  public String getName(Object o){return "atanh";}
  public int getNumVariables(Object o){return 1;}  
  public double compute(double var[], Object o){
      return SpecialFunction.atanh(var[0]);
  }
}

class FunctionErf implements  UserFunction{
  public String getName(Object o){return "Erf";}
  public int getNumVariables(Object o){return 1;}  
  public double compute(double var[], Object o){
      return SpecialFunction.erf(var[0]);
  }
}

class FunctionErfc implements  UserFunction{
  public String getName(Object o){return "Erfc";}
  public int getNumVariables(Object o){return 1;}  
  public double compute(double var[], Object o){
      return SpecialFunction.erfc(var[0]);
  }
}

class FunctionNormal implements  UserFunction{
  public String getName(Object o){return "Normal";}
  public int getNumVariables(Object o){return 1;}  
  public double compute(double var[], Object o){
      return SpecialFunction.normal(var[0]);
  }
}

class FunctionPoisson implements  UserFunction{
  public String getName(Object o){return "Poisson";}
  public int getNumVariables(Object o){return 2;}  
  public double compute(double var[], Object o){
      return SpecialFunction.poisson((int)(var[0]+0.1),var[1]);
  }
}

class FunctionPoissonc implements  UserFunction{
  public String getName(Object o){return "Poissonc";}
  public int getNumVariables(Object o){return 2;}  
  public double compute(double var[], Object o){
      return SpecialFunction.poissonc((int)(var[0]+0.1),var[1]);
  }
}

class FunctionChiSq implements  UserFunction{
  public String getName(Object o){return "ChiSq";}
  public int getNumVariables(Object o){return 2;}  
  public double compute(double var[], Object o){
      return SpecialFunction.chisq(var[0], var[1]);
  }
}

class FunctionChiSqc implements  UserFunction{
  public String getName(Object o){return "ChiSqc";}
  public int getNumVariables(Object o){return 2;}  
  public double compute(double var[], Object o){
      return SpecialFunction.chisqc(var[0], var[1]);
  }
}

class FunctionIgam implements  UserFunction{
  public String getName(Object o){return "IGam";}
  public int getNumVariables(Object o){return 2;}  
  public double compute(double var[], Object o){
      return SpecialFunction.igam(var[0], var[1]);
  }
}

class FunctionIgamc implements  UserFunction{
  public String getName(Object o){return "IGamc";}
  public int getNumVariables(Object o){return 2;}  
  public double compute(double var[], Object o){
      return SpecialFunction.igamc(var[0], var[1]);
  }
}

class FunctionJn implements  UserFunction{
  public String getName(Object o){return "Jn";}
  public int getNumVariables(Object o){return 2;}  
  public double compute(double var[], Object o){
      return SpecialFunction.jn((int)(var[0]+0.01), var[1]);
  }
}

class FunctionYn implements  UserFunction{
  public String getName(Object o){return "Yn";}
  public int getNumVariables(Object o){return 2;}  
  public double compute(double var[], Object o){
      return SpecialFunction.yn((int)(var[0]+0.01),var[1]);    
  }
}
