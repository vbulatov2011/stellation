package pvs.utils;

/**
  simple 2 dimension point class
 */
public class Point2 implements Cloneable{

  public double x;
  public double y;
  
  public Point2(double x, double y){
    this.x = x; 
    this.y = y; 
  }

  public Point2(Point2 point){
    x = point.x;
    y = point.y;
  }
  
  public Point2 subSet(Point2 point){
    this.x -= point.x;
    this.y -= point.y;
    return this;
  }
  
  public Point2 addSet(Point2 point){
    this.x += point.x;
    this.y += point.y;
    return this;
  }
  
  public Point2 mulSet(double a){
    this.x *= a;
    this.y *= a;
    return this;
  }
  
  public double dot(Point2 p){
    return x*p.x + y*p.y;
  }

  public double length(){
    return Math.sqrt(length2());
  }

  public double length2(){
    return x*x + y*y;
  }

  public double distance2(Point2 p){
    double dx = x - p.x;
    double dy = y - p.y;
    return dx*dx + dy*dy;
  }
  
  public Object clone(){
    return new Point2(x,y);
  }
  
  public String toString(){
    return "["+x+" "+y+"]";
  }

}
