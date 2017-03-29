package pvs.Expression;


import java.io.*;
import java.util.*;
import java.awt.*;
import java.awt.event.*;
import java.net.URL;
import java.applet.*;


import pvs.polyhedra.Vector3D;
import pvs.polyhedra.Plane;
import pvs.utils.*;
import pvs.Expression.*;


public class VectorCalculator {
  
  boolean standalone = false;

  public VectorCalculator(boolean standalone){
    this();
    this.standalone = standalone;
  }

  public VectorCalculator(){

    makeUI();
    
  }

  public void show(){
    frame.show();
  }

  Frame frame;

  static final int MAXVECTORS = 3;

  TextField tfVectors[] = new TextField[MAXVECTORS];

  TextArea textArea = new TextArea(24,80);

  WindowOutputStream winStream ;
  PrintStream out;
  TextField tfAngle = new TextField(17);
  Choice cDegree = new Choice();

  Parser parser;

  double angle;
  Vector3D vectors[] = new Vector3D[MAXVECTORS];
  Plane planes[] = new Plane[MAXVECTORS];

  /**
     
   */
  void makeUI(){

    frame = new Frame("Vector Calculator");
    frame.setBackground(Color.lightGray);

    winStream = new WindowOutputStream(textArea);
    out = new PrintStream(winStream);

    GridBagLayout gb = new GridBagLayout();
    frame.setLayout(gb);

    Panel panel1 = new Panel();
    panel1.setLayout(gb);

    for(int i =0; i < MAXVECTORS; i++){

      tfVectors[i] = new TextField(17);

      WindowUtils.constrain(panel1,new Label("v"+(i+1)),0,i,1,1, gbc.NONE, gbc.CENTER,0.,0.);
      WindowUtils.constrain(panel1,tfVectors[i],        1,i,2,1, gbc.HORIZONTAL, gbc.NORTH,1.,0.);
      
    }

    cDegree.addItem("degree");
    cDegree.addItem("radians");
    
    WindowUtils.constrain(panel1,new Label("angle"), 0,MAXVECTORS+1,1,1, gbc.HORIZONTAL, gbc.NORTH,0.,0.);
    WindowUtils.constrain(panel1,tfAngle,            1,MAXVECTORS+1,1,1, gbc.HORIZONTAL, gbc.NORTH,1.,0.);
    WindowUtils.constrain(panel1,cDegree,            2,MAXVECTORS+1,1,1, gbc.NONE, gbc.WEST,0.,0.);    

    
    Panel panelBtn = new Panel();
    
    Button btnDot = new Button("Dot(v1.v2)"); 
    btnDot.addActionListener(new onDot());
    Button btnCross = new Button("Cross(v1, v2)");
    btnCross.addActionListener(new onCross());
    Button btnAngle = new Button("Angle(v1, v2)");
    btnAngle.addActionListener(new onAngle());
    Button btnAngleV1V2V3 = new Button("Angle(v1,v2,v3)");
    btnAngleV1V2V3.addActionListener(new onAngleV1V2V3());
    Button btnNormal = new Button("Normalize(v)");
    btnNormal.addActionListener(new onNormal());
    Button btnRotate = new Button("Rot(v1,v2,angle)");
    btnRotate.addActionListener(new onRotate());
    Button btnLength = new Button("Length(v)");
    btnLength.addActionListener(new onLength());
    Button btnDistance = new Button("Distance(v1,v2)");
    btnDistance.addActionListener(new onDistance());
    Button btnSubtract = new Button("v1 - v2");
    btnSubtract.addActionListener(new onSubtract());
    Button btnIntersect = new Button("Intersect(v1,v2,v3)");
    btnIntersect.addActionListener(new onIntersect());
    Button btnPlane = new Button("Plane(v1,v2,v3)");
    btnPlane.addActionListener(new onPlane());
    Button btnClear = new Button("Clear");
    btnClear.addActionListener(new onClear());

    panelBtn.setLayout(gb);
    int c = 0;
    WindowUtils.constrain(panelBtn,btnDot,    c++,0,1,1,gbc.HORIZONTAL, gbc.NORTH,1.,0.,3,3,3,3);
    WindowUtils.constrain(panelBtn,btnCross,  c++,0,1,1,gbc.HORIZONTAL, gbc.NORTH,1.,0.,3,3,3,3);
    WindowUtils.constrain(panelBtn,btnAngle,  c++,0,1,1,gbc.HORIZONTAL, gbc.NORTH,1.,0.,3,3,3,3);
    WindowUtils.constrain(panelBtn,btnAngleV1V2V3,  c++,0,1,1,gbc.HORIZONTAL, gbc.NORTH,1.,0.,3,3,3,3);
    WindowUtils.constrain(panelBtn,btnNormal, c++,0,1,1,gbc.HORIZONTAL, gbc.NORTH,1.,0.,3,3,3,3);
    WindowUtils.constrain(panelBtn,btnRotate, c++,0,1,1,gbc.HORIZONTAL, gbc.NORTH,1.,0.,3,3,3,3);
    c = 0;
    WindowUtils.constrain(panelBtn,btnDistance, c++,1,1,1,gbc.HORIZONTAL, gbc.NORTH,1.,0.,3,3,3,3);
    WindowUtils.constrain(panelBtn,btnSubtract, c++,1,1,1,gbc.HORIZONTAL, gbc.NORTH,1.,0.,3,3,3,3);
    WindowUtils.constrain(panelBtn,btnIntersect, c++,1,1,1,gbc.HORIZONTAL, gbc.NORTH,1.,0.,3,3,3,3);
    WindowUtils.constrain(panelBtn,btnPlane, c++,1,1,1,gbc.HORIZONTAL, gbc.NORTH,1.,0.,3,3,3,3);
    WindowUtils.constrain(panelBtn,btnLength, c++,1,1,1,gbc.HORIZONTAL, gbc.NORTH,1.,0.,3,3,3,3);

    WindowUtils.constrain(panelBtn,btnClear,  c++,1,1,2,gbc.HORIZONTAL, gbc.NORTH,1.,0.,3,3,3,3);


    WindowUtils.constrain(frame,panel1,0,0,1,1,gbc.HORIZONTAL, gbc.NORTH,1.,0.);
    WindowUtils.constrain(frame,textArea,0,1,1,1,gbc.BOTH, gbc.NORTH,1.,1.,3,6,3,0);    
    WindowUtils.constrain(frame,panelBtn,0,2,1,1,gbc.NONE, gbc.CENTER,0.,0.,3,3,3,3);    
    
    frame.addWindowListener(new CloseWindowListener());
    
    frame.pack();
    frame.validate();

    textArea.setEditable(true);
    
  }


  public double calculate(String s){

    double result = 0;
    try {
      Expr expr = parser.parse (s);
      Variable g = expr.getVariable ("g");
      g.setValue((Math.sqrt(5)+1)/2);

      Variable pi = expr.getVariable ("pi");
      pi.setValue(Math.PI);

      result = expr.value();

    } catch(Exception e){
      System.out.println("Exception during calculating " + s);
    }

    return result;
  }

  static final int MAXD = 12345;

  void getData(){

    parser = new Parser();

    for(int i =0; i < MAXVECTORS; i++){      
      
      String txt = tfVectors[i].getText();
      StringTokenizer st= new StringTokenizer(txt,",");
      int cnt = 0;
      String[] tt = new String[4];
      while(st.hasMoreTokens()){
	tt[cnt++] = st.nextToken();
      }

      double x = 0, y = 0, z = 0, d = 1;

      if(tt[0] != null)
	x = calculate(tt[0]);
      if(tt[1] != null)
	y = calculate(tt[1]);
      if(tt[2] != null)
	z = calculate(tt[2]);
      if(tt[3] != null)
	d = calculate(tt[3]);

      vectors[i] = new Vector3D(x,y,z);

      //if(d == MAXD){
      // if there are only 3 components, planes are defined by vector and it's length
      Vector3D v = new Vector3D(vectors[i]);
      double dd = v.length2();	
      planes[i] = new Plane(v, dd*d);
      /*
      } else {
	// there is 4th component as well. Plane is defined by normalized vector and 
	planes[i] = new Plane(new Vector3D(vectors[i]).normalize(), d);	
      }
      */
      out.println("v"+(i+1)+": " + vectors[i].x + ", "+vectors[i].y +", "+vectors[i].z + "," + planes[i].d);
    }

    boolean degree = cDegree.getSelectedIndex() == 0;    
    angle = 0;
    String ta = tfAngle.getText();
    if(ta.length() > 0){
      double a = calculate(ta);
      if(degree)
	angle = a *(Math.PI/180);
      else 
	angle = a;
    }

    printangle("angle   :",angle);
    printangle("(180-angle)/2: ", (Math.PI-angle)/2);
    printangle("(180+angle)/2: ", (Math.PI+angle)/2);

  }


  class onDot implements ActionListener {

    public void actionPerformed(ActionEvent e){
      getData();
      double dot = vectors[0].dot(vectors[1]);
      out.println("Dot(v1,v2) = " + round(dot));
    }
  }

  class onCross implements ActionListener {

    public void actionPerformed(ActionEvent e){
      getData();
      Vector3D v = vectors[0].cross(vectors[1]);
      out.println("Cross(v1,v2) = " + round(v.x) + ", "  + round(v.y) + ", "  + round(v.z) );
      
    }
  }

  class onAngle implements ActionListener {

    public void actionPerformed(ActionEvent e){
      
      getData();
      vectors[0].normalize();
      vectors[1].normalize();
      double cos = vectors[0].dot(vectors[1]);
      double sin = vectors[0].cross(vectors[1]).length();
      double a = Math.atan2(sin,cos);
      double deg = (int)(a*18000/Math.PI + 0.5)/100.0;

      out.println("a: " + a);
      printangle("Angle(v1, v2): ", a);
      
      double dihedral1 = (Math.PI-a)/2;
      double dihedral2 = (Math.PI+a)/2;
      printangle("(180-Angle(v1,v2))/2: ", dihedral1);
      printangle("(180+Angle(v1,v2))/2: ", dihedral2);
      
    }
  }

  void printangle(String name, double angle){
    
    double deg = (int)(angle*18000/Math.PI + 0.5)/100.0;
    double grad = angle*(180/Math.PI);
    int minutes = (int)((grad-(int)grad)/(1./60.) + 0.5);
    out.println(name + angle + ", " +   deg + " deg; (" + (int)(grad) + "  deg " + minutes + " min )");
  }


  /**
     calculates angle of triangle v1v2v3
   */
  class onAngleV1V2V3 implements ActionListener {

    public void actionPerformed(ActionEvent e){
      
      getData();
      Vector3D v1 = vectors[0].sub(vectors[1]).normalize();
      Vector3D v2 = vectors[2].sub(vectors[1]).normalize();
      double cos = v1.dot(v2);
      double sin = v1.cross(v2).length();
      double a = Math.atan2(sin,cos);
      double deg = (int)(a*18000/Math.PI + 0.5)/100.0;
      out.println("Angle(v1, v2, v3) = " + round(a) + " ( " + deg + " degree)");
      
    }
  }

  class onNormal implements ActionListener {

    public void actionPerformed(ActionEvent e){

      getData();
      for(int i=0; i < MAXVECTORS; i++){
	Vector3D v = vectors[i].normalize();
	out.println("Normalize(v" + (i+1) + ") = " + round(v.x) + ", "  + round(v.y) + ", "  + round(v.z) );	
      }
    }
  }

  class onRotate implements ActionListener {

    public void actionPerformed(ActionEvent e){

      getData();
      Vector3D v = vectors[0].rotate(vectors[1].normalize(),angle);
      out.println("Rotate(v1,v2,angle) = " + round(v.x) + ", "  + round(v.y) + ", "  + round(v.z) );
      
    }
  }
 
  class onDistance implements ActionListener {

    public void actionPerformed(ActionEvent e){

      getData();
      double d = vectors[0].sub(vectors[1]).length();
      out.println("Distance(v1,v2) = " + round(d));
      
    }
  }
 
  class onSubtract implements ActionListener {

    public void actionPerformed(ActionEvent e){

      getData();
      Vector3D v = vectors[0].sub(vectors[1]);
      out.println("v1-v2 = " + round(v.x) + ", "  + round(v.y) + ", "  + round(v.z) );
      
    }
  }
 
  class onIntersect implements ActionListener {

    public void actionPerformed(ActionEvent e){

      getData();

      Vector3D v = Plane.intersect(planes[0],planes[1],planes[2]); 
      if(v != null)
	out.println("Intersect(v1,v2,v3) = " + round(v.x) + ", "  + round(v.y) + ", "  + round(v.z) );
      else 
	out.println("Intersect(v1,v2,v3) = no intersection");	
    }
  }
 
  class onPlane implements ActionListener {

    public void actionPerformed(ActionEvent e){

      getData();

      Plane plane = getPlane(vectors[0], vectors[1], vectors[2]); 
      
      out.print("Plane(v1,v2,v3) = " + round(plane.v.x) + ", "  + round(plane.v.y) + ", "  + round(plane.v.z));
      
      if(plane.d == 0.) // plane passing through origin 
	out.print("," + round(plane.d));
      else              // regular plane 
	out.println();
    }
  }
 
  class onClear implements ActionListener {

    public void actionPerformed(ActionEvent e){

      textArea.setText("");
      
    }
  }
 
  class onLength implements ActionListener {

    public void actionPerformed(ActionEvent e){

      getData();
      for(int i=0; i < MAXVECTORS; i++){
	out.println("Length(v" + i + ")" + round(vectors[i].length()) );
      }
      
    }
  }
 
  class CloseWindowListener extends WindowAdapter {
    
    public void  windowClosing(WindowEvent e){
      frame.setVisible(false);
      frame.dispose();
      if(standalone)
        System.exit(0);
    }
  }

  static double round(double v){
           
    int i = (int)(v + 0.5);
    if(v < 0)
      i -= 1;
    if( Math.abs(i - v) < EPS)
      return i;
    else 
      return chop(v);
  } 

  static final double EPS = 1.e-13;

  static double chop(double v){
    if(v < -EPS || v > EPS)
      return v;
    else 
      return 0;    
  }
  static private GridBagConstraints gbc = new GridBagConstraints();


  /**
    getPlane

    returns equation of plane of given face of given poly
    equation: v.dot(X)-d = 0
    vector P.v is orthogonal to plane and normalized
    d (positive) - distance from plane to origin. 
   */
  public static Plane getPlane(Vector3D v0, Vector3D v1, Vector3D v2){

    Vector3D normal = v2.sub(v1).cross(v0.sub(v1));
    normal.normalize();
    double dot = (normal.dot(v0) + normal.dot(v1) + normal.dot(v2))/3;
    if(dot < EPS && dot > -EPS){
      // plane is passing through origin
      return new Plane(normal, 0);
    } else {
      if(dot < 0){
	dot = -dot;
	normal.mulSet(-1);
      } 
      normal.mulSet(dot);
      return new Plane(normal, 1.);
    }
  }

  public static void main(String args[]){

    new VectorCalculator(true).show();

  }    
}
