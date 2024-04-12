package pvs.polyhedra;


public class Axis {

  public int order;
  public Vector3D vector;
  
  public Axis(Vector3D  vector, int order){
    this.order = order;
    this.vector = new Vector3D(vector);
  }

  public Axis(Axis  ax){
    this.order = ax.order;
    this.vector = new Vector3D(ax.vector);
  }
  
  
  // PB!
  public Axis(double x, double y, double z, int order){
	this.order = order;
    this.vector = new Vector3D(x ,y, z);
  }	
  
}
