package pvs.polyhedra.stellation;

import java.awt.BasicStroke;
import java.awt.Button;
import java.awt.Canvas;
import java.awt.Color;
import java.awt.Dialog;
import java.awt.Dimension;
import java.awt.Frame;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.GridBagConstraints;
import java.awt.GridBagLayout;
import java.awt.GridLayout;
import java.awt.Label;
import java.awt.Panel;
import java.awt.RenderingHints;
import java.awt.TextField;
import java.awt.event.ActionEvent;
import java.awt.event.WindowAdapter;
import java.awt.event.WindowEvent;
import java.awt.geom.AffineTransform;
import java.awt.geom.GeneralPath;
import java.awt.geom.Rectangle2D;
import java.awt.print.PageFormat;
import java.awt.print.Paper;
import java.awt.print.Printable;
import java.awt.print.PrinterJob;
import java.util.Vector;

import pvs.Expression.Parser;
import pvs.polyhedra.PolyShape;
import pvs.utils.Dlg_Preferences;
import pvs.utils.Parameter;
import pvs.utils.ParameterBoolean;
import pvs.utils.ParameterDouble;
import pvs.utils.ParameterInt;
import pvs.utils.WindowUtils;


public class DlgPrint {


  public DlgPrint(){

  }

  Dialog dialog; 

  public boolean edit(Frame frame, Vector shapes){

    if(dialog == null)
      makeDialog(frame);
    
    this.shapes = shapes;
    dialog.show();

    return result;
    
  }
  
  Vector shapes;
  boolean result;
  PrintCanvas canvas = new PrintCanvas();
  
  TextField tfEditors[];

  static ParameterDouble  Scale = new ParameterDouble("Scale",1);
  static ParameterBoolean  MirrorV = new ParameterBoolean("MirrorV",false);
  static ParameterBoolean  MirrorH = new ParameterBoolean("MirrorH",false);
  static ParameterDouble  Xoffset = new ParameterDouble("Xoffset",0);
  static ParameterDouble  Yoffset = new ParameterDouble("Yoffset",0);
  static ParameterDouble  PrintWidth = new ParameterDouble("PrintWidth",20); // cm 
  static ParameterDouble  PrintHeight = new ParameterDouble("PrintHeight",25); // cm
  static ParameterDouble  CorrectionHeight = new ParameterDouble("CorrectionHeight",1);
  static ParameterDouble  CorrectionWidth = new ParameterDouble("CorrectionWidth",1);
  static ParameterInt     TileX = new ParameterInt("TileX",1,1,100);
  static ParameterInt     TileY = new ParameterInt("TileY",1,1,100);
  static ParameterInt     Copies = new ParameterInt("Copies",1,1,1000);
  /*
  For HP Laser Printer in Office, corrections are: 
  0.994,  0.9975
  for HP DeskJet 722C at home corrections are: 
  1.002, 1.000
  */
  static Parameter Parameters[] = new Parameter[] {
    Scale, MirrorV, MirrorH, Xoffset, Yoffset, PrintWidth, PrintHeight, CorrectionHeight, CorrectionWidth, 
    TileX, TileY, Copies
  };

  String filePath = "stellation_print.ini";

  static final double INCHES = 2.54;

  void makeDialog(Frame frame){

    
    Dlg_Preferences.readPreferences(filePath, Parameters);
    dialog = new Dialog(frame);

    GridBagLayout gb = new GridBagLayout();
    dialog.setLayout(gb);

    Panel panel1 = new Panel();
    panel1.setLayout(gb);

    
    //TO-DO. we may use ParameterEditor instead
    tfEditors = new TextField[Parameters.length];
    for(int i=0; i < Parameters.length; i++){
      tfEditors[i] = new TextField(10);
      WindowUtils.constrain(panel1,new Label(Parameters[i].getName()), 0,i,1,1, gbc.NONE, gbc.CENTER,0.,0.);
      WindowUtils.constrain(panel1,tfEditors[i],         1,i,1,1, gbc.NONE, gbc.CENTER,0.,0.);
      tfEditors[i].setText(Parameters[i].getValue());
    }


    Panel panelBtn = new Panel();

    panelBtn.setLayout(new GridLayout(1,3,3,3));

    Button btnApply = new Button("Apply");
    Button btnPrint = new Button("Print");
    Button btnCancel = new Button("Cancel");
    

    panelBtn.add(btnApply);
    panelBtn.add(btnPrint);
    panelBtn.add(btnCancel);

    btnApply.addActionListener(new OnApply());
    btnCancel.addActionListener(new OnCancel());
    btnPrint.addActionListener(new OnPrint());
        
    WindowUtils.constrain(dialog,panel1,  0,0,1,1,gbc.HORIZONTAL, gbc.NORTH,0.0,0.,5,5,5,5);
    WindowUtils.constrain(dialog,panelBtn,0,1,1,1,gbc.NONE, gbc.NORTH, 0.,0.,5,5,5,5); 
    WindowUtils.constrain(dialog,canvas,  1,0,1,2,gbc.BOTH, gbc.CENTER,1.,1.,5,5,5,5);
    

    dialog.addWindowListener(new CloseWindowListener());
    
    dialog.pack();
    dialog.validate();
    dialog.setModal(true);
        
  }

  void updateValues(){

    for(int i=0; i < Parameters.length; i++){
      Parameters[i].setValue(tfEditors[i].getText());
    }      
  }

  Parser parser;

  class OnApply implements java.awt.event.ActionListener{

    public void actionPerformed(ActionEvent e){
      
      updateValues();

      canvas.repaint();

    }    
  }

  class OnPrint implements java.awt.event.ActionListener{

    public void actionPerformed(ActionEvent e){

      dialog.setVisible(false);
      dialog.dispose();
      Dlg_Preferences.savePreferences(filePath,Parameters);
      result = true;
      

      PrinterJob job = PrinterJob.getPrinterJob();
      
      PageFormat pageFormat = job.defaultPage();
      Paper paper = pageFormat.getPaper();
      paper.setImageableArea(0,0,paper.getWidth(), paper.getHeight());
      pageFormat.setPaper(paper);
      //pageFormat.setOrientation(PageFormat.LANDSCAPE);
      //pageFormat.setOrientation(PageFormat.PORTRAIT);

      job.setPrintable(canvas, pageFormat);
      try {
	job.print();
      } catch (Exception ex) {
	ex.printStackTrace();
      }
      /*
      PrintJob pj = Toolkit.getDefaultToolkit().getPrintJob((Frame)dialog.getParent(),"Print Diagram",null);
      if(pj == null)
	return;
      Graphics gr = pj.getGraphics();
      Dimension dim = pj.getPageDimension();
      System.out.println("printing diagram");
      canvas.drawContent(gr, dim.width, dim.height, pj.getPageResolution());
      pj.end();
      */
    }    
  }

  class OnCancel implements java.awt.event.ActionListener{

    public void actionPerformed(ActionEvent e){

      dialog.setVisible(false);
      dialog.dispose();
      result = false;
   }    
  }

  class CloseWindowListener extends WindowAdapter {
    
    public void  windowClosing(WindowEvent e){
      dialog.setVisible(false);
      dialog.dispose();
      result = false;      
    }
  }

  static private GridBagConstraints gbc = new GridBagConstraints();

  /**
   *
   *
   *
   */
  class PrintCanvas extends Canvas implements Printable {
    
    public void update(Graphics g){
      paint(g);
    }
    
    public Dimension getPreferredSize(){
      return new Dimension(300,300);
    }
    
    int inset = 5;

    /**
     *
     *
     */
    public void paint(Graphics g){
      
      g.setColor(Color.white);
      Dimension dim = getSize();
      g.fillRect(0,0,dim.width, dim.height);
      int _height = dim.height - 2*inset;
      
      int _width = dim.width - 2*inset;
      double width, height, currentScale; 
      double totalPrintWidth = PrintWidth.value * TileX.value;
      double totalPrintHeight = PrintHeight.value*TileY.value;

      if(_width * totalPrintHeight  > _height * totalPrintWidth){

	// top and bottom should touch 
	height = _height;
	width = height*totalPrintWidth/totalPrintHeight;

      } else {

	// left, right should touch 
	width = _width;
	height = width * totalPrintHeight / totalPrintWidth;

      } 

      currentScale = height / totalPrintHeight;

      g.setColor(Color.gray);
      for(int yt = 0; yt < TileY.value; yt++){
        for(int xt = 0; xt < TileX.value; xt++){
          double tileWidth = width / TileX.value;
          double tileHeight = height / TileY.value;
          g.drawRect((int)((dim.width-width)/2  + xt * tileWidth) ,(int)((dim.height-height)/2 + yt*tileHeight),
                     (int)tileWidth, (int)tileHeight);          
        }
      }

      Graphics2D g2d = (Graphics2D)g;

      //GraphicsConfiguration gc = g2d.getGraphicsConfiguration();      
      //g2d.setTransform(gc.getDefaultTransform());
      g2d.setTransform(new AffineTransform());
      g2d.translate(dim.width/2, dim.height/2); // translate image to center of tiled pages 
      g2d.scale(currentScale, currentScale);
      
      //g2d.transform(gc.getNormalizingTransform());
      // 1 inch device space equals to 72 units in user space 
      
      g2d.translate(Xoffset.value, -Yoffset.value);
      g2d.scale(Scale.value,-Scale.value);
      if(MirrorV.value)
        g2d.scale(-1,1);
      if(MirrorH.value)
        g2d.scale(1,-1);        
      //g2d.scale(10.0,10.0);
      renderShapes(g2d);
      //renderTest(g2d);

    }

    void drawContent(Graphics g, int width, int height, int resolution){

    }

    /**
     *
     *
     */
    public int print(Graphics g, PageFormat pageFormat, int pageIndex){

      if(pageIndex >= Copies.value * TileX.value * TileY.value){
	return Printable.NO_SUCH_PAGE;
      }
      int tile = (pageIndex / Copies.value);
      int tileOffsetX = tile % (TileX.value);
      int tileOffsetY = tile / (TileX.value); 

      Graphics2D g2d = (Graphics2D)g;
      //System.out.println("print size: [" + width + " x " + height + "]");
      g2d.setColor(Color.black);

      //g2d.setTransform(new AffineTransform());
      g2d.setStroke(new BasicStroke(0));

      double pwidthmm = pageFormat.getWidth()*INCHES/72;
      double pheightmm = pageFormat.getHeight()*INCHES/72;

      g2d.translate(pageFormat.getWidth()/2, pageFormat.getHeight()/2);
      g2d.scale(CorrectionWidth.value*72/INCHES,CorrectionHeight.value*72/INCHES);
      Rectangle2D rect = new Rectangle2D.Double(-PrintWidth.value/2, -PrintHeight.value/2, 
						PrintWidth.value, PrintHeight.value );
      g2d.draw(rect);
      g.setClip(rect);

      // we need to make right X and Y offset of tiles. Origin is located in the center of 
      // big page [ PrintWidth.value*TileX.value by PrintHeight.value*TileY.value]

      double imageOffsetX = PrintWidth.value * (2*tileOffsetX + 1 - TileX.value) / 2;
      double imageOffsetY = PrintHeight.value * (2*tileOffsetY + 1 - TileY.value) / 2;

      g2d.translate(Xoffset.value - imageOffsetX, -Yoffset.value + imageOffsetY);

      g2d.scale(Scale.value,-Scale.value);
      if(MirrorV.value)
        g2d.scale(-1,1);
      if(MirrorH.value)
        g2d.scale(1,-1);        

      renderShapes(g2d);
            
      return Printable.PAGE_EXISTS;
    }

    /**
     *
     *
     */
    void renderShapes(Graphics2D g2d){

      RenderingHints hints = new RenderingHints(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_OFF);
      g2d.setRenderingHints(hints);

      g2d.setColor(Color.black);
      g2d.setStroke(new BasicStroke(0));
      for(int i = 0; i < shapes.size(); i++){
	PolyShape shape = (PolyShape)shapes.elementAt(i);
	switch(shape.type){
	case PolyShape.FILL: 
	  g2d.setColor(shape.color);
	  g2d.fill(shape.path);
	  break;
	case PolyShape.DRAW: 	  
	  g2d.setColor(shape.color);
	  g2d.draw(shape.path);
	  break;
	}
      }
    }

    /**
     *
     *
     */
    void renderTest(Graphics2D g2d){

      g2d.setColor(Color.black);
      g2d.setStroke(new BasicStroke(0));
      GeneralPath path = new GeneralPath();
      int N = 360;
      double r = 0.1;
      double R = 1;

      for(int i=0; i < N; i++){
	double a = (2*Math.PI*i)/N;
	double sina = Math.sin(a);
	double cosa = Math.cos(a);
	path.moveTo((float)(r*cosa), (float)(r*sina));
	path.lineTo((float)(R*cosa), (float)(R*sina));
	path.closePath();
      }

      g2d.draw(path);
    }

  }

}
