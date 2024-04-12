package pvs.utils.ui;

import java.awt.Frame;
import java.awt.event.WindowAdapter;
import java.awt.event.WindowEvent;

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
