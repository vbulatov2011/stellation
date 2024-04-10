package pvs.utils;
//package sap.util;

/**
 * 
 */
public class ParameterInt implements Parameter {
  
  public int value; 
  String name; 

  public int bottom = Integer.MIN_VALUE;
  public int top = Integer.MAX_VALUE;

  public ParameterInt(String name, int value){
    this.name = name;
    this.value = value;
  }

  public ParameterInt(String name, int value, int bottom, int top){
    this.name = name;
    this.value = value;
    this.bottom = bottom;
    this.top = top;
  }

  public String getValue(){
    return new Integer(this.value).toString();
  }

  public void setValue(String value){
    this.value = Double.valueOf(value).intValue();
    if(this.value < bottom){
      this.value = bottom;
    }
    if(this.value > top){
      this.value = top;
    }
  }

  public String getName(){
    return name;
  }
  
  public void setBottomTop(int bottom, int top){
	 this.bottom = bottom;
	 this.top = top;
  }
}
