package pvs.polyhedra.stellation;

import pvs.polyhedra.*;

public class SelectionCell {
  
  int isSelected;
  SSCell cell; 
  int index; 
  
  public SelectionCell(SSCell cell, int index){
    this.cell = cell;
    this.index = index;
    this.isSelected = 0;
  }
  public void setSelected(int value){
    isSelected = value;
  }
  public int getSelected(){
    return isSelected;
  }
  public int getIndex(){
    return index;
  }
  public void invertSelection(){
    isSelected = 1 - isSelected;
  }
} 
