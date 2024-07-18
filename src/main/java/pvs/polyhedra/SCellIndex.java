package pvs.polyhedra;

import pvs.utils.Comparator;
import pvs.utils.QSort;


/**
   this class is used to hold sorted array of integers and compare two such arrays 
 */
public class SCellIndex implements Comparator{

  int index[];

  public SCellIndex(int index[]){
    int ind[] = new int[index.length];
    for(int i=0; i < ind.length; i++){
      ind[i] = index[i];
    }
    QSort.quickSort(ind,0,ind.length-1);
    this.index = ind;
  }

  public String toString(){
    StringBuffer sb = new StringBuffer();
    sb.append("[");
    for(int i =0; i < index.length-1; i++){
      sb.append(index[i]);
      sb.append(",");
    }
    sb.append(index[index.length-1]);
    sb.append("]");
    return sb.toString();
  }
  
  public int compare(Object o1, Object o2){
    SCellIndex s1 = (SCellIndex)o1;
    SCellIndex s2 = (SCellIndex)o2;
    int dsize = s1.index.length - s2.index.length;
    if(dsize != 0)
      return dsize;
    for(int i=0; i < s1.index.length; i++){
      int diff =  s1.index[i] - s2.index[i];
      if(diff != 0)
	return diff;
    }
    return 0;
  }
  
}
