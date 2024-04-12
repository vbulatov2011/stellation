package pvs.utils;


import java.awt.AWTEvent;
import java.awt.Button;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.Event;
import java.awt.Font;
import java.awt.Frame;
import java.awt.GridBagConstraints;
import java.awt.GridBagLayout;
import java.awt.TextArea;
import java.awt.Toolkit;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.io.IOException;
import java.io.OutputStream;


/**
 * 
 */
class MyFrame extends Frame {

  public MyFrame(String title) { 
    super(title); 
  }

  protected void processEvent(AWTEvent e){

    switch (e.getID()) {
    case Event.WINDOW_DESTROY: 
      this.setVisible(false);  
      break;
    }
    super.processEvent(e);
  }
}

/**
 * 
 */
public class WindowOutputStream extends OutputStream {
  
   Frame myFrame;
   TextArea ta;
   StringBuffer sb = new StringBuffer();

  public WindowOutputStream() {
    Dimension d = Toolkit.getDefaultToolkit().getScreenSize();
    int swidth = d.width;
    int sheight = d.height;
    
    int width = swidth/3;
    int height = sheight/3;
    myFrame = new MyFrame("Debug Output");      
    Font f = new Font("Courier", Font.PLAIN, 12);
    myFrame.setFont(f);
    ta = new TextArea(24, 80);
    ta.setEditable(true);
    //myFrame.add("Center", ta);
    Button btnClear = new Button("Clear");
    btnClear.addActionListener(new ClearListener());
    //myFrame.add("South", btnClear);
    GridBagLayout gb = new GridBagLayout();
    myFrame.setLayout(gb);
    myFrame.setBackground(Color.lightGray);
    WindowUtils.constrain(myFrame,ta, 0, 0,1,1,gbc.BOTH, gbc.NORTH,1.,1.,3,3,3,3);
    WindowUtils.constrain(myFrame,btnClear, 0,1,1,1,gbc.NONE, gbc.CENTER,1.,0.,3,3,3,3);

    myFrame.pack();
    /*
    myFrame.setSize(width, height);
    myFrame.setLocation(swidth-width, sheight-height-20);
    */
    myFrame.show();  
  }
  
    public WindowOutputStream(TextArea textarea) {
      ta = textarea;
    }

    public void write(int b) throws IOException {

      sb.append((char) b);
      if (b == '\n') {
        ta.append(sb.toString());
        sb.setLength(0);
      }
    }

    public void write(byte b[], int off, int len) throws IOException {

      for (int i = 0; i < len; i++) {
        write((char) b[i+off]);
      }
    }

    public void write(byte b[]) throws IOException {
      for (int i = 0; i < b.length; i++) {
        write((char) b[i]);
      }
    }

  public void flush(){
    ta.append(sb.toString());
    sb.setLength(0);    
  }

  public void clear(){
    ta.setText("");
  }
  
  public void shutdown(){
    myFrame.setVisible(false);  
    myFrame.dispose();
  }
  
  public Frame getFrame(){
    return myFrame;
  }

  class ClearListener implements ActionListener {
    public void actionPerformed(ActionEvent e) {
      clear();
    }
  }

  static private GridBagConstraints gbc = new GridBagConstraints();

}
