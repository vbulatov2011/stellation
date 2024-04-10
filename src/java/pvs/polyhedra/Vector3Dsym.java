package pvs.polyhedra;

public class Vector3Dsym extends Vector3D{
  // this is Vector3D, which remembers, 
  // from which vector it was transformed, using which matrix
  // it also holds index of original vector 
  Matrix3D matrix;
  Vector3D vector;
  int index; 

  public Vector3Dsym(double x,double y,double z,Vector3D vector, Matrix3D matrix, int index){
    super(x,y,z);
    this.index = index;
    this.vector = vector;
    this.matrix = matrix;

  }

  public Vector3Dsym(Vector3D v,Vector3D vector, Matrix3D matrix, int index){

    super(v);

    this.index = index;
    this.vector = vector;
    this.matrix = matrix;

  }
  

}
