package pvs.polyhedra;

import java.io.PrintWriter;
import java.util.StringTokenizer;
import java.util.Vector;

import pvs.utils.FixedStreamTokenizer;
import pvs.utils.PVSObserver;

/**************
 *
 *   class PolygonArray
 *
 */
public class PolygonArray implements PolygonDisplayNode {

  private String id = "array";

  private Vector3D [] vert; // vertices of polygon 
  private Vector3D [][] vert1; // veetices of polygon on other side of board 
  private double thickness; // thickness of board ()
  private double extension; // extension of sides (default 0)
  // array of dihedral angles at every polygon side. 
  // angles are measured in degree
  // by default these angles are 90 
  private double angles[] = new double[0];
  
  static int count = 0;

  public PolygonArray(){
    vert = new Vector3D[0];
    id = "array_" + count;
    count++;
  }

  public PolygonArray(Vector3D [] vert){

    this.vert = vert;
    id = "array_" + count;
    count++;
    
  }

  static final double ANGLES2RADS = Math.PI/180;

  public void calculatePolygon(){

    if(thickness != 0.0){

      // make calculations of polygon on other side of board of given thickness      

      vert1 = new Vector3D[(vert.length-1)][2];
      Vector3D zaxis = new Vector3D(0,0,1);
      for(int i = 0; i  < vert.length-1; i++){
	
	Vector3D v1 = new Vector3D(vert[i]); 
	Vector3D v2 = new Vector3D(vert[i+1]); 

	Vector3D vnorm = v2.sub(v1);
	vnorm.normalize();
	vnorm = vnorm.rotate(zaxis, -Math.PI/2);
	vnorm.mulSet(thickness*Math.cos(angles[i]*ANGLES2RADS)/Math.sin(angles[i]*ANGLES2RADS));
	
	v1.addSet(vnorm);
	v2.addSet(vnorm);

	vert1[i][0] = Vector3D.interpolate(v1,v2,-extension);
	vert1[i][1] = Vector3D.interpolate(v1,v2,1 + extension);
	
      }

    }

    if(observer != null){
      observer.update(this,null);
    }

  }


  public String getNodeName(){

    return "PolygonArray";

  }

  public String getNodeID(){

    return id;
  }
  
  public void write(PrintWriter out, String indent){
    
    out.println(indent + this.getNodeName() + " {");
    String indent1 = indent + indentStep;
    out.println(indent1 + "id " + id);
    out.print(indent1 + "points [" );

    for(int i=0; i < vert.length; i++){
      if(i != 0)
        out.print(indent1 + "        ");
      out.print(vert[i].x + ", " +vert[i].y + ", " +vert[i].z);
      if(i < vert.length-1){
        out.println(",");
      }
    }
    out.println("]");

    out.println(indent1 + "thickness " + thickness);
    out.println(indent1 + "extension " + extension);
    
    out.print(indent1 + "angles [" );
    for(int i = 0; i < angles.length; i++){
      if(i != 0)
        out.print(indent1 + "        ");
      out.print(angles[i]);
      if(i < vert.length-1){
        out.println(",");
      }
    }
    out.println("]");
    

    out.println(indent + "}");
  }

  public int getPolygonCount(){
    if(thickness == 0.0)
      return 1; 
    else 
      return vert1.length; 
  }

  public double getThickness(){

    return thickness;

  }

  public double getExtension(){

    return extension;

  }

  public double[] getAngles(){

    return angles;

  }

  public Vector3D[] getVertices(int index){
        
    return vert;
    
  }

  public Vector3D[] getPolygon(int index){

    if(thickness == 0.0){

      return vert;

    } else {

      return vert1[index];
      //return vert;
      //return vert1;
    }
  }

  PVSObserver observer;
  public void setObserver(PVSObserver observer){
    this.observer = observer;
  }

  public void parse( FixedStreamTokenizer st )
  {
    new Parser() .parse( st );
  }  

  /**
   *     void setData(String str)
   */
  public void setPoints(String str){

    StringTokenizer st = new StringTokenizer(str,", \n\r",false);
    Vector pnt = new Vector();
    int count = 0;
    while(st.hasMoreTokens()){
      String tok = st.nextToken();
      pnt.addElement(tok);
    }
    int nvert = pnt.size()/3;
    vert = new Vector3D[nvert];
    for(int i = 0; i < nvert; i++){
      vert[i] = new Vector3D(Double.parseDouble((String)pnt.elementAt(i*3)),
                             Double.parseDouble((String)pnt.elementAt(i*3+1)),
                             Double.parseDouble((String)pnt.elementAt(i*3+2)));
    }

    //if(observer != null){
    //  observer.update(this,null);
    //}
    
  }

  public void setAngles(String str){

    StringTokenizer st = new StringTokenizer(str,", \n\r",false);
    Vector pnt = new Vector();
    int count = 0;
    while(st.hasMoreTokens()){
      String tok = st.nextToken();
      pnt.addElement(tok);
    }
    int nvert = pnt.size();
    angles = new double[nvert];
    for(int i = 0; i < nvert; i++){
      angles[i] = Double.parseDouble((String)pnt.elementAt(i));
    }

    
  }

  public void setThickness(String str){

    thickness = Double.parseDouble(str);

    //if(observer != null){
    //  observer.update(this,null);
    //}
    
  }

  public void setExtension(String str){

    extension = Double.parseDouble(str);
    
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
          return PolygonArray.this;
        }
        
        while(st.nextToken() != st.TT_EOF){	
          switch(st.ttype){
          case FixedStreamTokenizer.TT_WORD:	
            if(st.sval.equalsIgnoreCase("id")){
              st.nextToken();
              id = st.sval;

	    } else if(st.sval.equalsIgnoreCase("thickness")){
	      
              st.nextToken();
              thickness = Double.parseDouble(st.sval);

	    } else if(st.sval.equalsIgnoreCase("extension")){
	      
              st.nextToken();
              extension = Double.parseDouble(st.sval);
	      
	    } else if(st.sval.equalsIgnoreCase("angles")){

	      angles = parseAngles(st);

            } else if(st.sval.equalsIgnoreCase("points")){
              vert = parsePoints(st);
	      
            } else {

              System.out.println("line: " + st.lineno());
              System.out.println("wrong parameter in " + getNodeName() + ": \"" + st.sval+"\"");

            }
            break;
          case '}': // end of model 
            return PolygonArray.this;
          default: // should not happens 
            System.out.println("line: " + st.lineno());
            System.out.println("wrong character in " + getNodeName() + ": \"" + (char)st.ttype+"\"");
            return PolygonArray.this;
          }         
        }     
      } catch(Exception e){
        e.printStackTrace(System.out);
      }

      if(angles.length < vert.length){
	double angles1[] = new double[vert.length];
	for(int i=0; i < angles1.length; i++){
	  if(i < angles.length)
	    angles1[i] = angles[i];
	  else 
	    angles1[i] = 90;	  
	}
	angles= angles1;
      }
      return PolygonArray.this;

    }
    
    //-------------------------------------------
    //
    //-------------------------------------------
    double[] parseAngles (FixedStreamTokenizer st){
      
      Vector pnt = new Vector();
      try {
        st.nextToken();
        if(st.ttype != '['){
          System.out.println("line: " + st.lineno());
          System.out.println("wrong character in points. \"[\" expected, found \"" + st.ttype + "\" instead");
          return new double[0];
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
      int n = pnt.size();
      //System.out.println("found " + n + " points");
      double angles[] = new double[n];
      for(int i=0; i < n; i++){
        angles[i] = Double.parseDouble((String)pnt.elementAt(i));
      }
      return angles;

    }

    //-------------------------------------------
    //
    //-------------------------------------------
    Vector3D[] parsePoints (FixedStreamTokenizer st){

      //System.out.println("parsePoints()");
      Vector pnt = new Vector();
      try {
        st.nextToken();
        if(st.ttype != '['){
          System.out.println("line: " + st.lineno());
          System.out.println("wrong character in points. \"[\" expected, found \"" + st.ttype + "\" instead");
          return new Vector3D[0];
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
      Vector3D[] vert = new Vector3D[n];
      for(int i=0; i < n; i++){
        vert[i] = new Vector3D(Double.parseDouble((String)pnt.elementAt(i*3)),
                               Double.parseDouble((String)pnt.elementAt(i*3+1)),
                               Double.parseDouble((String)pnt.elementAt(i*3+2)));
      }
      return vert;
    }    
  } // PolygonArray.Parser 

}
