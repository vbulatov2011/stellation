package pvs.utils.ui;

import java.awt.Color;
import java.awt.Dimension;
import java.awt.Graphics;
import java.awt.Insets;
import java.awt.Panel;

public class BorderPanel extends Panel
{
  int border = 1;	// size of border
  Color col1,col2,cback;

  public static final int RECESSED = 0, RAISED = 1; // PRESSED, DEPRESSED

  public int state = RECESSED;
  public static int insets_ = 5;

  public BorderPanel() {
    this(RECESSED);
  }

  public BorderPanel(int state) {
    this.state = state;
    cback = new Color(192,192,192);
    if(state == RECESSED){
      col1 = cback.darker();
      col2 = cback.brighter();
    } else {
      col2 = cback.darker();
      col1 = cback.brighter();
    }
  }
  
  public BorderPanel(int w, Color c1, Color c2) {	
    border = w;
    col1 = c1; col2 = c2;
  }
  
  public BorderPanel(Color c1, Color c2) {
    col1 = c1; col2 = c2;
  }
  
  public Insets getInsets() {
    return new Insets(border+insets_, border+insets_, border+insets_, border+insets_);
  }

  public void update(Graphics g){
    paint(g);
  }

  public void paint(Graphics g) {
    super.paint(g);
    Dimension d = getSize();
    int w = d.width-1, h = d.height-1;
    g.setColor(cback);
    g.fillRect(0,0,d.width,d.height);
    g.setColor(col1);
    for(int i=0; i<border; i++) {
      g.drawLine(i,i,w-i,i);
      g.drawLine(i,i,i,h-i);
    }
    g.setColor(col2);
    for(int i=0; i<border; i++) {
      g.drawLine(w-i,h-i, w-i,i);
      g.drawLine(w-i,h-i, i,h-i);
    }
  }
}
