package pvs.polyhedra;

import java.awt.Color;
import java.util.Vector;

import pvs.utils.PVSObserver;
import pvs.utils.Point2;

public class CurveChaikin {

  // how to deal with endpoints
  public static final int OPEN = 0, CLOSED = 1;
  // for subdivision constructions, how many levels?
  public static final int MAXLEVEL = 10;

  // curve parameters 
  public int levels = 3; // may be 0 - 10;
  public double weight = 3; // may be 1 - 8 
  public int closed = 1; // may be 0 or 1; 
  double offset = 0; // template offset - draw actual curve on distance tOffset 
  
  float [][]offsetPnt = new float[0][2]; // extra storage to store offset points 

  public boolean drawpts = false;
  int lastlength = -1;

  // for control polygon
  public static final Color ctrl = new Color( 192, 192, 192);
  // for control vertices
  static final Color ctrv = new Color( 255, 153, 51 );
    // background
  public static final Color bgrd = new Color( 255, 255, 255); // 192, 192, 192);//102, 102, 102 );
    // foregraound
    // private static final Color fgrd = new Color( 255, 255, 255 );
  static final Color lineColor = new Color( 0,0,0);//255, 255, 255 );


  // dynamic vector to hold the control points
  public Vector cpts = new Vector( 100 );

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
  public float[][] getCurve(){

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
  public void render(IGraphics2D graph2){

    // number of control points
    int np = cpts.size();
    // previous
    Point2 p;
    int i;
    // int l;
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