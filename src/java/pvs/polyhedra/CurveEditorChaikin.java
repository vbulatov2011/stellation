// original code from SUN in
// http://www.javasoft.com/applets/applets/DrawTest/example1.html
// modified by Peter Schr\"oder
// and Denis Zorin
// modified 2002 by Vladimir Bulatov
// 

package pvs.polyhedra;

import java.awt.*;
import java.awt.event.*;
import java.applet.*;
import java.util.Vector;

import pvs.utils.WindowUtils;
import pvs.utils.Point2;
import pvs.utils.Graphics2D;
import pvs.utils.Viewport;
import pvs.utils.ViewRect;
import pvs.utils.EventCallback;
import pvs.utils.TimeoutCallback;
import pvs.utils.Timeout;
import pvs.utils.PVSObserver;

class CurveChaikin {

  // how to deal with endpoints
  public static final int OPEN = 0, CLOSED = 1;
  // for subdivision constructions, how many levels?
  public static final int MAXLEVEL = 10;

  // curve parameters 
  int levels = 3; // may be 0 - 10;
  double weight = 3; // may be 1 - 8 
  int closed = 1; // may be 0 or 1; 
  double offset = 0; // template offset - draw actual curve on distance tOffset 
  
  float [][]offsetPnt = new float[0][2]; // extra storage to store offset points 

  boolean drawpts = false;
  int lastlength = -1;

  // for control polygon
  static final Color ctrl = new Color( 192, 192, 192);
  // for control vertices
  static final Color ctrv = new Color( 255, 153, 51 );
    // background
  static final Color bgrd = new Color( 255, 255, 255); // 192, 192, 192);//102, 102, 102 );
    // foregraound
    // private static final Color fgrd = new Color( 255, 255, 255 );
  static final Color lineColor = new Color( 0,0,0);//255, 255, 255 );


  // dynamic vector to hold the control points
  Vector cpts = new Vector( 100 );

  // for drawing we'll need some cascade storage which we don't want to
  // continually allocate
  // first index is level index, second index is translatory index and
  // third is x/y
  float line[][][] = new float[CurveChaikin.MAXLEVEL][][];
  int total = 0; // amount of actual rendered data point 

  Point2 points[]; 
  boolean isCalculated = false;

  PVSObserver observer; // observer to inform aout our modifications 
  
  public CurveChaikin(){

    points = new Point2[0];
    init();

  }
  
  public CurveChaikin(Point2 points[], int levels, double weight, int closed){

    this.points = points;
    this.levels = levels;
    this.weight = (float)weight;
    this.closed = closed;     
    init();
  }  

  private void init(){

    for(int i=0; i < points.length; i++){
      Point2 pnt = points[i];
      cpts.addElement(new Point2(pnt.x, pnt.y ));
    }    
  }

  public void setObserver(PVSObserver observer){

    this.observer = observer; 

  }

  public void setPoints(Point2[] points){

    this.points = points;
    isCalculated = false;
    init();
    
  }

  public void setLevel(int levels){
    isCalculated = false;
    this.levels = levels;
  }
  public void setWeight(double weight){
    isCalculated = false;
    this.weight = weight;
  }
  public void setClosed(int closed){
    isCalculated = false;
    this.closed = closed;
  }

  public void setOffset(double offset){

    this.offset = offset;

  }

  public double getOffset(){

    isCalculated = false;
    return offset;

  }
  public int getLevel(){
    isCalculated = false;
    return levels;
  }
  public double getWeight(){
    return weight;
  }
  public int getClosed(){
    return closed;
  }
  
  public Point2[] getPoints(){
    return points;
  }

  /**
   *  is called when user finished editing step 
   * 
   */
  public void updateData(){
    
    int np = cpts.size();
    Point2 pnt[] = new Point2[np];
    cpts.copyInto(pnt);
    points = pnt; 

    if(observer != null){
      observer.update(this,null);
    }    
  }

  /**
   *    float[][] getCurve()
   */
  float[][] getCurve(){

    if(!isCalculated )
      calculate();

    return line[levels];

  }

  int getCurveCount(){

    if(!isCalculated )
      calculate();

    return total;
  }


  // this is the corner cutter. It takes a `s'ource array and writes into a
  // `d'estination array, using a `w'eight (3 for Chaikin). The source is
  // of `sl' length and we also need to know how to deal with the last
  // point
  private void CutCorners( float d[][], float s[][], float w,
			   int sl, boolean periodic, int level )
  {
    float a = 1 / ( 1 + w );
    // compute two new points which are w/a and 1/a respectively 1/a and
    // w/a averages of their two parent points
    for( int di = 0, si = 0; si < sl-1; di += 2, si++ ){
      // normalization
      d[di][0] = ( w * s[si][0] + s[si+1][0] ) * a;
      d[di][1] = ( w * s[si][1] + s[si+1][1] ) * a;
      d[di+1][0] = ( s[si][0] + w * s[si+1][0] ) * a;
      d[di+1][1] = ( s[si][1] + w * s[si+1][1] ) * a;
    }
    // if we are periodic we do the last one by wrapping around.
    if( periodic ){
      d[2*(sl-1)][0] = ( w * s[sl-1][0] + s[0][0] ) * a;
      d[2*(sl-1)][1] = ( w * s[sl-1][1] + s[0][1] ) * a;
      d[2*sl-1][0] = ( s[sl-1][0] + w * s[0][0] ) * a;
      d[2*sl-1][1] = ( s[sl-1][1] + w * s[0][1] ) * a;
    }
  }

  private void calculate(){

    isCalculated = true;
    int newlength;
    boolean periodic = ( closed == CLOSED );

    int np = cpts.size();
    int i, l;

    
    // cut corners with 1/4 3/4
    switch( closed ){
    default:
    case CurveChaikin.OPEN:
      // default; no doubling up
      newlength = np;
      total = newlength * ( 1 << levels ) - 2 * ( ( 1 << levels ) - 1 );
      break;
    case CurveChaikin.CLOSED:
      // no doubling up either, but wrap around
      newlength = np;
      total = newlength * ( 1 << levels );
      break;
    }
    // in order to avoid continual reallocation of the level arrays
    // which hold the successive polyline approximations we rebuild
    // them lazily
    if( newlength != lastlength ){
      // must rebuild
      for( i = 0, l = newlength; i < CurveChaikin.MAXLEVEL; i++ ){
        line[i] = new float[l][2];
        l *= 2;
      }
      lastlength = newlength;
    }
    // load up the level 0 array with the control points
    switch( closed ){
    default:
    case CurveChaikin.OPEN:
    case CurveChaikin.CLOSED:
      // no doubling up
      for( i = 0; i < np; i++ ){
        line[0][i][0] = (float)( ( Point2 )cpts.elementAt( i ) ).x;
        line[0][i][1] = (float)( ( Point2 )cpts.elementAt( i ) ).y;
      }
      break;
    }
    // now do so many levels of corner cutting putting successive
    // levels in to `line'
    for( i = 0, l = lastlength; i < levels; i++ ){
      CutCorners( line[i+1], line[i], (float)weight, l, periodic, i );
      // how long is the next array? (roughly 2 times)
      l = periodic ? 2 * l : 2 * ( l - 1 );
    }

    if(offset != 0.0){
      // offset the curve 
      if(total > offsetPnt.length){
        offsetPnt = new float[total][2];
      } 

      float pts[][] = line[levels];

      for( i=0; i < total-1; i++){
       
        double dx = (pts[i+1][0]- pts[i][0]);
        double dy = (pts[i+1][1]- pts[i][1]);
        double len = Math.sqrt(dx*dx + dy*dy);
        offsetPnt[i][0] = (float)( -offset*dy / len);
        offsetPnt[i][1] = (float)( offset*dx / len);
      } 
      offsetPnt[total-1][0] = offsetPnt[0][0];
      offsetPnt[total-1][1] = offsetPnt[0][1];

      for( i=0; i < total; i++){
        pts[i][0] += offsetPnt[i][0];
        pts[i][1] += offsetPnt[i][1];
      }      
    }
  }

  /**
   *  void render(Graphics2D graph2)
   */
  public void render(Graphics2D graph2){

    // number of control points
    int np = cpts.size();
    // previous
    Point2 p;
    int i, l;
    float pts[][];
    boolean periodic = ( closed == CLOSED );
    // draw the current lines
    
    if( np <= 0 ){
      return;
    }

    graph2.setColor( ctrl );
    // draw the control polygon
    switch( closed ){
    default:
    case CurveChaikin.OPEN:
      p = ( Point2 )cpts.firstElement();
      break;
    case CurveChaikin.CLOSED:
      p = ( Point2 )cpts.lastElement();
      break;
    }
    for( i = 0; i < np; i++ ){
      Point2 n = ( Point2 )cpts.elementAt(i);
      graph2.drawLine( p.x, p.y, n.x, n.y );
      p = n;
    }

    calculate();

    // draw the final level
    graph2.setColor( lineColor );
    pts = line[levels];
    for( i = 0; i < total - 1; i++ ){

      graph2.drawLine( pts[i][0], pts[i][1],
                       pts[i+1][0], pts[i+1][1] );
    }
    // connect the last to the first?
    if( periodic ){
      graph2.drawLine( pts[total-1][0], pts[total-1][1],
                       pts[0][0], pts[0][1] );
    }

    if( drawpts ) {
      graph2.setColor( Color.black );
      for( i = 0; i < total; i++ ){
        graph2.fillControlSquare( pts[i][0], pts[i][1], 3);	    
      }
    }
    // draw control points
    graph2.setColor( ctrv );
    for( i = 0; i < np; i++ ){
      Point2 n = ( Point2 )cpts.elementAt(i);
      graph2.fillControlSquare( n.x, n.y, 5);
    }
  }   
}

public class CurveEditorChaikin extends Panel{
  
  // some defines for state variables
  public static final int ADD_MOV = 0, DEL = 1;
  // start out in add mode
  int mode = ADD_MOV;  
  
  float weightscale = 5.0f;
  
  // point selected
  double x1, y1;
  // location during drag
  double xl, yl;
  // initially empty
  Point2 selected;
  // initially not valid index
  int selindex = -1;
  
  
  // for double buffering
  Image offScrImage=null;
  Graphics offScr;
  
  CurveChaikin curve;

  EventCallback eventCallback;
    
  // initilizer
  public CurveEditorChaikin()
  {
    curve = new CurveChaikin();
    initUI();
  }

  // initilizer
  public CurveEditorChaikin(CurveChaikin curve)
  {
    this.curve = curve;     
    initUI();
  }  


  void initUI(){

    CurveMouseListener ml = new CurveMouseListener();
    this.addMouseListener(ml);
    this.addMouseMotionListener(ml);
  }

  public Dimension getPreferredSize(){
    return new Dimension(500,500);
  }

  public Dimension getMinimumSize(){
    return new Dimension(100,100);
  }
  
  // change edit modes
  public void setState( int m )
  {
    mode = m;
    repaint();
  }

  // updates data in curve, after user finished editing step 
  void updateCurve(){

    curve.updateData();

  }
  
  public void setLevels( int m )
  {
    if( m >= CurveChaikin.MAXLEVEL ) return;
    curve.levels = m;
    repaint();
  }
  
  public int getLevels( )
  {
    return curve.levels;
  }
  
  public void setWeight( int w )
    {
      curve.weight = w < 0.f? 0.f : ( (float)w/weightscale );
      repaint();
    }
    
  public double getWeight()
  {
    return curve.weight;
  }

  public float weightScale()
  {
    return weightscale;
  }
    
  public void setDrawPts( boolean m )
  {
    curve.drawpts = m;
    repaint();
  }
  
  public void clearPoints()
  {
    curve.cpts.removeAllElements();
    repaint();
  }
  
  public void setEndpoint( int e )
  {
    curve.closed = e;
    repaint();
  }
  
  // linear search. We don't expect to have many points in this list and
  // don't want fancy data structures right now
  private int findPoint2( double x, double y )
  {
    double tol = graph2.screen2x(PNT_SIZE) -  graph2.screen2x(0);
    int np = curve.cpts.size();
    for( int i = 0; i < np; i++ ){
      Point2 n = ( Point2 )curve.cpts.elementAt( i );
      // is the point within +/- tol distance of one of the control points?
      if( n.x - tol < x && x < n.x + tol &&
          n.y - tol < y && y < n.y + tol ){ 
        selected = n; return i; 
      }
    }
    // none found
    return -1;
  }
  
  
  /**
   *
   *  class CurveMouseListener
   *
   */
  class CurveMouseListener implements MouseListener, MouseMotionListener {
    
    public void mouseClicked(MouseEvent e){}
    public void mouseEntered(MouseEvent e){}
    public void mouseExited(MouseEvent e){}

    // event handler for mouseDown
    public void mousePressed(MouseEvent e){

      Point2 p = graph2.screen2world(e.getX(), e.getY());
      double x = p.x;
      double y = p.y;

      wasDragged = false;
      mode = ADD_MOV;
      if(e.isControlDown() || (e.getModifiers() & Event.META_MASK) != 0){ 
        // delete point 
	selindex = findPoint2( x, y );
	if( selindex != -1 ){
	  // only if something is selected attempt to delete it
	  curve.cpts.removeElement( selected ); 
	  repaint();          
	  updateCurve();
	}
        mode = DEL;
      } else {
	// remember the location
	x1 = x; y1 = y;
	selindex = findPoint2( x, y );        
      }
      return;
    }
    
    public void mouseReleased(MouseEvent e) {

      Point2 pnt = graph2.screen2world(e.getX(), e.getY());
      double x = pnt.x;
      double y = pnt.y;

      switch( mode ){
      case ADD_MOV:
        //case MOV:
        if(wasDragged){ // we were moving 
          if( selindex != -1 ){
            // only if something is selected update its coordinates
            selected.x = x;
            selected.y = y;
            repaint();
          }          
	  
        } else { // we were creating new point 
	  
          // add this coordinate as a new control point to the list
          // we need to find where to insert
          Point2 p = new Point2( x, y );
          int index = findEdge(p);
          if(index >=0){ // found edge to insert 
            curve.cpts.insertElementAt(p, index+1 );
          } else { // insert at the end 
            curve.cpts.addElement( p );
          }
          repaint();
          break;
        }
	updateCurve();
	break;
      default:
	return;
      }
      
      return;
    }
    
    boolean wasDragged = false;
    
    public void mouseMoved(MouseEvent e){}
   
    public void mouseDragged(MouseEvent e){
      
      Point2 pnt = graph2.screen2world(e.getX(), e.getY());
      double x = pnt.x;
      double y = pnt.y;

      wasDragged = true;

      xl = x;
      yl = y;

      switch( mode ){
      case ADD_MOV:
	if( selindex != -1 ){
	  // continually change the coordinate of the selected point
	  selected.x = xl; selected.y = yl; repaint();
	}
	break;
      default:
	return;
      }
      return;
    }
    
  } // CurveMouseListener 
    

    /**
     *  calculates square of distance between line and point 
     *
     */
    double dist2(Point2 p0, Point2 p1, Point2 p){
      
      double num = (p1.x-p0.x)*(p.x-p0.x) + (p1.y-p0.y)*(p.y-p0.y);
      double den = (p1.x-p0.x)*(p1.x-p0.x) + (p1.y-p0.y)*(p1.y-p0.y);
      if(den == 0) {// p0 == p1
	return (p.x-p0.x)*(p.x-p0.x) + (p.y-p0.y)*(p.y-p0.y);
      }
      double t = num/den;
      if(t < 0){
	// closest point is p0;
	return (p.x-p0.x)*(p.x-p0.x) + (p.y-p0.y)*(p.y-p0.y);
      } else if(t > 1){
	// closest point is p1;
	return (p.x-p1.x)*(p.x-p1.x) + (p.y-p1.y)*(p.y-p1.y);      
      } else {
	// point inside of interval 
	double x = (1-t)*p0.x + t*p1.x;
	double y = (1-t)*p0.y + t*p1.y;
	return (x-p.x)*(x-p.x) + (y-p.y)*(y-p.y);
	
      }
      
    }
    
  static final int PNT_SIZE2 = 25;
  static final int PNT_SIZE = 5;
  
  /**
   * find closest edge to the point 
   *
   */
  int findEdge(Point2 p){
    
    double tolerance = graph2.screen2x(PNT_SIZE) -  graph2.screen2x(0);
    tolerance *= tolerance;

    int len = curve.cpts.size();
    if(len < 2){
      return -1; // no edges yet
    }
    for(int i=1; i < len; i++){
      Point2 pnt0 = (Point2)curve.cpts.elementAt(i-1);
      Point2 pnt1 = (Point2)curve.cpts.elementAt(i);
      if(dist2(pnt0, pnt1, p) < tolerance)
	return i-1;
    }
    return -1;
  }
  


  public void update( Graphics g ){
    paint(g);
  }

  Graphics2D graph2 = new Graphics2D();
  double centerX = 0, centerY = 0;
  int borderWidth = 3;
  double Width = 5;

  void initViewport(int width, int height){

    int d = ((width > height) ? height:width);
    int borderWidth = 4;
    double wx = Width*(width-2*borderWidth)/(d-2*borderWidth);
    double wy = Width*(height-2*borderWidth)/(d-2*borderWidth);
    graph2.setViewport(new Viewport(centerX - wx/2, centerY + wy/2,centerX + wx/2, centerY - wy/2));
    graph2.setScreenRectangle(new ViewRect(borderWidth,borderWidth,width-borderWidth,height-borderWidth));
    
  }
  
  public synchronized void paint( Graphics g )
    {
      Dimension size = getSize();
      if(offScrImage==null || offScrImage.getWidth(this) != size.width ||offScrImage.getHeight(this) != size.height ) {

	offScrImage = createImage(size.width,size.height);
	offScr = offScrImage.getGraphics();
	graph2.setGraphics(offScr);

      }

      initViewport(size.width, size.height);

      offScr.setPaintMode();
      offScr.setColor( curve.bgrd);
      offScr.fillRect(0,0,size.width,size.height);
      offScr.setColor( curve.ctrl );
      offScr.drawRect(0,0,size.width-1,size.height-1);
      
      curve.render(graph2);

      g.drawImage( offScrImage, 0, 0, this );

      if(eventCallback != null){
	// if user is holding down a mouse button
	// this will repeat repeated action 
	EventCallback ec = eventCallback;
	eventCallback = null;
	ec.processEventCallback(null,null);
      }

    }


  
  OptionsPanel optionsPanel;

  /**
   *    getOptionsPanel() return panel with user editable controls 
   *
   */
  public Panel getOptionsPanel(){

    if(optionsPanel == null){
      optionsPanel = new OptionsPanel(this);
    }

    return optionsPanel;

  }

  static final GridBagConstraints gbc = new GridBagConstraints();

  /**
   * 
   *
   */
  class OptionsPanel extends Panel {
    
    
    // the drawing aread
    Scrollbar scrollLevel;
    Scrollbar scrollWeight;
    // Scrollbar scrollSWeight;
    Label leveldisplay;
    Label weightdisplay;
    
    // the drawing aread
    Checkbox closed, drawpts;
    Label l;
    String
      closedl = "Closed",
      drawptsl = "Draw Points", 
      erasel = "Clear All";
    
    Button erase;
    TextField tfOffset;

    // associated drawing panel 
    CurveEditorChaikin dp;

    
    public OptionsPanel(CurveEditorChaikin dp )
    {

      this.dp = dp;

      setBackground(Color.lightGray);
      setLayout( new GridBagLayout());
      
      int c = 0;

      Panel buttons = makeButtonPanel();
      WindowUtils.constrain(this, buttons, 0, c++, 1, 1, gbc.NONE, gbc.NORTHWEST, 0,1,5,5,5,5);

      leveldisplay = new Label("Level: "+ String.valueOf( dp.getLevels() ), Label.LEFT );
      WindowUtils.constrain(this, leveldisplay, 0, c++, 1, 1, gbc.NONE, gbc.WEST, 0,0,5,5,5,5);
      
      scrollLevel = new Scrollbar( Scrollbar.HORIZONTAL, dp.getLevels(), 1, 0, 10 );
      WindowUtils.constrain(this, scrollLevel, 0, c++, 1, 1, gbc.NONE, gbc.WEST, 0,0,5,5,5,5);
      
      weightdisplay = new Label("Weight: "+ String.valueOf(dp.getWeight()), Label.LEFT );
      WindowUtils.constrain(this, weightdisplay, 0, c++, 1, 1, gbc.NONE, gbc.WEST, 0,0,5,5,5,5);
      scrollWeight = new Scrollbar( Scrollbar.HORIZONTAL,(int)(dp.getWeight()*dp.weightScale()), 10, 0, 50 );
      WindowUtils.constrain(this, scrollWeight, 0, c++, 1, 1, gbc.NONE, gbc.WEST, 0,0,5,5,5,5);
      
      closed = new Checkbox( closedl, (curve.getClosed() == curve.CLOSED));
      WindowUtils.constrain(this, closed, 0, c++, 1, 1, gbc.NONE, gbc.WEST, 0,0,5,5,5,5);
      drawpts = new Checkbox( drawptsl, null, false );      
      WindowUtils.constrain(this, drawpts, 0, c++, 1, 1, gbc.NONE, gbc.WEST, 0,0,5,5,5,5);
      erase = new Button(erasel);
      WindowUtils.constrain(this, erase, 0, c++, 1, 1, gbc.NONE, gbc.NORTHWEST, 0.,0.,5,5,5,5);

      WindowUtils.constrain(this, new Label("offset"), 0, c++, 1, 1, gbc.NONE, gbc.NORTHWEST, 0.,0.,5,5,5,5);
      tfOffset = new TextField(String.valueOf(curve.getOffset()));
      WindowUtils.constrain(this, tfOffset, 0, c++, 1, 1, gbc.NONE, gbc.NORTHWEST, 0.,0.,5,5,5,5);
      
      Button btnUpdate = new Button("update");
      btnUpdate.addActionListener(new ButtonUpdateListener());
      WindowUtils.constrain(this, btnUpdate, 0, c++, 1, 1, gbc.NONE, gbc.NORTHWEST, 0.,0.,5,5,5,5);

      Button btnDump = new Button("dump");
      btnDump.addActionListener(new ButtonDumpListener());
      WindowUtils.constrain(this, btnDump, 0, c++, 1, 1, gbc.NONE, gbc.NORTHWEST, 0.,0.,5,5,5,5);

    }    
    
    Panel makeButtonPanel(){
      
      Panel buttonsPanel = new Panel();
      buttonsPanel.setLayout(new GridBagLayout());
      buttonsPanel.setBackground(Color.lightGray);

      Button btnZoomIn = new Button("+");
      btnZoomIn.addMouseListener(new ZoomInListener());

      Button btnZoomOut = new Button("-");
      btnZoomOut.addMouseListener(new ZoomOutListener());

      Button btnUp = new Button("^");
      btnUp.addMouseListener(new UpListener());

      Button btnDown = new Button("v");
      btnDown.addMouseListener(new DownListener());

      Button btnLeft = new Button("<");
      btnLeft.addMouseListener(new LeftListener());

      Button btnRight = new Button(">");
      btnRight.addMouseListener(new RightListener());

      int c = 0;
      WindowUtils.constrain(buttonsPanel,btnZoomIn,  c++,0,1,1, gbc.NONE, gbc.WEST,0.,0.);
      WindowUtils.constrain(buttonsPanel,btnZoomOut, c++,0,1,1, gbc.NONE, gbc.WEST,0.,0.);
      WindowUtils.constrain(buttonsPanel,btnUp,      c++,0,1,1, gbc.NONE, gbc.WEST,0.,0.);
      WindowUtils.constrain(buttonsPanel,btnDown,    c++,0,1,1, gbc.NONE, gbc.WEST,0.,0.);
      WindowUtils.constrain(buttonsPanel,btnLeft,    c++,0,1,1, gbc.NONE, gbc.WEST,0.,0.);
      WindowUtils.constrain(buttonsPanel,btnRight,   c++,0,1,1, gbc.NONE, gbc.WEST,0.,0.);
      
      return buttonsPanel;
      
    }


    double shiftSpeed = 0.0025;
    double zoomSpeed = 1.025;
    
    public void zoomIn(){
      Width /= zoomSpeed;    
      dp.repaint();
    }
    
    public void zoomIn(double zoom){
      Width /= zoom;    
      dp.repaint();
    }
    
    public void zoomOut(){
      Width *= zoomSpeed;    
      dp.repaint();
    }
    
    public void zoomOut(double zoom){
      Width *= zoom;    
      dp.repaint();
    }
    
    public void shiftLeft(){
      centerX += Width*shiftSpeed;
      dp.repaint();
      
    }
    
    public void shiftRight(){
      centerX -= Width*shiftSpeed;
      dp.repaint();
    }
    
    public void shiftUp(){
      centerY -= Width*shiftSpeed;
      dp.repaint();
      
    }
    
    public void shiftDown(){
      centerY += Width*shiftSpeed;
      dp.repaint();
    }
          
    class ZoomInListener extends MouseAdapter implements EventCallback, TimeoutCallback{
      
      boolean mouseDown = false;
      Timeout timeout;
      
      public void mousePressed(MouseEvent e){
	
	mouseDown = true;
	zoomIn();
	// make delay before autorepeat 
	timeout = new Timeout(500, this, null);
	
      }
      
      public void mouseReleased(MouseEvent e){
	
	mouseDown = false;
	eventCallback = null;
	timeout.stop();
      }
      
      public void processEventCallback(Object who, Object what){
	if(mouseDown){
	  eventCallback = this;       
	  zoomIn();
	}
      }
      
      public void timeoutCallback(Object userData){
	
	if(mouseDown){
	  
	  eventCallback = this;       
	  zoomIn();
	}
      }
      
      
    }
    
    class ZoomOutListener extends MouseAdapter  implements EventCallback, TimeoutCallback {
      
      boolean mouseDown = false;
      Timeout timeout;
      
      public void mousePressed(MouseEvent e){
	mouseDown = true;
	zoomOut();
	// make delay before autorepeat 
	timeout = new Timeout(300, this, null);
	
      }
      
      public void mouseReleased(MouseEvent e){
	
	mouseDown = false;
	eventCallback = null;
	timeout.stop();
	
      }
      
      public void timeoutCallback(Object userData){
	
	if(mouseDown){
	  
	  eventCallback = this;       
	  zoomOut();
	}
      }
      
      public void processEventCallback(Object who, Object what){
	if(mouseDown){
	  eventCallback = this;       
	  zoomOut();
	}
      }
      
    }
    
    class UpListener extends MouseAdapter   implements EventCallback, TimeoutCallback {
      
      boolean mouseDown = false;
      Timeout timeout;
      
      public void mousePressed(MouseEvent e){
	mouseDown = true;
	shiftUp();
	// make delay before autorepeat 
	timeout = new Timeout(300, this, null);
	
      }
      
      public void mouseReleased(MouseEvent e){
	
	mouseDown = false;
	eventCallback = null;
	timeout.stop();
	
      }
      
      public void timeoutCallback(Object userData){
	
	if(mouseDown){
	  
	  eventCallback = this;       
	  shiftUp();
	}
      }
      
      public void processEventCallback(Object who, Object what){
	if(mouseDown){
	  eventCallback = this;       
	  shiftUp();
	}
      }
      
    }
    
    class DownListener extends MouseAdapter    implements EventCallback, TimeoutCallback {
      
      boolean mouseDown = false;
      Timeout timeout;
      
      public void mousePressed(MouseEvent e){
	mouseDown = true;
	shiftDown();
	// make delay before autorepeat 
	timeout = new Timeout(300, this, null);
	
      }
      
      public void mouseReleased(MouseEvent e){
	
	mouseDown = false;
	eventCallback = null;
	timeout.stop();
	
      }
      
      public void timeoutCallback(Object userData){
	
	if(mouseDown){
	  
	  eventCallback = this;       
	  shiftDown();
	}
      }
      
      public void processEventCallback(Object who, Object what){
	if(mouseDown){
	  eventCallback = this;       
	  shiftDown();
	}
      }
    }
    
    class LeftListener extends MouseAdapter   implements EventCallback, TimeoutCallback{
      boolean mouseDown = false;
      Timeout timeout;
      
      public void mousePressed(MouseEvent e){
	mouseDown = true;
	shiftLeft();
	// make delay before autorepeat 
	timeout = new Timeout(300, this, null);
	
      }
      
      public void mouseReleased(MouseEvent e){
	
	mouseDown = false;
	eventCallback = null;
	timeout.stop();
	
      }
      
      public void timeoutCallback(Object userData){
	
	if(mouseDown){
	  
	  eventCallback = this;       
	  shiftLeft();
	}
      }
      
      public void processEventCallback(Object who, Object what){
	if(mouseDown){
	  eventCallback = this;       
	  shiftLeft();
	}
      }
      
    }
    
    class RightListener extends MouseAdapter   implements EventCallback, TimeoutCallback{
      
      boolean mouseDown = false;
      Timeout timeout;
      
      public void mousePressed(MouseEvent e){
	mouseDown = true;
	shiftRight();
	// make delay before autorepeat 
	timeout = new Timeout(300, this, null);
	
      }
      
      public void mouseReleased(MouseEvent e){
	
	mouseDown = false;
	eventCallback = null;
	timeout.stop();
	
      }
      
      public void timeoutCallback(Object userData){
	
	if(mouseDown){
	  
	  eventCallback = this;       
	  shiftRight();
	}
      }
      
      public void processEventCallback(Object who, Object what){
	if(mouseDown){
	  eventCallback = this;       
	  shiftRight();
	}
      }
    }    
    
    public boolean handleEvent( Event e )
    {
      if( e.target instanceof Checkbox ){
	String cbox = ( ( Checkbox )e.target ).getLabel();
	if( cbox.equals( closedl ) )
	  dp.setEndpoint( (((Checkbox)e.target).getState()) ? CurveChaikin.CLOSED: CurveChaikin.OPEN );
	else if( cbox.equals( drawptsl ) )
	  dp.setDrawPts( drawpts.getState() );
	else return false;
      } else if( e.target instanceof Button ){
	String button = ( ( Button )e.target ).getLabel();
	if( button.equals( erasel ) ){
	  // After clearing the control points, put the user back into
	  // ADD mode, since none of the other modes make any sense.
	  dp.clearPoints();
	} else return false;
      }

      switch( e.id ){
      case Event.SCROLL_LINE_DOWN:
      case Event.SCROLL_LINE_UP:
      case Event.SCROLL_PAGE_DOWN:
      case Event.SCROLL_PAGE_UP:
      case Event.SCROLL_ABSOLUTE:
        if( e.target instanceof Scrollbar ){
          if( ((Scrollbar)e.target) == scrollLevel ) {
            // For any of these events, get the level value from the
            // scrollbar, and update the curve level, and the label.
            leveldisplay.setText( "Level: "
                                  + String.valueOf( ( ( Scrollbar )e.target ).getValue() ) );
            dp.setLevels( ( ( Scrollbar )e.target ).getValue() );
          } else if ( ((Scrollbar)e.target) == scrollWeight ) {
            dp.setWeight( ( ( Scrollbar )e.target ).getValue() );
            weightdisplay.setText( "Weight: "
                                   + String.valueOf(dp.getWeight() ));
          }
        }
        return true;
      default:
	return false;
      }
    }

    class ButtonUpdateListener implements ActionListener {

      public void actionPerformed(ActionEvent e){
        
        double v = Double.parseDouble(tfOffset.getText());
        curve.setOffset(v);
        dp.repaint();
        curve.updateData();
      }
    }

    class ButtonDumpListener implements ActionListener {

      public void actionPerformed(ActionEvent e){
        
        float pnt[][] = curve.getCurve();
        for(int i=0; i < pnt.length; i++){
          System.out.println(pnt[i][0] + ", " + pnt[i][1]);
        }
      }
    }

  } // OptionsPanel

  
  public static void main( String args[] ) {
      Frame f = new Frame( "DrawChaikin" );
      
      f.setBackground( Color.lightGray );
      f.setLayout( new BorderLayout( 0, 0 ) );
      f.setFont( new Font( "SansSerif", Font.PLAIN, 12 ) );

      CurveEditorChaikin ce = new CurveEditorChaikin();
      Panel editor = ce.getOptionsPanel();

      f.add( "Center", ce );
      f.add( "East", editor );
      
      f.setSize(800,800);
      f.show();
  }

} // CurveEditorChaikin 






