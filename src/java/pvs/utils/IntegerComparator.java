package pvs.utils;

public class IntegerComparator implements Comparator {
  public int compare(Object fst, Object snd){
    
    int diff = ((Integer)fst).intValue() - ((Integer)snd).intValue();
    return diff;
  }
}
