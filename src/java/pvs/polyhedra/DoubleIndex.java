package pvs.polyhedra;

import pvs.utils.Comparator;

/**
  class DoubleIndex 

  is used for indexing and sorting double's
 */
public class DoubleIndex implements Comparator {

  public double value; 
  public int index;

  DoubleIndex(double _value, int _index){
    value = _value;
    index = _index;
  }

  public int compare(Object fst, Object snd){
    double d = ((DoubleIndex)fst).value - ((DoubleIndex)snd).value;
    if(d < 0.0)
      return -1;
    else if(d > 0.0)
      return 1;
    else return 0;
  }  
}
