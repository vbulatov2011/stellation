package pvs.utils;

public class Viewport
{
  public double top;
  public double left;
  public double right;
  public double bottom;
  
  public Viewport(double left, double top, double right, double bottom) {
    this.top = top;
    this.bottom = bottom;
    this.left = left;
    this.right = right;
  }
}
