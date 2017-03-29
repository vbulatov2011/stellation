package pvs.g3d;

/**
 *  class Face: basic storage class for polygonal face informaton.
 */

public class Face implements Cloneable{

  public int	nverts;				// number of vertices
  public int	index[];			// array of indices
  public int	cr, cg, cb;			// face color in RGB
  public double	zdepth;				// z depth of furthest vertex
  //public Vec3 normal;  // normal to face
  //public Vec3 tnormal; // transformed face normal 
  public Vec3 center; // face's center
  public int findex;  // index of this face in array 
  public int nindex;  // index of normal of this face

  public Face () {
    nverts = 0;
    index = null;
    cr = 255; cg = 255; cb = 255;
  }

  public Face (int nv) {
    nverts = nv;
    index = new int[nv];
    cr = 255; cg = 255; cb = 255;
  }

  public Face (int index[], int cr, int cg, int cb) {
    nverts = index.length;
    this.index = new int[nverts];
    System.arraycopy(index,0,this.index,0,nverts);
    this.cr = cr; this.cg = cg; this.cb = cb;
  }

  public void numVerts(int nv) {
    nverts = nv;
    index = new int[nv];
  }

  public Object getCopy(){
    return new Face(index,cr,cg,cb);
  }
}
