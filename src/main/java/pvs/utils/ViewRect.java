package pvs.utils;

public class ViewRect
{
  public int top;
  public int left;
  public int right;
  public int bottom;
  
  public ViewRect(int left, int top, int right, int bottom) {
    this.top = top;
    this.bottom = bottom;
    this.left = left;
    this.right = right;
  }
}
