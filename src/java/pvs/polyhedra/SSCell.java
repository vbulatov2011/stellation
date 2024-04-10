package pvs.polyhedra;

import java.util.Vector;
import java.util.Hashtable;
import java.util.Enumeration;
import pvs.utils.Comparator;
import pvs.utils.QSort;
import pvs.utils.Fmt;
import pvs.utils.FastHashtable;


/**
   SSCell 

   class to represent Symmetrical Stellation Cell 
*/
public class SSCell implements Comparator {

    // top and bottom SSCells of this cell
    public Vector top = new Vector();
    public Vector bottom = new Vector();
    // primitive cells composing this cell
    public SCell[] cells;
    public SSCell[] subCells = null; // possible array of sub cells
    public SSCell superCell = null; // our possible parent 
    int handedness = 0;
  
    private FastHashtable ttop = new FastHashtable();
    //private FastHashtable tbottom = new FastHashtable();
    private boolean isTopBottomInitialized = false;

    public int layer;
    public int index;
    String symmetry;

    /**
       constructor
    */

    public SSCell(Vector _cells, String symmetry){

        cells = new SCell[_cells.size()];
        _cells.copyInto(cells);
        this.symmetry = symmetry;
        QSort.quickSort(cells,0,cells.length-1,cells[0]);
        initHandedness();
        //initTopAndBottom();
        //System.out.println(handedness);
    }

    /** 
        void initTopAndBottom()
        this should be called after all SSCells are initialized
    */
    void initTopAndBottom(){

        if(isTopBottomInitialized)
            return;
        isTopBottomInitialized = true;
        for(int c=0; c < cells.length; c++){

            SFace [] ftop = cells[c].top;
            for(int f = 0; f < ftop.length; f++){
                SCell cellAbove = ftop[f].cellAbove;
                //Stellation.Out.println("f: " + f +  ", " + ftop[f] + " cellAbove: " + cellAbove);
                if(cellAbove != null)
                    ttop.put(cellAbove,cellAbove);
            }
            /*
              SFace [] fbottom = cells[c].bottom;
              for(int f = 0; f < fbottom.length; f++){
              SCell cellBelow = fbottom[f].cellBelow;
              if(cellBelow != null)
              tbottom.put(cellBelow,cellBelow);
              }
            */
        }
        //Stellation.Out.println("\ntop cells : "+ttop.size() + " bottom cells: " + tbottom.size());    
    }

    boolean isTopAdjacentCell(SCell cell){

        Object o = ttop.get(cell);
        if(o != null)
            return true;
        else 
            return false;

    }

    /*
      boolean isBottomAdjacentCell(SCell cell){

      Object o = tbottom.get(cell);
      if(o != null)
      return true;
      else 
      return false;
      }
    */

    void initHandedness(){

        if(cells.length > 0){
            handedness = Symmetry.get_handedness(cells[0].getCenter(),symmetry);
        }
    }


    /**
       isTopAdjacent
    
       checks if top cell is adjacent to this cell from top
    */
    boolean isTopAdjacent(SSCell topcell){   
        //int tcount = 0;
        //for(int i = 0; i < cells.length; i++){
        //  tcount += cells[i].top.length;
        //}
        //int bcount = 0;
        //for(int i = 0; i < topcell.cells.length; i++){
        //  bcount += topcell.cells[i].bottom.length;
        //}
        //Stellation.Out.println("\ntcount: "+tcount + ",  bcout: "+bcount);
    
        for(int tc = 0; tc < topcell.cells.length; tc++){
            if(isTopAdjacentCell(topcell.cells[tc]))
                return true;
        }
        return false;
        /*
          for(int i = 0; i < cells.length; i++){
          SFace[] faces = cells[i].top;
      
          for(int j = 0; j < topcell.cells.length; j++){
          SFace[] topfaces = topcell.cells[j].bottom;

          for(int k = 0; k < faces.length; k++){
          for(int m = 0; m < topfaces.length; m++){
	    
          if(faces[k] == topfaces[m])
	      return true;
          }
          }	
          }
          }
          return false;
        */
    }

    /**
       getVolume

       calculates volume of the scell
    */
    double volume = 0.0;
    public double getVolume(){

        if(volume == 0.0){
            for(int i =0; i < cells.length; i++){
                volume += cells[i].getVolume();
            }
        }
        return volume;
    }
  
    double area = 0.0;
  
    public double getArea(){
        if(area == 0.0){
            for(int i =0; i < cells.length; i++){
                area += cells[i].getArea();
            }
        }
        return area;
    }
  
    public int getCellsCount(){
        return cells.length;
    }

    public void setIndex(int layer, int index){

        this.layer = layer;
        this.index = index;

    }

    public int getNFacets() {

        return cells[0].top.length + cells[0].bottom.length; 

    }

    public int getNtopFacets() {

        return cells[0].top.length;

    }

    int nVertices = 0;
    int nComponents = 0;

    public int getNVertices(){

        if(nVertices != 0) // we already counted it      
            return nVertices;
        countComponents();
        return nVertices;
    }

    public int getNComponent(){
        if(nComponents != 0)
            return nComponents;
        countComponents();
        return nComponents;
    }

    void countComponents(){

        Hashtable ht = new Hashtable();
        for(int i =0; i < cells.length; i++){
            SCell scell = cells[i];
            for(int k=0; k < scell.top.length; k++){
                SFace face = scell.top[k];
                for(int v = 0; v < face.vertices.length; v++){
                    ht.put(face.vertices[v],scell);
                }
            }
            for(int k=0; k < scell.bottom.length; k++){
                SFace face = scell.bottom[k];
                for(int v = 0; v < face.vertices.length; v++){
                    ht.put(face.vertices[v],scell);
                }
            }
        }
    
        nVertices = ht.size();
        /*
        // TO-DO 
        Enumeration e = ht.keys();
        //Vertex
        SFace face = (SFace)ht.get(e.nextElement());
        int count = 1;
        while(e.hasMoreElements()){
        SFace face1 = (SFace)ht.get(e.nextElement());
        if(face1 == face)
        count++;
        }
        */
        // count - 
        nComponents = 1;
    }

    SCellIndex sCellIndex = null;
    /**
       returns smallest index of all SCells
       make no much sence actually 
    */
    public SCellIndex getSCellIndex(){
        if(sCellIndex != null)
            return sCellIndex;
        SCellIndex indices[] = new SCellIndex[cells.length];
        for(int k = 0; k < indices.length; k++){
            SCell cell = cells[k];
            int[] index = new int[cell.top.length + cell.bottom.length];
            int c = 0;
            for(int i=0; i < cell.top.length; i++){
                index[c++] = cell.top[i].getPlaneIndex();
            }
            for(int i=0; i < cell.bottom.length; i++){
                index[c++] = cell.bottom[i].getPlaneIndex();
            }
            indices[k] = new SCellIndex(index);
        }
        QSort.quickSort(indices,0,indices.length-1,indices[0]);
        return sCellIndex = indices[0];
    }

    public int getHandedness(){
        //if(superCell != null)
        //  return superCell.getHandedness();
        return handedness;
    }

    static double TOL = 0.0001;


    public int old_compare(Object fst, Object snd){

        SSCell cell1 = (SSCell)fst;
        SSCell cell2 = (SSCell)snd;
        double v1 = cell1.getVolume();
        double v2 = cell2.getVolume();
        double d = v2 - v1;
        if(d < -TOL)
            return -1;
        else if(d > TOL) 
            return 1;
        // volumes are identical
        d = cell2.getArea() - cell1.getArea();
        if(d < -TOL)
            return -1;
        else if(d > TOL) 
            return 1;
        // areas are identical 
        if(cell1.handedness != 0 && cell2.handedness != 0) {
            return -cell2.handedness + cell1.handedness;
        } else if(cell1.handedness == 0 && cell2.handedness != 0){
            return -1;
        } else if(cell2.handedness == 0 && cell1.handedness != 0){
            return 1;
        }
        return 0;    
    }  

    /**
     *  void setSubCells(Vector cells)
     *
     */
    public void setSubCells(Vector cells){

        this.subCells = new SSCell[cells.size()];
        cells.copyInto(this.subCells);    
        for(int i=0; i < subCells.length;i++){
            subCells[i].superCell = this;
        }
    }
  
    public int strictCompare(SSCell scell1, SSCell scell2){
        // check which cell has more elementary cells
        int sizediff = scell1.cells.length - scell2.cells.length;    
        if(sizediff != 0)
            return sizediff;

        // check, which cell has lower symmetry index
        // this actually makes sence only for subcells
        for(int i=0; i < scell1.cells.length; i++){
            int diff = scell1.cells[i].getIndex() - scell2.cells[i].getIndex();
            if(diff != 0)
                return diff;
        }

        SCell cell1 = scell1.cells[0];
        SCell cell2 = scell2.cells[0];
        // check, which elementary cell has more faces 
        int nfacetdiff = scell1.getNFacets() - scell2.getNFacets();
        if(nfacetdiff != 0)
            return nfacetdiff;

        // check, which elementary cell has more vertices
        int nvertdiff = scell1.getNVertices() - scell2.getNVertices();
        if(nvertdiff != 0)
            return nvertdiff;
        // no topological difference found 
        return 0;
    }

    /**
       method of interface Comparator 
    */
    public int compare(Object fst, Object snd){

        SSCell scell1 = (SSCell)fst;
        SSCell scell2 = (SSCell)snd;
        int sdiff = strictCompare(scell1,scell2);
        if(sdiff != 0)
            return sdiff;
    
        double vdiff = scell1.getVolume()-scell2.getVolume();
        // this is bad as sometimes cell volumes are equal, but no other way found yet. 

        if(Math.abs(vdiff) < EPS){
            // volumes are equal, what to do? 
            return 0;
        }  else {
            return (vdiff < 0.) ? -1: 1;
        }

    }

    static final double EPS = 1.e-4;

    /**
       orders cells of this cell in order, which corresponds to 
       order of operations in group of symmetry; 
    */
    public void makeCanonicalOrder(){

        Symmetry.CanonicalTester tester = Symmetry.getCanonicalTester(symmetry);

        int cIndex = 0;
        int count = 0;
        for(int i=0; i < cells.length; i++){
            Vector3D v = cells[i].getCenter();
            if(tester.test(v)){
                count++;
                cIndex = i;
            }
        }
        if(count != 1){
            // System.out.println("Something wrong! Canonical cells found: " + count);
            System.out.print("!");      
        }

        Hashtable ht = new Hashtable();
        for(int i=0; i < cells.length; i++){
            if(i != cIndex)
                ht.put(cells[i].getCenter(),cells[i]);
        }
    
        Matrix3D matr[] = Symmetry.getMatrices(symmetry);
        cells[cIndex].setIndex(0);
        Vector3D v0 = cells[cIndex].getCenter();
        for(int i = 1; i < matr.length; i++){
            Vector3D v1 = v0.mul(matr[i]);
            SCell cell = (SCell)ht.get(v1);
            if(cell != null){
                //System.out.println(i);      
                cell.setIndex(i);
            }
        }
        QSort.quickSort(cells,0,cells.length-1,cells[0]);
        //printIndices();
    }

    public void printIndices(){

        for(int i=0; i < cells.length; i++){
            System.out.print(cells[i].getIndex());
            System.out.print(" ");
        }
        System.out.println();    
    }

    public String getIndices(){

        StringBuffer sb = new StringBuffer();
        sb.append("<");
        for(int i=0; i < cells.length; i++){
            sb.append(cells[i].getIndex());
            if(i < cells.length-1)
                sb.append(",");      
        }
        sb.append(">");
        return sb.toString();

    }

    public String getInfo(){
        return "[" + getNFacets()+","+getNVertices()+","+Fmt.fmt(getVolume(),6,8)+"]";
    }

    public void setSuperCell(SSCell scell) {
        superCell = scell;
    }

    public boolean hasSCell(SCell cell){

        for(int i =0; i < cells.length; i++){
            if(cells[i] == cell)
                return true;
        }
        return false;
    }
}


