package pvs.polyhedra;

import pvs.utils.Comparator;

public class VectorIndex implements Comparator {
  
  Vector3D vector;
  int index;
  double length2;

  public VectorIndex(int index, Vector3D vector){
    this.vector = vector;
    this.index= index;
    length2 = vector.length2();
  }
  public int compare(Object first, Object second){
    VectorIndex i1 = (VectorIndex)first;
    VectorIndex i2 = (VectorIndex)second;
    double diff = i1.length2 - i2.length2;
    if(diff > 0)
      return 1;
    else if(diff < 0)
      return -1;
    return 0;
  }

  public boolean equals(Object object){
    return vector.equals(((VectorIndex)object).vector);
  }

  public int hashCode(){
    return vector.hashCode();
  }

}

