
package pvs.Expression;

/**
  small container to keep together function object and related data
 */
public class  UserFunctionData{

  /**
    reference to user function object
   */
  public UserFunction uf;

  /**
    reference to client data
    it allows one class to have multiple data 
   */
  public Object data;

  public UserFunctionData(UserFunction uf,Object data ){
    this.uf = uf;
    this.data = data;
  }
}
