package pvs.utils;
//
// Copyright (C) 1996 by Vladimir Bulatov <V.Bulatov@ic.ac.uk>.  
//        All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions
// are met:
// 1. Redistributions of source code must retain the above copyright
//    notice, this list of conditions and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above copyright
//    notice, this list of conditions and the following disclaimer in the
//    documentation and/or other materials provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE AUTHOR AND CONTRIBUTORS ``AS IS'' AND
// ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
// ARE DISCLAIMED.  IN NO EVENT SHALL THE AUTHOR OR CONTRIBUTORS BE LIABLE
// FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
// DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS
// OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
// HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
// LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY
// OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
// SUCH DAMAGE.

import java.awt.Color;
import java.awt.Graphics;
import java.awt.Image;
import java.awt.Point;
import java.awt.image.ImageObserver;
import java.util.Vector;

public class Graphics2D extends Object {
  
  /**
    current graphics
    */
  Graphics g;
  
  /**
    current painting mode
    */
  boolean paintMode = true;
  public Color XORColor = Color.white;
  Viewport viewport;
  ViewRect screenRect;

  protected double scalex=1,scaley=1,x0=0,y0=0;

  // Constructor.
  public Graphics2D() {
  }

  public Graphics2D(Graphics g) {
    this.g = g;
  }

  public void setGraphics(Graphics g){
    this.g = g;
  }

  public Graphics getGraphics(){
    return g;
  }

  public void setViewport(Viewport viewport){

    this.viewport = viewport;
    initTransform();    

  }

  public void setScreenRectangle(ViewRect screenRect){

    this.screenRect = screenRect;
    //System.out.println("setScreenRect()" + screenRect);
    initTransform();
  }

  void initTransform(){
    //System.out.println("scalex: " + scalex + " scaley: " + scaley + " x0: " + x0 + " y0: "+ y0);
    //System.out.println("viewport: " + viewport + " screenrect: " + screenRect);
    if(viewport != null && screenRect != null){
      scalex = (screenRect.right - screenRect.left)/(viewport.right - viewport.left);
      scaley = (screenRect.top - screenRect.bottom)/(viewport.top - viewport.bottom);
      x0 = -viewport.left + screenRect.left/scalex;
      y0 = -viewport.top + screenRect.top/scaley;
    }
  }
  
  public void setScale(double scale){
    this.scalex = scale;
    this.scaley = scale;
    // System.out.println("sc: " + scale + " x0: " + x0 + " y0:" + y0);
  }

  public void setScale(double scalex, double scaley ){
    this.scalex = scalex;
    this.scaley = scaley;

  }

  public void setTranslation(double x0, double y0){
    this.x0 = x0;
    this.y0 = y0;
  }

  public void setTranslation(Point2 p){
    this.x0 = p.x;
    this.y0 = p.y;
  }

  public void translate(Point2 p){
    this.x0 += p.x;
    this.y0 += p.y;
  }
  
  public double x2screen(double x){
    double sx = (scalex*(x+x0));
    //System.out.println("sx: " + sx);    
    return sx;
  }

  public double y2screen(double y){
    double sy = (scaley*(y+y0));
    //System.out.println("sy: " + sy);
    return sy;
  }
  
  public Point xy2screen(double x,double y){
    return new Point((int)(scalex*(x+x0)), (int)(scaley*(y+y0)) );
  }

  public Point2 screen2world(int x, int y){
    return new Point2(x/scalex - x0, y/scaley - y0 );
  }

  public double screen2x(int x){
    return x/scalex - x0;
  }

  public double screen2y(int y){
    return y/scaley - y0;
  }

  static double rad2grad = 180./Math.PI;

  public void drawString(String s, double x, double y){

    g.drawString(s,(int)x2screen(x),(int)y2screen(y));

  }

  public void drawCyrcle(double x, double y, double radius){
    double x0 = x2screen(x-radius);
    double y0 = y2screen(y-radius);
    double dx = x2screen(x+radius) - x0;
    double dy = y2screen(y+radius) - y0;

    g.drawOval((int)x0,(int)y0,(int)dx,(int)dy);

  }

  public void fillCyrcle(double x, double y, double radius){

    double x0 = x2screen(x-radius);
    double y0 = y2screen(y-radius);
    double dx = x2screen(x+radius) - x0;
    double dy = y2screen(y+radius) - y0;

    g.fillOval((int)x0,(int)y0,(int)dx,(int)dy);

  }

  public boolean drawImage(Image img, double x, double y,
		    double width, double height, 
		    ImageObserver observer){
    Point p1 = xy2screen(x,y);
    Point p2 = xy2screen(x+width,y+height);
    return g.drawImage(img, p1.x, p1.y, p2.x - p1.x, p2.y -p1.y, observer);
  }
  
  private int segmentsInArc(double radius, double angle){
    // number of grad in segment
    if(radius == 0.0)
      return 1;
    int n1 = (int)Math.ceil(Math.abs(angle*rad2grad/5));
    //number of 5 pixel segments in cyrcle
    int n2 = (int)Math.abs(x2screen(radius))+1;
    return  Math.min(n1,n2);
  }

  public void drawArc(double x, double y, double radius,
		      double start, double angle){
    
    int n = segmentsInArc(radius,angle);
    int x0,y0,x1,y1;
    x0 = (int)x2screen(x+radius*Math.cos(start));
    y0 = (int)y2screen(y+radius*Math.sin(start)); 
    for(int i=1;i <= n;i++){
      double fi = start + i*angle/n;
      x1 = (int)x2screen(x+radius*Math.cos(fi));
      y1 = (int)y2screen(y+radius*Math.sin(fi));
      g.drawLine(x0,y0, x1,y1);
      x0 = x1; y0 = y1;
    }
  }

  public void drawLine( double x1, double  y1, double x2, double y2 ) {

    // we need to clip the line agains 
    if(viewport != null)
      clipLine(x1,y1,x2,y2,viewport);
    else 
      drawLineNoClip(x1, y1, x2, y2);
  } 

  public void drawLineNoClip(double x1, double  y1, double x2, double y2){
    double sx1 = x2screen(x1);
    double sy1 = y2screen(y1);
    double sx2 = x2screen(x2);
    double sy2 = y2screen(y2);
    g.drawLine((int)sx1,(int)sy1, (int)sx2,(int)sy2);
  }

  public void setColor(Color color){
    g.setColor(color);
  }
  
  public void drawRect(double x, double y, double width, double height){
    double x1 = x2screen(x);
    double x2 = x2screen(x+width);
    double y1 = y2screen(y);
    double y2 = y2screen(y+height);
    g.drawRect((int)(x1+0.5), (int)(y1+0.5), (int)(x2-x1+0.5), (int)(y2-y1+0.5));
  }  

  public void fillRect(double x, double y, double width, double height){
    double x1 = x2screen(x);
    double x2 = x2screen(x+width);
    double y1 = y2screen(y);
    double y2 = y2screen(y+height);
    g.fillRect((int)(x1+0.5), (int)(y1+0.5), (int)(x2-x1+0.5), (int)(y2-y1+0.5));
  }  

  public void drawControlSquare(double x, double y, int size){
    g.drawRect((int)x2screen(x) - size/2, (int)y2screen(y) - size/2, size, size);
  }

  public void fillControlSquare(double x, double y, int size){
    g.fillRect((int)x2screen(x) - size/2, (int)y2screen(y) - size/2, size, size);
  }

  public void fillPolygon(Vector points){
    int nvert = points.size();
    int[] x = new int[nvert];
    int[] y = new int[nvert];
    for(int i=0; i < nvert;i++){
      Point2 p = (Point2)points.elementAt(i);
      x[i] = (int)x2screen(p.x);
      y[i] = (int)y2screen(p.y);	
    }
    g.fillPolygon(x,y,nvert);    
  }

  public void drawPolygon(Vector points){

    int nvert = points.size();
    Point2 p = (Point2)points.elementAt(nvert-1);
    double x0 = p.x;
    double y0 = p.y;	
    for(int i = 0; i < nvert;i++){
      Point2 p1 = (Point2)points.elementAt(i);
      double x1 = p1.x;
      double y1 = p1.y;	      
      drawLine(x0,y0,x1,y1);
      x0 = x1;
      y0 = y1;
    }
  }

  public void drawPolygon(Point2 points[]){
    int nvert = points.length;
    // last point
    double x0 = points[nvert-1].x;
    double y0 = points[nvert-1].y;	
    for(int i = 0; i < nvert;i++){
      Point2 p1 = points[i];
      double x1 = p1.x;
      double y1 = p1.y;	      
      drawLine(x0,y0,x1,y1);
      x0 = x1;
      y0 = y1;
    }
  }

  public void fillPolygon(Point2 p[]){
    int nvert = p.length;
    int[] x = new int[nvert];
    int[] y = new int[nvert];
    for(int i=0; i < nvert;i++){
      x[i] = (int)x2screen(p[i].x);
      y[i] = (int)y2screen(p[i].y);	
    }
    g.fillPolygon(x,y,nvert);
  }

  public void drawPolyline(Point2 points[]){
    int nvert = points.length;
    if(nvert < 2)
      return;     
    // first point
    double x0 = points[0].x;
    double y0 = points[0].y;	
    for(int i = 1; i < nvert;i++){
      Point2 p1 = points[i];
      double x1 = p1.x;
      double y1 = p1.y;	      
      drawLine(x0,y0,x1,y1);
      x0 = x1;
      y0 = y1;
    }
  }

  public void drawPoint( double x1, double  y1) {
    g.fillRect((int)x2screen(x1),(int)y2screen(y1), 1,1);
  }   

  public boolean setPaintMode(){
    boolean mode = paintMode;
    paintMode = true;
    g.setPaintMode();
    return mode;
  }

  public boolean setXORMode(Color color){
    boolean mode = paintMode;
    paintMode = false;
    g.setXORMode(color);
    XORColor = color;
    return mode;
  }  

  public boolean setPaintMode(boolean newmode){
    boolean mode = paintMode;
    if(newmode)
      g.setPaintMode();
    else 
      g.setXORMode(XORColor);
    paintMode = newmode;    
    return mode;
  }  


  public void clipLine(double d1, double d2, double d3, double d4, Viewport viewport)
  //public void drawLine(double x1, double y1, double x2, double y2, Viewport viewport)
  {    
    double d5 = viewport.top;
    double d6 = viewport.bottom;
    double d7 = viewport.left;
    double d8 = viewport.right;
    //System.out.print("line(" + d1 + ","+d2 + ","+d3 + ","+d4 + ")");
    //System.out.println(" viewport(" + d7 + ","+d5 + ","+d3 + ","+d4 + ")");
    int i = outcode(d1, d2, d5, d6, d7, d8);
    int j = outcode(d3, d4, d5, d6, d7, d8);
    int k = 0;
    if ((i & j) == 0)
      {
	if (i == 0 && j == 0)
	  drawLineNoClip(d1, d2, d3, d4);
	else
	  {
	    boolean flag;
	    if (i != 0)
	      {
		k = i;
		flag = true;
	      }
	    else
	      {
		flag = false;
		k = j;
	      }
	    double d9 = 0.0;
	    double d10 = 0.0;
	    double d11 = 0.0;
	    if ((k & 2) != 0)
	      {
		d11 = (d8 - d1) / (d3 - d1);
		d9 = d8;
		d10 = d2 + (d4 - d2) * d11;
	      }
	    else if ((k & 1) != 0)
	      {
		d11 = (d7 - d1) / (d3 - d1);
		d9 = d7;
		d10 = d2 + (d4 - d2) * d11;
	      }
	    else if ((k & 4) != 0)
	      {
		d11 = (d5 - d2) / (d4 - d2);
		d9 = d1 + (d3 - d1) * d11;
		d10 = d5;
	      }
	    else if ((k & 8) != 0)
	      {
		d11 = (d6 - d2) / (d4 - d2);
		d9 = d1 + (d3 - d1) * d11;
		d10 = d6;
	      }
	    if (flag)
	      clipLine(d9, d10, d3, d4, viewport);
	    else
	      clipLine(d1, d2, d9, d10, viewport);
	  }
      }
  }

  public int outcode(double d1, double d2, double d3, double d4, double d5, double d6)
    {
        int i = 0;
        if (d1 < d5)
            i++;
        else if (d1 > d6)
            i += 2;
        if (d2 > d3)
            i += 4;
        else if (d2 < d4)
            i += 8;
        return i;
    }



  public boolean getPaintMode(){
    return paintMode;
  }    

}
