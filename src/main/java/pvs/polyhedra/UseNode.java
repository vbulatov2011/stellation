package pvs.polyhedra;

import java.io.PrintWriter;

import pvs.utils.FixedStreamTokenizer;
import pvs.utils.PVSObserver;


/**************
 *
 *   class UseNode
 *
 */
public class UseNode implements PolygonDisplayNode, PVSObserver {

  private String id = "use";

  public String reference="node";

  static int count = 0;

  public UseNode(){

    makeID();
    
  }

  void makeID(){

    count++;
  }

  public String getNodeName(){

    return "Use";

  }

  public String getNodeID(){

    return id;
  }
  
  public void write(PrintWriter out, String indent){
    
    out.println(indent + this.getNodeName() + " {" + reference + "}");

  }

  PVSObserver observer;

  public void setObserver(PVSObserver observer){

    this.observer = observer;

  }
    
  public void update(Object obj, Object data){

    // is called by a child to tell, that image needs update     
    if(observer != null) // tell our observer, that our image need update 
      observer.update(this, null);
    
  }

  
  public int getPolygonCount(){
    PolygonDisplayNode node = this .findNode(reference);
    if(node != null)
      return node.getPolygonCount();
    else 
      return 0;
  }

  public Vector3D[] getPolygon(int index){

    PolygonDisplayNode node = this .findNode(reference);

    if(node != null)
      return node.getPolygon(index);
    else 
      return null;
  }


  public void parse( FixedStreamTokenizer st )
  {
    new Parser() .parse( st );
  }  

  public void setReference(String str){

    this.reference = str;

  }


  /***
   *
   *  class Parser for TransformNode
   */
  class Parser {
    
    Parser(){
      
    }

    public PolygonDisplayNode parse(FixedStreamTokenizer st){
      
      try {
        
        st.nextToken();
        if(st.ttype != '{'){
          System.out.println("wrong start of " + getNodeName()+ ". \"{\" expected, but \"" + 
                      st.ttype + "\" found instead");
          return UseNode.this;
        }
        
        while(st.nextToken() != FixedStreamTokenizer.TT_EOF){	
          switch(st.ttype){
          case FixedStreamTokenizer.TT_WORD:	
	    
	    setReference(st.sval);

            break;

          case '}': // end of node
            return UseNode.this;
          default: // should not happens 
            System.out.println("line: " + st.lineno());
            System.out.println("wrong character in " + getNodeName() + ": \"" + (char)st.ttype+"\"");
            return UseNode.this;
          }         
        }     
      } catch(Exception e){
        e.printStackTrace(System.out);
      }
      
      return UseNode.this;

    }
    
  } // UseNode.Parser   


  @Override
  public PolygonDisplayNode findNode( String nodeID )
  {
      return this .observer .findNode(nodeID);
  }

} // class UseNode 

