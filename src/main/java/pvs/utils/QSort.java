package pvs.utils;
/*
  File: QSort.java

  Taken by V.Bulatov@ic.ac.uk from Dynarray.java

  Originally written by Doug Lea and released into the public domain. 
  Thanks for the assistance and support of Sun Microsystems Labs, Agorics 
  Inc, Loral, and everyone contributing, testing, and using this code.

  History:
  Date     Who                What
  2Oct95  dl@cs.oswego.edu   refactored from DASeq.java
  13Oct95  dl                 Changed protection statuses

  06Jun96  V.Bulatov          sorting part extracted and example test written

*/
  
//package collections;


/**
 *
 * quick sort algorithm
 * 
 *
**/

import java.util.Vector;

public class QSort { 

/**
 * An implementation of Quicksort using medians of 3 for partitions.
 * @param s, the array to sort
 * @param lo, the least index to sort from
 * @param hi, the greatest index
 * @param cmp, the comparator to use for comparing elements
**/

  /*
  public static void _quickSort(Object s[], int lo, int hi, Comparator cmp) {
    
    if (lo >= hi) return;
    
    
    //   Use median-of-three(lo, mid, hi) to pick a partition. 
    //  Also swap them into relative order while we are at it.
    
  
    int mid = (lo + hi) / 2;
  
    if (cmp.compare(s[lo], s[mid]) > 0) {
      Object tmp = s[lo]; s[lo] = s[mid]; s[mid] = tmp; // swap
    }
    
    if (cmp.compare(s[mid], s[hi]) > 0) {
      Object tmp = s[mid]; s[mid] = s[hi]; s[hi] = tmp; // swap 
      
      if (cmp.compare(s[lo], s[mid]) > 0) {
        Object tmp2 = s[lo]; s[lo] = s[mid]; s[mid] = tmp2; // swap
      }
      
    }
    
    int left = lo+1;           // start one past lo since already handled lo
    int right = hi-1;          // similarly
    if (left >= right) return; // if three or fewer we are done
    
    Object partition = s[mid];
    
    for (;;) {
      
      while (cmp.compare(s[right], partition) > 0) --right;
      
      while (left < right && cmp.compare(s[left], partition) <= 0) ++left;
      
      if (left < right) {
        Object tmp = s[left]; s[left] = s[right]; s[right] = tmp; // swap
        --right;
      }
      else break;
    }
    
    quickSort(s, lo, left, cmp);
    quickSort(s, left+1, hi, cmp);    
  }
*/

  public static void quickSort(int s[], int lo, int hi) {
    
    if (lo >= hi) return;
    
     
    //   Use median-of-three(lo, mid, hi) to pick a partition. 
    //   Also swap them into relative order while we are at it.
    
  
    int mid = (lo + hi) / 2;
  
    if (s[lo]- s[mid] > 0) {
      int tmp = s[lo]; s[lo] = s[mid]; s[mid] = tmp; // swap
    }
    
    if (s[mid] - s[hi] > 0) {
      int tmp = s[mid]; s[mid] = s[hi]; s[hi] = tmp; // swap 
      
      if (s[lo] - s[mid] > 0) {
        int tmp2 = s[lo]; s[lo] = s[mid]; s[mid] = tmp2; // swap
      }
      
    }
    
    int left = lo+1;           // start one past lo since already handled lo
    int right = hi-1;          // similarly
    if (left >= right) return; // if three or fewer we are done
    
    int partition = s[mid];
    
    for (;;) {
      
      while (s[right] -  partition > 0) --right;
      
      while (left < right && s[left] - partition <= 0) ++left;
      
      if (left < right) {
        int tmp = s[left]; s[left] = s[right]; s[right] = tmp; // swap
        --right;
      }
      else break;
    }
    
    quickSort(s, lo, left);
    quickSort(s, left+1, hi);    
  }

  /*
  public static void quickSort(Vector v, int lo, int hi, Comparator cmp) {
    
    if (lo >= hi) return;
    
    
    //   Use median-of-three(lo, mid, hi) to pick a partition. 
    //   Also swap them into relative order while we are at it.
    
  
    int mid = (lo + hi) / 2;
  
    if (cmp.compare(v.elementAt(lo), v.elementAt(mid)) > 0) {
      Object tmp = v.elementAt(lo); 
      v.setElementAt(v.elementAt(mid),lo); 
      v.setElementAt(tmp,mid); // swap
    }
    
    if (cmp.compare(v.elementAt(mid), v.elementAt(hi)) > 0) {
      Object tmp = v.elementAt(mid); 
      v.setElementAt(v.elementAt(hi),mid);
      v.setElementAt(tmp,hi);// swap 
      
      if (cmp.compare(v.elementAt(lo), v.elementAt(mid)) > 0) {
        Object tmp2 = v.elementAt(lo); 
	v.setElementAt(v.elementAt(mid),lo); 
	v.setElementAt(tmp2,mid); // swap
      }
      
    }
    
    int left = lo+1;           // start one past lo since already handled lo
    int right = hi-1;          // similarly
    if (left >= right) return; // if three or fewer we are done
    
    Object partition = v.elementAt(mid);
    
    for (;;) {
      
      while (cmp.compare(v.elementAt(right), partition) > 0) --right;
      
      while (left < right && 
	     cmp.compare(v.elementAt(left), partition) <= 0) ++left;
      
      if (left < right) {
        Object tmp = v.elementAt(left); 
	v.setElementAt(v.elementAt(right),left);
	v.setElementAt(tmp,right);
        --right;
      }
      else break;
    }
    
    quickSort(v, lo, left, cmp);
    quickSort(v, left+1, hi, cmp);    
  }
  */
  /*
  public static void quickSort(FastVector v, int lo, int hi, Comparator cmp) {
    
    if (lo >= hi) return;
    
    
    //   Use median-of-three(lo, mid, hi) to pick a partition. 
    //   Also swap them into relative order while we are at it.
    
  
    int mid = (lo + hi) / 2;
  
    if (cmp.compare(v.elementAt(lo), v.elementAt(mid)) > 0) {
      Object tmp = v.elementAt(lo); 
      v.setElementAt(v.elementAt(mid),lo); 
      v.setElementAt(tmp,mid); // swap
    }
    
    if (cmp.compare(v.elementAt(mid), v.elementAt(hi)) > 0) {
      Object tmp = v.elementAt(mid); 
      v.setElementAt(v.elementAt(hi),mid);
      v.setElementAt(tmp,hi);// swap 
      
      if (cmp.compare(v.elementAt(lo), v.elementAt(mid)) > 0) {
        Object tmp2 = v.elementAt(lo); 
	v.setElementAt(v.elementAt(mid),lo); 
	v.setElementAt(tmp2,mid); // swap
      }
      
    }
    
    int left = lo+1;           // start one past lo since already handled lo
    int right = hi-1;          // similarly
    if (left >= right) return; // if three or fewer we are done
    
    Object partition = v.elementAt(mid);
    
    for (;;) {
      
      while (cmp.compare(v.elementAt(right), partition) > 0) --right;
      
      while (left < right && 
	     cmp.compare(v.elementAt(left), partition) <= 0) ++left;
      
      if (left < right) {
        Object tmp = v.elementAt(left); 
	v.setElementAt(v.elementAt(right),left);
	v.setElementAt(tmp,right);
        --right;
      }
      else break;
    }
    
    quickSort(v, lo, left, cmp);
    quickSort(v, left+1, hi, cmp);    
  }
  */

  public static void quickSort(Object[] a, int lo, int hi,
			  Comparator c) {
    sort(a,lo, hi+1,c);
  }

  public static void quickSort(Vector v, int lo, int hi, 
			  Comparator c) {
    Object a[] = new Object[v.size()];
    v.copyInto(a);
    sort(a,lo,hi+1,c);
    for(int i=0; i < v.size(); i++){
      v.setElementAt(a[i],i);
    }
  }

  public static void quickSort(FastVector v, int lo, int hi, 
			  Comparator c) {
    Object a[] = new Object[v.size()];
    v.copyInto(a);
    sort(a,lo,hi+1,c);
    for(int i=0; i < v.size(); i++){
      v.setElementAt(a[i],i);
    }
  }


    /**
     * Sorts the specified range of the specified array of objects according
     * to the order induced by the specified comparator.  The range to be
     * sorted extends from index <tt>fromIndex</tt>, inclusive, to index
     * <tt>toIndex</tt>, exclusive.  (If <tt>fromIndex==toIndex</tt>, the
     * range to be sorted is empty.)  All elements in the range must be
     * <i>mutually comparable</i> by the specified comparator (that is,
     * <tt>c.compare(e1, e2)</tt> must not throw a <tt>ClassCastException</tt>
     * for any elements <tt>e1</tt> and <tt>e2</tt> in the range).<p>
     *
     * This sort is guaranteed to be <i>stable</i>:  equal elements will
     * not be reordered as a result of the sort.<p>
     *
     * The sorting algorithm is a modified mergesort (in which the merge is
     * omitted if the highest element in the low sublist is less than the
     * lowest element in the high sublist).  This algorithm offers guaranteed
     * n*log(n) performance, and can approach linear performance on nearly
     * sorted lists.
     *
     * @param a the array to be sorted.
     * @param fromIndex the index of the first element (inclusive) to be
     *        sorted.
     * @param toIndex the index of the last element (exclusive) to be sorted.
     * @param c the comparator to determine the order of the array.  A
     *        <tt>null</tt> value indicates that the elements' <i>natural
     *        ordering</i> should be used.
     * @throws ClassCastException if the array contains elements that are not
     *	       <i>mutually comparable</i> using the specified comparator.
     * @throws IllegalArgumentException if <tt>fromIndex &gt; toIndex</tt>
     * @throws ArrayIndexOutOfBoundsException if <tt>fromIndex &lt; 0</tt> or
     *	       <tt>toIndex &gt; a.length</tt>
     * @see Comparator
     */
    public static void sort(Object[] a, int fromIndex, int toIndex,
                            Comparator c) {
        rangeCheck(a.length, fromIndex, toIndex);
        Object aux[] = (Object[])a.clone();
	mergeSort(aux, a, fromIndex, toIndex, c);
    }

    private static void mergeSort(Object src[], Object dest[],
                                  int low, int high, Comparator c) {
	int length = high - low;

	// Insertion sort on smallest arrays
	if (length < 7) {
	    for (int i=low; i<high; i++)
		for (int j=i; j>low && c.compare(dest[j-1], dest[j])>0; j--)
		    swap(dest, j, j-1);
	    return;
	}

        // Recursively sort halves of dest into src
        int mid = (low + high)/2;
        mergeSort(dest, src, low, mid, c);
        mergeSort(dest, src, mid, high, c);

        // If list is already sorted, just copy from src to dest.  This is an
        // optimization that results in faster sorts for nearly ordered lists.
        if (c.compare(src[mid-1], src[mid]) <= 0) {
           System.arraycopy(src, low, dest, low, length);
           return;
        }

        // Merge sorted halves (now in src) into dest
        for(int i = low, p = low, q = mid; i < high; i++) {
            if (q>=high || p<mid && c.compare(src[p], src[q]) <= 0)
                dest[i] = src[p++];
            else
                dest[i] = src[q++];
        }
    }

    /**
     * Check that fromIndex and toIndex are in range, and throw an
     * appropriate exception if they aren't.
     */
    private static void rangeCheck(int arrayLen, int fromIndex, int toIndex) {
        if (fromIndex > toIndex)
            throw new IllegalArgumentException("fromIndex(" + fromIndex +
                       ") > toIndex(" + toIndex+")");
        if (fromIndex < 0)
            throw new ArrayIndexOutOfBoundsException(fromIndex);
        if (toIndex > arrayLen)
            throw new ArrayIndexOutOfBoundsException(toIndex);
    }

    /**
     * Swaps x[a] with x[b].
     */
    private static void swap(Object x[], int a, int b) {
	Object t = x[a];
	x[a] = x[b];
	x[b] = t;
    }


  public static void main(String[] args){
    int n = 1000;
    if(args.length == 0){
      System.out.println("usage: java QSort <amount to sort>");
    } else{
      n = Integer.parseInt(args[0]);
    }
    Double[] array = new Double[n];
    for(int i=0; i<n; i++){
      array[i] = new Double(Math.random());
    }
    Comparator cmp = new DoubleComparator();
    long start = System.currentTimeMillis();
    
    quickSort(array,0,n-1,cmp);
    long delta = System.currentTimeMillis() - start;
    System.out.println(""+n+ " numbers was sorted in " +delta +" milliseconds");
  }
}

