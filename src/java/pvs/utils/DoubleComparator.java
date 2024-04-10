package pvs.utils;

public class DoubleComparator implements Comparator {
  public int compare(Object fst, Object snd){
    
    double diff = ((Double)fst).doubleValue() - ((Double)snd).doubleValue();
    if(diff < 0.0)
      return -1;
    else if( diff == 0.0 )
      return 0;
    else 
      return 1;
  }
}
