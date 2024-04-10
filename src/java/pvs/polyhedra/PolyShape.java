package pvs.polyhedra;
import java.awt.geom.GeneralPath;
import java.awt.Color;

public class PolyShape {

  final public static int FILL =0, DRAW = 1;
  public Color color;
  public GeneralPath path;
  public int type;
  
  public PolyShape(GeneralPath path, int type, Color color){

    this.path = path;
    this.color = color;
    this.type = type;

  }
  

}
