package pvs.utils.ui;

import java.awt.Component;
import java.awt.Container;
import java.awt.Frame;
import java.awt.GridBagConstraints;
import java.awt.GridBagLayout;
import java.awt.Rectangle;

public class WindowUtils extends Object{
  /*
  static public Component getMainWindow(Component c) {
      Component parent = c.getParent();
      while(true){
	if(parent.getParent() == null)
	  break;
	else 
	  parent = parent.getParent();
      }
      return parent;    
  }
  */

  static public Frame getMainWindow(Component c) {
    while (c.getParent() != null && !(c instanceof Frame))
      c = c.getParent();
    return (Frame)c;
  }

  static public Frame getFrame(Component c) {
    return getMainWindow(c);
  }

  static private GridBagConstraints cons = new GridBagConstraints();
  
  static public void constrain(Container container, Component component, 
			int grid_x, int grid_y, int grid_width, int grid_height,
			int fill, int anchor, double weight_x, double weight_y,
			int left, int top, int right, int bottom)
    {
      cons.gridx = grid_x; cons.gridy = grid_y;
      cons.gridwidth = grid_width; cons.gridheight = grid_height;
      cons.fill = fill; cons.anchor = anchor;
      cons.weightx = weight_x; cons.weighty = weight_y;
      cons.insets.top = top;
      cons.insets.left = left;
      cons.insets.bottom = bottom;
      cons.insets.right = right;            
      ((GridBagLayout)container.getLayout()).setConstraints(component, cons);
      container.add(component);
    }
  
  static public void constrain(Container container, Component component, 
			int grid_x, int grid_y,int grid_width,int grid_height){
    constrain(container, component, grid_x, grid_y, 
              grid_width, grid_height, GridBagConstraints.NONE, 
              GridBagConstraints.NORTHWEST, 0.0, 0.0, 0, 0, 0, 0);
  }
  
  static public void constrain(Container container, Component component, 
			int grid_x, int grid_y, int grid_width,int grid_height,
			int left, int top, int right, int bottom) {
    constrain(container, component, grid_x, grid_y, 
              grid_width, grid_height, GridBagConstraints.NONE, 
              GridBagConstraints.NORTHWEST, 
              0.0, 0.0, left, top, right, bottom);
  }

  static public void constrain(Container container, Component component, 
			int grid_x, int grid_y, int grid_width,int grid_height,
			int fill, int anchor, double weight_x,double weight_y){
    constrain(container, component, grid_x, grid_y, 
              grid_width, grid_height,fill,anchor, 
              weight_x, weight_y, 0,0,0,0);
    
  }

  static public void constrain(Container container, Component component, 
			int grid_x, int grid_y, int grid_width,int grid_height,
			int fill, int anchor){
    constrain(container, component, grid_x, grid_y, 
              grid_width, grid_height,fill,anchor, 
              1.0, 1.0, 0,0,0,0);
    
  }

  /**
    return absolute position of given component on screen.
   */
  static public Rectangle getAbsolutePosition(Component c){
    Rectangle r = c.getBounds();
    while(!(c instanceof Frame)){
      c = c.getParent();
      Rectangle r1 = c.getBounds();
      r.setLocation(r.x+r1.x,r.y+r1.y);
    }
    return r;
  }
 
}
