package pvs.utils;

import java.awt.*;
import java.awt.event.*;

public class DestroyableFrame extends Frame {

  public DestroyableFrame(String title) { 
    super(title); 
    addWindowListener(new WindowCloser());
  }

  class WindowCloser extends WindowAdapter {

    public void windowClosing(WindowEvent e){
      
      setVisible(false);
      dispose();      
    }
  }
}
