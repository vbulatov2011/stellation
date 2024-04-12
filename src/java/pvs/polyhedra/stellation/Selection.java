package pvs.polyhedra.stellation;

import java.awt.Canvas;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Frame;
import java.awt.Graphics;
import java.awt.GridLayout;
import java.awt.Image;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.util.Enumeration;
import java.util.Hashtable;
import java.util.Vector;

import pvs.polyhedra.SSCell;
import pvs.polyhedra.StellationCanvas;
import pvs.utils.DestroyableFrame;
import pvs.utils.Fmt;
import pvs.utils.PVSObserver;



public class Selection extends Canvas {

  Vector allcells; // stellation cells
  Vector subcells; // all subcells
  //int[] stellation = new int[0]; // number subcells per layer 
  SelectionCell[][] selection = new SelectionCell[0][0]; // layer, subcell on/off
  // array of subcells
  SelectionCell[][] selectableCells = new SelectionCell[0][0];
  SelectionCell[][][] selectableSubCells = new SelectionCell[0][0][0];
  int offsetX = 0, offsetY = 0;
  int preferedWidth = 100;
  int preferedHeight = 100;

  int fontHeight = 16;
  int fontHeightSub = 12;
  int fontHeightSub3 = 10;
  Font font = new Font("SansSerif",Font.BOLD,fontHeight);
  Font fontSub = new Font("SansSerif",Font.PLAIN,fontHeightSub);
  Font fontSub3 = new Font("SansSerif",Font.PLAIN,fontHeightSub3);
  //Font fontSub3 = new Font("Courier",Font.PLAIN,fontHeightSub3);
  static int yspace = 8, xspace = 8; // extra space of grid in addition to text size
  // pads around cells 
  static int ypad = 2, xpad = 2, xpad2 = 2*xpad;
  Color symCellColor = new Color(230,230,255);

  PVSObserver observer = null;

  Frame frame;
  //int[][] cellGroups = new int[0][0];

  public Selection(PVSObserver _observer){
    observer = _observer;
    addMouseListener(new MouseListenerClass());
  }
  
  public Selection(Vector allcells, Vector subcells, PVSObserver observer){

    this.observer = observer;
    addMouseListener(new MouseListenerClass());
        
    setArray(allcells, subcells);

    frame = new DestroyableFrame("Stellation Cells");
    frame.setLayout(new GridLayout(1,1));
    frame.add(this);

    frame.pack();
    frame.show();
  }


  void init(){
    
    int nlayers = allcells.size();
    //stellation = new int[nlayers];

    selection = new SelectionCell[nlayers][];
    selectableCells = new SelectionCell[nlayers][];
    selectableSubCells = new SelectionCell[nlayers][][];

    for(int l = 0; l < nlayers; l++){
      
      Vector layer = (Vector)allcells.elementAt(l); 
      selectableSubCells[l] = new SelectionCell[layer.size()][];
      int layerlen = 0;
      int selcellLen = 0;
      for(int c =0; c < layer.size(); c++){

	SSCell ssc = (SSCell)layer.elementAt(c);

	selectableSubCells[l][c] = new SelectionCell[ssc.subCells.length];

	if(ssc.subCells.length > 1){
	  // one extra space for header 
	  layerlen += (ssc.subCells.length + 1);
	  selcellLen += ssc.subCells.length;
	} else {
	  layerlen ++;
	  selcellLen ++;
	}
      }
      
      //stellation[l] = ((Vector)subcells.elementAt(l)).length;
      selection[l] = new SelectionCell[layerlen];
      selectableCells[l] = new SelectionCell[selcellLen];
      int count = 0; // count everything 
      int scount = 0; // counts subcells
      for(int c = 0; c < layer.size(); c++){

	SSCell ssc = (SSCell)layer.elementAt(c);

	if(ssc.subCells.length > 1){
	  // one extra space for header 
	  selection[l][count] = new SelectionCell(ssc, 0);
	  count++;
	  for(int s = 0; s < ssc.subCells.length; s++){
	    SelectionCell sc = new SelectionCell(ssc.subCells[s],scount);

	    selectableSubCells[l][c][s] = sc;
	    selection[l][count] = sc;
	    selectableCells[l][scount] = sc;
	    scount++;
	    count++;
	  }
	} else {
	  SelectionCell sc = new SelectionCell(ssc.subCells[0],scount);
	  selectableSubCells[l][c][0] = sc;
	  selection[l][count] = sc;
	  selectableCells[l][scount] = sc;
	  scount++;
	  count++;
	}
      }

    }
    /*
    for(int l=0; l < selectableSubCells.length; l++){
      for(int c=0; c < selectableSubCells[l].length; c++){
	for(int s=0; s < selectableSubCells[l][c].length; s++){
	  System.out.println("[" + l  + "," + c+","+s+"]" + selectableSubCells[l][c][s]);
	}
      }
    }
    */
    FontMetrics fm = getFontMetrics(font);
    gridY = fontHeight + yspace;
    gridX = fm.charWidth('W')+xspace;
    int maxWidth = 0;
    for(int i = 0; i < selection.length; i++){
      if(maxWidth < selection[i].length){
	maxWidth = selection[i].length;
      }
    }
    preferedHeight = gridY*selection.length;
    preferedWidth = gridX*(maxWidth+3);
    //cellGroups = new int[allcells.size()];
    //for(int l = 0; l < allcells)

    cellColors = makeColors();

  }

  Color cellColors[];

  Color getOutlineColor(SSCell cell){
    
    //System.out.println( "getGroupColor(" + cell.cells.length+")");
    int index = cell.cells.length;
    if(cellColors[index] == null){
      // empty color, we need to make new one
      int indtop = cellColors.length-1; 
      int indbottom = 0;
      for(int i = index-1; i >=0; i--){
	if(cellColors[i] != null){
	  indbottom = i;
	  break;
	}
      }
      for(int i = index+1; i < cellColors.length; i++){
	if(cellColors[i] != null){
	  indtop = i;
	  break;
	}
      }
      Color ctop = cellColors[indtop];
      Color cbot = cellColors[indbottom];
      int len = indtop - indbottom;
      int c1 = (index - indbottom);
      int c2 = (indtop - index);
      int red =   (c1*ctop.getRed()   + c2*cbot.getRed())  /len;
      int green = (c1*ctop.getGreen() + c2*cbot.getGreen())/len;
      int blue =  (c1*ctop.getBlue()  + c2*cbot.getBlue()) /len;
      
      //System.out.println("new index: " + index + " [" + red + ","+ green + "," +  blue + "]");
      cellColors[index] = new Color(red,green,blue);
    }
    return cellColors[index];
  }

  /**
   *  Color[] makeColors(Vector cells)
   */
  Color[] makeColors(){

    Vector cells = allcells;
    Hashtable ht = new Hashtable();
    for(int i = 0; i < cells.size(); i++){
      Vector layer = (Vector)cells.elementAt(i);
      for(int c = 0; c < layer.size(); c++){
	SSCell cell = (SSCell)layer.elementAt(c);
	Integer k = new Integer(cell.cells.length);
	ht.put(k,k);
      }      
    }
    
    // we need to make array of colors, with different color for 
    // each possible number of cells occurinmg among SSCells
    int ncolors = ht.size();
    int maxcolor = 0;
    for(Enumeration e = ht.keys(); e.hasMoreElements();){
      Integer k = (Integer)e.nextElement();
      //System.out.println(k);
      if(k.intValue() > maxcolor){
	maxcolor = k.intValue();
      }
    }
    Color colors[] = new Color[maxcolor+1];
    
    for(Enumeration e = ht.keys(); e.hasMoreElements();){
      Integer k = (Integer)e.nextElement();
      colors[k.intValue()] =  Color.black;
    }
    int ccount = 0;
    for(int i = 0; i < colors.length; i++){
      if(colors[i] != null){
	float hue = (float)( ((double)ccount)/ncolors);
	float level = 0.9f;
	float saturation = 0.8f;
	colors[i] = Color.getHSBColor(hue,saturation,level);
	ccount++;
	/*
	System.out.println("Color["+i+"] = " + "["+
			   colors[i].getRed() + "," + 
			   colors[i].getGreen() + "," + 
			   colors[i].getBlue() +  
			   "]");
	*/
      }
    }
    
    return colors;

  }

  public Dimension getMinimumSize(){
    return new Dimension(100,100);
  }

  public Dimension getPreferredSize(){
    return new Dimension(100,100);
  }

  public void setArray(Vector allcells, Vector subcells){

    this.allcells = allcells;
    this.subcells = subcells;

    init();
    repaint();
  }

  /**
    setSelection

    set current selection
   */
  public void setSelection(int [][] index){

    clearAll();

    for(int i = 0; i < index.length; i++){
      selectableCells[index[i][0]][index[i][1]].setSelected(1);
    }
    repaint();

  }

  /**
     index[0] - layer, index[1] - cell in layer
     action - one of possible values 
     StellationCanvas.SUB_SUPPORTING_CELLS,
     StellationCanvas.ADD_SUPPORTING_CELLS,
     StellationCanvas.TOGGLE_SUPPORTING_CELLS,
     StellationCanvas.TOGGLE_TOP_CELL,
     StellationCanvas.TOGGLE_BOTTOM_CELL;
   */
  public int [][] modifySelection(int [] index, int action){
    
    switch(action){
    case StellationCanvas.TOGGLE_BOTTOM_CELL:
    case StellationCanvas.TOGGLE_TOP_CELL:
      SelectionCell cell = selectableCells[index[0]][index[1]];
      cell.invertSelection();
      break;  
    case StellationCanvas.ADD_SUPPORTING_CELLS:
      {
	int [][]supp = getSupportCells(index[0],index[1]);
	for(int lay =0; lay < supp.length; lay++){
	  for(int ind =0; ind < supp[lay].length; ind++){
	    if(supp[lay][ind] == 1){
	      selectableCells[lay][ind].setSelected(1);
	    }
	  }
	}	   
      }     
      break;
    case StellationCanvas.SUB_SUPPORTING_CELLS:      
      {
	int [][]supp = getSupportCells(index[0],index[1]);
	for(int lay =0; lay < supp.length; lay++){
	  for(int ind =0; ind < supp[lay].length; ind++){
	    if(supp[lay][ind] == 1){
	      selectableCells[lay][ind].setSelected(0);
	    }
	  }
	}	   
      }     
      break;
    case StellationCanvas.TOGGLE_SUPPORTING_CELLS:      
      {
	int [][]supp = getSupportCells(index[0],index[1]);	
	for(int lay =0; lay < supp.length; lay++){
	  for(int ind =0; ind < supp[lay].length; ind++){
	    if(supp[lay][ind] == 1){
	      selectableCells[lay][ind].invertSelection();
	    }
	  }
	}	   
      }     
      break;      
    }

    repaint();
    return getCells();
  }


  public void clearAll(){
    for(int i = 0; i < selection.length; i++){
      for(int j =0; j < selection[i].length; j++){
	selection[i][j].setSelected(0);
      }
    }    
    repaint();
  }

  public void setSelectionIndex(int [][] index){

    //System.out.println("setSelectionIndex()");
    for(int i = 0; i < selectableCells.length; i++){
      for(int j =0; j < selectableCells[i].length; j++){
	selectableCells[i][j].setSelected(index[i][j]);
      }
    }
    
    // updateObserver();
    repaint();
  }

  public void setSelectedSubCells(int [][][] index){

    for(int i = 0; i < selectableSubCells.length; i++){
      for(int j =0; j < selectableSubCells[i].length; j++){
	for(int k =0; k < selectableSubCells[i][j].length; k++){
	  selectableSubCells[i][j][k].setSelected(index[i][j][k]);
	}
      }
    }    
    // updateObserver();
    repaint();
  }

  int getSubcellsIndex(int layer, SSCell ssc){

    for(int s = 0; s < selection.length; s++){
      if(selection[layer][s].cell == ssc.subCells[0])
	return s;
    }
    return 0;
  }

  public SelectionCell [][] getSelectionIndex(){

    return selectableCells;
    //return null;
  }

  public SelectionCell [][][] getSelectionIndex_v2(){

    return selectableSubCells;
    //return null;
  }


  static Color[] color = new Color[2];
  static {
    color[0] = Color.white;//new Color(230,230,230);
    color[1] = new Color(192,192,192);
  }
    
  // step of grid
  int gridX = 10, gridY = 10;

  Image memImage = null;
  Dimension dim = new Dimension(0,0);

  public void update(Graphics g) {
    g.setColor(Color.lightGray);
    paint(g);
  }


  SSCell getCellAt(int i, int j){

    if(i < 0 || i >= subcells.size())
      return null;
    
    if(j < 0 || j >= selection[i].length)
      return null;
    
    SelectionCell sc = selection[i][j];

    return sc.cell;
  }

  double getVolume(int i, int j){
    SSCell sscell = getCellAt(i,j);
    return sscell.getVolume();
  }

  int getHandedness(int i, int j){
    SSCell sscell = getCellAt(i,j);
    return sscell.getHandedness();
  }

  /**
       void paint(Graphics g0)
       
   */
  public void paint(Graphics g0){

    Dimension d = getSize();
    if(d.width != dim.width || d.height != dim.height || memImage == null){
      dim = d;
      memImage = this.createImage(dim.width,dim.height);      
    }

    Graphics g = memImage.getGraphics();
    g.setColor(Color.white);   
    g.fillRect(0,0,d.width, d.height);

    g.setColor(Color.black);
    g.setFont(font);

    int x = 1, y = 1+offsetY;
    char c[] = new char[1];


    for(int i = 0; i < selection.length; i++){

      x = 1+offsetX;

      int xg = x;
      int yg = (i+1)*gridY - yspace-2+offsetY;   
      // columns  numbers 
      g.setColor(Color.black); 
      g.setFont(font);
      g.drawRect(x+1, y, 2*gridX-3, gridY);
      g.drawString(Fmt.fmt(i, 3),xg+4,yg+3);

      xg += 2*gridX;

      // draw groups 
      Vector layer = (Vector)allcells.elementAt(i);
      int scount = 0;

      for(int j = 0; j < layer.size();j++){
	SSCell cell = (SSCell)layer.elementAt(j);
	int groupsize = cell.subCells.length;
	
	int xs = xg;
      
	if(groupsize > 1){

	  g.setColor(symCellColor);
	  g.fillRect(xs + xpad-1,y+ypad-1, gridX-xpad2-1,gridY-2*ypad-1); 
	  g.setColor(Color.gray);
	  g.drawRect(xs + xpad-2,y+ypad-2, gridX-xpad2,gridY-2*ypad); 
	  // index of subcell 
	  g.setFont(font);
	  g.setColor(Color.black);
	  String num = String.valueOf(j);
	  if(num.length() == 1)
	    g.drawString(num,xg+5,yg+3);	
	  else 
	    g.drawString(num,xg+1,yg+3);

	  scount++;

	  g.setColor(Color.gray);
	  g.fillRect(xs + gridX-3,y+gridY/2-4, 3,3); 
	  g.fillRect(xs + gridX-3,y+gridY/2+2, 3,3); 
	  
	  for(int k = 0; k < cell.subCells.length; k++){
	    if(selection[i][scount].getSelected() == 1){
	      g.setColor(Color.lightGray);
	      g.fillRect(xs + gridX +xpad-1,y+ypad-2, gridX-xpad2-1,gridY-2*ypad);
	    } else {	      
	      g.setColor(Color.lightGray);
	      g.drawRect(xs + gridX +xpad-2,y+ypad-2, gridX-xpad2,gridY-2*ypad);
	    }	    
	    scount++;
	    Color outline = getOutlineColor(cell.subCells[k]);//getOutlineColor(i,j);
	    if(outline != null){
	      g.setColor(outline);
	      g.fillRect(xs+xpad+gridX-2,y+ypad-2,gridX-xpad2+1,3);
	      //g.drawRect(x+2,y+2,gridX-6,gridY-6);
	      //g.drawRect(x+3,y+3,gridX-8,gridY-8);
	    }	    
	    
	    g.setFont(fontSub);
	    g.setColor(Color.black);	    
	    String sub = String.valueOf(k);
	    int disp = 0;
	    switch(sub.length()){
	    case 1: disp = 6; break;
	    case 2: disp = 3; break;
	    case 3: 
	      g.setFont(fontSub3);
	      disp = 1; break;
	    }
	    g.drawString(sub,xs+gridX+disp,yg+3);
	    xs += gridX;
	  }    	  
	  g.setColor(getOutlineColor(cell));
	  g.fillRect(xg+gridX+xpad-2,y+gridY-ypad-3,gridX*groupsize-xpad2+1,3);
	  xg += (groupsize+1)*gridX;
	} else { // only one subcell - draw only it 
	  
	  if(selection[i][scount].getSelected() == 1){
	    g.setColor(Color.lightGray);
	    g.fillRect(xs + xpad-1,y+ypad-2, gridX-xpad2-1,gridY-2*ypad);
	  }

	  // index of subcell 
	  g.setColor(Color.black);
	  String num = String.valueOf(j);
	  if(num.length() == 1)
	    g.drawString(num,xg+5,yg+3);	
	  else 
	    g.drawString(num,xg+1,yg+3);
	  
	  g.setColor(Color.gray);
	  g.drawRect(xs + xpad-2,y+ypad-2, gridX-xpad2,gridY-2*ypad); 

	  g.setColor(getOutlineColor(cell));
	  g.fillRect(xg+xpad-2,y+gridY-ypad-3,gridX*groupsize-xpad2+1,3);
	  xg += (groupsize)*gridX;
	  scount++;
	}
	
      }

      y += gridY;
    }

    /*
    g.setColor(Color.black);
    g.setFont(fontSub);
    y = gridY - yspace-2+offsetY;   
    for(int i = 0; i < stellation.length; i++){
      x = xpad + 1 + offsetX + 2*gridX;
      for(int j = 0; j < stellation[i]; j++){
	int ind = j % (2*('z'-'a'+1));
	if(ind >= ('z'-'a'+1)){
	  c[0] = (char)('A' + j - ('z'-'a'+1));
	} else {
	  c[0] = (char)('a' + j);
	}
	g.drawString(new String(c),x+8,y+3);
	x += gridX;
      }      
      y += gridY;
    }
    */

    g0.drawImage(memImage,0,0,null);
  }

  /**
         class MouseListenerClass
     
   */
  class MouseListenerClass extends MouseAdapter {
    
    public void mousePressed(MouseEvent e){

      int [] cell = getCellUnderMouse( e.getX(), e.getY());
      if(cell == null)
	return;

      int xg = cell[1];
      int yg = cell[0];
      boolean shiftDown = e.isShiftDown();
      boolean controlDown = e.isControlDown();

      if(yg < selection.length && yg >= 0){

	if(xg >= 0 && xg < selection[yg].length){
	  
	  SSCell ssc = getCellAt(cell[0], cell[1]);	  
	  
	  // ssc.printIndices();

	  if(ssc.subCells != null){
	    // this is super cell. We need to manipulate it's subCells 
	    
	    if(controlDown || shiftDown){ // operation with fully supported set 

	      int[][] asupp = null;

	      for(int c = 0; c < ssc.subCells.length; c++){
		// accumulate all supporting cells
		int [][]supp = getSupportCells(yg, selection[yg][xg+1+c].getIndex());
		if(asupp == null){
		  asupp = supp; // store first array 
		} else {
		  for(int i =0; i < asupp.length; i++){
		    for(int j =0; j < asupp[i].length; j++){		      
		      if(supp[i][j] != 0)
			asupp[i][j] = 1;
		    }
		  }
		}	
	      } 
	      
	      processSelection(asupp,controlDown, shiftDown);
	      
	    } else {
	      for(int i = 0; i < ssc.subCells.length; i++){
		selection[yg][xg + 1 + i].invertSelection();
	      }	      
	    }


	  } else {
	    // normal cell 
	    if(controlDown || shiftDown){ // operation with fully supported set 
	      
	      int [][]supp = getSupportCells(yg, selection[yg][xg].getIndex());
	      processSelection(supp,controlDown, shiftDown);
	    } else {
	      selection[yg][xg].setSelected(1 - selection[yg][xg].getSelected());
	    }
	  }
	  repaint();	
	  updateObserver();
	} else if(xg < 0) {	    
	  // operation on the whole layer 
	  if( e.isShiftDown()){
	    for(int i = 0; i < selection[yg].length; i++){
	      if(selection[yg][i].cell.subCells == null)
		selection[yg][i].setSelected(1);
	    }	    
	  } else {	  
	    for(int i = 0; i < selection[yg].length; i++){
	      if(selection[yg][i].cell.subCells == null)		
		selection[yg][i].invertSelection();
	    }
	  }
	  updateObserver();
	  repaint();		  
	}
      }
      return;
    }
  }

  void processSelection(int[][] supp, boolean controlDown, boolean shiftDown){

    for(int lay =0; lay < supp.length; lay++){
      for(int ind =0; ind < supp[lay].length; ind++){
	if(supp[lay][ind] == 1){
	  if(shiftDown && controlDown) // clear cells 
	    selectableCells[lay][ind].setSelected(0);
	  else if(shiftDown) // set cells 
	    selectableCells[lay][ind].setSelected(1);
	  else  // ctrldown - inverse cells 
	    selectableCells[lay][ind].invertSelection();
	}
      }	    
    }
  }
  
  int [] getCellUnderMouse(int x, int y){
    
    int xg = ((x-offsetX)/gridX) - 2;

    int yg = ((y-offsetY)/gridY);
    if(yg < selection.length && yg >= 0){
      if(xg >= -2 && xg < selection[yg].length){
	return new int[]{yg,xg};
      }
    }
    return null;
  }

  void updateObserver(){

    if(observer != null){      
      int[][] cells = getCells();
      observer.update(Selection.this,cells);
    }
  }

  int [][] getCells(){

    int count = 0;
    for(int i = 0; i < selectableCells.length; i++){
      for(int j = 0; j < selectableCells[i].length; j++){
	count += selectableCells[i][j].getSelected();
      }
    }
    int [][] cells = new int[count][2];
    count = 0;
    for(int i = 0; i < selectableCells.length; i++){
      for(int j = 0; j < selectableCells[i].length; j++){	      
	if(selectableCells[i][j].getSelected() == 1){
	  cells[count][0] = i;
	  cells[count][1] = j;//selectableCells[i][j].getIndex();
	  //System.out.println("("+i+","+j+")");
	}
	count += selectableCells[i][j].getSelected();
      }      
    }
    return cells;
  }

  /**
     return all cells which fully support given cell 
   */
  int [][] getSupportCells(int layer, int index){

    // allocate empty array
    int cells[][] = new int[layer+1][];
    for(int lay =0; lay < cells.length; lay++){
      cells[lay] = new int[selectableCells[lay].length];      
    }
    cells[layer][index] = 1; // this is one cell at top layer
    for(int lay = layer; lay > 0; lay --){
      for(int ind = 0; ind < cells[lay].length; ind++){
	if(cells[lay][ind] == 0) 
	  continue; // no need to count support for empty cells
	SSCell cell = selectableCells[lay][ind].cell;
	Vector bottom = cell.bottom;
	for(int b = 0; b < bottom.size(); b++){
	  SSCell bcell = (SSCell)bottom.elementAt(b);
	  cells[bcell.layer][bcell.index] = 1;
	}	
      }
    }
    /*
    System.out.println();
    for(int lay =0; lay < cells.length; lay++){
      System.out.print(lay + ": ");
      for(int ind =0; ind < cells[lay].length; ind++){
	System.out.print(cells[lay][ind] + " ");
      }
      System.out.println();
    }
    */
    return cells;
  }
  /*
  SSCell getSSCell(int layer, int ind){
    Vector cells = (Vector)allcells.elementAt(layer);
    return (SSCell)cells.elementAt(ind);
  }
  */
  static public void main(String[] args){
    int[] s = new int[args.length];
    for(int i = 0; i < args.length; i++){
      s[i] = Integer.parseInt(args[i]);
    }
    //new Selection(s, null);
    
    Frame frame = new DestroyableFrame("Stellation Cells");
    frame.add("Center",new Selection(null));
    frame.pack();
    frame.show();         
    
  }

  public void setOffsetX(int offset){
    offsetX = offset;
    repaint();
  }
  
  public void setOffsetY(int offset){
    offsetY = offset;
    repaint();
  }  

}
