package pvs.polyhedra;

import java.awt.Button;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.FileDialog;
import java.awt.Frame;
import java.awt.GridBagConstraints;
import java.awt.GridBagLayout;
import java.awt.Label;
import java.awt.Menu;
import java.awt.MenuBar;
import java.awt.MenuItem;
import java.awt.Panel;
import java.awt.TextField;
import java.awt.Toolkit;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.awt.event.WindowAdapter;
import java.awt.event.WindowEvent;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.PrintStream;
import java.io.PrintWriter;
import java.io.Reader;
import java.io.StreamTokenizer;
import java.util.Vector;

import pvs.Expression.Expr;
import pvs.Expression.Variable;
import pvs.polyhedra.stellation.DlgPrint;
import pvs.utils.FixedStreamTokenizer;
import pvs.utils.PVSObserver;
import pvs.utils.WindowOutputStream;
import pvs.utils.WindowUtils;


public class PolygonDisplay  implements PVSObserver {


  //TO-DO these vectors should be selectable from user interface
  Vector3D sceneNormal = new Vector3D(0,0,1);
  Vector3D sceneCenter = new Vector3D(0,0,0);

  final static String EXT_POLY = ".poly";
  final static String EXT_BAK = ".bak";

  //TO-DO this is global static pointer to the scene
  // it should not be static 
  static PolygonDisplay scene; 

     
  public PolygonDisplay(){

    scene = this; 
    makeUI();
    
  }

  public void show(){
    frame.show();
  }

  Frame frame;
  StellationCanvas canvas;
  static boolean standAlone = false;

  MenuItem   miOpen = new MenuItem("Open...");
  MenuItem   miNew = new MenuItem("New");
  MenuItem   miSave = new MenuItem("Save");
  MenuItem   miSaveAs  = new MenuItem("Save As...");
  MenuItem   miPrint = new MenuItem("Print...");
  MenuItem   miExit = new MenuItem("Exit...");
   
  MenuItem   miEditNode = new MenuItem("Edit Node...");
  MenuItem   miEditID = new MenuItem("Edit ID...");
  MenuItem   miDelete = new MenuItem("Delete");
  MenuItem   miCopy = new MenuItem("Copy");
  MenuItem   miPaste = new MenuItem("Paste");
  
  MenuItem   miNewArray = new MenuItem("Array...");
  MenuItem   miNewCurve = new MenuItem("Curve...");
  MenuItem   miNewParametrical = new MenuItem("Parametrical...");
  MenuItem   miNewTransform = new MenuItem("Transform...");
  MenuItem   miNewUse = new MenuItem("Use...");  


  java.awt.List listPoly = new java.awt.List(5);

  TextField vectorField = new TextField();


  Vector polygons = new Vector();
  String fileName; 

  int currentPolygon = 0;

  boolean needInit = true;

  void makeUI(){

    frame = new Frame("Polygon Display");
    frame.setMenuBar(makeMenuBar());
    GridBagLayout gbl = new GridBagLayout();
    frame.setLayout(gbl);
    frame.setBackground(Color.lightGray);
    SFace[] faces = new SFace[0];
    SFace[] ffaces = new SFace[0];
    Axis[] axes = new Axis[0];
    Vector3D[][] planes = new Vector3D[0][0];
    
    canvas = new StellationCanvas(faces, ffaces, 
                                  true, //UsePolyline // to draw non-closed polygons 
                                  true); //DisplayMousePosition

    Panel panel1 = new Panel();
    panel1.setLayout(gbl);

    Panel panelBtn = new Panel();
    panelBtn.setLayout(gbl);
    int c = 0;

    WindowUtils.constrain(panel1,listPoly,    0,c++,1,1, gbc.VERTICAL, gbc.CENTER,1.,1.,2,2,2,2);   

    WindowUtils.constrain(frame,canvas,     0,0,1,1, gbc.BOTH, gbc.CENTER,1.,1.);
    WindowUtils.constrain(frame,panel1, 1,0,1,1, gbc.VERTICAL, gbc.CENTER,0.,1.);
    
    miOpen.addActionListener(new onRead());

    miNew.addActionListener(new onNew());
    miSave.addActionListener(new onSave());
    miSaveAs.addActionListener(new onSaveAs());
    miPrint.addActionListener(new onPrint());
    miExit.addActionListener(new onExit());
    
    miEditNode.addActionListener(new onEdit());
    miEditID.addActionListener(new onEditID());
    miDelete.addActionListener(new onDelete());
    miCopy.addActionListener(new onCopy());
    miPaste.addActionListener(new onPaste());
    
    miNewArray.addActionListener(new onAddArray());
    miNewCurve.addActionListener(new onAddCurve());
    miNewParametrical.addActionListener(new onParametrical());
    miNewTransform.addActionListener(new onAddTransform());
    miNewUse.addActionListener(new onAddTransform());

    listPoly.addActionListener(new onListPolyAction());
    
    frame.addWindowListener(new PolygonDisplayWindowListener(standAlone, frame));

    frame.pack();


    
  }

  MenuBar makeMenuBar(){
    
    
    Menu mFile = new Menu("File");
        
    mFile.add(miOpen);
    mFile.add(miNew);
    mFile.add(miSave);
    mFile.add(miSaveAs);
    mFile.addSeparator();
    mFile.add(miPrint);
    mFile.addSeparator();
    mFile.add(miExit);

   
    Menu mEdit = new Menu("Edit");
 
    mEdit.add(miEditNode);   
    mEdit.add(miEditID);   
    mEdit.addSeparator();
    mEdit.add(miDelete);
    mEdit.add(miCopy);
    mEdit.add(miPaste);

    Menu mNew = new Menu("New");

    mNew.add(miNewArray);   
    mNew.add(miNewCurve);   
    mNew.add(miNewParametrical);   
    mNew.add(miNewTransform);   
    mNew.add(miNewUse);   

    MenuBar  mbar = new MenuBar();

    mbar.add(mFile);
    mbar.add(mEdit);
    mbar.add(mNew);

    return mbar;
    
  }

  void updatePolygon(PolygonDisplayNode polygon){ // Vector3D[] vert){
    // we are informed, that polygon was changed
    // we just regenerating the whole picture 
    displayPolygons();
    
  }

  /**
     return node with given ID 
   */
  PolygonDisplayNode findNode(String nodeID){

    //System.out.println("findNode()" + nodeID);
    for(int i = 0; i < polygons.size(); i++){

      PolygonDisplayNode node = (PolygonDisplayNode)polygons.elementAt(i);
      //System.out.println("       nodeID: " + node.getNodeID());
      if(node.getNodeID().equals(nodeID))
	return node;
    }
    return null;
  }

  void displayPolygons(){
    
    // first polygon defines plane in which to project others
    // TO-DO - we need to define separate normal vector and center 
    /*
      // this was used to choose center and normal by first polygon. 
    Vector3D[] vert0 = ((PolygonDisplayNode)polygons.elementAt(0)).getPolygon();
    if(vert0.length < 3){
      System.out.println("first polygon has no vertices");
      return;
    }
    Plane plane = new Plane(vert0[0],vert0[1],vert0[2]);    

    SFace face0 = new SFace (vert0, plane,0);

    SFace faces[] = new SFace[polygons.size()]; 
    Vector3D center = new Vector3D(0.,0.,0.);
    for(int i=0; i < vert0.length; i++){
      center.addSet(vert0[i]);
    }
    center.mulSet(1.0/face0.vertices.length);
    Vector3D y = new Vector3D(0,1,0);
    Vector3D z = new Vector3D(0,0,1);
    Vector3D normal = vert0[1].sub(vert0[0]).cross(vert0[2].sub(vert0[1]));
    normal.normalize();
    */

    Vector3D normal = new Vector3D(sceneNormal);
    Vector3D center = new Vector3D(sceneCenter);

    Plane plane = new Plane(normal,0.0);    
    Vector3D y = new Vector3D(0,1,0);
    Vector3D z = new Vector3D(0,0,1);

    int pc = 0; // total number of polygons (some nodes may have generate several polygons)
    for(int p = 0; p < polygons.size(); p++){
      
      pc += ((PolygonDisplayNode)polygons.elementAt(p)).getPolygonCount();
    }
   
    SFace faces[] = new SFace[pc];

    pc = 0;
    for(int p = 0; p < polygons.size(); p++){
      
      int pcount = ((PolygonDisplayNode)polygons.elementAt(p)).getPolygonCount();
      for(int pp = 0; pp < pcount; pp++){

        Vector3D[] vert1 = ((PolygonDisplayNode)polygons.elementAt(p)).getPolygon(pp);
        // make a clone, because we will modify it.
        Vector3D[] vert = new Vector3D[vert1.length];
        for(int v = 0; v < vert1.length; v++){
          vert[v] = new Vector3D(vert1[v]);
        }
        SFace face = new SFace (vert, plane,0);
        faces[pc] = face;
        for(int j = 0; j < vert.length; j++){
          vert[j].subSet(center);
        }
        
        // rotate face normal to Z-axis
        for(int i = 0; i < vert.length; i++){
          vert[i].rotateSet(normal,z);
          // System.out.println("" + vert[i].x + ","+ vert[i].y + ","+ vert[i].z);
        }
        pc++;
      } 
    }

    canvas.setFaces(new SFace[0], faces, null, null);
    if(needInit){
      canvas.init();
      needInit = false;
    }
  }

  int count = 0;

  String getNewPolyName(){

    count++;
    return "poly_"+ count;

  }
  /*
  class onSet implements ActionListener {

    public void actionPerformed(ActionEvent e){

      updatePolygon();
      
    }
  }
  */
  class onEdit implements ActionListener {

    public void actionPerformed(ActionEvent e){
      
      int ind = listPoly.getSelectedIndex();
      if(ind < 0 || ind >= polygons.size())
        return;
      ((PolygonDisplayNode)polygons.elementAt(ind)).getEditor().show();
    }
  }


  class onListPolyAction implements ActionListener {

    public void actionPerformed(ActionEvent e){
      
      int ind = listPoly.getSelectedIndex();
      if(ind < 0 || ind >= polygons.size())
        return;
      ((PolygonDisplayNode)polygons.elementAt(ind)).getEditor().show();
    }
  }


  class onDelete implements ActionListener {

    public void actionPerformed(ActionEvent e){

      int ind = listPoly.getSelectedIndex();
      if(ind < 0 || ind >= polygons.size())
        return;
      polygons.removeElementAt(ind);
      listPoly.remove(ind);
      displayPolygons();            

    }
  }

  class onNew implements ActionListener {

    public void actionPerformed(ActionEvent e){

      fileName = null;
      polygons.removeAllElements();
      displayPolygons();            
      listPoly.removeAll();
    }
  }

  class onSave implements ActionListener {

    public void actionPerformed(ActionEvent e){

      if(fileName != null)
        write(fileName );
      else 
        saveAs();

    }
  }

  class onSaveAs implements ActionListener {

    public void actionPerformed(ActionEvent e){

      saveAs();

    }
  }	

  void initTitle(){
    frame.setTitle("Polygon Display: [" + fileName + "]");
    
  }

  void saveAs (){

    if(fileDialog == null){
      fileDialog = new FileDialog(frame, "Save polygon", FileDialog.SAVE);
    } else {
      fileDialog.setMode(FileDialog.SAVE);
    }
    
    fileDialog.show();
    
    if(fileDialog.getFile() == null)
      return;
    String fName = fileDialog.getFile();
    String dName = fileDialog.getDirectory();
    
    String fileName = dName + fName;
    write(fileName);
    PolygonDisplay.this.fileName = fileName;
    initTitle();

  }

  void write(String fileName ){
    
    if(!fileName.toLowerCase().endsWith(EXT_POLY))
      fileName = fileName.concat(EXT_POLY);
    
    String bakName = fileName+EXT_BAK;
    File bak = new File(bakName);
    bak.delete();
    File curFile = new File(fileName);
    if(curFile.exists()){
      boolean res = curFile.renameTo(new File(bakName));
    }
    
    File file = new File(fileName);
    
    try {
      
      OutputStream out = new FileOutputStream(file);
      PrintWriter pw = new PrintWriter(out);
      // write header 
      pw.println(polyFileHeader);
      
      // write viewport
      
      for(int i=0; i < polygons.size(); i++){
        // write each polygon 
        ((PolygonDisplayNode)polygons.elementAt(i)).write(pw,"");
      }
      pw.close();
    } catch (Exception ex){
      ex.printStackTrace();
    }
    
  }


  class onEditID implements ActionListener {

    public void actionPerformed(ActionEvent e){

      // TO_DO !!!!
    }
  }

  class onCopy implements ActionListener {

    public void actionPerformed(ActionEvent e){

      // TO_DO !!!!
    }
  }

  class onPaste implements ActionListener {

    public void actionPerformed(ActionEvent e){

      // TO_DO !!!!
    }
  }

  class onExit implements ActionListener {

    public void actionPerformed(ActionEvent e){

      System.exit(0);
    }
  }

  class onAddArray implements ActionListener {

    public void actionPerformed(ActionEvent e){

      PolygonArray polygon = new PolygonArray();
      listPoly.add(polygon.getNodeID());
      polygons.addElement(polygon);
      listPoly.select(listPoly.getItemCount()-1);

      polygon.setObserver(PolygonDisplay.this);
      PolygonEditor dlg = polygon.getEditor();

      dlg.show();

    }
  }

  class onAddCurve implements ActionListener {

    public void actionPerformed(ActionEvent e){

      SubdivisionCurve polygon = new SubdivisionCurve();
      listPoly.add(polygon.getNodeID());
      polygons.addElement(polygon);
      listPoly.select(listPoly.getItemCount()-1);

      polygon.setObserver(PolygonDisplay.this);
      PolygonEditor dlg = polygon.getEditor();

      dlg.show();

    }
  }

  class onAddTransform implements ActionListener {

    public void actionPerformed(ActionEvent e){

      TransformNode polygon = new TransformNode();
      listPoly.add(polygon.getNodeID());
      polygons.addElement(polygon);
      listPoly.select(listPoly.getItemCount()-1);

      polygon.setObserver(PolygonDisplay.this);
      PolygonEditor dlg = polygon.getEditor();

      dlg.show();

    }
  }

  class onParametrical implements ActionListener {

    public void actionPerformed(ActionEvent e){

      PolygonParametrical polygon = new PolygonParametrical();
      listPoly.add(polygon.getNodeID());
      polygons.addElement(polygon);
      listPoly.select(listPoly.getItemCount()-1);

      polygon.setObserver(PolygonDisplay.this);
      PolygonEditor dlg = polygon.getEditor();

      dlg.show();
      
    }
  }

  class onAddUse implements ActionListener {

    public void actionPerformed(ActionEvent e){
      //TO-DO 
    }
  }

  public void update(Object who, Object what){

    if(who instanceof PolygonDisplayNode){
      

      PolygonDisplayNode poly = (PolygonDisplayNode)who;
      updatePolygon(poly);
      System.out.println("update " + poly.getNodeID());

    }

  }

  FileDialog fileDialog;

  class onRead implements ActionListener {

    public void actionPerformed(ActionEvent e){


	if(fileDialog == null){
	  fileDialog = new FileDialog(frame, "Open Polyhedron", FileDialog.LOAD);
	} else {
	  fileDialog.setMode(FileDialog.LOAD);
	}
	
	fileDialog.setTitle("Open Polyhedron");
        fileDialog.show();

	if(fileDialog.getFile() == null)
	  return;
	String fName = fileDialog.getFile();
	String dName = fileDialog.getDirectory();
	
	PolygonDisplay.this.fileName = dName + fName;
	       
        polygons.removeAllElements();
        listPoly.removeAll();
        parsePolygonFile(fileName);
	initTitle();

    }
  }

  void initList(){

    for(int i=0; i < polygons.size(); i++){
      listPoly.add(((PolygonDisplayNode)polygons.elementAt(i)).getNodeID());
    }
  }

  static final char [] polyFileHeader = {'#','p','o','l','y','-','v','1'};

  void parsePolygonFile(String fileName){

    FileInputStream inp = null;

    try {

      inp = new FileInputStream(fileName);
      
      Reader r = new BufferedReader(new InputStreamReader(inp));
      
      char[] buf = new char[polyFileHeader.length]; 
      r.read(buf,0,polyFileHeader.length);
      for(int i =0; i < polyFileHeader.length; i++){
        if(buf[i] != polyFileHeader[i]){
          System.out.println("wrong polygon file header");
          return;
        }
      }
      
      FixedStreamTokenizer st = makeStreamTokenizer(r);
            
      parseChildren(st,polygons, this);
      
    
    } catch (Exception ex){

      ex.printStackTrace();

    }    
    try {
    if(inp != null)
      inp.close();
    } catch (Exception e){
    }

    initList();
    displayPolygons();
  }

  static FixedStreamTokenizer makeStreamTokenizer(Reader r){

      FixedStreamTokenizer st = new FixedStreamTokenizer(r);
      
      st.whitespaceChars((int)'=',(int)'=');
      st.slashSlashComments(true);
      st.slashStarComments(true);
      st.eolIsSignificant(false);
      st.quoteChar('"'); 
      st.wordChars('_','_'); 
      st.wordChars('0','9'); 
      st.wordChars('-','-'); 
      st.wordChars('.','.'); 
      return st;


  }

  /**
     
   */
  static public void parseChildren(FixedStreamTokenizer st, Vector children, 
				   PVSObserver observer) throws Exception{
    
    while(st.nextToken() != st.TT_EOF){	
      
      switch(st.ttype){
	
      case StreamTokenizer.TT_WORD:
	
	if(st.sval.equalsIgnoreCase("PolygonParametrical")){
	  
	  PolygonParametrical poly = new PolygonParametrical();
	  poly.getParser().parse(st);
	  children.addElement(poly);
	  poly.calculatePolygon();
	  poly.setObserver(observer);
	  
	} else if(st.sval.equalsIgnoreCase("PolygonArray")){
	  
	  PolygonArray poly = new PolygonArray();
	  poly.getParser().parse(st);
	  children.addElement(poly);
	  poly.calculatePolygon();
	  poly.setObserver(observer);
	  
	} else if(st.sval.equalsIgnoreCase("SubdivisionCurve")){
	  
	  SubdivisionCurve poly = new SubdivisionCurve();
	  poly.getParser().parse(st);
	  children.addElement(poly);
	  poly.setObserver(observer);
	  
	} else if(st.sval.equalsIgnoreCase("Transform")){
	  
	  TransformNode poly = new TransformNode();
	  poly.getParser().parse(st);
	  children.addElement(poly);
	  poly.setObserver(observer);

	} else if(st.sval.equalsIgnoreCase("SceneNormal")){
	  
          //TO-DO parse scene normal 

	} else if(st.sval.equalsIgnoreCase("SceneCenter")){
	  
          //TO-DO parse scene center

	} else if(st.sval.equalsIgnoreCase("SceneScale")){
	  
          //TO-DO parse scene scale 
	  
	} else if(st.sval.equalsIgnoreCase("Use")){
	  
	  UseNode poly = new UseNode();
	  poly.getParser().parse(st);
	  children.addElement(poly);
	  poly.setObserver(observer);
	  
	} else{
	  
	  System.out.println("line: " + st.lineno());
	  System.out.println("unknown node: " + st.sval); 
	  throw new Exception(" parsing error");

	}
	break;
      case ']': // end of children list 
	return; 
      default: // should not happens 
	System.out.println("line: " + st.lineno());
	System.out.println("wrong token in the file: " + (char)st.ttype);
	throw new Exception(" parsing error");
	//break;
      }         
    } 
  }



  DlgPrint dlgPrint;

  class onPrint implements ActionListener {


    public void actionPerformed(ActionEvent e){

	if(dlgPrint == null){
	  
	  dlgPrint = new DlgPrint();
	  
	}
	boolean result = dlgPrint.edit(frame, canvas.getRenderingShapes());
    }
  }	

  static private GridBagConstraints gbc = new GridBagConstraints();

  static void createOutputStream(){

    WindowOutputStream winStream;
    Dimension screen = Toolkit.getDefaultToolkit().getScreenSize();

    winStream = new WindowOutputStream();
    PrintStream Out = new PrintStream(winStream);
    Frame frameOutput = winStream.getFrame();
    frameOutput.setVisible(true);
    //frameOutput.addWindowListener(frameClosingListener);
    frameOutput.setLocation(screen.width/2,screen.height/2);
    frameOutput.setSize(screen.width/2,screen.height/2-30);
    frameOutput.validate();
    frameOutput.setTitle("output");

    try {
      System.setOut(Out);
      System.setErr(Out);
    } catch (Exception e){
      System.out.println("failed call System.setOut()");
    }

  }

  public static void main(String[] arg){

    createOutputStream();    
    standAlone = true;
    new PolygonDisplay().show();
    
  }

  static pvs.Expression.Parser parser = new pvs.Expression.Parser();

  static double calculateFormula(String formula){

    try {
      Expr expr = parser.parse (formula);
      // special variables 
      Variable g = expr.getVariable ("g");
      g.setValue((Math.sqrt(5)+1)/2);
      Variable pi = expr.getVariable ("pi");
      pi.setValue(Math.PI);

      return expr.value();
    } catch (Exception e){
      e.printStackTrace(System.out);
    }
    return 0;
  }

} // PolygonDisplay 




class PolygonDisplayWindowListener extends WindowAdapter {
  
  boolean doExit = false;
  Frame frame;

  PolygonDisplayWindowListener(boolean doExit, Frame frame){
    this.doExit = doExit;
    this.frame = frame;
  }
  public void  windowClosing(WindowEvent e){
    frame.setVisible(false);
    frame.dispose();
    if(doExit)
      System.exit(-1);
  }
}

/**
 *   class Dlg_SubdivisionCurve
 *   
 */
class Dlg_SubdivisionCurve  implements PolygonEditor{

  Frame frame;

  SubdivisionCurve polygon;

  public Dlg_SubdivisionCurve(SubdivisionCurve polygon){

    this.polygon = polygon;
    makeUI();
  }
  
  public void show(){

    frame.show();
  }

  //Button btnUpdate = new Button("Update");

  CurveEditorChaikin curvePanel;

  void makeUI(){

    frame = new Frame("curve: " + polygon.getNodeID());

    GridBagLayout gbl = new GridBagLayout();
    frame.setLayout(gbl);
    frame.setBackground(Color.lightGray);

    curvePanel = new CurveEditorChaikin(polygon.getCurve());

    Panel panel1 = new Panel();
    panel1.setLayout(gbl);
    WindowUtils.constrain(panel1,curvePanel,                   0,0,1,1, gbc.BOTH, gbc.WEST,1.,1.);
    WindowUtils.constrain(panel1,curvePanel.getOptionsPanel(), 1,0,1,1, gbc.NONE, gbc.NORTH,0.,0.);

    Panel panel2 = new Panel();
    panel2.setLayout(gbl);
    
    WindowUtils.constrain(frame,panel1, 0,0,1,1, gbc.BOTH, gbc.CENTER,1.,1.);
    WindowUtils.constrain(frame,panel2, 0,1,1,1, gbc.HORIZONTAL, gbc.CENTER,1.,0.);
    
    initFields();

    frame.pack();
    frame.addWindowListener(new PolygonDisplayWindowListener(false,frame));
    
  }
      
  void initFields(){

  }

  void readFields(){
    
  }

  static private GridBagConstraints gbc = new GridBagConstraints();

}


/**
 *   class Dlg_UseNode
 *   
 */
class Dlg_UseNode  implements PolygonEditor{

  Frame frame;
  UseNode useNode;

  TextField tfReference = new TextField(20);
  Button btnUpdate = new Button("Update");

  public Dlg_UseNode(UseNode useNode){

    this.useNode = useNode;
    makeUI();
  }
  
  public void show(){

    frame.show();
  }

  void makeUI(){

    frame = new Frame("use node");

    GridBagLayout gbl = new GridBagLayout();
    frame.setLayout(gbl);
    frame.setBackground(Color.lightGray);

    Panel panel1 = new Panel();     panel1.setLayout(gbl);
    int c = 0;
    WindowUtils.constrain(panel1,tfReference, 1,c,1,1, gbc.BOTH, gbc.CENTER,1.,1.);
    WindowUtils.constrain(panel1,new Label("reference"), 0,c++,1,1, gbc.NONE, gbc.EAST,0.,1.);

    Panel panel3 = new Panel();    panel3.setLayout(gbl);
    WindowUtils.constrain(panel3,btnUpdate,      0,0,1,1, gbc.NONE, gbc.CENTER,1.,1.);    
    
    WindowUtils.constrain(frame,panel1, 0,0,1,1, gbc.BOTH, gbc.CENTER,1.,1.);
    WindowUtils.constrain(frame,panel3, 0,1,1,1, gbc.NONE, gbc.CENTER,1.,0.);
    
    initFields();

    btnUpdate.addActionListener(new onUpdate());
    frame.pack();
    frame.addWindowListener(new PolygonDisplayWindowListener(false,frame));
    
  }
      
  void initFields(){

    tfReference.setText(useNode.reference);
    
  }

  void readFields(){
    
  }

  class onUpdate implements ActionListener {

    public void actionPerformed(ActionEvent e){

      useNode.setReference(tfReference.getText());      

    }
  }

  static private GridBagConstraints gbc = new GridBagConstraints();

}



/**
 *
 *  interface PolygonNodeParser
 *
 */
interface PolygonNodeParser {

  public PolygonDisplayNode parse(FixedStreamTokenizer st);

}

interface PolygonEditor {

  public void show();

}

interface PolygonDisplayNode {
  
  public PolygonNodeParser getParser ();
  public String getNodeName();
  public String getNodeID();
  public void write(PrintWriter out, String indent);

  public int getPolygonCount();
  public Vector3D[] getPolygon(int index);
  public PolygonEditor getEditor();
  public void setObserver(PVSObserver observer);
  //public void calculatePolygon();
  static final String indentStep = "  ";

}

