package pvs.utils;
/**
 * PSGr is a Graphics subclass that images to PostScript.
 * (C) 1996 E.J. Friedman-Hill and Sandia National Labs
 * @version 	1.0
 * @author 	Ernest Friedman-Hill
 */

/*
   modified 1996 by V.Bulatov@ic.ac.uk  
 */
import java.awt.Color;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics;
import java.awt.Image;
import java.awt.Polygon;
import java.awt.Rectangle;
import java.awt.Shape;
import java.awt.image.ImageObserver;
import java.io.OutputStream;
import java.io.PrintStream;

public class GraphicsPS extends java.awt.Graphics {

  public final static int CLONE = 49;
  /*
  protected final static int PAGEHEIGHT = 792;
  protected final static int PAGEWIDTH = 612;
  protected final static int XOFFSET = 30;
  protected final static int YOFFSET = 30;
  */
  /*
     Paper size A4
   */
  protected final static int PAGEHEIGHT = 864;
  protected final static int PAGEWIDTH = 595;
  protected final static int XOFFSET = 5;
  protected final static int YOFFSET = 5;

  /**
    hexadecimal digits
    */
  
  protected final static char hd[] = {'0', '1', '2', '3', '4', '5', '6', '7',
                                      '8', '9', 'A', 'B', 'C', 'D', 'E', 'F' };
  
  /**
    number of chars in a full row of pixel data
    */
  
  protected final static int charsPerRow = 12*6;

  
  /**
    Output stream where postscript goes
    */

  protected PrintStream os = System.out;

  /**
    The current color
    */

  protected Color clr = Color.black;

  /**
    The current font
    */

  protected Font font = new Font("Helvetica",Font.PLAIN,12);

  protected Rectangle clippingRect = new Rectangle(0,0,PAGEWIDTH,PAGEHEIGHT);

  protected Graphics g;

  /**
   * Constructs a new GraphicsPS Object. Unlike regular Graphics objects,
   * GraphicsPS contexts can be created directly.
   * @param o Output stream for PostScript output
   * @see #create
   */

  public GraphicsPS(OutputStream o, Graphics g) {
    os = new PrintStream(o);
    this.g = g;
    emitProlog();
  }

  public GraphicsPS(OutputStream o, Graphics g, int what) {
    os = new PrintStream(o);
    this.g = g;
    if (what != CLONE)
      emitProlog();
  }

  /**
   * Creates a new GraphicsPS Object that is a copy of the original GraphicsPS Object.
   */
  public Graphics create() {
    GraphicsPS psgr = new GraphicsPS(os,g,CLONE);
    psgr.font = font;
    psgr.clippingRect = clippingRect;
    psgr.clr = clr;
    return (Graphics) psgr;
  }
  
  /**
   * Creates a new Graphics Object with the specified parameters,
   * based on the original
   * Graphics Object. 
   * This method translates the specified parameters, x and y, to
   * the proper origin coordinates and then clips the Graphics Object to the
   * area.
   * @param x the x coordinate
   * @param y the y coordinate
   * @param width the width of the area
   * @param height the height of the area
   * @see #translate
   */
  public Graphics create(int x, int y, int width, int height) {
    Graphics g = create();
    g.translate(x, y);
    g.clipRect(0, 0, width, height);
    return g;
  }

  /**
   * Translates the specified parameters into the origin of
   * the graphics context. All subsequent
   * operations on this graphics context will be relative to this origin.
   * @param x the x coordinate
   * @param y the y coordinate
   * @see #scale
   */

  public void translate(int x, int y) {
    os.print(x);
    os.print(" ");
    os.print(-y);  // v.bulatov@ic.ac.uk (was wrong sign)
    os.println(" translate");
  }

  /**
   * Scales the graphics context. All subsequent operations on this
   * graphics context will be affected.
   * @param sx the scaled x coordinate
   * @param sy the scaled y coordinate
   * @see #translate
   */
  public void scale(float sx, float sy) {
    os.print(sx);
    os.print(" ");
    os.print(sy);
    os.println(" scale");
  }


  /**
   * Gets the current color.
   * @see #setColor
   */
  public Color getColor() {
    return clr;
  }
  

  /**
   * Sets the current color to the specified color. All subsequent graphics operations
   * will use this specified color.
   * @param c the color to be set
   * @see Color
   * @see #getColor
   */

  public void setColor(Color c) {
    if (c != null)
      clr = c;
    os.print(clr.getRed()/255.0);
    os.print(" ");
    os.print(clr.getGreen()/255.0);
    os.print(" ");
    os.print(clr.getBlue()/255.0);
    os.println(" setrgbcolor");
  }

  /**
   * Sets the default paint mode to overwrite the destination with the
   * current color. PostScript has only paint mode.
   */
  public void setPaintMode() {
  }

  /**
   * Sets the paint mode to alternate between the current color
   * and the new specified color. PostScript does not support XOR mode.
   * @param c1 the second color
   */
  public void setXORMode(Color c1) {
    System.err.println("Warning: GraphicsPS does not support XOR mode");
  }

  /**
   * Gets the current font.
   * @see #setFont
   */
  public Font getFont() {
    return font;
  }

  /**
   * Sets the font for all subsequent text-drawing operations.
   * @param font the specified font
   * @see Font
   * @see #getFont
   * @see #drawString
   * @see #drawBytes
   * @see #drawChars
   */
  public void setFont(Font f) {
    if (f != null) {
      this.font = f;
      String javaName = font.getName();
      int javaStyle = font.getStyle();
      String psName;

      if (javaName.equals("Symbol"))
        psName = "Symbol";

      else if (javaName.equals("Times")) {
        psName = "Times-";
        switch (javaStyle) {
        case Font.PLAIN:
          psName += "Roman"; break;
        case Font.BOLD:
          psName += "Bold"; break;
        case Font.ITALIC:
          psName += "Italic"; break;
        case (Font.ITALIC + Font.BOLD):
          psName += "BoldItalic"; break;
        }
      }

      else if (javaName.equals("Helvetica") || javaName.equals("Courier")) {
        psName = javaName;
        switch (javaStyle) {
        case Font.PLAIN:
          break;
        case Font.BOLD:
          psName += "-Bold"; break;
        case Font.ITALIC:
          psName += "-Oblique"; break;
        case (Font.ITALIC + Font.BOLD):
          psName += "BoldOblique"; break;
        }
      }
      
      else 
        psName = "Courier";

      os.println("/" + psName + " findfont");
      os.print(font.getSize());
      os.println(" scalefont setfont");
    }
  }

  /**
   * Gets the current font metrics.
   * @see #getFont
   */
  public FontMetrics getFontMetrics() {
    return getFontMetrics(getFont());
  }

  /**
   * Gets the current font metrics for the specified font.
   * @param f the specified font
   * @see #getFont
   * @see #getFontMetrics
   */
  public FontMetrics getFontMetrics(Font f) {
    return g.getFontMetrics(f);
  }


  /** 
   * Returns the bounding rectangle of the current clipping area.
   * @see #clipRect
   */
  public Rectangle getClipRect() {
    return clippingRect;
  }

  /** 
   * Clips to a rectangle. The resulting clipping area is the
   * intersection of the current clipping area and the specified
   * rectangle. Graphic operations have no effect outside of the
   * clipping area.
   * @param x the x coordinate
   * @param y the y coordinate
   * @param width the width of the rectangle
   * @param height the height of the rectangle
   * @see #getClipRect
   */
  public void clipRect(int x, int y, int width, int height) {
    clippingRect = new Rectangle(x,y,width,height);
    y = transformY(y);
    drawLine(x, y, x + width, y);
    drawLine(x + width, y, x + width, y - height);
    drawLine(x, y, x, y - height);
    os.println("closepath eoclip newpath");
  }

  /**
   * Copies an area of the screen.
   * @param x the x-coordinate of the source
   * @param y the y-coordinate of the source
   * @param width the width
   * @param height the height
   * @param dx the horizontal distance
   * @param dy the vertical distance
   * Note: copyArea not supported by PostScript
   */
  public void copyArea(int x, int y, int width, int height, int dx, int dy) {
    throw new RuntimeException("copyArea not supported");
  }

  /** 
   * Draws a line between the coordinates (x1,y1) and (x2,y2). The line is drawn
   * below and to the left of the logical coordinates.
   * @param x1 the first point's x coordinate
   * @param y1 the first point's y coordinate
   * @param x2 the second point's x coordinate
   * @param y2 the second point's y coordinate
   */
  public void drawLine(int x1, int y1, int x2, int y2) {
    y1 = transformY(y1);
    y2 = transformY(y2);
    os.print(x1);
    os.print(" ");
    os.print(y1);
    os.print(" m ");
    os.print(x2);
    os.print(" ");
    os.print(y2);
    os.println(" l s");
  }

  protected void doRect(int x, int y, int width, int height, boolean fill) {
    y = transformY(y);
    os.print(x);
    os.print(" ");
    os.print(y);
    os.println(" m ");
    os.print(x + width);
    os.print(" ");
    os.print(y);
    os.println(" l ");
    os.print(x + width);
    os.print(" ");
    os.print(y - height);
    os.println(" l ");
    os.print(x);
    os.print(" ");
    os.print(y - height);
    os.println(" l ");
    os.print(x);
    os.print(" ");
    os.print(y);
    os.println(" l ");
    if (fill)
      os.println("e");
    else
      os.println("s");
      
  }

  /** 
   * Fills the specified rectangle with the current color. 
   * @param x the x coordinate
   * @param y the y coordinate
   * @param width the width of the rectangle
   * @param height the height of the rectangle
   * @see #drawRect
   * @see #clearRect
   */
  public void fillRect(int x, int y, int width, int height) {
    os.println("%fillRect");
    doRect(x,y,width,height,true);
  }

  /** 
   * Draws the outline of the specified rectangle using the current color.
   * Use drawRect(x, y, width-1, height-1) to draw the outline inside the specified
   * rectangle.
   * @param x the x coordinate
   * @param y the y coordinate
   * @param width the width of the rectangle
   * @param height the height of the rectangle
   * @see #fillRect
   * @see #clearRect
   */
  public void drawRect(int x, int y, int width, int height) {   
    os.println("%drawRect");
    doRect(x,y,width,height,false);
  }
  
  /** 
   * Clears the specified rectangle by filling it with the current background color
   * of the current drawing surface.
   * Which drawing surface it selects depends on how the graphics context
   * was created.
   * @param x the x coordinate
   * @param y the y coordinate
   * @param width the width of the rectangle
   * @param height the height of the rectangle
   * @see #fillRect
   * @see #drawRect
   */
  public void clearRect(int x, int y, int width, int height) {
    os.println("%clearRect");
    os.println("gsave");
    os.println("1 1 1 setrgbcolor");
    doRect(x,y,width,height, true);
    os.println("grestore");
  }


  private void doRoundRect(int x, int y, int width, int height,
                           int arcWidth, int arcHeight, boolean fill) {
    y = transformY(y);
    os.print(x+arcHeight);
    os.print(" ");
    os.print(y);
    os.println(" moveto");

    // top, left to right
    os.print(x+width);
    os.print(" ");
    os.print(y);
    os.print(" ");
    os.print(x+width);
    os.print(" ");
    os.print(y-height);
    os.print(" ");
    os.print(arcHeight);
    os.println(" arcto");
    os.println("4 {pop} repeat");

    // right, top to bottom
    os.print(x+width);
    os.print(" ");
    os.print(y-height);
    os.print(" ");
    os.print(x);
    os.print(" ");
    os.print(y-height);
    os.print(" ");
    os.print(arcHeight);
    os.println(" arcto");
    os.println("4 {pop} repeat");

    // top, left to right
    os.print(x);
    os.print(" ");
    os.print(y-height);
    os.print(" ");
    os.print(x);
    os.print(" ");
    os.print(y);
    os.print(" ");
    os.print(arcHeight);
    os.println(" arcto");
    os.println("4 {pop} repeat");

    // left, top to bottom
    os.print(x);
    os.print(" ");
    os.print(y);
    os.print(" ");
    os.print(x+width);
    os.print(" ");
    os.print(y);
    os.print(" ");
    os.print(arcHeight);
    os.println(" arcto");
    os.println("4 {pop} repeat");

    if (fill) 
      os.println("e");
    else
      os.println("s");

  }


  /** 
   * Draws an outlined rounded corner rectangle using the current color.
   * @param x the x coordinate
   * @param y the y coordinate
   * @param width the width of the rectangle
   * @param height the height of the rectangle
   * @param arcWidth the diameter of the arc
   * @param arcHeight the radius of the arc
   * @see #fillRoundRect
   */
  public void drawRoundRect(int x, int y, int width, int height, int arcWidth, int arcHeight) {
    os.println("%drawRoundRect");
    doRoundRect(x,y,width,height,arcWidth,arcHeight, false);
  }

  /** 
   * Draws a rounded rectangle filled in with the current color.
   * @param x the x coordinate
   * @param y the y coordinate
   * @param width the width of the rectangle
   * @param height the height of the rectangle
   * @param arcWidth the diameter of the arc
   * @param arcHeight the radius of the arc
   * @see #drawRoundRect
   */
  public void fillRoundRect(int x, int y, int width, int height, int arcWidth, int arcHeight) {
    os.println("%fillRoundRect"); 
    doRoundRect(x,y,width,height,arcWidth,arcHeight, true);
  }

  /**
   * Draws a highlighted 3-D rectangle.
   * @param x the x coordinate
   * @param y the y coordinate
   * @param width the width of the rectangle
   * @param height the height of the rectangle
   * @param raised a boolean that states whether the rectangle is raised or not
   */
  public void draw3DRect(int x, int y, int width, int height, boolean raised) {
    os.println("%draw3DRect"); 
    Color c = getColor();
    Color brighter = c.brighter();
    Color darker = c.darker();

    setColor(raised ? brighter : darker);
    drawLine(x, y, x, y + height);
    drawLine(x + 1, y, x + width - 1, y);
    setColor(raised ? darker : brighter);
    drawLine(x + 1, y + height, x + width, y + height);
    drawLine(x + width, y, x + width, y + height);
    setColor(c);
  }    

  /**
   * Paints a highlighted 3-D rectangle using the current color.
   * @param x the x coordinate
   * @param y the y coordinate
   * @param width the width of the rectangle
   * @param height the height of the rectangle
   * @param raised a boolean that states whether the rectangle is raised or not
   */
  public void fill3DRect(int x, int y, int width, int height, boolean raised) {
    os.println("%fill3DRect"); 
    Color c = getColor();
    Color brighter = c.brighter();
    Color darker = c.darker();

    if (!raised) {
      setColor(darker);
    }
    fillRect(x+1, y+1, width-2, height-2);
    setColor(raised ? brighter : darker);
    drawLine(x, y, x, y + height - 1);
    drawLine(x + 1, y, x + width - 2, y);
    setColor(raised ? darker : brighter);
    drawLine(x + 1, y + height - 1, x + width - 1, y + height - 1);
    drawLine(x + width - 1, y, x + width - 1, y + height - 1);
    setColor(c);
  }    

  /** 
   * Draws an oval inside the specified rectangle using the current color.
   * @param x the x coordinate
   * @param y the y coordinate
   * @param width the width of the rectangle
   * @param height the height of the rectangle
   * @see #fillOval
   */
  public void drawOval(int x, int y, int width, int height) {
    os.println("%drawOval");
    doArc(x,y,width,height,0,360,false);
  }

  /** 
   * Fills an oval inside the specified rectangle using the current color.
   * @param x the x coordinate
   * @param y the y coordinate
   * @param width the width of the rectangle
   * @param height the height of the rectangle
   * @see #drawOval
   */
  public void fillOval(int x, int y, int width, int height) {
    os.println("%fillOval");
    doArc(x,y,width,height,0,360,true);
  }

  private void doArc(int x, int y, int width, int height,
                     int startAngle, int arcAngle, boolean fill) {
    y = transformY(y);
    os.println("gsave");

    // cx,cy is the center of the arc
    float cx = x + (float)width/2;
    float cy = y - (float)height/2;

    // translate the page to be centered there
    os.print(cx);
    os.print(" ");
    os.print(cy);
    os.println(" translate");
    
    // scale the coordinate system - this is the only way to directly draw
    // an eliptical arc in postscript. Calculate the scale:
    
    float yscale = (float) height/(float)width;
    os.print(1.0);
    os.print(" ");
    os.print(yscale);
    os.println(" scale");
    
    if (fill) {
      os.println("0 0 moveto");
    }

    // now draw the arc.
    float endAngle = startAngle + arcAngle;
    os.print("0 0 ");
    os.print((float)width/2.0);
    os.print(" ");
    os.print(startAngle);
    os.print(" ");
    os.print(endAngle);
    os.println(" arc");

    if (fill) {
      os.println("closepath e");
    } else {
      os.println("s");
    }

    // undo all the scaling!
    os.println("grestore");

  }


  /**
   * Draws an arc bounded by the specified rectangle from startAngle to
   * endAngle. 0 degrees is at the 3-o'clock position.Positive arc
   * angles indicate counter-clockwise rotations, negative arc angles are
   * drawn clockwise. 
   * @param x the x coordinate
   * @param y the y coordinate
   * @param width the width of the rectangle
   * @param height the height of the rectangle
   * @param startAngle the beginning angle
   * @param arcAngle the angle of the arc (relative to startAngle).
   * @see #fillArc
   */
  public void drawArc(int x, int y, int width, int height,
                      int startAngle, int arcAngle) {
    os.println("%drawArc");
    doArc(x,y,width,height,startAngle,arcAngle,false);
  }

  /** 
   * Fills an arc using the current color. This generates a pie shape.
   *
   * @param x the x coordinate
   * @param y the y coordinate
   * @param width the width of the arc
   * @param height the height of the arc
   * @param startAngle the beginning angle
   * @param arcAngle the angle of the arc (relative to startAngle).
   * @see #drawArc
   */
  public void fillArc(int x, int y, int width, int height, int startAngle, int arcAngle) {
    os.println("%fillArc");      
    doArc(x,y,width,height,startAngle,arcAngle,true);
  }


  private void doPoly(int xPoints[], int yPoints[], int nPoints, boolean fill) {
    if (nPoints < 2)
      return;

    int newYPoints[] = new int[nPoints];
    int i;

    for (i=0; i< nPoints; i++)
      newYPoints[i] = transformY(yPoints[i]);

    os.print(xPoints[0]);
    os.print(" ");
    os.print(newYPoints[0]);
    os.println(" m ");

    for (i=0; i<nPoints; i++) {
      os.print(xPoints[i]);
      os.print(" ");
      os.print(newYPoints[i]);
      os.println(" l ");
    }
    if(xPoints[nPoints-1] != xPoints[0] || newYPoints[nPoints-1] != newYPoints[0]){
      // close poly 
      os.print(xPoints[0]);
      os.print(" ");
      os.print(newYPoints[0]);
      os.println(" l ");      
    }
    
    if (fill)
      os.println("e");
    else
      os.println("s");

  }


  /** 
   * Draws a polygon defined by an array of x points and y points.
   * @param xPoints an array of x points
   * @param yPoints an array of y points
   * @param nPoints the total number of points
   * @see #fillPolygon
   */
  public void drawPolygon(int xPoints[], int yPoints[], int nPoints) {
    //os.println("%drawPoly");            
    doPoly(xPoints, yPoints, nPoints, false);
  }

  /** 
   * Draws a polygon defined by the specified point.
   * @param p the specified polygon
   * @see #fillPolygon
   */
  public void drawPolygon(Polygon p) {
    os.println("%drawPoly");            
    doPoly(p.xpoints, p.ypoints, p.npoints, false);
  }
  
  /** 
   * Fills a polygon with the current color.
   * @param xPoints an array of x points
   * @param yPoints an array of y points
   * @param nPoints the total number of points
   * @see #drawPolygon
   */
  public void fillPolygon(int xPoints[], int yPoints[], int nPoints) {
    os.println("%fillPoly");            
    doPoly(xPoints, yPoints, nPoints, true);
  }

  /** 
   * Fills the specified polygon with the current color.
   * @param p the polygon
   * @see #drawPolygon
   */
  public void fillPolygon(Polygon p) {
    os.println("%fillPoly");            
    doPoly(p.xpoints, p.ypoints, p.npoints, true);
  }

  /** 
   * Draws the specified String using the current font and color.
   * The x,y position is the starting point of the baseline of the String.
   * @param str the String to be drawn
   * @param x the x coordinate
   * @param y the y coordinate
   * @see #drawChars
   * @see #drawBytes
   */
  public void drawString(String str, int x, int y) {
    y = transformY(y);
    os.print(x);
    os.print(" ");
    os.print(y);
    os.print(" moveto (");
    os.print(str);
    os.println(") show s");
  }
  /** 
   * Draws the specified characters using the current font and color.
   * @param data the array of characters to be drawn
   * @param offset the start offset in the data
   * @param length the number of characters to be drawn
   * @param x the x coordinate
   * @param y the y coordinate
   * @see #drawString
   * @see #drawBytes
   */
  public void drawChars(char data[], int offset, int length, int x, int y) {
    drawString(new String(data, offset, length), x, y);
  }

  /** 
   * Draws the specified bytes using the current font and color.
   * @param data the data to be drawn
   * @param offset the start offset in the data
   * @param length the number of bytes that are drawn
   * @param x the x coordinate
   * @param y the y coordinate
   * @see #drawString
   * @see #drawChars
   */
  public void drawBytes(byte data[], int offset, int length, int x, int y) {
    drawString(new String(data, 0, offset, length), x, y);
  }


  public boolean doImage(Image img, int x, int y, int width, int height,
                           ImageObserver observer, Color bgcolor) {
    y = transformY(y);
    
    // This class fetches the pixels in its constructor.
    PixelConsumer pc = new PixelConsumer(img);
        
    os.println("gsave");

    os.println("% build a temporary dictionary");
    os.println("20 dict begin");
    emitColorImageProlog(pc.xdim);

    os.println("% lower left corner");
    os.print(x);
    os.print(" ");
    os.print(y);
    os.println(" translate");

    // compute image size. First of all, if width or height is 0, image is 1:1.
    if (height == 0 || width == 0) {
      height = pc.ydim;
      width = pc.xdim;
    }       

    os.println("% size of image");
    os.print(width);
    os.print(" ");
    os.print(height);
    os.println(" scale");

    os.print(pc.xdim);
    os.print(" ");
    os.print(pc.ydim);
    os.println(" 8");

    os.print("[");
    os.print(pc.xdim);
    os.print(" 0 0 -");
    os.print(pc.ydim);
    os.print(" 0 ");
    os.print(0);
    os.println("]");

    os.println("{currentfile pix readhexstring pop}");
    os.println("false 3 colorimage");
    os.println("");


    int offset, sleepyet=0;;
    // array to hold a line of pixel data
    char[] sb = new char[charsPerRow + 1];

      for (int i=0; i<pc.ydim; i++) {
        offset = 0;
        ++sleepyet;
        if (bgcolor == null) {
          // real color image. We're deliberately duplicating code here
          // in the interest of speed - we don't want to check bgcolor
          // on every iteration.
          for (int j=0; j<pc.xdim; j++) {
            int n = pc.pix[j][i];
            
            // put hex chars into string
            // flip red for blue, to make postscript happy.
            
            sb[offset++] = hd[(n & 0xF0)     >>  4];
            sb[offset++] = hd[(n & 0xF)           ];
            sb[offset++] = hd[(n & 0xF000)   >> 12];
            sb[offset++] = hd[(n & 0xF00)    >>  8];
            sb[offset++] = hd[(n & 0xF00000) >> 20];
            sb[offset++] = hd[(n & 0xF0000)  >> 16];
            
            if (offset >= charsPerRow) {
              String s = String.copyValueOf(sb, 0, offset);
              os.println(s);
              if (sleepyet > 5) {
                try {
                  // let the screen update occasionally!
                  Thread.sleep(15);
                } catch (java.lang.InterruptedException ex) {
                  // yeah, so?
                }
                sleepyet = 0;
              }
              offset = 0;
            }
          }
        } else {
          System.out.println("%FalseColor");
          // false color image.
          for (int j=0; j<pc.xdim; j++) {
            int bg =
              bgcolor.getGreen() << 16 + bgcolor.getBlue() << 8 + bgcolor.getRed();
            int fg =
              clr.getGreen() << 16 + clr.getBlue() << 8 + clr.getRed();
            
            int n = (pc.pix[j][i] == 1 ? fg : bg);
            
            // put hex chars into string
            
            sb[offset++] = hd[(n & 0xF0)     ];
            sb[offset++] = hd[(n & 0xF)     ];
            sb[offset++] = hd[(n & 0xF000)  ];
            sb[offset++] = hd[(n & 0xF00)   ];
            sb[offset++] = hd[(n & 0xF00000)];
            sb[offset++] = hd[(n & 0xF0000) ];
            
            if (offset >= charsPerRow) {
              String s = String.copyValueOf(sb, 0, offset);
              os.println(s);
              if (sleepyet > 5) {
                try {
                  // let the screen update occasionally!
                  Thread.sleep(15);
                } catch (java.lang.InterruptedException ex) {
                  // yeah, so?
                }
                sleepyet = 0;
              }
              offset = 0;
            }
          }
        }   
        // print partial rows
        if (offset != 0) {
          String s = String.copyValueOf(sb, 0, offset);
          os.println(s);
        }
      }
    
    os.println("");
    os.println("end");
    os.println("grestore");
    
    return true;
  }
  
  /** 
   * Draws the specified image at the specified coordinate (x, y). If the image is 
   * incomplete the image observer will be notified later.
   * @param img the specified image to be drawn
   * @param x the x coordinate
   * @param y the y coordinate
   * @param observer notifies if the image is complete or not
   * @see Image
   * @see ImageObserver
   */

  public boolean drawImage(Image img, int x, int y,
                           ImageObserver observer) {
    os.println("%drawImage-1");

    return doImage(img, x, y, 0, 0, observer, null);

  }
  
  /**
   * Draws the specified image inside the specified rectangle. The image is
   * scaled if necessary. If the image is incomplete the image observer will be
   * notified later.
   * @param img the specified image to be drawn
   * @param x the x coordinate
   * @param y the y coordinate
   * @param width the width of the rectangle
   * @param height the height of the rectangle
   * @param observer notifies if the image is complete or not
   * @see Image
   * @see ImageObserver
   */
  public boolean drawImage(Image img, int x, int y,
                           int width, int height, 
                           ImageObserver observer) {
    os.println("%drawImage-2");
    return doImage(img, x, y, width, height, observer, null);
  }

  /** 
   * Draws the specified image at the specified coordinate (x, y). If the image is 
   * incomplete the image observer will be notified later.
   * @param img the specified image to be drawn
   * @param x the x coordinate
   * @param y the y coordinate
   * @param bgcolor the background color
   * @param observer notifies if the image is complete or not
   * @see Image
   * @see ImageObserver
   */

  public boolean drawImage(Image img, int x, int y, Color bgcolor,
                           ImageObserver observer) {
    os.println("%drawImage-3");
    return doImage(img, x, y, 0, 0, observer, bgcolor);
  }

  /**
   * Draws the specified image inside the specified rectangle. The image is
   * scaled if necessary. If the image is incomplete the image observer will be
   * notified later.
   * @param img the specified image to be drawn
   * @param x the x coordinate
   * @param y the y coordinate
   * @param width the width of the rectangle
   * @param height the height of the rectangle
   * @param bgcolor the background color
   * @param observer notifies if the image is complete or not
   * @see Image
   * @see ImageObserver
   * NOTE: GraphicsPS ignores the background color.
   */
  public boolean drawImage(Image img, int x, int y,
                           int width, int height, Color bgcolor,
                           ImageObserver observer) {
    os.println("%drawImage-4");
    return doImage(img, x, y, width, height, observer, bgcolor);
  }
  
  /**
   * Disposes of this graphics context.  The Graphics context cannot be used after 
   * being disposed of.
   * @see #finalize
   */
  public void dispose() {
    os.println("%dispose");
    os.flush();
  }

  /**
   * Disposes of this graphics context once it is no longer referenced.
   * @see #dispose
   */
  public void finalize() {
    dispose();
  }

  /**
   * Returns a String object representing this Graphic's value.
   */
  public String toString() {	
    return getClass().getName() + "[font=" + getFont() + ",color=" + getColor() + "]";
  }

  /**
    Flip Y coords so Postscript looks like Java
    */

  protected int transformY(int y) {
    return 4*PAGEHEIGHT - y;
  }

  /**
    Top of every PS file
    */

  protected void emitProlog() {
    os.println("%!Adobe-PS-2.0 Created by GraphicsPS Java PostScript Context");
    os.println("% (C)1996 Ernest Friedman-Hill and Sandia National Labs");
    //os.println("0 0 translate");
    os.println("0.25 0.25 scale");
    os.println("/m {moveto} bind def");
    os.println("/l {lineto} bind def");
    os.println("/s {stroke} bind def");
    os.println("/e {eofill} bind def");
    setFont(font);
  }


  protected void emitColorImageProlog(int xdim) {
    os.println("% Color picture stuff, lifted from XV's PS files");

    os.println("% define string to hold a scanline's worth of data");
    os.print("/pix ");
    os.print(xdim*3);
    os.println(" string def");

    os.println("% define space for color conversions");
    os.print("/grays ");
    os.print(xdim);
    os.println(" string def  % space for gray scale line");
    os.println("/npixls 0 def");
    os.println("/rgbindx 0 def");

    os.println("% define 'colorimage' if it isn't defined");
    os.println("%   ('colortogray' and 'mergeprocs' come from xwd2ps");
    os.println("%     via xgrab)");
    os.println("/colorimage where   % do we know about 'colorimage'?");
    os.println("{ pop }           % yes: pop off the 'dict' returned");
    os.println("{                 % no:  define one");
    os.println("/colortogray {  % define an RGB->I function");
    os.println("/rgbdata exch store    % call input 'rgbdata'");
    os.println("rgbdata length 3 idiv");
    os.println("/npixls exch store");
    os.println("/rgbindx 0 store");
    os.println("0 1 npixls 1 sub {");
    os.println("grays exch");
    os.println("rgbdata rgbindx       get 20 mul    % Red");
    os.println("rgbdata rgbindx 1 add get 32 mul    % Green");
    os.println("rgbdata rgbindx 2 add get 12 mul    % Blue");
    os.println("add add 64 idiv      % I = .5G + .31R + .18B");
    os.println("put");
    os.println("/rgbindx rgbindx 3 add store");
    os.println("} for");
    os.println("grays 0 npixls getinterval");
    os.println("} bind def");
    os.println("");
    os.println("% Utility procedure for colorimage operator.");
    os.println("% This procedure takes two procedures off the");
    os.println("% stack and merges them into a single procedure.");
    os.println("");
    os.println("/mergeprocs { % def");
    os.println("dup length");
    os.println("3 -1 roll");
    os.println("dup");
    os.println("length");
    os.println("dup");
    os.println("5 1 roll");
    os.println("3 -1 roll");
    os.println("add");
    os.println("array cvx");
    os.println("dup");
    os.println("3 -1 roll");
    os.println("0 exch");
    os.println("putinterval");
    os.println("dup");
    os.println("4 2 roll");
    os.println("putinterval");
    os.println("} bind def");
    os.println("");
    os.println("/colorimage { % def");
    os.println("pop pop     % remove 'false 3' operands");
    os.println("{colortogray} mergeprocs");
    os.println("image");
    os.println("} bind def");
    os.println("} ifelse          % end of 'false' case");

  }

  public void gsave() {
    os.println("gsave");
  }

  public void grestore() {
    os.println("grestore");
  }

  public int getWidth(){
    return 4*PAGEWIDTH;    
  }

  public int getHeight(){
    return 4*PAGEHEIGHT;    
  }

  public void flush(){
    os.println("showpage");
    os.flush();
  }

  // new (JDK1.2? ) methods of Graphics
  public Shape getClip(){
    return null;
  }

  public void drawPolyline(int[] x, int[] y, int n){

  }

  public void setClip(int x, int y, int w, int h){

  }

  public Rectangle getClipBounds(){
    return null;
  }

  public void setClip(Shape shape ){
    
  }

  public void drawString(java.text.AttributedCharacterIterator iter, int x, int y) {
  }

  public boolean drawImage(java.awt.Image im, int i1, int i2, int i3, int i4, int i5, int i6, int i7, int i8, 
		    java.awt.Color color , java.awt.image.ImageObserver obs){
    return false;
  }
  
  public boolean drawImage(java.awt.Image im, int i1, int i2, int i3, int i4, int i5, int i6, int i7, int i8, java.awt.image.ImageObserver obs){
    return true;
  } 
}


