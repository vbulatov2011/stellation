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
import java.util.Vector;

import pvs.utils.ui.WindowUtils;

public class SubdivisionChaikin extends Panel {

  // background
  private static final Color bgrd = new Color( 192, 192, 192);//102, 102, 102 );
  
  DrawPanelChaikin dp; 

  public void init()
  {
    //setForeground( fgrd );
    setBackground( bgrd );
    setLayout( new BorderLayout( 0, 0 ) );
    setFont( new Font( "SansSerif", Font.PLAIN, 12 ) );
    dp = new DrawPanelChaikin();
    add( "Center", dp );
    add( "East", new CurveControls( ) );
  }
  
  public static void main( String args[] ) {
      Frame f = new Frame( "DrawChaikin" );
      SubdivisionChaikin drawSmooth = new SubdivisionChaikin();
      drawSmooth.init();
      //drawSmooth.start();

      f.add( "Center", drawSmooth );
      f.setSize(800,800);
      f.show();
  }


  // control point class
  class Cpt{
    public int x, y;
    
    public Cpt( int a, int b )
    {
      x = a; y = b;
    }
  }

  static final GridBagConstraints gbc = new GridBagConstraints();

  class CurveControls extends Panel{
    
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


    public CurveControls( )
    {
      setBackground(Color.lightGray);
      setLayout( new GridBagLayout());

      int c = 0;
      leveldisplay = new Label("Level: "+ String.valueOf( dp.getLevels() ), Label.LEFT );
      WindowUtils.constrain(this, leveldisplay, 0, c++, 1, 1, gbc.NONE, gbc.WEST, 0,0,5,5,5,5);

      scrollLevel = new Scrollbar( Scrollbar.HORIZONTAL, dp.getLevels(), 1, 0, 10 );
      WindowUtils.constrain(this, scrollLevel, 0, c++, 1, 1, gbc.NONE, gbc.WEST, 0,0,5,5,5,5);
      
      weightdisplay = new Label("Weight: "+ String.valueOf(dp.getWeight()), Label.LEFT );
      WindowUtils.constrain(this, weightdisplay, 0, c++, 1, 1, gbc.NONE, gbc.WEST, 0,0,5,5,5,5);
      scrollWeight = new Scrollbar( Scrollbar.HORIZONTAL,(int)(dp.getWeight()*dp.weightScale()), 10, 0, 50 );
      WindowUtils.constrain(this, scrollWeight, 0, c++, 1, 1, gbc.NONE, gbc.WEST, 0,0,5,5,5,5);

      closed = new Checkbox( closedl, null, false );
      WindowUtils.constrain(this, closed, 0, c++, 1, 1, gbc.NONE, gbc.WEST, 0,0,5,5,5,5);
      drawpts = new Checkbox( drawptsl, null, false );      
      WindowUtils.constrain(this, drawpts, 0, c++, 1, 1, gbc.NONE, gbc.WEST, 0,0,5,5,5,5);
      erase = new Button(erasel);
      WindowUtils.constrain(this, erase, 0, c++, 1, 1, gbc.NONE, gbc.NORTHWEST, 0,1,5,5,5,5);

    }

    
    public boolean handleEvent( Event e )
    {
      if( e.target instanceof Checkbox ){
	String cbox = ( ( Checkbox )e.target ).getLabel();
	if( cbox.equals( closedl ) )
	  dp.setEndpoint( (((Checkbox)e.target).getState()) ? DrawPanelChaikin.CLOSED: DrawPanelChaikin.OPEN );
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
  }


  class DrawPanelChaikin extends Panel{
    
    // some defines for state variables
    public static final int ADD_MOV = 0, DEL = 1;
    // start out in add mode
    int mode = ADD_MOV;
    
    // how to deal with endpoints
    public static final int OPEN = 0, INTERP = 1, CLOSED = 2;
    int endpt = OPEN;
    
    // for subdivision constructions, how many levels?
    public static final int MAXLEVEL = 10;
    int levels = 3;
    float weight = 3.0f;  
    float weightscale = 5.0f;
    boolean drawpts = false;
    
    // dynamic vector to hold the control points
    Vector cpts = new Vector( 100 );
    // point selected
    int x1, y1;
    // location during drag
    int xl, yl;
    // initially empty
    Cpt selected;
    // initially not valid index
    int selindex = -1;
    
    // for drawing we'll need some cascade storage which we don't want to
    // continually allocate
    // first index is level index, second index is translatory index and
    // third is x/y
    float line[][][];
    int lastlength = -1;
    
    // for double buffering
    Image offScrImage=null;
    Graphics offScr;
    
    // for control polygon
    private final Color ctrl = new Color( 192, 192, 192);
    // for control vertices
    private final Color ctrv = new Color( 255, 153, 51 );
    // background
    private final Color bgrd = new Color( 255, 255, 255); // 192, 192, 192);//102, 102, 102 );
    // foregraound
    // private static final Color fgrd = new Color( 255, 255, 255 );
    private final Color lineColor = new Color( 0,0,0);//255, 255, 255 );
    
    // initilizer
    public DrawPanelChaikin()
    {
      // create storage for the cascade
      line = new float[MAXLEVEL][][];
      //setForeground( fgrd );
      //setBackground( bgrd );
    }
    
    // change edit modes
    public void setState( int m )
    {
      mode = m;
      repaint();
    }
    
    public void setLevels( int m )
    {
      if( m >= MAXLEVEL ) return;
      levels = m;
      repaint();
    }

    public int getLevels( )
    {
      return levels;
    }
    
    public void setWeight( int w )
    {
      weight = w < 0.f? 0.f : ( (float)w/weightscale );
      repaint();
    }
    
    public float getWeight()
    {
      return weight;
    }
    public float weightScale()
    {
      return weightscale;
    }
    
    public void setDrawPts( boolean m )
    {
      drawpts = m;
      repaint();
    }
    
    public void clearPoints()
    {
      cpts.removeAllElements();
      repaint();
    }
    
    public void setEndpoint( int e )
    {
      endpt = e;
      repaint();
    }
    
    // linear search. We don't expect to have many points in this list and
    // don't want fancy data structures right now
    private int findCpt( int x, int y )
    {
      int np = cpts.size();
      for( int i = 0; i < np; i++ ){
	Cpt n = ( Cpt )cpts.elementAt( i );
	// is the point within +/- 3 pixels of one of the control points?
	if( n.x - 3 < x && x < n.x + 3 &&
	    n.y - 3 < y && y < n.y + 3 ){ selected = n; return i; }
      }
      // none found
      return -1;
    }
    
    // event handler for mouseDown
    public boolean mouseDown( Event e, int x, int y )
    {
      wasDragged = false;
      mode = ADD_MOV;
      if(e.controlDown() || (e.modifiers & Event.META_MASK) != 0){ 
        // delete point 
	selindex = findCpt( x, y );
	if( selindex != -1 ){
	  // only if something is selected attempt to delete it
	  cpts.removeElement( selected ); repaint();          
	}
        mode = DEL;
      } else {
	// remember the location
	x1 = x; y1 = y;
	selindex = findCpt( x, y );        
      }
      return true;
    }

    /**
     *  calculates square of distance between line and point 
     *
     */
    double dist2(Cpt p0, Cpt p1, Cpt p){
      
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
    // find closest edge to the point 
    
    int findEdge(Cpt p){
      
      int len = cpts.size();
      if(len < 2){
	return -1; // no edges yet
      }
      for(int i=1; i < len; i++){
	Cpt pnt0 = (Cpt)cpts.elementAt(i-1);
	Cpt pnt1 = (Cpt)cpts.elementAt(i);
	if(dist2(pnt0, pnt1, p) < PNT_SIZE2)
	  return i-1;
      }
      return -1;
    }
    
    public boolean mouseUp( Event e, int x, int y )
    {
      switch( mode ){
      case ADD_MOV:
        //case MOV:
        if(wasDragged){ // we were moving 
          if( selindex != -1 ){
            // only if something is selected update its coordinates
            selected.x = x < 0 ? 0:(x > size().width ? size().width:x);
            selected.y = y < 0 ? 0:(y > size().height ? size().height:y);
            repaint();
          }          
	  
        } else { // we were creating new point 
	  
          // add this coordinate as a new control point to the list
          // we need to find where to insert
          Cpt p = new Cpt( x, y );
          int index = findEdge(p);
          if(index >=0){ // found edge to insert 
            cpts.insertElementAt(p, index+1 );
          } else { // insert at the end 
            cpts.addElement( p );
          }
          repaint();
          break;
        }
	
	break;
      case DEL:
	break;
      default:
	return false;
      }
      
      return true;
    }
    
  boolean wasDragged = false;

  public boolean mouseDrag( Event e, int x, int y )
    {
      wasDragged = true;
      xl = x<0?0:(x>size().width?size().width:x);
      yl = y<0?0:(y>size().height?size().height:y);
      switch( mode ){
      case ADD_MOV:
	if( selindex != -1 ){
	  // continually change the coordinate of the selected point
	  selected.x = xl; selected.y = yl; repaint();
	}
	break;
      default:
	return false;
      }
      return true;
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

    public void update( Graphics g ){
      paint(g);
    }
    
    public synchronized void paint( Graphics g )
    {
      // number of control points
      int np = cpts.size();
      // previous
      Cpt p;
      int i, l, total, newlength;
      float pts[][];
      boolean periodic;

      if(offScrImage==null || offScrImage.getWidth(this) != size().width ||offScrImage.getHeight(this) != size().height ) {
	offScrImage = createImage(size().width,size().height);
	offScr = offScrImage.getGraphics();
      }
      offScr.setPaintMode();
      offScr.setColor( bgrd);
      offScr.fillRect(0,0,size().width,size().height);
      offScr.setColor( ctrl );
      offScr.drawRect(0,0,size().width-1,size().height-1);
      
      // draw the current lines

      if( np > 0 ){
	offScr.setColor( ctrl );
	// draw the control polygon
	switch( endpt ){
	default:
	case INTERP:
	case OPEN:
	  p = ( Cpt )cpts.firstElement();
	  break;
	case CLOSED:
	  p = ( Cpt )cpts.lastElement();
	  break;
	}
	for( i = 0; i < np; i++ ){
	  Cpt n = ( Cpt )cpts.elementAt(i);
	  offScr.drawLine( p.x, p.y, n.x, n.y );
	  p = n;
	}
	// cut corners with 1/4 3/4
	switch( endpt ){
	case INTERP:
	  // double up first and last vertex
	  newlength = np+2;
	  total = newlength * ( 1 << levels ) - 2 * ( ( 1 << levels ) - 1 );
	  break;
	default:
	case OPEN:
	  // default; no doubling up
	  newlength = np;
	  total = newlength * ( 1 << levels ) - 2 * ( ( 1 << levels ) - 1 );
	  break;
	case CLOSED:
	  // no doubling up either, but wrap around
	  newlength = np;
	  total = newlength * ( 1 << levels );
	  break;
	}
	periodic = ( endpt == CLOSED );
	// in order to avoid continual reallocation of the level arrays
	// which hold the successive polyline approximations we rebuild
	// them lazily
	if( newlength != lastlength ){
	  // must rebuild
	  for( i = 0, l = newlength; i < MAXLEVEL; i++ ){
	    line[i] = new float[l][2];
	    l *= 2;
	  }
	  lastlength = newlength;
	}
	// load up the level 0 array with the control points
	switch( endpt ){
	case INTERP:
	  // double up the first and last
	  line[0][0][0] = ( ( Cpt )cpts.elementAt( 0 ) ).x;
	  line[0][0][1] = ( ( Cpt )cpts.elementAt( 0 ) ).y;
	  for( i = 0; i < np; i++ ){
	    line[0][i+1][0] = ( ( Cpt )cpts.elementAt( i ) ).x;
	    line[0][i+1][1] = ( ( Cpt )cpts.elementAt( i ) ).y;
	  }
	  line[0][np+1][0] = ( ( Cpt )cpts.elementAt( np-1 ) ).x;
	  line[0][np+1][1] = ( ( Cpt )cpts.elementAt( np-1 ) ).y;
	  break;
	default:
	case OPEN:
	case CLOSED:
	  // no doubling up
	  for( i = 0; i < np; i++ ){
	    line[0][i][0] = ( ( Cpt )cpts.elementAt( i ) ).x;
	    line[0][i][1] = ( ( Cpt )cpts.elementAt( i ) ).y;
	  }
	  break;
	}
	// now do so many levels of corner cutting putting successive
	// levels in to `line'
	for( i = 0, l = lastlength; i < levels; i++ ){
	  CutCorners( line[i+1], line[i], weight, l, periodic, i );
	  // how long is the next array? (roughly 2 times)
	  l = periodic ? 2 * l : 2 * ( l - 1 );
	}
	// draw the final level
	offScr.setColor( lineColor );
	pts = line[levels];
	for( i = 0; i < total - 1; i++ ){
	  offScr.drawLine( ( int )pts[i][0], ( int )pts[i][1],
		      ( int )pts[i+1][0], ( int )pts[i+1][1] );
	}
	// connect the last to the first?
	if( periodic ){
	  offScr.drawLine( ( int )pts[total-1][0], ( int )pts[total-1][1],
		      ( int )pts[0][0], ( int )pts[0][1] );
	}
	if( drawpts ) {
	  offScr.setColor( Color.black );
	  for( i = 0; i < total; i++ ){
	    offScr.fillRect( ( int )pts[i][0]-1,
			     ( int )pts[i][1]-1, 3, 3 );	    
	  }
	}
	// draw control points
	offScr.setColor( ctrv );
	for( i = 0; i < np; i++ ){
	  Cpt n = ( Cpt )cpts.elementAt(i);
	  offScr.fillRect( n.x - 2, n.y - 2, 5, 5 );
	}
      }
      g.drawImage( offScrImage, 0, 0, this );
    }
  }

} // Draw Chaikin 




