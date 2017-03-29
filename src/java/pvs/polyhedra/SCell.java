package pvs.polyhedra;

import pvs.utils.*;

/**
  3 dimensional stellation cell, 
  it is one convex polygon, bounded by several SFace's.
  It is constructed as an intersection of planes, which are face's extensions of 
  core polyhedron.
 */
public class SCell implements Comparator {
  /**
    top faces
   */
  SFace[] top = null;

  /**
    bottom faces, they have opposite (clockwise) orientation
   */
  SFace[] bottom = null;  
  
  /**
    layer of this cell
   */
  int layer;

  private int index = -1; // non-initialized symmetry index 
  /*
   this is a smalles index of symmertry operation used to make this cell from 
   "canonical" cell.
   canonical cell is a cell, whose center is located inside or at the boundary 
   of canonical spherical triangle, which is different for every symmetry group. 
   Several symmetry operations may transform canonical cell into current cell.
   the smallest index is assigned.    
  */
  

  Vector3D center;

  /**
    constructor 

   */
  SCell(SFace[] _top, SFace[] _bottom, int _layer){
    top = _top;
    bottom = _bottom;
    layer = _layer;

    for(int t = 0; t < top.length; t++){
      //Stellation.Out.println(" top[" + t+"]" + this);
      top[t].cellBelow = this;
    }
    for(int b = 0; b < bottom.length; b++){
      //Stellation.Out.println(" bottom[" + b+"]" + this);
      bottom[b].cellAbove = this;
    }
  }

  /**
    getCenter
   */
  Vector3D getCenter(){
    if(center == null){
      center = new Vector3D(top[0].getCenter());
      for(int i = 1; i < top.length; i++){
	center.addSet(top[i].getCenter());	
      }
      for(int i = 0; i < bottom.length; i++){
	center.addSet(bottom[i].getCenter());	
      }
      center.mulSet(1./(top.length+bottom.length));
    }
    return center;
  }  

  /**
    getVolume

    calculates volume of this cell
   */
  double vol = 0;
  double getVolume(){

    if(vol != 0.)
      return vol;

    double volume = 0;
    for(int i=0; i < top.length; i ++){
      volume += top[i].vertices[0].dot(top[i].getArea());
    }
    
    for(int i=0; i < bottom.length; i ++){
      // bottom cells have oposite orientation
      volume -= bottom[i].vertices[0].dot(bottom[i].getArea());
    }
    vol = volume/3;
    return vol;
  }

  double area = 0;

  double getArea(){

    if(area == 0.){

      for(int i=0; i < top.length; i ++){
	area += top[i].getArea().length();
      }      
      for(int i=0; i < bottom.length; i ++){
	area += bottom[i].getArea().length();
      }
    }
    return area;

  }

  
  public void setIndex(int index){

    if(this.index < 0) {
      this.index = index;
      return;
    }
    if(index < this.index){
      this.index = index;
    }
    
  }

  public int getIndex(){
    return index;
  }

  SCell getTransformedCopy(Matrix3D matrix, FastHashtable tbottom, FastHashtable ttop){

    SFace[] newtop = new SFace[top.length];
    SFace[] newbottom = new SFace[bottom.length];
    for(int i=0; i < top.length; i++){

      SFace face = (SFace)ttop.get(top[i].getCenter().mul(matrix));
      if(face == null){
        System.out.println("! no top facet in SCell.getTransformedCopy()");
      }
      newtop[i] = face;
    }
    for(int i=0; i < bottom.length; i++){

      SFace face = (SFace)tbottom.get(bottom[i].getCenter().mul(matrix));
      if(face == null){
        System.out.println("! no bottom facet in SCell.getTransformedCopy()");
      }
      newbottom[i] = face;
    }

    return new SCell(newtop, newbottom, layer);
    
  }

  public int compare(Object o1, Object o2){
    SCell c1 = (SCell)o1;
    SCell c2 = (SCell)o2;
    return c1.index - c2.index;
  }
}

