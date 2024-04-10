package pvs.polyhedra.stellation;

import java.applet.*;

public class StellationApplet extends Applet{

  StellationMain pMain;
  static final int BROWSER_IE =1;

  static public int browser = 0;

  public void start(){
    
    String fname = "off/u27.off";
    String symmetry = "I";

    pMain = new StellationMain(fname,symmetry,this);     
  }  

  public void stop(){
      pMain.doQuit();
  }
}
