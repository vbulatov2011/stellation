package pvs.polyhedra;

import java.awt.event.*;
import java.awt.*;
import java.awt.geom.*;
import java.util.*;
import java.awt.*;
import java.awt.event.*;
import java.io.*;


import pvs.polyhedra.Vector3D;
import pvs.polyhedra.Plane;
import pvs.utils.*;
import pvs.Expression.*;


/**************
 *
 *   class TransformNode
 *
 */
public class TransformNode implements PolygonDisplayNode, PVSObserver {

  private String id = "transform";

  private Dlg_TransformNode editor = null;

  Vector3D [] vert; // 
  // vector of children nodes of this transform 
  Vector children = new Vector();
  String translation = "0 0 0";
  String rotation="0 0 1 0";
  String scale="1 1 1";
  String mirror="0 0 0";

  Vector3D translationVector= new Vector3D(0,0,0);
  Vector3D scaleVector = new Vector3D(1,1,1);
  Vector3D mirrorVector = new Vector3D(0,0,0);
  Matrix3D rotationMatrix = new Matrix3D(1,0,0,0,1,0,0,0,1);
 
  boolean needUpdate = true;
  static int count = 0;

  public TransformNode(){

    vert = new Vector3D[0];
    makeID();
    
  }

  void makeID(){

    id = "transform_" + count;
    count++;
  }

  public String getNodeName(){

    return "Transform";

  }

  public String getNodeID(){

    return id;
  }

  public void calculatePolygon(){

  }

  public String getChildrenText(){

    ByteArrayOutputStream out = new ByteArrayOutputStream();
    PrintWriter pw = new PrintWriter(out);
    writeChildren(pw, "");
    pw.flush();
    String ct = out.toString();
    return ct;
  }
  
  public void write(PrintWriter out, String indent){
    
    out.println(indent + this.getNodeName() + " {");
    String indent1 = indent + indentStep;
    out.println(indent1 + "id " + id);
    out.println(indent1 + "scale \"" + scale+"\"");
    out.println(indent1 + "mirror \"" + mirror+"\"");
    out.println(indent1 + "rotation \"" + rotation+"\"");
    out.println(indent1 + "translation \"" + translation+"\"");
    out.println(indent1 + "children [" );
    String indent2 = indent1 + indentStep;
    writeChildren(out,indent2);
    out.println(indent1 + "]");
    out.println(indent + "}");
  }

  private void writeChildren(PrintWriter out, String indent){

    for(int i=0; i < children.size(); i++){      
      PolygonDisplayNode node = (PolygonDisplayNode)children.elementAt(i);
      node.write(out, indent);
    }
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

    int pc = 0;
    for(int p = 0; p < children.size(); p++){
      pc += ((PolygonDisplayNode)children.elementAt(p)).getPolygonCount();
    }
    System.out.println(" TransformNode polycount: " + pc);
    return pc;

  }

  public Vector3D[] getPolygon(int index){

    if(index >= getPolygonCount())
      return new Vector3D[0];

    Vector3D[] vert = null;
    for(int c = 0; c < children.size(); c++){
      PolygonDisplayNode node = ((PolygonDisplayNode)children.elementAt(c));
      int pc = node.getPolygonCount();
      index -= pc;

      if(index < 0) {
        // we found the child, which has given polygin index
        System.out.println("returning polygon: " + c + ", " + (index + pc));
        vert = node.getPolygon(index + pc);
        break; 
      }
    }

    if(vert == null){
      System.out.println("Transform with no children:" + getNodeID());
      return new Vector3D[0];
    }

    // create a copy
    Vector3D vertn[] = new Vector3D[vert.length];


    // apply tranformations 

    //System.out.println("apply transformation: ");

    // scale 
    double sx = scaleVector.x;
    double sy = scaleVector.y;
    double sz = scaleVector.z;
    for(int v = 0; v < vert.length ; v++){
      vertn[v] = vert[v].mul(sx,sy,sz);
      //System.out.println("scale:" + vertn[v]);
    }

    // mirror 
    double mlength = mirrorVector.length();
    if(mlength != 0.0){// do mirror only if vector in non zero
      Vector3D vm = mirrorVector.mul(1./mlength);      
      for(int v = 0; v < vert.length ; v++){
        //System.out.println("vert:[" + vertn + "]->[");
        vertn[v].subSet(vm.mul(2*vertn[v].dot(vm)));
        //System.out.println(vertn + "]");
      }      
    }


    // rotation 
    for(int v = 0; v < vert.length ; v++){
      vertn[v].mulSet(rotationMatrix);
      //System.out.println("rotation:" + vertn[v]);
    }

    // translation 
    for(int v = 0; v < vert.length ; v++){
      vertn[v].addSet(translationVector);
      //System.out.println("translation:" + vertn[v]);
    }


    return vertn;

  }

  public PolygonEditor getEditor(){

    if(editor == null)
      editor = new Dlg_TransformNode(this);    
    return editor;
  }

  public PolygonNodeParser getParser (){

    return new Parser();
    
  }

  static final String SPACE=" ; ";

  void setTranslation(String str){

    this.translation = str;
    StringTokenizer st = new StringTokenizer(str,SPACE);
    String str_x = "0", str_y = "0", str_z = "0";
    if(st.hasMoreTokens())
      str_x = st.nextToken();
    if(st.hasMoreTokens())
      str_y = st.nextToken();
    if(st.hasMoreTokens())
      str_z = st.nextToken();

    double x = PolygonDisplay.calculateFormula(str_x);
    double y = PolygonDisplay.calculateFormula(str_y);
    double z = PolygonDisplay.calculateFormula(str_z);

    System.out.println("translation: " + x + ", " + y + ", " + z );

    translationVector = new Vector3D(x,y,z);
    
  }

  void setMirror(String str){

    this.mirror = str;
    StringTokenizer st = new StringTokenizer(str,SPACE);
    String str_x = "0", str_y = "0", str_z = "0";
    if(st.hasMoreTokens())
      str_x = st.nextToken();
    if(st.hasMoreTokens())
      str_y = st.nextToken();
    if(st.hasMoreTokens())
      str_z = st.nextToken();

    double x = PolygonDisplay.calculateFormula(str_x);
    double y = PolygonDisplay.calculateFormula(str_y);
    double z = PolygonDisplay.calculateFormula(str_z);

    System.out.println("mirror: " + x + ", " + y + ", " + z );

    mirrorVector = new Vector3D(x,y,z);
    
  }

  void setScale(String str){

    this.scale = str;
    StringTokenizer st = new StringTokenizer(str,SPACE);
    String str_x = "1", str_y = "1", str_z = "1";
    if(st.hasMoreTokens())
      str_x = st.nextToken();
    if(st.hasMoreTokens())
      str_y = st.nextToken();
    if(st.hasMoreTokens())
      str_z = st.nextToken();

    double x = PolygonDisplay.calculateFormula(str_x);
    double y = PolygonDisplay.calculateFormula(str_y);
    double z = PolygonDisplay.calculateFormula(str_z);

    System.out.println("scale: " + x + ", " + y + ", " + z );

    scaleVector = new Vector3D(x,y,z);

  }

  void setRotation(String str){

    this.rotation = str;
    StringTokenizer st = new StringTokenizer(str,SPACE);
    String str_x = "0", str_y = "0", str_z = "1", str_a = "0";
    if(st.hasMoreTokens())
      str_x = st.nextToken();
    if(st.hasMoreTokens())
      str_y = st.nextToken();
    if(st.hasMoreTokens())
      str_z = st.nextToken();
    if(st.hasMoreTokens())
      str_a = st.nextToken();

    double x = PolygonDisplay.calculateFormula(str_x);
    double y = PolygonDisplay.calculateFormula(str_y);
    double z = PolygonDisplay.calculateFormula(str_z);
    double angle = PolygonDisplay.calculateFormula(str_a);

    System.out.println("rotation: " + x + ", " + y + ", " + z + ", " + angle);

    rotationMatrix = Matrix3D.rotation(new Vector3D(x,y,z),angle);
    
  }
  
  void setChildren(String str){
    
    Reader reader = new BufferedReader(new InputStreamReader(new  ByteArrayInputStream(str.getBytes())));

    FixedStreamTokenizer st = PolygonDisplay.makeStreamTokenizer(reader);
    
    try {
      children.removeAllElements();
      PolygonDisplay.parseChildren(st, children, TransformNode.this);
    } catch (Exception e){
      e.printStackTrace(System.out);
    }

  }

  /***
   *
   *  class Parser for TransformNode
   */
  class Parser implements PolygonNodeParser {
    
    Parser(){
      
    }

    public PolygonDisplayNode parse(FixedStreamTokenizer st){
      
      try {
        
        st.nextToken();
        if(st.ttype != '{'){
          System.out.println("wrong start of " + getNodeName()+ ". \"{\" expected, but \"" + 
                      st.ttype + "\" found instead");
          return TransformNode.this;
        }
        
        while(st.nextToken() != st.TT_EOF){	
          switch(st.ttype){
          case FixedStreamTokenizer.TT_WORD:	
            if(st.sval.equalsIgnoreCase("id")){
              st.nextToken();
              id = st.sval;

            } else if(st.sval.equalsIgnoreCase("rotation")){

              st.nextToken();
	      setRotation(st.sval);

            } else if(st.sval.equalsIgnoreCase("translation")){

              st.nextToken();
	      setTranslation(st.sval);

            } else if(st.sval.equalsIgnoreCase("mirror")){

              st.nextToken();
	      setMirror(st.sval);

            } else if(st.sval.equalsIgnoreCase("scale")){

              st.nextToken();
	      setScale(st.sval);

            } else if(st.sval.equalsIgnoreCase("children")){

	      st.nextToken();
	      if(st.ttype != '['){
		System.out.println("line: " + st.lineno());
		System.out.println("wrong token in " + getNodeName() + ": \"" + st.sval+"\"");
		throw new Exception("paramater children should start with [");
	      }
              PolygonDisplay.parseChildren(st, children, TransformNode.this);

            } else {
              System.out.println("line: " + st.lineno());
              System.out.println("wrong parameter in " + getNodeName() + ": \"" + st.sval+"\"");
            }
            break;
          case '}': // end of model 
            return TransformNode.this;
          default: // should not happens 
            System.out.println("line: " + st.lineno());
            System.out.println("wrong character in " + getNodeName() + ": \"" + (char)st.ttype+"\"");
            return TransformNode.this;
          }         
        }     
      } catch(Exception e){
        e.printStackTrace(System.out);
      }
      
      return TransformNode.this;

    }
    
  } // TransformNode.Parser   
} // class Transform 
