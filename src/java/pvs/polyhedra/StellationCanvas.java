package pvs.polyhedra;
 

import java.awt.Button;
import java.awt.Canvas;
import java.awt.Checkbox;
import java.awt.Color;
import java.awt.Component;
import java.awt.Dimension;
import java.awt.FileDialog;
import java.awt.Frame;
import java.awt.Graphics;
import java.awt.GridBagConstraints;
import java.awt.GridBagLayout;
import java.awt.Image;
import java.awt.MenuItem;
import java.awt.Panel;
import java.awt.PopupMenu;
import java.awt.Scrollbar;
import java.awt.TextField;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.awt.event.AdjustmentEvent;
import java.awt.event.AdjustmentListener;
import java.awt.event.ItemEvent;
import java.awt.event.ItemListener;
import java.awt.event.KeyAdapter;
import java.awt.event.KeyEvent;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.awt.event.MouseMotionAdapter;
import java.awt.geom.GeneralPath;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Vector;

import pvs.utils.EventCallback;
import pvs.utils.Graphics2D;
import pvs.utils.GraphicsPS;
import pvs.utils.PVSObserver;
import pvs.utils.Point2;
import pvs.utils.Timeout;
import pvs.utils.TimeoutCallback;
import pvs.utils.ViewRect;
import pvs.utils.Viewport;
import pvs.utils.WindowUtils;
 
public class StellationCanvas extends Panel implements Runnable{

  PVSObserver observer;
  int maxlevel = -1;
  Point2 [][][] levels = null;
  //SFace[] faces; // original set of stellation faces
  Point2 [][] fpoly = new Point2[0][0];

  pvs.utils.Graphics2D g2d = new pvs.utils.Graphics2D();
  double Width = 0;
  //Point2[] centers = new Point2[0];
  Point2[][] symLines; // intersections of symmetry planes
  Point2[] symAxes;    // intersections of symmetry axes
  int[] symAxesOrder;    // orders of symmetry axes

  SCanvas canvas;
  Checkbox cbSymAxes, cbSymLines;
  PopupMenu cellSelectionPopup;
  boolean drawSymmetryLines = false;
  boolean drawSymmetryAxes = false;
  double centerX = 0;
  double centerY = 0;
  double polyDiameter = 1; // diameter of face diagram 

  int sbMaximum = 100000;
  int sbVisible = 100000;
  Scrollbar sbVertical = new Scrollbar(Scrollbar.VERTICAL,0,sbVisible,0,sbMaximum);
  Scrollbar sbHorizontal = new Scrollbar(Scrollbar.HORIZONTAL,0,sbVisible,0,sbMaximum);

  double Angle = 0;

  boolean usePolyline = false;
  boolean displayMousePosition = false;

  private SFace[] faces;
  private SFace[] ffaces;
  private Axis[] axes;
  private Vector3D[][] planes;

  TextField mousePositionField;
  
  public StellationCanvas(SFace[] faces, SFace[] ffaces, boolean usePolyline, boolean displayMousePosition){    
    
    this.faces = faces;
    this.ffaces = ffaces;
    this.displayMousePosition = displayMousePosition;
    this.usePolyline = usePolyline;
    initUI();

  }

  /**
    constructor 

   */
  public StellationCanvas(SFace[] faces, SFace[] ffaces, Axis[] axes, Vector3D[][] planes){    
    
    this.faces = faces;
    this.ffaces = ffaces;
    this.axes = axes;
    this.planes = planes;
    initUI();

  }

  void initUI(){

    this.setBackground(Color.white);
    this.setLayout(new GridBagLayout());
    
    Panel buttonsPanel = new Panel();
    buttonsPanel.setLayout(new GridBagLayout());
    buttonsPanel.setBackground(Color.lightGray);
    Button btnZoomIn = new Button("+");
    btnZoomIn.addMouseListener(new ZoomListener(ZOOM_TYPE_IN));
    Button btnZoomOut = new Button("-");
    btnZoomOut.addMouseListener(new ZoomListener(ZOOM_TYPE_OUT));
    Button btnUp = new Button("^");
    btnUp.addMouseListener(new PanListener(PAN_TYPE_UP));
    Button btnDown = new Button("v");
    btnDown.addMouseListener(new PanListener(PAN_TYPE_DOWN));
    Button btnLeft = new Button("<");
    btnLeft.addMouseListener(new PanListener(PAN_TYPE_LEFT));
    Button btnRight = new Button(">");
    btnRight.addMouseListener(new PanListener(PAN_TYPE_RIGHT));
    Button btnRotateRight = new Button("R");
    btnRotateRight.addMouseListener(new RotateListener(1));
    Button btnRotateLeft = new Button("L");
    btnRotateLeft.addMouseListener(new RotateListener(-1));
    if(axes != null){
      cbSymLines = new Checkbox("Sym. Lines",drawSymmetryLines);
      cbSymLines.addItemListener(new SymLinesListener());
      cbSymAxes = new Checkbox("Axes",drawSymmetryAxes);
      cbSymAxes.addItemListener(new SymAxesListener());
    }
    sbVertical.addAdjustmentListener(new SBVerticalAdjustmentListener());
    sbHorizontal.addAdjustmentListener(new SBHorizontalAdjustmentListener());

    int c= 0;
    if(axes != null){    
      WindowUtils.constrain(buttonsPanel,cbSymLines, c++,0,1,1, gbc.NONE, gbc.WEST,0.,0.);
      WindowUtils.constrain(buttonsPanel,cbSymAxes,  c++,0,1,1, gbc.NONE, gbc.WEST,1.,0.);
    }
    /*
    if(displayMousePosition){
      mousePositionField = new TextField();
      WindowUtils.constrain(buttonsPanel,mousePositionField, c++,0,1,1, gbc.HORIZONTAL, gbc.WEST,1.,0.);
    }
    */
    WindowUtils.constrain(buttonsPanel,btnZoomIn,  c++,0,1,1, gbc.NONE, gbc.EAST,1.,0.);
    WindowUtils.constrain(buttonsPanel,btnZoomOut, c++,0,1,1, gbc.NONE, gbc.EAST,0.,0.);
    WindowUtils.constrain(buttonsPanel,btnUp,      c++,0,1,1, gbc.NONE, gbc.EAST,0.,0.);
    WindowUtils.constrain(buttonsPanel,btnDown,    c++,0,1,1, gbc.NONE, gbc.EAST,0.,0.);
    WindowUtils.constrain(buttonsPanel,btnLeft,    c++,0,1,1, gbc.NONE, gbc.EAST,0.,0.);
    WindowUtils.constrain(buttonsPanel,btnRight,   c++,0,1,1, gbc.NONE, gbc.EAST,0.,0.);
    WindowUtils.constrain(buttonsPanel,btnRotateLeft,  c++,0,1,1, gbc.NONE, gbc.EAST,0.,0.);
    WindowUtils.constrain(buttonsPanel,btnRotateRight, c++,0,1,1, gbc.NONE, gbc.EAST,0.,0.);

    canvas = new SCanvas();

    WindowUtils.constrain(this,buttonsPanel, 0,0,2,1, gbc.HORIZONTAL, gbc.WEST,1.,0.);
    WindowUtils.constrain(this,canvas, 0,1,1,1, gbc.BOTH, gbc.CENTER,1.,1.);
    WindowUtils.constrain(this,sbVertical, 1,1,1,1, gbc.VERTICAL, gbc.CENTER,0.,1.);
    WindowUtils.constrain(this,sbHorizontal, 0,2,1,1, gbc.HORIZONTAL, gbc.CENTER,1.,0.);
    
    cellSelectionPopup = makeCellSelectionPopup();
    canvas.add(cellSelectionPopup);

    setFaces(faces, ffaces, axes, planes);

    canvas.addMouseListener(new CanvasMouseListener());
    canvas.addMouseMotionListener(new CanvasMouseMotionListener());
    canvas.addKeyListener(new KeyListenerClass());
    init();
  }

  void setUsePolyline(boolean value){
    usePolyline = value;
  }

  boolean getUsePolyline(boolean value){
    return usePolyline;
  }

  public void init(){
    findWidth();    
    //buildCenters();    
    canvas.repaint();
  }

  /**
    addObserver

   */
  public void addObserver(PVSObserver _observer){
    observer = _observer;
  }

  static Color[] stepColors = new Color[100];
  static {
    float c = 0.0f;
    for(int i = 0; i < stepColors.length; i++){
      //stepColors[i] = Color.getHSBColor(c, 0.8f,1.0f);
      stepColors[i] = Color.getHSBColor(c, 0.5f,1.0f);
      c += 0.1534f;
      if(c > 1.0f)
	c -= 1.0;
    }
  }

  /**
    getColor

   */
  static Color getColor(int i){
    i = (i < 0)? -1 : i; 
    return stepColors[i%100];
  }

  public Dimension getPreferredSize(){
    return new Dimension(300,300);
  }

  /**
    setFaces

   */
  public void setFaces(SFace[] faces){

    this.faces = faces;

    maxlevel = -1;
    for(int i = 0; i < faces.length; i++){
      if(faces[i].layer > maxlevel){
	maxlevel = faces[i].layer;
      }
    }
    int[] lcount = new int[maxlevel+1];

    for(int i = 0; i < faces.length; i++){
      lcount[faces[i].layer]++;
    }

    levels = new Point2[maxlevel+1][][];
    for(int i = 0; i < lcount.length; i++){
      levels[i] = new Point2[lcount[i]][];
    }
    
    int[] counter = new int[maxlevel+1];

    for(int i=0; i < faces.length; i++){

      int level = faces[i].layer;
      Point2[] points = new Point2[faces[i].vertices.length];
      transform(faces[i].vertices,points);
      levels[level][counter[level]++] = points;
    }
    initCurrentMatrix();
    rotate(current_matrix);
    //init();
    canvas.repaint();
  }

  /**
    setFaces

   */
  public void setFaces(SFace[] faces, SFace[] ffaces, Axis[] axes, Vector3D[][] planes){

    this.faces = ffaces;
    maxlevel = -1;
    for(int i = 0; i < faces.length; i++){
      if(faces[i].layer > maxlevel){
	maxlevel = faces[i].layer;
      }
    }
    int[] lcount = new int[maxlevel+1];

    for(int i = 0; i < faces.length; i++){
      lcount[faces[i].layer]++;
    }

    levels = new Point2[maxlevel+1][][];
    for(int i = 0; i < lcount.length; i++){
      levels[i] = new Point2[lcount[i]][];
    }
    int[] counter = new int[maxlevel+1];
    // these are filled faces 
    for(int i=0; i < faces.length; i++){
      int level = faces[i].layer;
      Point2[] points = new Point2[faces[i].vertices.length];
      transform(faces[i].vertices,points);
      levels[level][counter[level]++] = points;
    }

    // these will be drawn as outline
    fpoly = new Point2[ffaces.length][];
    for(int i=0; i < ffaces.length; i++){
      Point2[] points = new Point2[ffaces[i].vertices.length];
      transform(ffaces[i].vertices,points);
      fpoly[i] = points;
    }

    if(axes != null){
      symAxes = new Point2[axes.length];
      symAxesOrder = new int[axes.length];
      for(int i = 0; i < axes.length; i++){
	if(axes[i] != null){
	  symAxes[i] = new Point2(axes[i].vector.x,axes[i].vector.y);
	  symAxesOrder[i] = axes[i].order;
	}
      }
    }
    if(planes != null){
      symLines = new Point2[planes.length][];
      for(int i = 0; i < planes.length; i++){
	if(planes[i] != null){
	  symLines[i] = new Point2[]{new Point2(planes[i][0].x,planes[i][0].y),
				      new Point2(planes[i][1].x,planes[i][1].y)};
	}
      }
    }

    initCurrentMatrix();
    rotate(current_matrix);

    //buildCenters();
    //init();
    canvas.repaint();
    
  }

  void initCurrentMatrix(){
    //System.out.println("CurrentAngle: " + (Angle/Math.PI*180));
    double fi = Angle;
    current_matrix[0][0] = Math.cos(fi);
    current_matrix[1][1] = Math.cos(fi);
    current_matrix[0][1] = Math.sin(fi);
    current_matrix[1][0] = -Math.sin(fi);    
    
  }


  /**
    findWidth

   */
  void findWidth(){

    double r = 0.0;
    //double xmin=100, xmax=-100, ymin=100, ymax=-100;
    for(int i=0; i < fpoly.length; i++){
      Point2[] poly = fpoly[i];
      for(int j = 0; j < poly.length; j++){
	Point2 v = poly[j];
	double v2 = v.length2();
	if(v2 > r)
	  r = v2;
	//if(v.x > xmax)
	//  xmax = v.x;
	//if(v.x < xmin)
	//  xmin = v.x;
	//if(v.y > ymax)
	//  ymax = v.y;
	//if(v.y < ymin)
	//  ymin = v.y;
      }
    } 
    polyDiameter = 2*Math.sqrt(r);
    if(polyDiameter == 0.0)
      polyDiameter = 1;
    Width = polyDiameter;
    
    centerX = 0;
    centerY = 0;
    //Stellation.Out.println("face radius: " + (Width/2));
  }

  /**
    
   */
  /*
  void buildCenters(){

    centers = new Point2[fpoly.length];
    for(int i=0; i < fpoly.length; i++){
      Point2[] poly = fpoly[i];
      Point2 center = new Point2(0,0);
      for(int j = 0; j < poly.length; j++){
	center.addSet(poly[j]);
      }
      center.mulSet(1./poly.length);
      centers[i] = center;
    } 
  }
  */
  /**
    reduces 3D to 2D
   */
  void transform(Vector3D[] vect, Point2[] point){
    for(int i=0; i < vect.length; i++){
      Vector3D v = vect[i];
      point[i] = new Point2(v.x,v.y);
    }    
  }

  
  /**
    paint 

   */
  public void paintCanvas(Graphics g){
    Dimension size = canvas.getSize();
    if(size.width == 0)
      return;
    paintCanvas(g,size.width, size.height);

    if(eventCallback != null){
      // if user is holding down a mouse button
      // this will repeat repeated action 
      EventCallback ec = eventCallback;
      eventCallback = null;
      ec.processEventCallback(null,null);
    }
    // this is to init rendering of selected polygon 
    oldPolyIndex = -1;
  }

  EventCallback eventCallback = null;
  Viewport viewport;
  ViewRect screenRectangle;

  int oldWidth = -1, oldHeight = -1;
  Image backImage = null;
  Graphics backGraphics;

  /**
    paint 

   */
  public void paintCanvas(Graphics g, int width, int height){

    if(width != oldWidth || height != oldHeight || backImage == null){
      oldWidth = width;
      oldHeight = height;
      backImage = createImage(width,height);      
      backGraphics = backImage.getGraphics();
    }    

    backGraphics.setColor(Color.white);
    backGraphics.fillRect(0,0,width,height);

    drawContent(backGraphics, width, height);

    g.drawImage(backImage,0,0,this);
  }

  public void drawContent(Graphics g, int width, int height){

    g2d.setGraphics(g);
    initViewport(width, height);

    drawContent(g2d);
    
  }

  /**
     return vector of PolyShapes for rendering on Graphics2D 
   */
  public Vector getRenderingShapes(){
    
    Vector shapes = new Vector();
    
    for(int i=0; i < levels.length; i++){      

      //g.setColor(getColor(i));

      GeneralPath path = new GeneralPath();
      Point2[][] poly = levels[i];
      if(poly.length == 0)
	continue;

      for(int j=0; j < poly.length; j++){
	path.moveTo((float)poly[j][0].x, (float)poly[j][0].y);
	for(int v = 1; v < poly[j].length; v++){
	  path.lineTo((float)poly[j][v].x, (float)poly[j][v].y);
	}
        path.lineTo((float)poly[j][0].x, (float)poly[j][0].y);
      }
      //path.closePath();
      shapes.addElement(new PolyShape(path,PolyShape.FILL, getColor(i)));

    }

    GeneralPath outline = new GeneralPath();

    // polygon's outline 
    for(int j = 0; j < fpoly.length; j++){
      
      outline.moveTo((float)fpoly[j][0].x, (float)fpoly[j][0].y);
      for(int v = 1; v < fpoly[j].length; v++){
	outline.lineTo((float)fpoly[j][v].x, (float)fpoly[j][v].y);
      }
      if(!usePolyline)
        outline.lineTo((float)fpoly[j][0].x, (float)fpoly[j][0].y);
    }        
    //outline.closePath();
    shapes.addElement(new PolyShape(outline,PolyShape.DRAW, Color.black));
    
    return shapes;

  }

  void initViewport(int width, int height){

    int d = ((width > height) ? height:width);
    int borderWidth = 4;
    double wx = Width*(width-2*borderWidth)/(d-2*borderWidth);
    double wy = Width*(height-2*borderWidth)/(d-2*borderWidth);
    g2d.setViewport(new Viewport(centerX - wx/2, centerY + wy/2,centerX + wx/2, centerY - wy/2));
    g2d.setScreenRectangle(new ViewRect(borderWidth,borderWidth,width-borderWidth,height-borderWidth));
    
  }

  public void drawSelectionPoly(Graphics g, int polyIndex){

    g2d.setGraphics(g);
    g2d.fillPolygon(fpoly[polyIndex]);
    
  }

  /**
    paint 

   */
  public void drawContent(Graphics2D g){
    
    if(levels == null)
      return;
    for(int i=0; i < levels.length; i++){
      g.setColor(getColor(i));
      Point2[][] poly = levels[i];
      for(int j=0; j < poly.length; j++){
	g.fillPolygon(poly[j]);
      }
    }

    // lines
    if(drawSymmetryLines) {
      g.setColor(Color.gray); 
    } else {
      g.setColor(Color.black);    
    }
    // polygon's outline 
    if(usePolyline){
      for(int j = 0; j < fpoly.length; j++){      
        g.drawPolyline(fpoly[j]);
      }        
    } else {
      for(int j = 0; j < fpoly.length; j++){      
        g.drawPolygon(fpoly[j]);
      }        
    }
    
    if(drawSymmetryLines) {
      // symmetry planes 
      //g.setXORMode(Color.white);
      g.setColor(Color.black);
      if(symLines != null){
	for(int i =0; i < symLines.length; i++){
	  if(symLines[i] != null)
	    g.drawLine(symLines[i][0].x,symLines[i][0].y,symLines[i][1].x,symLines[i][1].y);
	}
      }
    }
      // symmetry axes 
    if(drawSymmetryAxes) {      
      if(symAxes != null){
	for(int i =0; i < symAxes.length; i++){
	  if(symAxes[i] != null)
	    drawAxis(g,symAxes[i],symAxesOrder[i]);
	}
      }
    }
    
  }

  void drawAxis(Graphics2D g, Point2 p, int order) {

    int x = (int)(g.x2screen(p.x) + 0.5);
    int y = (int)(g.y2screen(p.y) + 0.5);
    
    int size = 4;
    
    g.setColor(axisColor[order]);
    g.getGraphics().fillOval(x-size,y-size,2*size,2*size+1);    
    
  }

  
  void adjustScrollbars(){

    sbVisible = (int)(sbMaximum * Width/polyDiameter);
    sbVertical.setVisibleAmount(sbVisible);

    int y = (int)((sbMaximum - sbVisible)*0.5*(1-2*centerY/polyDiameter));
    sbVertical.setValue(y);

    int unitInc = (int)((sbMaximum - sbVisible)*( 0.01*Width/polyDiameter));
    if(unitInc < 1)
      unitInc = 1;
    sbVertical.setUnitIncrement(unitInc);
    sbHorizontal.setUnitIncrement(unitInc);
    sbVertical.setBlockIncrement(unitInc*50);
    sbHorizontal.setBlockIncrement(unitInc*50);

    int x = (int)((sbMaximum - sbVisible)*0.5*(1+2*centerX/polyDiameter));
    sbHorizontal.setVisibleAmount(sbVisible);
    sbHorizontal.setValue(x);

  }

  static Color axisColor[] = {Color.gray, Color.gray, 
			      
			      new Color(200,0,200),
			      new Color(0,0,250), 
			      new Color(0,200,250), 
			      new Color(50,250,50), 
			      };

  double[][] current_matrix = {{1,0},{0,1}};


  /**
    rotate 

   */
  void rotate(double [][]matrix){
    // modify current matrix to remember total rotation 
    //rotate_matrix(matrix);

    double m00 = matrix[0][0];
    double m01 = matrix[0][1];
    double m10 = matrix[1][0];
    double m11 = matrix[1][1];
    

    for(int i = 0; i < levels.length; i++){
      Point2[][] poly = levels[i];
      for(int j = 0; j < poly.length; j++){
	Point2[] points = poly[j];
	for(int k = 0; k < points.length; k++){
	  Point2 point = points[k];
	  double t = m00*point.x + m01*point.y;
	  point.y = m10*point.x + m11*point.y;
	  point.x = t;
	}	
      }
    }    

    for(int j = 0; j < fpoly.length; j++){
      Point2[] points = fpoly[j];
      for(int k = 0; k < points.length; k++){
	Point2 point = points[k];
	double t = m00*point.x + m01*point.y;
	point.y = m10*point.x + m11*point.y;
	point.x = t;
      }	
    }    
    if(symLines != null){
      for(int i =0; i < symLines.length; i++){
        if(symLines[i] != null){
          Point2 p = symLines[i][0];
          double t = m00*p.x + m01*p.y;
          p.y = m10*p.x + m11*p.y;
          p.x = t;
          p = symLines[i][1];
          t = m00*p.x + m01*p.y;
          p.y = m10*p.x + m11*p.y;
          p.x = t;
        }
      }
    }
    if(symAxes != null){
      for(int i =0; i < symAxes.length; i++){
	if(symAxes[i] != null){
	  Point2 p = symAxes[i];
	  double t = m00*p.x + m01*p.y;
	  p.y = m10*p.x + m11*p.y;
	  p.x = t;
	}
      }
    }    

    adjustScrollbars();

  }

  
  /**
    rotateMatrix

   */
  void rotate_matrix(double [][]matrix){
    
    double m00 = matrix[0][0];
    double m01 = matrix[0][1];
    double m10 = matrix[1][0];
    double m11 = matrix[1][1];
    double cm00 = current_matrix[0][0];
    double cm01 = current_matrix[0][1];
    double cm10 = current_matrix[1][0];
    double cm11 = current_matrix[1][1];

    current_matrix[0][0] = m00*cm00 + m01*cm10;
    current_matrix[0][1] = m00*cm01 + m01*cm11;
    current_matrix[1][0] = m10*cm00 + m11*cm10;
    current_matrix[1][1] = m10*cm01 + m11*cm11;
  }


  PopupMenu makeCellSelectionPopup(){
    //Font mf = new Font("Monospaced",Font.PLAIN,10);
    PopupMenu menu = new PopupMenu("Select Cell");
    //menu.setFont(mf);    
    MenuItem mi;
    mi = new MenuItem("toggle bottom cell     (Click)");   
    //mi.setFont(mf);
    mi.addActionListener(new ToggleBottomCellAction());
    menu.add(mi); 

    mi = new MenuItem("toggle top cell          (Alt+Click)");   
    mi.addActionListener(new ToggleTopCellAction());
    //mi.setFont(mf);
    menu.add(mi);
    mi = new MenuItem("toggle supp. cells    (Ctrl+Click)");   
    mi.addActionListener(new ToggleSupportingCellsAction());
    //mi.setFont(mf);
    menu.add(mi);
    mi = new MenuItem("add supp. cells        (Shift+Click) ");   
    mi.addActionListener(new AddSupportingCellsAction());
    //mi.setFont(mf);
    menu.add(mi);
    mi = new MenuItem("subtract supp. cells (Ctrl+Shift+Click) ");   
    mi.addActionListener(new SubSupportingCellsAction());
    //mi.setFont(mf);
    menu.add(mi);    
    return menu;
  }

  void displayMousePosition(Point2 point){
    
    if(mousePositionField!= null)

      mousePositionField.setText("[" + point.x + ", " + point.y + "]");
  }

  class SubSupportingCellsAction implements ActionListener {
    public void actionPerformed(ActionEvent e){
	if(oldPolyIndex  >=0 ){
	  int[] arg = new int[2];	
	  arg[0] = oldPolyIndex;
	  arg[1] = SUB_SUPPORTING_CELLS;
	  observer.update(this,arg);
	}
    }
  }
  public static final int SUB_SUPPORTING_CELLS=0,ADD_SUPPORTING_CELLS=1,TOGGLE_SUPPORTING_CELLS=2,
    TOGGLE_TOP_CELL=3,TOGGLE_BOTTOM_CELL=4;

  class AddSupportingCellsAction implements ActionListener {
    public void actionPerformed(ActionEvent e){
	if(menuActionPoly  >=0 ){
	  int[] arg = new int[2];	
	  arg[0] = menuActionPoly;
	  arg[1] = ADD_SUPPORTING_CELLS;
	  observer.update(this,arg);
	}
    }
  }
  class ToggleSupportingCellsAction implements ActionListener {
    public void actionPerformed(ActionEvent e){
	if(menuActionPoly  >=0 ){
	  int[] arg = new int[2];	
	  arg[0] = menuActionPoly;
	  arg[1] = TOGGLE_SUPPORTING_CELLS;
	  observer.update(this,arg);
	}
    }
  }
  class ToggleTopCellAction implements ActionListener {
    public void actionPerformed(ActionEvent e){
	if(menuActionPoly  >=0 ){
	  int[] arg = new int[2];	
	  arg[0] = menuActionPoly;
	  arg[1] = TOGGLE_TOP_CELL;
	  observer.update(this,arg);
	}
    }
  }
  class ToggleBottomCellAction implements ActionListener {
    public void actionPerformed(ActionEvent e){
	if(menuActionPoly  >=0 ){
	  int[] arg = new int[2];	
	  arg[0] = menuActionPoly;
	  arg[1] = TOGGLE_BOTTOM_CELL;
	  observer.update(this,arg);
	}
    }
  }

  int oldPolyIndex = -1;
  int menuActionPoly = -1;

  class CanvasMouseMotionListener extends MouseMotionAdapter {

    public void mouseMoved(MouseEvent e){

      int x = e.getX();
      int y = e.getY();
      Point2 point = g2d.screen2world( x, y); 
      /*
      //int polyIndex = findPoly(point);

      //System.out.println(polyIndex);
      
      //Graphics g = canvas.getGraphics();
      //g.setXORMode(Color.white);
      //g.setXORMode(Color.green);
      //g.setColor(Color.lightGray);
      if(polyIndex == oldPolyIndex)
	return;
      if(oldPolyIndex >= 0){
	// remove old poly
	//drawSelectionPoly(g,oldPolyIndex);
      }
      if(polyIndex  >=0 ){
	// draw new poly 
	//drawSelectionPoly(g,polyIndex);
      }
      oldPolyIndex = polyIndex;      
      */
    }
    
  }

  /**
     class CanvasMouseListener

   */
  class CanvasMouseListener extends MouseAdapter {

    public void mouseReleased(MouseEvent e){

      int x = e.getX();
      int y = e.getY();
      Point2 point = g2d.screen2world( x, y); 

      //System.out.println(e);
      if((e.getModifiers() & e.BUTTON3_MASK) == 0){
	return;
      }      

      int poly = findPoly(point);
      if(poly < 0)
	return;
      menuActionPoly = poly;
      cellSelectionPopup.show(canvas,x,y);
    }

    
    /**
      
     */
    public void mousePressed(MouseEvent e){
      
      int x = e.getX();
      int y = e.getY();
      Point2 point = g2d.screen2world( x, y); 

      System.out.print("pointer:[" + chop(point.x) + ", " + chop(point.y) + "] ");
      int vert[] = findVertex(point);      
      if(vert != null){
	Vector3D v = faces[vert[0]].vertices[vert[1]];
        System.out.print("vertex:[" + chop(v.x) + ", " + chop(v.y)+ "]");
        // TO-DO - highlight the vertex 
      }
      System.out.println();

      if ((e.getModifiers() & e.BUTTON1_MASK) == 0)
	return;
          
      if(observer != null){
	int poly = findPoly(point);
	if(poly  >=0 ){
	  int[] arg = new int[2];	
	  arg[0] = poly;
	  if((e.getModifiers() & e.CTRL_MASK) != 0){
	    if((e.getModifiers() & e.SHIFT_MASK) != 0){
	      arg[1] = SUB_SUPPORTING_CELLS;
	    } else {
	      arg[1] = TOGGLE_SUPPORTING_CELLS;	      
	    }
	  } else if((e.getModifiers() & e.SHIFT_MASK) != 0){
	      arg[1] = ADD_SUPPORTING_CELLS;	      	    
	  } else {
	    if((e.getModifiers() & e.ALT_MASK) != 0){
	      arg[1] = TOGGLE_TOP_CELL; 
	    } else {
	      arg[1] = TOGGLE_BOTTOM_CELL; 
	    }
	  }
	  observer.update(this,arg);
	}
      }
      return ;
    }
  }
  
  public void zoom(double factor){

    Width /= factor;        
    canvas.repaint();
    adjustScrollbars();
    
  }

  public void pan(double shiftX, double shiftY){
    
    centerX -= Width*shiftX;
    centerY -= Width*shiftY;
    canvas.repaint();
    adjustScrollbars();
    
  }

  /**
     findVertex
     returns index of poly and index of vertex
   */
  int[] findVertex(Point2 point){

    double x = point.x;
    double y = point.y;
    double dmin = 1000;

    Point2 pnt1 = g2d.screen2world( 10, 0); 
    Point2 pnt0 = g2d.screen2world( 0, 0); 
    double cutoff = Math.abs(pnt1.x - pnt0.x);    

    for(int i=0; i < fpoly.length; i++){

      Point2[] poly = fpoly[i];

      for(int v = 0; v < poly.length; v++){

	Point2 p = poly[v];
	double dx = p.x - x;
	if(dx < 0) 
	  dx = -dx;
	double dy = p.y - y;
	if(dy < 0) 
	  dy = -dy;
	double d = dx + dy;
	if(d < dmin)
	  dmin = d;
	if(d < cutoff){
	  //System.out.println("dmin: " + dmin +  ", i: " + i + ", v: " + v);	  
	  return new int[]{i,v};
	}
      }
    }
    //System.out.println("dmin: " + dmin);
    return null;
  }

  /**
    findPoly 
    
    search for polygon, which has center nearest to the point
   */
  int findPoly(Point2 point){
    
    // first we need to test old selected oldPolyIndex
    if(oldPolyIndex >= 0 && oldPolyIndex < fpoly.length){
      if(isInsidePolygon(fpoly[oldPolyIndex],point)){
        return oldPolyIndex;
      }
    }
    for(int i=0; i < fpoly.length; i++){
      if(isInsidePolygon(fpoly[i],point)){
	//oldPolyIndex = i;
	return i;
      }	
    }
    return -1;

  }

  public Frame getFrame(){
    Component comp = this;
    while(comp != null){
      comp = comp.getParent();
      if(comp instanceof Frame)
	return (Frame)comp;
    }
    return null;
  }

  class KeyListenerClass extends KeyAdapter {

    /**
       keyUp
       
    */
    public void keyTyped(KeyEvent e){

      switch(e.getKeyChar()){
      case 'P':
      case 'p':
	doPrint();
	break;
      }
      
      return;
    }
  }

  Thread thread;

  FileDialog fileDialog; 
  String psName = "stellation.ps";

  public void run(){

    try {

      OutputStream f = null;
      try{
	if(fileDialog == null){
	  fileDialog = new FileDialog(WindowUtils.getFrame(this), psName, FileDialog.SAVE);
	}
	fileDialog.show();
	if(fileDialog.getFile() == null)
	  return;
	psName = fileDialog.getFile();
	String psDir = fileDialog.getDirectory();
	
	String fileName = psDir + psName;

	File file = new File(fileName);
	f = new FileOutputStream(file);
	Stellation.Out.println("printing diagram to file " + fileName);
      } catch(Exception e){
	f = System.out;
	System.out.println("---------start of PS");
	Stellation.Out.println("printing diagram to java console" );
      }
      GraphicsPS ps = new GraphicsPS(f, getGraphics());
      // paint our canvas
      this.paintCanvas(ps, ps.getWidth(), ps.getHeight());
      ps.flush(); // important - adds showpage to end of file      
      if(f != System.out){
	f.close();
      } else {
	System.out.println("---------end of PS");
      }
    } catch (Exception e){
      //System.out.printStackTrace("Can't print diagram");
    }
  }

  void doPrint(){
    if(thread != null && thread.isAlive()){
      //thread.stop();
    }
    thread = new Thread(this);
    thread.setPriority(Thread.MIN_PRIORITY); 
    thread.start();  
  }    

  class SCanvas extends Canvas {

    public void update(Graphics g){
      paint(g);
    }
    public void paint(Graphics g){
      paintCanvas(g);
    }
    public Dimension getPreferredSize(){
      return new Dimension(300,300);
    }
  }
  
  class SymLinesListener implements ItemListener {

    public void itemStateChanged(ItemEvent e){
      if(e.getStateChange() == ItemEvent.SELECTED){
	drawSymmetryLines = true;
      } else {
	drawSymmetryLines = false;	
      }
      canvas.repaint();
    }
  }

  class SymAxesListener implements ItemListener {

    public void itemStateChanged(ItemEvent e){
      if(e.getStateChange() == ItemEvent.SELECTED){
	drawSymmetryAxes = true;
      } else {
	drawSymmetryAxes = false;	
      }
      canvas.repaint();
    }
  }

  long m_oldTime;
  long m_initialDelay= 300;//ms 

  static final int ZOOM_TYPE_IN = 0, ZOOM_TYPE_OUT = 1;


  class ZoomListener extends MouseAdapter implements EventCallback, TimeoutCallback{

    boolean mouseDown = false;
    Timeout timeout;
    int type = 0;
    double initialZoom = 1.01;
    double zoomSpeed = 1.5;

    ZoomListener(int type){
      this.type = type; 
    }
    
    public void mousePressed(MouseEvent e){

      mouseDown = true;
      m_oldTime = -1;
      doZoom(initialZoom);
      // make delay before autorepeat 
      timeout = new Timeout(m_initialDelay, this, null);

    }

    public void mouseReleased(MouseEvent e){

      mouseDown = false;
      eventCallback = null;
      timeout.stop();
    }

    public void processEventCallback(Object who, Object what){

      if(mouseDown){

        if(m_oldTime == -1){
          m_oldTime = System.currentTimeMillis();
        }
        long time = System.currentTimeMillis();
        long delay = time - m_oldTime;
        m_oldTime = time;
        
        double factor = Math.exp(zoomSpeed*(0.001*delay));
        doZoom(factor);

	eventCallback = this;       
	doZoom(factor);

      }
    }

    public void timeoutCallback(Object userData){

      if(mouseDown){
        processEventCallback(null, null);
      }
    }

    void doZoom(double factor){
      switch(type){
      case ZOOM_TYPE_IN: zoom(factor); break;
      case ZOOM_TYPE_OUT: zoom(1/factor); break;
      }
    }

  }

  static final int PAN_TYPE_UP = 0,PAN_TYPE_DOWN = 1,PAN_TYPE_LEFT = 2,PAN_TYPE_RIGHT = 3;

  class PanListener extends MouseAdapter   implements EventCallback, TimeoutCallback {

    boolean mouseDown = false;
    Timeout timeout;
    int type; // UP, DOWN, ...
    double panSpeed = 0.5; // pan per second 
    double clickPanAmount = 0.01;
    
    public PanListener(int type){
      this.type = type;
    }

    public void mousePressed(MouseEvent e){
      mouseDown = true;
      doPan(clickPanAmount);
      m_oldTime = -1;
      // make delay before autorepeat 
      timeout = new Timeout(m_initialDelay, this, null);

    }

    public void mouseReleased(MouseEvent e){

      mouseDown = false;
      eventCallback = null;
      timeout.stop();

    }

    public void timeoutCallback(Object userData){

      if(mouseDown){
        processEventCallback(null, null);
      }
    }

    public void processEventCallback(Object who, Object what){

      if(mouseDown){

        if(m_oldTime == -1){
          m_oldTime = System.currentTimeMillis();
        }
        long time = System.currentTimeMillis();
        long delay = time - m_oldTime;
        m_oldTime = time;
        double shift = 0.001*delay*panSpeed;

	eventCallback = this;

        doPan(shift);

      }
    }

    void doPan(double shift){

      switch(type){
      case PAN_TYPE_UP:    pan(0,shift); break;
      case PAN_TYPE_DOWN:  pan(0,-shift); break;
      case PAN_TYPE_LEFT:  pan(-shift, 0);break;
      case PAN_TYPE_RIGHT: pan(shift,0);break;
      }
    }
  }

  /**
   *  class RotateListener
   *
   */
  class RotateListener extends MouseAdapter  implements EventCallback, TimeoutCallback{

    boolean mouseDown = false;
    Timeout timeout;
    int sign = 1;
    double initialRotation = Math.PI/1800;
    double rotationSpeed = Math.PI/18;

    public RotateListener(int sign){

      this.sign = sign;

    }

    public void mousePressed(MouseEvent e){

      mouseDown = true;
      m_oldTime = -1;
      doRotation(initialRotation*sign);
      // make delay before autorepeat 
      timeout = new Timeout(m_initialDelay, this, null);
    }

    public void mouseReleased(MouseEvent e){

      mouseDown = false;
      eventCallback = null;
      timeout.stop();

    }

    public void timeoutCallback(Object userData){

      if(mouseDown){
        processEventCallback(null, null);
      }
    }

    public void processEventCallback(Object who, Object what){

      if(mouseDown){
       
        if(m_oldTime == -1){
          m_oldTime = System.currentTimeMillis();
        }
        long time = System.currentTimeMillis();
        long delay = time - m_oldTime;
        m_oldTime = time;
        double angle = 0.001*delay*rotationSpeed;

	eventCallback = this;

	eventCallback = this;               
	doRotation(angle*sign);
        
      }
    }

    void doRotation(double angle){
      
      double matrix[][] = new double[2][2];
      matrix[0][0] = Math.cos(angle);
      matrix[1][1] = Math.cos(angle);
      matrix[0][1] = -Math.sin(angle);
      matrix[1][0] = Math.sin(angle);
      rotate(matrix);
    } 
  }

  class SBHorizontalAdjustmentListener implements AdjustmentListener {

    public void adjustmentValueChanged(AdjustmentEvent e){

      
      int x = e.getValue();
      centerX = 0.5*polyDiameter*(2. * x / (sbMaximum - sbVisible)-1);
      canvas.repaint();      

    }
  }

  class SBVerticalAdjustmentListener implements AdjustmentListener {

    public void adjustmentValueChanged(AdjustmentEvent e){

      int y = e.getValue();

      centerY  = 0.5*polyDiameter*(1-2.*y/(sbMaximum - sbVisible));      
      //centerY = 0.5*polyDiameter*(1 - 2. * (sbMaximum-y) / (sbMaximum - sbVisible));
      canvas.repaint();
      //System.out.println("centerY " + centerY);

    }
  }

  static private GridBagConstraints gbc = new GridBagConstraints();


  static double MIN(double x,double y) {
    return (x < y ? x : y);
  }

  static double MAX(double x, double y) {
    return (x > y ? x : y);
  }

  
  // determines if point p lies inside of polygon 
  // for selfintersection polygons it will use 
  // even-od rule
  static boolean isInsidePolygon(Point2 [] polygon, Point2 p) {
    
    int cnt = 0;
    
    Point2 pnt1 = polygon[polygon.length-1];
    
    for (int i=0; i < polygon.length;i++) {
      
      Point2 pnt2 = polygon[i];    
      if (p.y > MIN(pnt1.y,pnt2.y)) {
	if (p.y <= MAX(pnt1.y,pnt2.y)) {
	  if (p.x <= MAX(pnt1.x,pnt2.x)) {
	    if (pnt1.y != pnt2.y) {
	      double xinters = 
		(p.y-pnt1.y)*(pnt2.x-pnt1.x)/(pnt2.y-pnt1.y)+pnt1.x;
	      if (pnt1.x == pnt2.x || p.x <= xinters)
		cnt++;
	    }
	  }
	}
      }   
      pnt1 = pnt2;
      
    }
    
    if (cnt % 2 == 0)
      return false; //(OUTSIDE);
    else
      return true; //(INSIDE);
  }  

  static final double EPS = 1.e-12;
  
  static double chop(double v){
    if(v < -EPS || v > EPS)
      return v;
    else 
      return 0;    
  }
}
