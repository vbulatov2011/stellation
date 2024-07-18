package pvs.polyhedra.stellation.ui;

import java.awt.Button;
import java.awt.Canvas;
import java.awt.Color;
import java.awt.Dialog;
import java.awt.Dimension;
import java.awt.Frame;
import java.awt.Graphics;
import java.awt.GridBagConstraints;
import java.awt.GridBagLayout;
import java.awt.GridLayout;
import java.awt.Image;
import java.awt.Label;
import java.awt.Panel;
import java.awt.Scrollbar;
import java.awt.TextField;
import java.awt.Toolkit;
import java.awt.event.ActionEvent;
import java.awt.event.AdjustmentEvent;
import java.awt.event.AdjustmentListener;
import java.awt.event.ComponentAdapter;
import java.awt.event.ComponentEvent;
import java.awt.event.MouseEvent;
import java.awt.event.MouseListener;
import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

import pvs.polyhedra.stellation.PolyNames;
import pvs.utils.ui.BorderPanel;
import pvs.utils.ui.WindowUtils;


public class DlgSelectPoly {

  Dialog dialog; 

  
  public int[] getPolyhedron(Frame frame, int category, int poly){

    this.currentCategory = category;
    this.currentPoly = poly;

    if(dialog == null)
      makeDialog(frame);

    dialog.show();

    if(result){
      return selection;
    } else {
      return null;
    }
  }
  
  PolyNames polyNames = new PolyNames();

  int selection[] = new int[2];
  int currentCategory;
  int currentPoly;

  PolyCanvas polyCanvas;
  int sbPolyMaximum = 1000;
  int sbPolyVisible = 1000;  

  Scrollbar sbPoly = new Scrollbar(Scrollbar.VERTICAL, 0,sbPolyVisible,0,sbPolyMaximum);

  boolean result;

  Button btnOK = new Button("OK");
  Button btnCancel = new Button("Cancel");
  TextField tfPolyName = new TextField(30);
  Label lbCurPolyName = new Label("polyhedron name");

  void makeDialog(Frame frame){

    dialog = new Dialog(frame);


    GridBagLayout gb = new GridBagLayout();
    dialog.setLayout(gb);
    dialog.addComponentListener(new DlgSizeListener());

    polyCanvas = new PolyCanvas();
    Panel panelPoly = new BorderPanel();
    panelPoly.setLayout(gb);
    sbPoly.addAdjustmentListener(new SBAdjustmentListener());
    //tfPolyName.setEnabled(false);
    Panel panelPoly_1 = new BorderPanel();
    panelPoly_1.setLayout(gb);
    WindowUtils.constrain(panelPoly_1,polyCanvas,0,0,1,1,gbc.BOTH, gbc.NORTH,1.,1.);    
   
    Panel panelPolyName = new Panel();    panelPolyName.setLayout(gb);
    WindowUtils.constrain(panelPolyName,tfPolyName,0,0,1,1,gbc.HORIZONTAL, gbc.NORTH,1.,0.,0,5,0,5);
    WindowUtils.constrain(panelPolyName,lbCurPolyName,1,0,1,1,gbc.HORIZONTAL, gbc.NORTH,1.,0.,10,5,0,5);

    WindowUtils.constrain(panelPoly,panelPoly_1,0,0,1,1,gbc.BOTH, gbc.NORTH,1.,1.);    
    WindowUtils.constrain(panelPoly,sbPoly,1,0,1,1,gbc.VERTICAL, gbc.NORTH,0.,1.);
    WindowUtils.constrain(panelPoly,panelPolyName,0,1,1,1,gbc.HORIZONTAL, gbc.NORTH,1.,0.,0,5,0,5);
    
    Panel panelBtn = new Panel();
    panelBtn.setLayout(new GridLayout(1,3,5,5));
    panelBtn.add(btnOK);
    panelBtn.add(btnCancel);
    btnOK.addActionListener(new OnOK());
    btnCancel.addActionListener(new OnCancel());

    WindowUtils.constrain(dialog,panelPoly,0,0,1,1,gbc.BOTH, gbc.NORTH,1.,1.);    
    WindowUtils.constrain(dialog,panelBtn,0,1,1,1,gbc.NONE, gbc.NORTH,1.,0.,5,5,5,5);    
    
    dialog.pack();
    Toolkit tk = Toolkit.getDefaultToolkit();
    Dimension screen = tk.getScreenSize();
    dialog.setSize(screen.width,screen.height-30);
    dialog.setModal(true);
        
  }

  class OnOK implements java.awt.event.ActionListener{

    public void actionPerformed(ActionEvent e){
      dialog.setVisible(false);
      dialog.dispose();
      result = true;
    }    
  }

  class OnCancel implements java.awt.event.ActionListener{

    public void actionPerformed(ActionEvent e){
      dialog.setVisible(false);
      dialog.dispose();
      result = false;
   }    
  }

  static private GridBagConstraints gbc = new GridBagConstraints();

  void adjustSB(){

    sbPoly.setVisibleAmount((polyCanvas.visibleRows*sbPolyMaximum)/polyCanvas.numberRows);
    sbPoly.setBlockIncrement(sbPolyMaximum/polyCanvas.numberRows);
    sbPoly.setUnitIncrement(sbPolyMaximum/polyCanvas.numberRows);

  }

  class SBAdjustmentListener implements AdjustmentListener{

    public void adjustmentValueChanged(AdjustmentEvent e){
      
      int y = e.getValue();
      polyCanvas.globalOffsetY = (y*polyCanvas.numberRows*polyCanvas.cellSizeY)/sbPolyMaximum;
      polyCanvas.moveIcons();
      //polyCanvas.repaint();
    }    
  }

  /**
     class represent canvas, which displays a set of poly icons 
   */
  class PolyCanvas extends Panel{
    
    int cellSizeX = 90;
    int cellSizeY = 90;
    int iconSizeX = 86;
    int iconSizeY = 86;
    int offsetX = 2;
    int offsetY = 2;
    Color color1, color2;
    Image images[][];
    PolyLabel polyLabels[][];

    int visibleRows = 1; 
    int numberRows = 1;
    int globalOffsetY = 0;

    Panel scrollPanel;

    PolyCanvas (){

      createImages();

      scrollPanel = new Panel();
      scrollPanel.setLayout(null);
      this.setLayout(null);

      this.add(scrollPanel);
      
      for(int y =0; y < images.length; y++){
	for(int x =0; x < images[y].length; x++){	  
	  images[y][x] = loadImage(y,x);
	  polyLabels[y][x] = new PolyLabel(y,x,images[y][x]);
	  scrollPanel.add(polyLabels[y][x]);
	  polyLabels[y][x].setSize(iconSizeX,iconSizeY);
	  int xx = x*cellSizeX + offsetX;
	  int yy = y*cellSizeY + offsetY;
	  polyLabels[y][x].setLocation(xx,yy);
	  
	}
      }

      polyLabels[currentCategory][currentPoly].setState(true);
      
    }

    void processMouseClicked(int cat, int poly){
      
      polyLabels[currentCategory][currentPoly].setState(false);
      polyLabels[cat][poly].setState(true);
      currentCategory = cat;
      currentPoly = poly;
      selection[0] =  currentCategory;
      selection[1] =  currentPoly;
      tfPolyName.setText(polyNames.name(currentCategory, currentPoly));
    }

    void processMouseEntered(int cat, int poly){
      
      //tfPolyName.setText(polyNames.name(cat,poly));
      //lbPolyName.setText(polyNames.name(cat,poly));
      //Point p = polyLabels[cat][poly].getLocation();      
      //lbPolyName.setLocation(p);
      lbCurPolyName.setText(polyNames.name(cat,poly));
    }

    int oldWidth = -1;
    /**
       
     */
    public void paint(Graphics g){
      
      //moveIcons();

    }

    void moveIcons(){

      Dimension dim = getSize();
      int nx = dim.width / cellSizeX;
      if(nx < 1)
	nx = 1;
      int ny = dim.height / cellSizeY;
      visibleRows = ny;

      scrollPanel.setLocation(0, -globalOffsetY);

      if(dim.width != oldWidth){

	oldWidth = dim.width;
	int curX = 0;
	int curY = 0; 
      
	// move all polyLabels 
	for(int cat =0; cat < images.length; cat++){
	  curX = 0;
	  for(int poly =0; poly < images[cat].length; poly++){	  
	    if(curX == nx){ // we reached end of line 
	      curX = 0; 
	      curY++;
	    }
	    int xx = curX*cellSizeX + offsetX;
	    int yy = curY*cellSizeY + offsetY;
	    polyLabels[cat][poly].setLocation(xx,yy);
	    curX++;
	  }
	  curY++;
	}

	numberRows = curY;
	
	scrollPanel.setSize(dim.width, (curY + 1)* cellSizeY);
	adjustSB();      
      }
    }
    
    
    Image loadImage(int cat, int poly){
      
      return loadImageFromJar("/images/poly/"+polyNames.fname(cat,poly)+"_tmb.gif");
      
    }

    void createImages(){

      String cat[] = polyNames.getCategories();
      images = new Image[cat.length][];
      polyLabels = new PolyLabel[cat.length][];
      for(int i =0; i < cat.length; i++){
	int catlen = polyNames.getCategoryLength(i);
	images[i] = new Image[catlen];
	polyLabels[i] = new PolyLabel[catlen];
      }
    }
        

    Image loadImageFromJar(String imageName) {
      
      Toolkit tk = Toolkit.getDefaultToolkit();
      byte bytebuf[] = null;
      
      
      bytebuf = null;
      int n;
      try {
	InputStream is = getClass().getResourceAsStream(imageName);
	if (is == null) {
	  System.out.println("ImageLoader.loadFromJar getResourceAsStream failed on " + imageName);
	  return null; // BAD
	}
	BufferedInputStream bis = new BufferedInputStream(is);
	ByteArrayOutputStream out = new ByteArrayOutputStream(1024);
	bytebuf = new byte[1024];
	while (true) {
	  n = bis.read(bytebuf);
	  if (n <= 0) break;
	  out.write(bytebuf, 0, n);
	}
	bis.close();
	out.flush();
	bytebuf = out.toByteArray();
      } catch (IOException e) {
	System.err.println("ImageLoader.loadFromJar IOException: " + e);
	return null; // BAD
      }
      if (bytebuf == null) {
	System.out.println("ImageLoader.loadFromJar: " + imageName + " not found.");
	return null;
      }
      if (bytebuf.length == 0) {
	System.out.println("ImageLoader.loadFromJar: " + imageName + " is zero-length");
	return null;
      }
      //System.out.println("loadFromJar: " + imageName + " loaded");
      return tk.createImage(bytebuf);
    }

    class PolyLabel extends Canvas implements MouseListener {

      int offsetX = 3, offsetY = 3;
      int imageSizeX = 80, imageSizeY = 80;
      int cat,poly; 
      Image image;

      PolyLabel(int cat, int poly, Image image){
	this.cat = cat;
	this.poly = poly;
	this.image = image;
	this.addMouseListener(this);
      }      

      boolean state = false;

      void setState(boolean state){
	this.state = state;
	repaint();
      }

      Color color1, color2;
      
      /**
       * 
       */
      public void paint(Graphics g){
	
	Color cback = getBackground();
	color2 = cback.darker();
	color1 = cback.brighter();
	Dimension dim = getSize();
	drawRect3D(g,0,0,dim.width-1, dim.height-1);
	Dimension d = getSize();
	g.drawImage(image, offsetX, offsetY, this); 
	if(state){
	  g.setColor(Color.blue);
	  g.drawRect(offsetX-1, offsetY-1, imageSizeX+2, imageSizeY+2);
	  g.drawRect(offsetX, offsetY, imageSizeX, imageSizeY);
	}
      }  
      
      void drawRect3D(Graphics g, int x,int y,int width, int height){
	
	g.setColor(color1);
	g.drawLine(x,y, x+width,y);
	g.drawLine(x,y, x,  y+height);
	g.setColor(color2);
	g.drawLine(x+width, y+height, x+width, y);
	g.drawLine(x+width,y+height, x,y+height);
      }
      
      public Dimension getPreferredSize(){
        return new Dimension(10,10);
      }

      public void mouseClicked(MouseEvent e){
      }
      public void mouseReleased(MouseEvent e){
      }
      public void mouseEntered(MouseEvent e){
	processMouseEntered(cat, poly);
      }
      public void mouseExited(MouseEvent e){
      }
      public void mousePressed(MouseEvent e){
	
	//System.out.println("mousePressed " + e);
	//int x = e.getX();
	//int y = e.getY();
	processMouseClicked(cat, poly);
      }
    }
  }

  class DlgSizeListener extends ComponentAdapter {

    public void componentResized(ComponentEvent e) {      
      polyCanvas.moveIcons();
    }
  }

}
