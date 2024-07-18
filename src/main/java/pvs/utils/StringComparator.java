package pvs.utils;

public class StringComparator implements Comparator {
  public int compare(Object fst, Object snd){

    return ((String)fst).compareTo(((String)snd));

  }
}
