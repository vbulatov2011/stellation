package pvs.utils;
//package sap.util;



public class ParameterDouble implements Parameter {
  
  public double value; 
  public double bottom = -Double.MAX_VALUE;
  public double top = Double.MAX_VALUE;
  String name; 

  public ParameterDouble(String name, double value){
    this.name = name;
    this.value = value;
  }

  public ParameterDouble(String name, double value, double bottom, double top){
    this.name = name;
    this.value = value;
    this.bottom = bottom;
    this.top = top;
  }

  public String getValue(){
    return new Double(this.value).toString();
  }

  public void setValue(String value){    
    this.value = Double.parseDouble(value);//valueOf(value).doubleValue();
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

}
