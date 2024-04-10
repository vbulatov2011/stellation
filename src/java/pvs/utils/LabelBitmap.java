package pvs.utils;

import java.awt.*;
import java.awt.event.*;

public class LabelBitmap extends Canvas {
  
  Image image;
  int width = 10;
  int height = 10;
  
  public LabelBitmap(Image image){
    
    this.image = image;

  }

  public LabelBitmap(int width, int height){
    this.width = width;
    this.height = height;
  }

  public void setImage(Image image){

    this.image = image;
    repaint();    

  }
  /*
  public void update(Graphics g){
      paint(g);
  } 
  */
  boolean state = false;
 
  /**
   * 
   */
  public void paint(Graphics g){

    if(image == null)
      return;
    Dimension d = getSize();
    if(image.getWidth(this) != 0 && image.getWidth(this) != 0){
      width = image.getWidth(this);
      height = image.getHeight(this);
      g.drawImage(image,0, 0,width, height,this);       
    } else {
      g.drawImage(image,0, 0,d.height, d.height, this); 
    }
  }  

  public Dimension getPreferredSize(){
    return new Dimension(width,height);
  }
}
