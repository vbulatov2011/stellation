// original code from SUN in
// http://www.javasoft.com/applets/applets/DrawTest/example1.html
// modified by Peter Schr\"oder
// and Denis Zorin
// modified 2002 by Vladimir Bulatov
// 

package pvs.polyhedra.ui;

import java.awt.BorderLayout;
import java.awt.Button;
import java.awt.Checkbox;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.Event;
import java.awt.Font;
import java.awt.Frame;
import java.awt.Graphics;
import java.awt.GridBagConstraints;
import java.awt.GridBagLayout;
import java.awt.Image;
import java.awt.Label;
import java.awt.Panel;
import java.awt.Scrollbar;
import java.awt.TextField;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.awt.event.MouseListener;
import java.awt.event.MouseMotionListener;

import pvs.polyhedra.CurveChaikin;
import pvs.utils.EventCallback;
import pvs.utils.Point2;
import pvs.utils.Timeout;
import pvs.utils.TimeoutCallback;
import pvs.utils.ViewRect;
import pvs.utils.Viewport;
import pvs.utils.ui.Graphics2D;
import pvs.utils.ui.WindowUtils;

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






