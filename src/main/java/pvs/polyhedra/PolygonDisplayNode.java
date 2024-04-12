package pvs.polyhedra;

import java.io.PrintWriter;

import pvs.utils.FixedStreamTokenizer;
import pvs.utils.PVSObserver;

public interface PolygonDisplayNode {
  
  public void parse( FixedStreamTokenizer st );
  
  public String getNodeName();
  public String getNodeID();
  public void write(PrintWriter out, String indent);

  public int getPolygonCount();
  public Vector3D[] getPolygon(int index);
//  public PolygonEditor getEditor();
  public void setObserver(PVSObserver observer);
  //public void calculatePolygon();
  static final String indentStep = "  ";
}

