package pvs.polyhedra;

import java.io.PrintWriter;
import java.util.Vector;

import pvs.utils.FixedStreamTokenizer;
import pvs.utils.PVSObserver;
import pvs.utils.Point2;

/**************
 *
 *   class SubdivisionCurve
 *
 */
public class SubdivisionCurve implements PolygonDisplayNode, PVSObserver {

  private String id = "curve";

  Vector3D [] vert; // this is vert

  Vector3D [] cvert = new Vector3D[0]; // CURVE VERTICES 

  boolean needUpdate = true;
  static int count = 0;

  CurveChaikin curve = new CurveChaikin();

  public SubdivisionCurve(){

    vert = new Vector3D[0];
    makeID();
    curve.setObserver(this);
    
  }

  /*
  public SubdivisionCurve(Vector3D [] vert){
    this.vert = vert;
    makeID();
    curve.setObserver(this);
    
  }
  */


  public CurveChaikin getCurve(){

    return curve;

  }


  void makeID(){

    id = "curve_" + count;
    count++;
  }

  public String getNodeName(){

    return "SubdivisionCurve";

  }

  public String getNodeID(){

    return id;
  }

  public void calculatePolygon(){
  }
  
  public void write(PrintWriter out, String indent){
    
    out.println(indent + this.getNodeName() + " {");
    String indent1 = indent + indentStep;
    out.println(indent1 + "id " + id);
    out.println(indent1 + "level " + curve.getLevel());    
    out.println(indent1 + "weight " + curve.getWeight());    
    out.println(indent1 + "closed " + curve.getClosed());    
    out.println(indent1 + "offset " + curve.getOffset());    
    if(vert != null && vert.length > 0){
      out.print(indent1 + "points [" );
      for(int i=0; i < vert.length; i++){
	if(i != 0)
	  out.print(indent1 + "        ");
	out.print(vert[i].x + ", " +vert[i].y + ", " +vert[i].z);
	if(i == vert.length-1){
	  out.println("]");
	} else {
	  out.println(",");
	}
      }
    }
    out.println(indent + "}");
  }

  PVSObserver observer;
  public void setObserver(PVSObserver observer){

    this.observer = observer;

  }
  
  // PVSObserver method is called by curve editor when curve image needs to be updated 
  public void update(Object obj, Object data){
    
    needUpdate = false;
    float[][] pts = curve.getCurve();
    int ncpts = curve.getCurveCount();
    int periodic = curve.getClosed();
    
    if(ncpts + periodic != cvert.length){

      cvert = new Vector3D[ncpts + periodic];    
      for(int i = 0; i < ncpts; i++ ){        
        cvert[i] = new Vector3D(pts[i][0], pts[i][1], 0);        
      }
      // connect the last to the first?
      if(periodic == 1){
        cvert[ncpts] = new Vector3D(pts[0][0], pts[0][1],0);
      }
    } else {
      for(int i = 0; i < ncpts; i++ ){        
        cvert[i].set(pts[i][0], pts[i][1],0);  
      }
      // connect the last to the first?
      if(periodic == 1){
        cvert[ncpts].set(pts[0][0], pts[0][1],0);
      }      
    }

    // copy control points
    Point2 pnt[] = curve.getPoints();    
    if(vert.length != pnt.length){
      vert = new Vector3D[pnt.length];
      for(int i=0; i < pnt.length; i++){
        vert[i] = new Vector3D(pnt[i].x, pnt[i].y,0);
      }
    } else {
      for(int i=0; i < pnt.length; i++){
        vert[i].x = pnt[i].x;
        vert[i].y = pnt[i].y;
        vert[i].z = 0;
      }      
    }


    if(observer != null) // tell our observer, that our image need update 
      observer.update(this, null);
   
  }

  public int getPolygonCount(){
    return 1; 
  }

  public Vector3D[] getPolygon(int index){

    if(needUpdate){
      update(null,null);
    }
    return cvert;

  }

  public void parse( FixedStreamTokenizer st )
  {
    new Parser() .parse( st );
  }  

  /***
   *
   *  class Parser for PolygonArray
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
          return SubdivisionCurve.this;
        }
        
        while(st.nextToken() != st.TT_EOF){	
          switch(st.ttype){
          case FixedStreamTokenizer.TT_WORD:	
            if(st.sval.equalsIgnoreCase("id")){
              st.nextToken();
              id = st.sval;
            } else if(st.sval.equalsIgnoreCase("level")){
              st.nextToken();
              curve.setLevel((int)Double.parseDouble(st.sval)); 
            } else if(st.sval.equalsIgnoreCase("weight")){
              st.nextToken();
              curve.setWeight(Double.parseDouble(st.sval)); 
            } else if(st.sval.equalsIgnoreCase("closed")){
              st.nextToken();
              curve.setClosed((int)Double.parseDouble(st.sval)); 
            } else if(st.sval.equalsIgnoreCase("offset")){
              st.nextToken();
              curve.setOffset(Double.parseDouble(st.sval)); 
            } else if(st.sval.equalsIgnoreCase("points")){
              parsePoints(st);
            } else {
              System.out.println("line: " + st.lineno());
              System.out.println("wrong parameter in " + getNodeName() + ": \"" + st.sval+"\"");
            }
            break;
          case '}': // end of model 
            return SubdivisionCurve.this;
          default: // should not happens 
            System.out.println("line: " + st.lineno());
            System.out.println("wrong character in " + getNodeName() + ": \"" + (char)st.ttype+"\"");
            return SubdivisionCurve.this;
          }         
        }     
      } catch(Exception e){
        e.printStackTrace(System.out);
      }
      
      return SubdivisionCurve.this;

    }
    
    void parsePoints (FixedStreamTokenizer st){

      //System.out.println("parsePoints()");
      Vector pnt = new Vector();
      try {
        st.nextToken();
        if(st.ttype != '['){
          System.out.println("line: " + st.lineno());
          System.out.println("wrong character in points. \"[\" expected, found \"" + st.ttype + "\" instead");
          return;
        }
        
      While: 
        while(st.nextToken() != st.TT_EOF){	

          switch(st.ttype){
          case FixedStreamTokenizer.TT_WORD: 
            //System.out.println("word: " + st.sval);
            // point             
            pnt.addElement(st.sval);
            break;
          case ']':
            break While;
          case ',':            
            //System.out.println("token : ,");
            break;
          default: // should not happens 
            
            System.out.println("line: " + st.lineno());
            System.out.println("wrong character : " + (char)st.ttype);
            break While;
          }
        }    
      } catch(Exception e){
        e.printStackTrace(System.out);
      }
      int n = pnt.size()/3;
      //System.out.println("found " + n + " points");
      vert = new Vector3D[n];
      for(int i=0; i < n; i++){
        vert[i] = new Vector3D(Double.parseDouble((String)pnt.elementAt(i*3)),
                               Double.parseDouble((String)pnt.elementAt(i*3+1)),
                               Double.parseDouble((String)pnt.elementAt(i*3+2)));
      }

      Point2 pnt2[] = new Point2[vert.length];
      for(int i=0; i < pnt2.length; i++){
	pnt2[i] = new Point2(vert[i].x,vert[i].y);
      }
      curve.setPoints(pnt2);

    }    
  } // SubdivisionCurve.Parser   

  @Override
  public PolygonDisplayNode findNode(String nodeID)
  {
      return this.observer .findNode(nodeID);
  }

} // class SubdivisionCurve 
