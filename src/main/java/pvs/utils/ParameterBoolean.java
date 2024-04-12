package pvs.utils;
//package sap.util;

/**
 * 
 */
public class ParameterBoolean implements Parameter {
  
  public boolean value; 
  String name; 

  public ParameterBoolean(String name, boolean value){
    this.name = name;
    this.value = value;
  }

  public String getValue(){
    if(value)
      return "on";
    else 
      return "off";      
  }

  public void setValue(String value){
    if("on".equalsIgnoreCase(value))      
      this.value = true;
    else 
      this.value = false;
  }

  public void setValue(boolean value){

    this.value = value;
    
  }

  public String getName(){
    return name;
  }  
}
