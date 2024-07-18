
package pvs.Expression;

public interface UserFunction{

  /**
    returns a name of this function
    clientData - arbitrary argument
   */
  public String getName(Object clientData);

  //public String getName();

  /**
    returns a number of variables required by this function
    clientData - arbitrary argument
   */
  public int getNumVariables(Object clientData);
  /**
    does calculations using array of intependent variables var[]
    and arbitrary parameter clientData, which  can be used to pass 
    arbitrary client data via parser to this function
   */
  public double compute(double v[], Object clientData);
}
