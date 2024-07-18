package pvs.polyhedra;
import java.util.Vector;

/**
  stellation vertex. It is result of intersection of several faces
 */
class SVertex {
  // all faces adjacent to this vertex
  Vector faces = new Vector();
  Vector3D vertex;

  public SVertex(Vector3D _vertex){
    vertex  = _vertex;
  }

  public void addFace(SFace face){
    faces.addElement(face);
  }

  public int hashCode(){
    return vertex.hashCode();
  }

}
/*
public class SVertex {

  
  // vector of this vertex
  Vector3D v;
  
  // planes, which form this vertex;
  int ind[] = new int[3];

  
  //  main constructor
  
  public SVertex (Vector3D vertex, int ind[]){

    this.v = vertex;
    
  }

}

*/
