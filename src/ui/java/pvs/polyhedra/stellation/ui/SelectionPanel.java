package pvs.polyhedra.stellation.ui;

import java.awt.Button;
import java.awt.Color;
import java.awt.Component;
import java.awt.Cursor;
import java.awt.Dimension;
import java.awt.GridBagConstraints;
import java.awt.GridBagLayout;
import java.awt.Panel;
import java.awt.Scrollbar;
import java.awt.TextField;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.awt.event.AdjustmentEvent;
import java.awt.event.AdjustmentListener;
import java.awt.event.ComponentAdapter;
import java.awt.event.ComponentEvent;
import java.awt.event.MouseEvent;
import java.awt.event.MouseMotionAdapter;
import java.util.StringTokenizer;
import java.util.Vector;

import pvs.polyhedra.PolygonDisplayNode;
import pvs.polyhedra.SSCell;
import pvs.polyhedra.stellation.SelectionCell;
import pvs.utils.Fmt;
import pvs.utils.Output;
import pvs.utils.PVSObserver;
import pvs.utils.ui.WindowUtils;


public class SelectionPanel extends Panel implements PVSObserver {

    private Selection canvas;
  
    private TextField  cellField = new TextField();
    TextField  infoField = new TextField();
    //TextField  statusField = new TextField();    
    Button cellsButton = new Button("Set");    
    Button clearButton = new Button("Clear");    

    int sbMaximum = 100000;
    int sbVisible = 100000;
    Scrollbar sbVertical = new Scrollbar(Scrollbar.VERTICAL,0,sbVisible,0,sbMaximum);
    Scrollbar sbHorizontal = new Scrollbar(Scrollbar.HORIZONTAL,0,sbVisible,0,sbMaximum);
    boolean sbVerticalVisible = false;
    boolean sbHorizontalVisible = false;
    Vector cellHistory = new Vector();
  
    StellationMain main;
    Panel cpanel;

    public SelectionPanel(StellationMain main){

        this.main = main;

        this.setBackground(Color.lightGray);
        infoField.setBackground(Color.lightGray);
        GridBagLayout gb = new GridBagLayout();    

        canvas = new Selection(this);
        canvas.addMouseMotionListener(new CanvasMouseMotion());
        sbVertical.addAdjustmentListener(new SBVerticalAdjustmentListener());
        sbHorizontal.addAdjustmentListener(new SBHorizontalAdjustmentListener());

        cpanel = new Panel();
        cpanel.setLayout(gb);
        cpanel.addComponentListener(new CPanelListener());

        WindowUtils.constrain(cpanel,canvas, 0,1,1,1, gbc.BOTH, gbc.CENTER,1.,1.);
        //WindowUtils.constrain(cpanel,sbVertical, 1,1,1,1, gbc.VERTICAL, gbc.CENTER,0.,1.);
        //WindowUtils.constrain(cpanel,sbHorizontal, 0,2,1,1, gbc.HORIZONTAL, gbc.CENTER,1.,0.);

        this.setLayout(gb);
    
        cellsButton.addActionListener(new CellsButtonListener());
        clearButton.addActionListener(new ClearButtonListener());

        WindowUtils.constrain(this,cpanel,      0,0,3,1, gbc.BOTH, gbc.CENTER,1.,1.,2,2,2,2);
        WindowUtils.constrain(this,infoField,   0,1,3,1, gbc.HORIZONTAL, gbc.CENTER,1.,0.);
        WindowUtils.constrain(this,cellField,   0,2,1,1, gbc.HORIZONTAL, gbc.CENTER,1.,0.);
        WindowUtils.constrain(this,cellsButton, 1,2,1,1, gbc.NONE, gbc.CENTER,0.,0.,2,2,2,2);    
        WindowUtils.constrain(this,clearButton, 2,2,1,1, gbc.NONE, gbc.CENTER,0.,0.,2,2,2,2);    
        //WindowUtils.constrain(this,statusField, 0,2,2,1, gbc.HORIZONTAL, gbc.CENTER,1.,0.);    
    
    }

    public void setSelection(int [][] index){
        canvas.setSelection(index);
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

        return canvas.modifySelection(index, action);

    }

    public void setArray(Vector allcells, Vector subcells){

        canvas.setArray(allcells, subcells); 
        canvas.setOffsetY(0);
        canvas.setOffsetX(0);
        adjustScrollbars();
    }

    public void adjustScrollbars(){

        Dimension d = canvas.getSize();    
        if(d.width == 0 || d.height == 0)
            return;
        if(canvas.preferedWidth > d.width){
            sbHorizontal.setMaximum(canvas.preferedWidth);
            sbHorizontal.setVisibleAmount(d.width);
            sbHorizontal.setUnitIncrement(canvas.gridX);
            sbHorizontal.setBlockIncrement(10*canvas.gridX);
            sbHorizontal.setEnabled(true);
            if(!sbHorizontalVisible){
                sbHorizontalVisible = true;
                WindowUtils.constrain(cpanel,sbHorizontal, 0,2,1,1, gbc.HORIZONTAL, gbc.CENTER,1.,0.); 
                cpanel.validate();
            }
        } else {
            canvas.setOffsetX(0);
            sbHorizontal.setEnabled(false);
            cpanel.remove(sbHorizontal);
            if(sbHorizontalVisible){
                sbHorizontalVisible = false;
                cpanel.remove(sbHorizontal);
                cpanel.validate();
            }
        }
        if(canvas.preferedHeight > d.height){
            sbVertical.setMaximum(canvas.preferedHeight);
            sbVertical.setVisibleAmount(d.height);
            sbVertical.setUnitIncrement(canvas.gridY);
            sbVertical.setBlockIncrement(10*canvas.gridY);
            sbVertical.setEnabled(true);
            if(!sbVerticalVisible){
                sbVerticalVisible = true;
                WindowUtils.constrain(cpanel,sbVertical, 1,1,1,1, gbc.VERTICAL, gbc.CENTER,0.,1.);
                cpanel.validate();
            }
        } else {
            sbVertical.setEnabled(false);
            canvas.setOffsetY(0);
            if(sbVerticalVisible){
                sbVerticalVisible = false;
                cpanel.remove(sbVertical);
                cpanel.validate();
            }
        }
    }

    /**
       update 
    
       callback function to inform, that something happens
    */
    public void update(Object who, Object what){

        main.update(this, what);
        initCellField();

    }
  
    public void initCellField(){

        SelectionCell [][][] index = canvas.getSelectionIndex_v2();
        String cells = makeStellationName_v2(index);

        String oldText = cellField.getText();
        cellHistory.addElement(oldText);

        cellField.setText(cells);
    
        return;
    }

    public void doUndo(){

        int current = cellHistory.size()-1;
        if(current < 0)
            return;
        String cells = (String)cellHistory.elementAt(current);
        cellHistory.removeElementAt(current);
        cellField.setText(cells);
        doParseCells();
    
    }

    public String getCells(){

        return cellField.getText();

    }

    public void setCells(String cells){

        cellField.setText(cells);
        doParseCells();

    }

    public static String makeStellationName_v2(SelectionCell [][][] index){

        StringBuffer sb = new StringBuffer();
        boolean needLayerComma = false;
        boolean needCellComma = false;
        boolean needSubCellComma = false;

        sb.append('{'); // beginning 
        boolean needComma = false;

        for(int i = 0; i < index.length; i++){

            String layer = writeLayer_v2(index[i]);
            if(layer.equals("()")) 
                continue;  // empty layer 
            if(needComma)
                sb.append(',');	
            sb.append(i);
            if(layer.equals("(*)")){
                needComma = true;
            } else {
                sb.append(layer);
                needComma = false;
            }
        }

        sb.append('}'); // end
        return sb.toString();

    }

    static String writeLayer_v2(SelectionCell [][] index){

        StringBuffer sb = new StringBuffer();
        sb.append('(');    
        boolean hasEmptyCells = false;
        boolean hasPartialCells = false;
        boolean needComma = false;

        for(int i=0; i < index.length; i++){
            String str = writeCell_v2(index[i]);
            if(str.equals("[]")){
                hasEmptyCells = true;
                continue;  // empty cell 
            } 
            if(needComma)
                sb.append(',');	
            sb.append(i);
            if(str.equals("[*]")) {
                needComma = true; // skip	
            } else {
                hasPartialCells = true;
                sb.append(str);
                needComma = false;
            }
        }
        sb.append(')');
        if(!hasEmptyCells && !hasPartialCells)
            return "(*)";
        else 
            return sb.toString();
    }

    static String writeCell_v2(SelectionCell [] index){
        StringBuffer sb = new StringBuffer();
        sb.append('[');    
        boolean hasCells = false;
        boolean hasEmptyCells = false;
        for(int i=0; i < index.length; i++){
            if(index[i].getSelected() == 1)
                hasCells = true;
            else 
                hasEmptyCells = true;
        }
        if(!hasEmptyCells) {
            // all cells 
            sb.append('*');   

        } else {
            boolean needComma = false;
            for(int i=0; i < index.length; i++){
                if(index[i].getSelected() == 1){
                    if(needComma){
                        sb.append(',');
                        needComma = false;
                    }
                    sb.append(i);
                    needComma = true;;
                }
            }      
        }      
        sb.append(']');   
        return sb.toString();
    }

    /*
      static boolean checkBufferEnd(StringBuffer sb, String str, int size){

      int bl = sb.length();
      for(int i=0; i < size; i++){
      if(str.charAt(i) != sb.charAt(sb-size+i))
      return false;
      }
      return true;
      }
    */

    /*
    // check if there are non-zeros.
    boolean hasCells = false;
    boolean hasEmptyCells = false;
    for(int j = 0; j < index[i].length; j++){
	if(index[i][j].getSelected() == 0){
    hasEmptyCells = true;
	} else {
    hasCells = true;
	}
    }
    if(!hasCells){
	continue;	
    }  
    
    if(needLayerComma)
	s.append(','); // close previous layer       
    needLayerComma = false;
    s.append(i); // layer

    if(!hasEmptyCells){
	needLayerComma = true; // all cells in the layer
	continue;
    }
    // has some subcells 
    s.append('(');
    needCellComma = false;
    for(int j = 0; j < index[i].length; j++){
	if(index[i][j].getSelected() != 0){
    if(needCellComma){
    s.append(',');
    }
    s.append(j);
    int count = countAdjacentCells(index[i],j);
    if(count > 2){
    // if more than 2 cells, use interval notation
    s.append('-');
    s.append(j + count - 1);
    j += count-1;
    }
    needCellComma = true;
	}
    }
    s.append(')');
    }
    
    s.append('}');
    return s.toString();
    
    }
    */
    public static String makeStellationName_v1(SelectionCell [][] index){

        StringBuffer s = new StringBuffer();

        for(int i = 0; i < index.length; i++){
            // check if there are non-zeros.
            boolean hasCells = false;
            boolean hasEmptyCells = false;
            for(int j = 0; j < index[i].length; j++){
                if(index[i][j].getSelected() == 0){
                    hasEmptyCells = true;
                } else {
                    hasCells = true;
                }
            }
            if(!hasCells){
                continue;	
            }      
            s.append(i); // layer
            s.append('(');
            if( !hasEmptyCells ){
                s.append('*');	
            } else {
                boolean needComma = false;
                for(int j = 0; j < index[i].length; j++){
                    if(index[i][j].getSelected() != 0){
                        if(needComma){
                            s.append(',');
                        }
                        s.append(j);
                        int count = countAdjacentCells(index[i],j);
                        if(count > 2){
                            // if more than 2 cells, use interval notation
                            s.append('-');
                            s.append(j + count - 1);
                            j += count-1;
                        }
                        needComma = true;
                    }
                }
            }
            s.append(')');
        }
    
        return s.toString();
    
    }

    static int countAdjacentCells(SelectionCell [] ind, int start){
        int count = 0;
        for(int i = start; i < ind.length; i++){
            if(ind[i].getSelected() == 0)
                return count;
            count++;
        }
        return count;
    }

    static int [][] parseCells(String cells, SelectionCell[][][] ind) throws Throwable{

        int[][] index = new int[ind.length][];
        for(int i = 0; i < ind.length; i++){
            index[i] = new int[ind[i].length];
        }
        try {
            StringTokenizer st = new StringTokenizer(cells,"(),-",true);
      
            while(st.hasMoreTokens()){
                String token = st.nextToken();	
                int layer = Integer.valueOf(token).intValue();
                if(layer < 0 || layer >= index.length)
                    throw new Throwable("illegal layer number: " + layer);
                parseLayer(st,index, layer);
            }
        } catch (Exception e){
            e.printStackTrace();      
        }
        return index;
    }

    static int [][][] parseCells_v2(String cells, SelectionCell[][][] ind) throws Throwable{

        int[][][] index = new int[ind.length][][];
        for(int i = 0; i < ind.length; i++){
            index[i] = new int[ind[i].length][];
            for(int j = 0; j < ind[i].length; j++){
                index[i][j] = new int[ind[i][j].length];
            }
        }
        try {

            StringTokenizer st = new StringTokenizer(cells,"(),-{}[]",true);
            if(!st.hasMoreTokens()){
                throw new Throwable("wrong cell notation");
            }
            String token = st.nextToken();	
            if(!token.equals("{")){
                throw new Throwable("wrong start of cell: \'" + token + "\'");
            }
            while(st.hasMoreTokens()){
                token = st.nextToken();	
                if("}".equals(token))
                    return index;
                if(!isNumber(token))
                    throw new Throwable("wrong expression of layer: \'" + token + "\'");
                int layer = Integer.valueOf(token).intValue();
                if(layer < 0 || layer >= index.length)
                    throw new Throwable("layer number: " + layer + " is out of bounds" );
                token = parseLayer_v2(st,index, layer);
                if("}".equals(token))
                    return index;
            }
        } catch (Exception e){
            e.printStackTrace();      
        }
        return index;
    }

    private static String parseLayer_v2(StringTokenizer st, int [][][] index, int layer) throws Throwable{
    
        //System.out.println("layer: " + layer);
        String str = st.nextToken();
        if(",".equals(str) || "}".equals(str)){
            // complete layer
            for(int i = 0; i < index[layer].length; i++){
                for(int k = 0; k < index[layer][i].length; k++){
                    index[layer][i][k] = 1;
                }
            }
            return str;
        }
        if(!"(".equals(str))
            throw new Throwable("illegal start of cell: \'" + str + "\' in layer " + layer );
      
        while(st.hasMoreTokens()){

            String token = st.nextToken();
            if(")".equals(token)){ // last complete cell 

                return token; // end of layer

            } else {

                if(!isNumber(token))
                    throw new Throwable("illegal cell expression \'" + token + "\' in layer " + layer);	  
                int cell = Integer.valueOf(token).intValue();
                if(cell >= 0 && cell < index[layer].length){
                    String lastToken = parseCell_v2(st,index,layer,cell);
                    if(")".equals(lastToken)){
                        return lastToken;
                    }
                } else {
                    throw new Throwable("cell number: " + cell + " in layer " + layer + " is out of bounds");
                }	
            }
        }        
        return "";
    }

    private static String parseCell_v2(StringTokenizer st, int [][][] index, int layer, int cell) throws Throwable{
    
        //System.out.println("cell: " + cell);
        String token = st.nextToken();
        if(",".equals(token) || ")".equals(token)){
            // complete cell 
            for(int i = 0; i < index[layer].length; i++){
                for(int k = 0; k < index[layer][cell].length; k++){
                    index[layer][cell][k] = 1;
                }
            }
            return token;
        }    

        if(!"[".equals(token))
            throw new Throwable("illegal start of subcell: \'" + token + "\'" + 
                                " in layer " + layer + " cell " + cell);
      
        while(st.hasMoreTokens()){

            token = st.nextToken();
      
            if("]".equals(token)){
                return "]";
            } else if(",".equals(token)){
                // do nothing
            } else {
                if(!isNumber(token))
                    throw new Throwable("illegal cell expression: \'" + token + "\' in layer " + layer);	  
                int subcell = Integer.valueOf(token).intValue();
                index[layer][cell][subcell] = 1;
            }
        }
        return "";
    }

    private static boolean isNumber(String str){
        for(int i =0; i < str.length();i++){
            if(str.charAt(i) < '0' || str.charAt(i) >'9')
                return false;
        }
        return true;
    }

    private static void parseLayer(StringTokenizer st, int [][] index, int layer) throws Throwable{

        String str = st.nextToken();
        if( ! "(".equals(str))
            throw new Throwable("illegal start of layer: " + str);      
        int lastCell = 0;
        while(st.hasMoreTokens()){
            String token = st.nextToken();
            if(")".equals(token)){
                return; // end of layer
            } else if(token.equals(",")){
                // do nothing 
            } else if(token.equals(" ")){
                // do nothing 
            } else if(token.equals("*")){
                // the whole layer
                for(int i = 0; i < index[layer].length; i++){
                    index[layer][i] = 1;
                }
            } else if(token.equals("-")){
                String nt = st.nextToken();
                int newCell = Integer.valueOf(nt).intValue();
                if(newCell < 0 || newCell >= index[layer].length){
                    throw new Throwable("illegal cell number: " + newCell + " in layer " + layer);
                } 
                for(int i = lastCell; i <= newCell; i++){
                    index[layer][i] = 1;	  
                }
                // interval 
            } else { // should be a number 
                lastCell = Integer.valueOf(token).intValue();
                if(lastCell >= 0 && lastCell < index[layer].length){
                    index[layer][lastCell] = 1;
                } else {
                    throw new Throwable("illegal cell number: " + lastCell + " in layer " + layer);
                }	
            }
        }
    
    }

    void doParseCells(){
        try {
            SelectionCell [][][] ind = canvas.getSelectionIndex_v2();
            String str = cellField.getText();
            if(str.length() == 0)
                str = "{}";
            int index[][][] = parseCells_v2(str, ind);
            canvas.setSelectedSubCells(index);
            int [][] cells = canvas.getCells();
            if(main != null)
                main.update(this,cells);
        } catch(Throwable ex){
            ex.printStackTrace(Output.out);
        }      
    }
    
    void doClearAll(){
        
        canvas.clearAll();
        cellField.setText("");
        int [][] cells = canvas.getCells();
        if(main != null)
            main.update(this,cells);
    }
    
    class CellsButtonListener implements ActionListener {
        
        public void actionPerformed(ActionEvent e) {
            doParseCells();
        }
    }
    
    class ClearButtonListener implements ActionListener {
        
        public void actionPerformed(ActionEvent e) {
            doClearAll();
        }
    }
    
    int oldLayer = -1;
    int oldCell = -1;
    class CanvasMouseMotion extends MouseMotionAdapter {
        
        public void mouseMoved(MouseEvent e){
            
            int[] cell = canvas.getCellUnderMouse(e.getX(), e.getY());
            
            if(cell == null){
                
                if(oldLayer != -1) {
                    //canvas.setInfo("");
                    canvas.setCursor(Cursor.getPredefinedCursor(Cursor.DEFAULT_CURSOR));
                    //statusField.setText("");
                    oldLayer = -1;
                }
            } else {
                if(oldLayer != cell[0] || oldCell != cell[1]){	  
                    SSCell ssc = canvas.getCellAt(cell[0], cell[1]);
                    if(ssc == null)
                        return;
                    int layer = cell[0];
                    int cindex = cell[1];
                    Vector lay = (Vector)canvas.allcells.elementAt(layer);
                    String info = "";
                    if(ssc.superCell != null){
                        info = "" + layer + "(" + lay.indexOf(ssc.superCell) + "["+ getIndex(ssc.superCell.subCells, ssc)+"]), " 
                            + ssc.getCellsCount() + " elem. cells"; 
                    } else {	    
                        info = "" + layer + "(" + lay.indexOf(ssc) + ")" + ", " + ssc.getCellsCount() + " elem. cells";
                    }
                    info = info + "[" + ssc.getNFacets()+","+ssc.getNVertices()+","+Fmt.fmt(ssc.getVolume(),6,8)+"]";
                    /*
                      ssc.getIndices() + "," + 
                      String info = 
                      "" + layer + 
                      "(" + 
                      cindex + 
	      
                      ")" +
                      //" sup.cell #" + supindex  + 
                      " (" + ssc.getCellsCount() + " cells)" + 
                      //ssc.getNFacets() + " facets, " + 
                      //ssc.getNVertices() + " vert. " + 
                      //ssc.getHandedness() + ")";
                      //" ind: " + ssc.getSCellIndex() + 
                      //" volume " + Fmt.fmt(ssc.getVolume(),8,7);
                      */
                    infoField.setText(info);
                    canvas.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
                    oldLayer = cell[0];
                    oldCell = cell[1];
                }
            }      
        }
    }

    class CPanelListener extends ComponentAdapter {
                
        public void componentResized(ComponentEvent e){
            Component comp = e.getComponent();
            adjustScrollbars();
        }
    }

    class SBHorizontalAdjustmentListener implements AdjustmentListener {

        public void adjustmentValueChanged(AdjustmentEvent e){

      
            int x = e.getValue();
            canvas.setOffsetX(-x);

        }
    }

    class SBVerticalAdjustmentListener implements AdjustmentListener {

        public void adjustmentValueChanged(AdjustmentEvent e){

            int y = e.getValue();
            canvas.setOffsetY(-y);

        }
    }

    static private GridBagConstraints gbc = new GridBagConstraints();

    static private int getIndex(Object[] array, Object obj){
        for(int i=0; i < array.length; i++){
            if(array[i] == obj)
                return i;
        }
        return -1;
    }

    @Override
    public PolygonDisplayNode findNode(String nodeID)
    {
        return this.main .findNode(nodeID);
    }

}

