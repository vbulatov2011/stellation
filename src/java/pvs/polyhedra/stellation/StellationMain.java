package pvs.polyhedra.stellation;
/**
   TO-DO 
   - edges at 3D view - really difficult 
   - Mathematica style ligthting - done
   - possibility to save and restore particular cells combinations - done
   - special marking for intresting points and lines on diagramm. - done
   - possibility to select all cells beneath current to make it "fully supported" - done
   - printing to Windows printer  - done 
   - saving to image file (?)
   - export to POV,VRML, STL. done 
   - color highlighting of cells - done
*/

import java.io.*;
import java.util.Enumeration;
import java.util.Vector;
import java.util.Hashtable;
import java.awt.*;
import java.awt.event.*;
import java.net.URL;
import java.applet.*;
import java.awt.image.BufferedImage;
import java.awt.geom.AffineTransform;
import java.util.StringTokenizer;
import javax.imageio.ImageIO;
import javax.swing.JFileChooser;
import javax.swing.filechooser.FileNameExtensionFilter;
import javax.swing.filechooser.FileFilter;
import java.util.prefs.Preferences;


import pvs.polyhedra.Stellation;
import pvs.polyhedra.Polyhedron;
import pvs.polyhedra.PolygonDisplay;
import pvs.polyhedra.Vector3D;
import pvs.polyhedra.SSCell;
import pvs.polyhedra.SFace;
import pvs.polyhedra.StellationCanvas;
import pvs.polyhedra.Plane;
import pvs.polyhedra.Symmetry;
import pvs.polyhedra.Matrix3D;

import pvs.utils.WindowOutputStream;
import pvs.utils.PVSObserver;
import pvs.utils.WindowUtils;
import pvs.utils.BorderPanel;
import pvs.utils.LabelBitmap;
import pvs.utils.QSort;
import pvs.utils.Comparator;
import pvs.utils.Fmt;
import pvs.utils.Arrays;

import pvs.Expression.VectorCalculator;

import pvs.utils.FixedStreamTokenizer;
import pvs.utils.Output;

import pvs.g3d.Model3D;
import pvs.g3d.Canvas3D;

import static pvs.utils.Output.printf;
import static pvs.utils.Output.print;
import static pvs.utils.Output.println;
import static pvs.utils.Output.fmt;
import static java.lang.Math.*;
import static pvs.polyhedra.stellation.Utils.transformVectors;
import static pvs.polyhedra.stellation.Utils.parsePlanes;
import static pvs.polyhedra.stellation.Utils.setFont;
import static pvs.polyhedra.stellation.Utils.getBoxTransform;
import static pvs.polyhedra.stellation.Utils.chop;
import static pvs.polyhedra.stellation.Utils.getPlanesString;
import static pvs.polyhedra.stellation.Utils.getString;
import static pvs.polyhedra.stellation.Utils.getCanonicalVectors;
import static pvs.polyhedra.stellation.Utils.planesToVectors;
import static pvs.polyhedra.stellation.Utils.vectorsToPlanes;

import static pvs.utils.WindowUtils.constrain;

/**
   main class for Stellation program 
 */
public class StellationMain implements PVSObserver{

    static final boolean DEBUG = true;
    static final String EXPORT_LENGTH_UNIT = "exportLengthUnit";

    static final String START = "Start!";
    static final String STOP = "Stop!";
    static final String LASTDIR_PROPERTY = "lastDir";
    static final double DEFAULT_EXPORT_LENGTH_UNIT = 0.01;

    Font m_font = new Font("Helvetica",Font.PLAIN,12);

    double m_exportLengthUnit = DEFAULT_EXPORT_LENGTH_UNIT; // unit of length (in meters) for export 


    String m_polySymmetry = "Ih";
    String m_stellationSymmetry = "I";

    static final int 
        SOURCE_POLY = 1,
        SOURCE_PLANES = 2;


    StellationData m_stelData;

    // what is source for stelation 
    int m_source = SOURCE_POLY;
    Stellation stellation = null;      
    Polyhedron polyhedron;
    String polyhedronName;
    int currentCategory = 0;
    int currentPoly = 3;

    Vector3D m_polyhedronPlanes[];
    //Vector3D m_canonicalPlanes[];
    Plane m_canonicalPlanes[];

    Vector allcells = null; // current Stellation cells 
    Vector subcells = null; // current Stellation subcells 
    SSCell[] currentCells; // currently selected cells 
    int [][] cellsIndex;   // indices of currently selected cells
    Model3D model3D = null;
    // set of currently visible cells
    int[][] cellIndex = new int[0][0];
    String stellationPath = NEW_FILE;


    String outType = "STL"; // what format to write Vrml2, POV, OFF

    boolean hasOutput = false;
    boolean printToWindow = false;
    boolean bShowDiagram = false;
    boolean bMakeCells = false;
    boolean bShowCells = false;


    static final String NEW_FILE = "stellation.stel";
    final static String EXT_STEL = ".stel";
    final static String EXT_BAK = ".bak";


    int maxIntersection = -1; // limit of intersections 
    int maxLayer = 1000; // limit number of layers
    int vertexUp = 0;
    int faceToShow = 0;
    int nFaces = 0;

    boolean bWriteCells = false;
    boolean bWriteLayers = false;
  
  
    ActionListener menuDispatcher  = new MenuDispatcher();
  
    static String MakeStellation = "Start";
    Button btnStart = new Button(MakeStellation);
    Button btnTest = new Button("test");
    Button btnTest1 = new Button("test1");

    // Menu File  
    MenuItem miOpen =  new MenuItem("Open...");
    MenuItem miSave =  new MenuItem("Save");
    MenuItem miSaveAs =  new MenuItem("Save As...");
    MenuItem miSaveAsPOV =  new MenuItem("Povray");
    MenuItem miSaveAsVRML = new MenuItem("VRML");
    MenuItem miSaveAsSTL = new MenuItem("STL");
    MenuItem miSaveAsDXF = new MenuItem("DXF");
    MenuItem miMakePlanes = new MenuItem("Make Planes");
    MenuItem miUndo = new MenuItem("Undo");
    MenuItem miClearAll = new MenuItem("Clear All");
    MenuItem miPrefereces = new MenuItem("Preferences");
    MenuItem miPrint3DModel = new MenuItem("Print 3D Model");
    MenuItem miVectorCalculator = new MenuItem("Vector Calculator");
    MenuItem miPolygonDisplay = new MenuItem("Polygon Display");

    MenuItem miPrintDiagram = new MenuItem("Print Diagram");
    MenuItem miSelectPolyhedron = new MenuItem("Select Polyhedron");  

    boolean viewCells = true, viewOutput = true, viewDiagram = true, m_view3D = true;

    CheckboxMenuItem miViewOutput = new CheckboxMenuItem("Output",viewOutput);
    CheckboxMenuItem miViewDiagram = new CheckboxMenuItem("Diagram", viewDiagram);
    CheckboxMenuItem miView3D = new CheckboxMenuItem("3D", m_view3D);
    CheckboxMenuItem miViewCells = new CheckboxMenuItem("Cells", viewCells);

    Button btnSelectPoly = new Button("Select...");

    MenuItem miConnectivityGraph = new MenuItem("Print Connectivity Graph");
    MenuItem miQuit = new MenuItem("Quit");

    Label polyName = new Label();

    Label polyInfoFaces = new Label();
    Label polyInfoVertices = new Label();
    Label polyInfoSymmetry = new Label();

    Image icon; 

    Choice choice_face = new Choice();
    Choice choice_symmetry = new Choice();
    TextField tfPolyName = new TextField(20);
    //Choice choice_category = new Choice();
    //Choice choice_poly = new Choice();
    Choice choice_vertexUp = new Choice();
    TextField tfMaxLayer = new TextField(5);

    StellationCanvas diagram = null;
    Frame frameDiagram = null;

    SelectionPanel selection = null;
    Frame frameSelection = null;

    Canvas3D m_canvas3D = null;
    Frame m_frame3D = null;

    Frame frameOutput;
    WindowOutputStream winStream;

    FrameClosingListener frameClosingListener = new FrameClosingListener();
    ViewListener viewListener = new ViewListener();

    LabelBitmap polyImage;
  
    Frame m_mainFrame;

    Dimension screen = Toolkit.getDefaultToolkit().getScreenSize();

    Thread thread = null;

    static String symnames[] = Symmetry.getSymmetryNames();
    PolyNames polyNames = new PolyNames();

    Applet applet;


    /**

       StellationMain

    */
    public StellationMain( String fname, String stellationSymmetry, Applet applet){

        this.stellationPath = fname;    
        this.m_stellationSymmetry = stellationSymmetry;
        this.applet = applet;

        m_mainFrame = new Frame(getFileName());
        Toolkit toolkit = Toolkit.getDefaultToolkit();
        try {
            icon = loadImageFromJar("/images/stellation_main.jpg");//toolkit.getImage(getClass().getResource(""));
        } catch(Exception e){
        }
        if(icon != null)
            m_mainFrame.setIconImage(icon);

        m_mainFrame.addWindowListener(new WindowListenerClass());
        createUI();
        m_mainFrame.pack();
        String jvendor = System.getProperty("java.vendor");
        String jversion = System.getProperty("java.version");
        println("java vendor: " + jvendor);
        println("java version: " + jversion);
        if(jvendor.indexOf("Microsoft") != -1){
            Dimension size = m_mainFrame.getPreferredSize();
            m_mainFrame.setBounds(0,0,size.width, size.height + 20);
            m_mainFrame.validate();
        }

        m_mainFrame.show();
    
        startStellationThread(null);
    
    }


    /**
       initUI

    */
    void createUI(){

        //Font font = new Font("Courier", Font.PLAIN, 14);
        setFont(m_mainFrame, m_font);

        //m_mainFrame.setFont(m_font);    
        m_mainFrame.setBackground(Color.lightGray);
        m_mainFrame.setPreferredSize(new Dimension(300,300));
        GridBagLayout gridbag = new GridBagLayout();

        m_mainFrame.setLayout(gridbag);

        //buttonLoad.addActionListener(this);
        btnStart.addActionListener(menuDispatcher);
        btnTest.addActionListener(menuDispatcher);
        btnTest1.addActionListener(menuDispatcher);
        //stopButton.addActionListener(this);
        //buttonExport.addActionListener(this);
        //buttonQuit.addActionListener(this);

        polyImage = new LabelBitmap(80,80);
    
        Font sfont = new Font("Serif",Font.BOLD,16);
        choice_symmetry.setFont(sfont);
        choice_face.setFont(sfont);
        choice_vertexUp.setFont(sfont);

        for(int i = 0; i < 10; i++){
            choice_face.addItem(fmt("%d",i));
            choice_vertexUp.addItem(fmt("%d",i));
        }

        choice_face.addItemListener(new FaceListener());
        choice_vertexUp.addItemListener(new VertexListener());

        btnSelectPoly.addActionListener(new OnSelectPolyhedron());

        initializePoly();

        choice_symmetry.addItemListener(new SymmetryListener());
        choice_symmetry.select(getSymmetryIndex(m_stellationSymmetry));

        Panel polyInfo = new   Panel();polyInfo.setLayout(gridbag);
        Panel polyInfo_1 = new Panel();//polyInfo_1.setLayout(gridbag);
        Panel polyInfo_2 = new Panel();polyInfo_2.setLayout(gridbag);

        //WindowUtils.constrain(polyInfo_1,polyImage,        0,0,1,1, gbc.NONE, gbc.CENTER,0.,0.,5,5,5,5);
        polyInfo_1.add("Center", polyImage);
        int c = 0;
        constrain(polyInfo_2,polyInfoFaces,    1,c++,1,1, gbc.HORIZONTAL, gbc.CENTER,1.,0.);
        constrain(polyInfo_2,polyInfoVertices, 1,c++,1,1, gbc.HORIZONTAL, gbc.CENTER,1.,0.);
        constrain(polyInfo_2,polyInfoSymmetry, 1,c++,1,1, gbc.HORIZONTAL, gbc.CENTER,1.,0.);
        constrain(polyInfo_2,btnSelectPoly,    1,c++,1,1, gbc.NONE, gbc.WEST,0.,0.);
        constrain(polyInfo,polyInfo_1,0,0,1,1,gbc.BOTH, gbc.CENTER,0.,0.,0,0,2,2);
        constrain(polyInfo,polyInfo_2,1,0,1,1,gbc.BOTH, gbc.CENTER,1.,0.,0,0,0,2);

        Panel buttons = new Panel();
        buttons.setLayout(new GridLayout(1,2,5,5));
        buttons.add(btnStart);
        //buttons.add(btnTest);
        //buttons.add(btnTest1);
        //buttons.add(stopButton);

        Panel panelMI = new Panel();
        panelMI.setLayout(gridbag);


        Panel panel_1 = new Panel(); panel_1.setLayout(gridbag);
        Panel panel_2 = new Panel(); panel_2.setLayout(gridbag);

        int count = 0;
        constrain(panel_1,tfPolyName,    0,0,1,1, gbc.HORIZONTAL, gbc.CENTER,1.,0.,0,0,0,0);
        constrain(panel_2,new Label("Symmetry ",Label.CENTER),  
                              0,1,1,1, gbc.HORIZONTAL, gbc.EAST,1.,0.,0,2,0,0);
        constrain(panel_2,choice_symmetry,          0,2,1,1, gbc.HORIZONTAL, gbc.NORTH,1.,1.,0,2,0,0);
        constrain(panel_2,new Label("Face ",Label.CENTER), 
                              1,1,1,1, gbc.HORIZONTAL, gbc.EAST,0.5,0.,0,2,0,0);
        constrain(panel_2,choice_face,              1,2,1,1, gbc.HORIZONTAL, gbc.NORTH,0.5,1.,0,2,0,0);

        constrain(panel_2,new Label("Vertex Up",Label.CENTER), 
                              2,1,1,1, gbc.HORIZONTAL, gbc.EAST,0.5,0.,0,2,0,0);
        constrain(panel_2,choice_vertexUp,              2,2,1,1, gbc.HORIZONTAL, gbc.NORTH,0.5,1.,0,2,0,0);

        c = 0;
        constrain(m_mainFrame, polyInfo, 0,c++,1,1, gbc.HORIZONTAL, gbc.NORTH,1.,0.);
        constrain(m_mainFrame, panel_1, 0,c++,1,1, gbc.HORIZONTAL, gbc.CENTER,1.,0.);
        constrain(m_mainFrame, panel_2, 0,c++,1,1, gbc.BOTH, gbc.CENTER,1.,1.);
        constrain(m_mainFrame, buttons, 0,c++,1,1, gbc.NONE, gbc.CENTER,0.,1.,5,5,5,5);

        m_mainFrame.setMenuBar(makeMenuBar());

        createSelectionFrame();
        createOutputStream();    

        setFont(m_mainFrame, m_font);

        //createMenu();

    }


    /**
     *
     *
     *
     */
    void initSymmetryUI(){

        choice_symmetry.removeAll();
        symnames = Symmetry.getSubgroups(m_polySymmetry);
        for(int i = 0; i < symnames.length; i++){
            choice_symmetry.addItem(symnames[i]);
        }

        choice_symmetry.select(m_stellationSymmetry);
          
    }

  
    MenuBar makeMenuBar(){

        MenuBar mb = new MenuBar();

        Menu mExport = new Menu("Export");
        mExport.add(miSaveAsSTL);    
        mExport.add(miSaveAsVRML);    
        mExport.add(miSaveAsPOV);
        mExport.add(miSaveAsDXF);

        Menu mFile = new Menu("File");        
        mFile.add(miOpen);
        mFile.add(miSave);
        mFile.add(miSaveAs);
        mFile.add(mExport);
        //mFile.add(miPreferences);
        mFile.addSeparator();

        mFile.add(miMakePlanes);
        mFile.add(miConnectivityGraph);
        mFile.addSeparator();
        mFile.add(miSelectPolyhedron);
        mFile.add(miPrintDiagram);
        mFile.add(miPrint3DModel);
        mFile.addSeparator();
        mFile.add(miVectorCalculator);
        mFile.add(miPolygonDisplay);

        mFile.addSeparator();
        mFile.add(miQuit);
    
        miOpen.addActionListener(menuDispatcher);
        miSave.addActionListener(menuDispatcher);
        miSaveAs.addActionListener(menuDispatcher);

        miSaveAsSTL.addActionListener(menuDispatcher);
        miSaveAsVRML.addActionListener(menuDispatcher);
        miSaveAsPOV.addActionListener(menuDispatcher);
        miSaveAsDXF.addActionListener(menuDispatcher);
        miMakePlanes.addActionListener(menuDispatcher);
        //miPreferences.addActionListener(this);
        miConnectivityGraph.addActionListener(menuDispatcher);
        miQuit.addActionListener(menuDispatcher);
        miPrintDiagram.addActionListener(new PrintDiagram());
        miPrint3DModel.addActionListener(new Print3DModel());
        miVectorCalculator.addActionListener(new OnVectorCalculator());
        miPolygonDisplay.addActionListener(new OnPolygonDisplay());
        miSelectPolyhedron.addActionListener(new OnSelectPolyhedron());

        Menu mEdit = new Menu("Edit");
        mEdit.add(miUndo);
        mEdit.add(miClearAll);
        miUndo.addActionListener(menuDispatcher);
        miClearAll.addActionListener(menuDispatcher);

        Menu mView = new Menu("View");

        mView.add(miViewDiagram);
        mView.add(miView3D);
        mView.add(miViewCells);
        mView.add(miViewOutput);

        miViewDiagram.addItemListener(viewListener);
        miView3D.addItemListener(viewListener);
        miViewCells.addItemListener(viewListener);
        miViewOutput.addItemListener(viewListener);
        
        mb.add(mFile);
        mb.add(mEdit);
        mb.add(mView);

        return mb;
    }



    /**
     
     */
    void createOutputStream(){

        winStream = new WindowOutputStream();
        Output.out = new PrintStream(winStream);
        frameOutput = winStream.getFrame();
        frameOutput.setVisible(viewOutput);
        frameOutput.addWindowListener(frameClosingListener);
        frameOutput.setLocation(0,screen.height/2);
        frameOutput.setSize(screen.width - screen.height/2,screen.height/2-30);
        frameOutput.validate();
        frameOutput.setTitle("output");
        if(icon != null)
            frameOutput.setIconImage(icon);

        Polyhedron.Out = Stellation.Out = Output.out;
        try {
            //System.setOut(Out);
            //System.setErr(Out);
        } catch (Exception e){
            println("failed call System.setOut()");
        }

    }

    /**
       create selection canvas 
    */
    void createSelectionFrame(){

        selection = new SelectionPanel(this);
        frameSelection = new Frame("Cells");
        frameSelection.addWindowListener(frameClosingListener);
        frameSelection.setBackground(Color.white);
        frameSelection.setLayout(new GridLayout(1,1));
        frameSelection.add(selection);
        frameSelection.setBounds(screen.width - screen.height,
                                 0,screen.height/2,screen.height/2);
        frameSelection.validate();
        frameSelection.show();
        if(icon != null)
            frameSelection.setIconImage(icon);
    
    }

    /**
       update PVSObserver's interface 
    
       callback function to inform, that something happens in cells or diagram panels 
    */
    public void update(Object who, Object what){

        if(who == selection) { // cell was selected in cells frame

            cellsIndex = (int [][]) what;
            showDiagram(cellsIndex);
      
        } else if (who == m_canvas3D){ // cell was selected from 3D model

     
            Object obj[] = (Object[])what;
            double center[] = (double[])obj[0];
            int options = ((Integer) obj[1]).intValue();
            double normal[] =  (double[])obj[2];
            double vertex[] =  (double[])obj[3];
            //println("center: " + center[0]+ ","+center[1]+ ","+center[2]+ ", opt: " + options);
            if((options & InputEvent.CTRL_MASK) == 0 && 
               (options & InputEvent.SHIFT_MASK) == 0 &&
               (options & InputEvent.ALT_MASK) == 0
               ){ // it was simple click 
                printf("normal:(%14.12f,%14.12f,%14.12f) vertex:(%14.12f,%14.12f,%14.12f)\n",
                       chop(normal[0]),chop(normal[1]),chop(normal[2]),
                       chop(vertex[0]),chop(vertex[1]),chop(vertex[2]));
                return;
            }
            boolean addCell = true;
            if((options & InputEvent.CTRL_MASK) != 0){
                addCell = true;
            }
            if((options & InputEvent.SHIFT_MASK) != 0){
                addCell = false;
            }
            int[] cindex = stellation.findCell(currentCells, new Vector3D(center), addCell); 

            if(cindex != null){	

                int[][] cellsIndex = selection.modifySelection(cindex, StellationCanvas.TOGGLE_TOP_CELL);
                showDiagram(cellsIndex);
                selection.initCellField();

            }

        } else {

            // face was selected from diagramm ??

            // face[0] will contain facet being clicked
            // face[1] contais combination action to perform
            // face[2] contais Vertex coordinates being clicked 
            int face = ((int[])what)[0];
            int action = ((int[])what)[1];
            //Vectro3D vertex = ((Vector3D)((Object [])what)[1]);

            int[] cindex = null;

            switch (action){

            case StellationCanvas.TOGGLE_BOTTOM_CELL:
            case StellationCanvas.TOGGLE_SUPPORTING_CELLS:
            case StellationCanvas.ADD_SUPPORTING_CELLS:
            case StellationCanvas.SUB_SUPPORTING_CELLS:
                // 1 if we want it to be top face
                cindex = stellation.findCell(subcells, faceToShow, face, 1);	
                break;
            case StellationCanvas.TOGGLE_TOP_CELL:
                // 0 if we want it to be bottom face
                cindex = stellation.findCell(subcells, faceToShow, face, 0);		
                break;
            }
      
            if(cindex != null){
	
                int[][] cellsIndex = selection.modifySelection(cindex, action);
                showDiagram(cellsIndex);

                /*
                  cellsIndex = makeNewCellIndex(cindex);
                  selection.setSelection(cellsIndex);
                  showDiagram(cellsIndex);
                */
                selection.initCellField();
            }
        }
    }
  
    /**
       makeNewCellIndex
    
    */
    int[][] makeNewCellIndex(int[] cindex){

        for(int i = 0; i <  cellIndex.length; i++){
            if((cellIndex[i][0] == cindex[0]) && 
               (cellIndex[i][1] == cindex[1])){
                // remove given cell from array
                int[][] nindex = new int[cellIndex.length - 1][];
                for(int k = 0; k < i; k++){
                    nindex[k] = cellIndex[k];
                }
                for(int k = i; k < cellIndex.length-1; k++){
                    nindex[k] = cellIndex[k+1];
                }
                return nindex;
            }
        }
    
        // add new cell to array    
        int[][] nindex = new int[cellIndex.length+1][];
        for(int k = 0; k < cellIndex.length; k++){
            nindex[k] = cellIndex[k];
        }
        nindex[cellIndex.length] = cindex;
        return nindex;
    }
  
    public void doTest(){

        stellation = new Stellation(planesToVectors(m_canonicalPlanes),m_polySymmetry,maxIntersection);
        nFaces = stellation.faces.length;
        allcells = stellation.makeCells2(m_polySymmetry, m_stellationSymmetry, maxLayer);

        initSubcells();

    }

    public void doTest1(){

        for(int k = 0; k < allcells.size(); k++){    
            printf("%2d:", k);
            Vector layer = (Vector)allcells.elementAt(k);      
            SSCell array[] = new SSCell[layer.size()];
            layer.copyInto(array);
            Arrays.sort(array, 0,array.length, (Comparator)array[0]);
      
            //QSort.quickSort(layer,0,layer.size()-1,(SSCell)layer.elementAt(0));
            //for(int i=0; i < layer.size(); i++){    
            for(int i=0; i < array.length; i++){
                //SSCell scell = (SSCell)layer.elementAt(i);
                SSCell scell = array[i];
                print(scell.cells.length + ".");
                print(scell.getNFacets() + ".");
                print(scell.getNVertices() + " ");
            }
            println("");
        }
    }


    void createSubcells(Vector cells, String symmetry){
    
        for(int l = 0; l < cells.size(); l++){
            Vector layer = (Vector)cells.elementAt(l);
            for(int c = 0; c < layer.size(); c++){
                SSCell cell = (SSCell)layer.elementAt(c);
                cell.setSubCells(Stellation.makeSymmetricalSubCells(cell, symmetry));	
            }
        }    
    }

    void initSubcells(){

        subcells = makeSubcells(allcells);
        stellation.makeConnectivityGraph(subcells);
        /*
          int[] layers = new int[allcells.size()];
          for(int i =0; i < allcells.size(); i++){
          layers[i] = ((Vector)allcells.elementAt(i)).size();
          }
        */
        selection.setArray(allcells, subcells);

        showDiagram(new int[0][0]);
        diagram.init();

        choice_face.removeAll();
        if(stellation.getFaces().length > 0) {
            Integer [] findex = stellation.getNonEquivalentFaces(m_stellationSymmetry);
            if(findex.length > 1){
                for(int i = 0; i < findex.length; i++){
                    choice_face.addItem(findex[i].toString());
                }
                choice_face.setEnabled(true);
            } else {
                choice_face.setEnabled(false);
            }
        }
    }

    /**
       createMenu
    
    */
    void createMenu(){

        MenuBar menubar = new MenuBar();
    
        Menu file = new Menu("File", true);
        file.add("Load...");
        file.add("Quit");
    
        Menu help = new Menu("Help", true);
        help.add("About...");
    
        menubar.add(file);
        menubar.add(help);
    
        //setMenuBar(menubar);

    }


    JFileChooser jDialogOpen;
    //String m_fileChooserDir = ".";
    Dimension m_fileChoserSize = new Dimension(500, 500);

    String getOpenPathJ(){

        if(jDialogOpen == null){
            
            Preferences prefs = Preferences.userNodeForPackage(StellationMain.class);
            String lastDir = prefs.get(LASTDIR_PROPERTY, null);            
            if(lastDir == null) lastDir = "";
            jDialogOpen = new JFileChooser(lastDir);            
            FileFilter stelFilter = new FileNameExtensionFilter("Stellation files", "stel");
            jDialogOpen.setFileFilter(stelFilter);
            setFont(jDialogOpen, m_font);
        }

        jDialogOpen.setPreferredSize(m_fileChoserSize);
        int returnVal = jDialogOpen.showDialog(m_mainFrame, "Open File");
        m_fileChoserSize = jDialogOpen.getSize();
        String dir = jDialogOpen.getCurrentDirectory().getAbsolutePath();
        Preferences.userNodeForPackage(StellationMain.class).put(LASTDIR_PROPERTY, dir);
        
        if (returnVal == JFileChooser.APPROVE_OPTION) {
            
            File file = jDialogOpen.getSelectedFile();            
            return file.getPath();            
        } 
        return null;            
            
    }

    String getSaveAsPathJ(){

        if(jDialogOpen == null){

            Preferences prefs = Preferences.userNodeForPackage(StellationMain.class);
            String lastDir = prefs.get(LASTDIR_PROPERTY, null);            
            if(lastDir == null) lastDir = "";
            jDialogOpen = new JFileChooser(lastDir);            
            FileFilter stelFilter = new FileNameExtensionFilter("Stellation files", "stel");
            jDialogOpen.setFileFilter(stelFilter);
        }

        jDialogOpen.setPreferredSize(m_fileChoserSize);
        int returnVal = jDialogOpen.showSaveDialog(m_mainFrame);
        m_fileChoserSize = jDialogOpen.getSize();
        String dir = jDialogOpen.getCurrentDirectory().getAbsolutePath();
        Preferences.userNodeForPackage(StellationMain.class).put(LASTDIR_PROPERTY, dir);
        
        if (returnVal == JFileChooser.APPROVE_OPTION) {
            
            File file = jDialogOpen.getSelectedFile();            
            return file.getPath();            
        } 
        return null;            

    }


    FileDialog dialogOpen;
    String getOpenPathFD(){
        if(dialogOpen == null){
            dialogOpen = new FileDialog(WindowUtils.getMainWindow(m_mainFrame), 
                                              "Open Polyhedron", FileDialog.LOAD);
            
            dialogOpen.setFile("*.stel;");
            //file_load_dialog.setFilenameFilter(new ExtensionFilter(new String[]{".stel"}));
        }

        dialogOpen.pack();
        dialogOpen.show(); 
    
        String name = dialogOpen.getFile();
        String dir = dialogOpen.getDirectory();
        if(name != null) 
            return dir + name;
        else 
            return null;
    }

    /**
       Polyhedron readOffFile(String fname)
    */
    Polyhedron readOffFile(String fname){
    
        Polyhedron poly = new Polyhedron();
        try {
            //Class cl = getClass();
            //ClassLoader cll = cl.getClassLoader();
            //System.out.println("CLASS: " + cl + " LOADER: " + cll);     
            //URL url = getClass().getResource("/images/off/" + fname+".off");
            //System.out.println("URL: " + url);
            //InputStream f = url.openStream();

            //String fullname = "/images/off/" + fname+".off";
            String fullname = "/images/off/" + fname+".gif";
            InputStream f = null;
            try {
                f = getClass().getResourceAsStream(fullname);
            } catch (Exception e){
                printf("getClass().getResourceAsStream(%s) failed\n", fullname);
            }
            try {
                if(f == null && applet != null){	  
                    InputStream ff = getClass().getResourceAsStream("/images/poly/"+fname+"_tmb.gif");
                    if(ff != null){
                        //System.out.println("/images/poly/"+fname+"_tmb.gif opened");
                    }
                    fullname = "images/off/" + fname+".off";
                    URL url = new URL(applet.getDocumentBase(), fullname);
                    println("opening: " + url);
                    f = url.openStream();
                }
            } catch (Exception e){
                println("URL.openStream(" + fullname +") failed");	
            }
            if(f != null) {
                poly.readOFF(f);
                poly.makeCCW();        
                poly.printVertices(Output.out);
                f.close();
            }
        } catch(Exception e){
            e.printStackTrace(Output.out);
        }
        return poly;

    }


    /**
       readFile

    */
    void readFile(String fname){
    
        Polyhedron poly = new Polyhedron();
        if(fname.endsWith(".off")){
            try {
                FileInputStream f = new FileInputStream(fname);
                poly.readOFF(f);
                poly.makeCCW();
                f.close();
            } catch(Exception e){
                e.printStackTrace(Output.out);
                return;
            }        
            println("read " + fname + " OK");Output.out.flush();    
            stellation = new Stellation(poly,maxIntersection);
            nFaces = poly.ifaces.length;
        } else {      
            Vector3D[] vectors = Stellation.readVectors(fname);
            nFaces = vectors.length;
            println(fname+" read OK");Output.out.flush();
            stellation = new Stellation(vectors,maxIntersection);      
        }
    }
   
    /**
       showDiagram

    */
    void showDiagram(int [][] st){

        try {
            cellIndex = st;
            SSCell[] cells = stellation.getStellation(subcells,st);
            Object[][] facets = stellation.getStellationDiagram(cells, faceToShow);
      
            if(stellation.getFaces().length == 0){
                println("Can't make stellation!");
                return; // something wrong
            }
      
            diagram = stellation.showStellationDiagram(facets,
                                                       Stellation.makeStellationName(st),
                                                       faceToShow, vertexUp, m_stellationSymmetry, diagram);
            if(frameDiagram == null){
        
                diagram.addObserver(this);    
                frameDiagram = diagram.getFrame();
                frameDiagram.addWindowListener(frameClosingListener);
                frameDiagram.setBounds(screen.width - screen.height/2,
                                       screen.height/2,screen.height/2,screen.height/2-30);
                frameDiagram.validate();
                frameDiagram.setTitle("Diagram");
                if(icon != null)
                    frameDiagram.setIconImage(icon);
            }
            showModel(cells);
        } catch(Exception e){
            e.printStackTrace();
        }
    }

    /**
       displays 
    */
    void showModel(SSCell[] cells){
    
        currentCells = cells;
        Polyhedron poly = stellation.getPolyhedron(cells);
        double[] vert = new double[poly.vertices.length*3];
        for(int i = 0, j =0; i < poly.vertices.length; i++){
            Vector3D v = poly.vertices[i];
            //Out.println(v);
            vert[j++] = v.x;
            vert[j++] = v.y;
            vert[j++] = v.z;
        }
    
        int[][] faces = new int[poly.ifaces.length][];
        for(int i = 0; i < faces.length; i++){
            faces[i] = new int[poly.ifaces[i].length];
            for(int j = 0; j < faces[i].length; j++){
                faces[i][j] = poly.ifaces[i][j]*3;  
            }
        }
        //int[][] edges = new int[poly.edges.length][2];
        int[][] edges = new int[0][2];
        for(int i = 0; i < edges.length; i++){
            edges[i][0] = poly.edges[i][0]*3;
            edges[i][1] = poly.edges[i][1]*3;
        }

        //Out.println("poly has edges: " + poly.edges.length);

        model3D = new pvs.g3d.Stellation3D(vert,faces,edges,poly.colors,poly.icolor,
                                           m_stellationSymmetry, m_polyhedronPlanes);

        if(m_canvas3D == null){
            m_frame3D = new Frame("3D view");
            m_frame3D.addWindowListener(frameClosingListener);
            m_frame3D.setBackground(Color.white);
            m_canvas3D = new Canvas3D(model3D);
            m_canvas3D.Out = Output.out;
            m_canvas3D.setObserver(this);
            m_frame3D.add("Center",m_canvas3D);
            m_frame3D.setBounds(screen.width - screen.height/2,
                              0,screen.height/2,screen.height/2);
            m_frame3D.validate();
            m_frame3D.show();
            if(icon != null)
                m_frame3D.setIconImage(icon);
        } 
            
        if(false)printf("m_canvas3D.setModel(%s)\n", model3D);
        m_canvas3D.setModel(model3D);
        
    
    }


    public void stopStellationThread(){

        if(thread.isAlive()){
            thread.stop();
        }
        btnStart.setLabel(MakeStellation);

    }
        
    public void startStellationThread(String cellsToSet){

        thread = new Thread(new StellationThread(cellsToSet));
        thread.setPriority(Thread.MIN_PRIORITY); 
        thread.start();
    
    }


    /** -----------------------------------------------------------------
     *
     *   run()  creates stellation 
     *
     *
     */
    class StellationThread implements Runnable {

        String cellsToSet;

        StellationThread(String cells){
            this.cellsToSet = cells;
        }
        public void run(){
      
            btnStart.setLabel(STOP);
                  
            if(DEBUG)println("stellationSymmetry: " + m_stellationSymmetry);

            int mi = 0;
            try {
                mi = Integer.valueOf(tfMaxLayer.getText()).intValue();
            } catch (Exception e){
            }
            if(mi > 0){
                maxLayer = mi;
            }
            //readFile(fname);
            //Out.println();
            if(DEBUG) printf("making new Stellation() m_canonicalPlanes: %d\n", m_canonicalPlanes.length);
            stellation = new Stellation(planesToVectors(m_canonicalPlanes),m_polySymmetry,maxIntersection);
            nFaces = stellation.faces.length;
            
      
            allcells = stellation.makeCells2( m_polySymmetry, m_stellationSymmetry, maxLayer);
      
            initSubcells();
      
            btnStart.setLabel(START);

            if(cellsToSet != null)
                selection.setCells(cellsToSet);        
            m_canvas3D.doFit();
            
        }
    } // class StellationThread

    public void doAbout(){

        AboutDialog d = new AboutDialog(m_mainFrame,"Stellation",true);
        d.pack();
        d.show();

    }

    /**
     *
     *
     *
     */
    void initializePoly(){

        switch(m_source){

        case SOURCE_PLANES: 

            polyImage.setImage(loadImageFromJar("/images/stellation_main.jpg"));  
            polyInfoFaces.setText(   "faces:    " + m_polyhedronPlanes.length);
            polyInfoVertices.setText("symmetry: " + m_polySymmetry);
            polyInfoSymmetry.setText("");
            tfPolyName.setText("user defined planes");
            initSymmetryUI();
            break;

        case SOURCE_POLY:
            
            polyhedronName = polyNames.name(currentCategory,currentPoly);
            String fname = polyNames.fname(currentCategory,currentPoly);
            Image image = null;
            try {
                image = loadImageFromJar("/images/poly/"+fname+"_tmb.gif");
            } catch (Exception e){
                e.printStackTrace(Output.out);
            }
            polyImage.setImage(image);  
      
            polyhedron = readOffFile(fname);
            if(m_polySymmetry == null){
                m_polySymmetry = polyNames.symmetry(currentCategory,currentPoly);
                m_stellationSymmetry = m_polySymmetry;
            }

            initSymmetryUI();
            
            m_polyhedronPlanes = makePolyhedronPlanes(polyhedron);
            m_canonicalPlanes = vectorsToPlanes(getCanonicalVectors(m_polyhedronPlanes, m_polySymmetry));
            if(DEBUG) printf("m_polyhedronPlanes: %d\n", m_polyhedronPlanes.length);
            if(DEBUG) printf("m_canonicalPlanes: %d\n", m_canonicalPlanes.length);
            polyInfoFaces.setText(   "faces:    " + polyhedron.ifaces.length);
            polyInfoVertices.setText("vertices: " + polyhedron.vertices.length);
            polyInfoSymmetry.setText("symmetry: " + m_polySymmetry);
            tfPolyName.setText(polyhedronName);
            break;
        }

    }
  
    public void doQuit(){

        try {
            //frame.close();
            m_mainFrame.dispose();
            //m_frame3D.close();
            m_frame3D.dispose();
            //frameOutput.close();
            frameOutput.dispose();
            //frameSelection.close();
            frameSelection.dispose();
            //frameDiagram.close();
            frameDiagram.dispose();      
        } catch(Exception ex){
            ex.printStackTrace();
        }      
        System.exit(0);
    }

    FileDialog dialogExport;

    public void doExport(String outType){

        try {

            OutputStream f = null;
            String exportPath = "";

            if(dialogExport  == null){
                dialogExport = new FileDialog(WindowUtils.getFrame(m_mainFrame), "export polyhedron as", FileDialog.SAVE);
            }
            
            dialogExport.setTitle("Export Polyhedron as " + outType);
            
            if(outType.equals("VRML")){
                dialogExport.setFile(getFileName()+".wrl");
            } else if(outType.equals("POVRAY")){
                dialogExport.setFile(getFileName()+".pov");
            } else if(outType.equals("STL")){
                dialogExport.setFile(getFileName()+".stl");
            } else if(outType.equals("DXF")){
                dialogExport.setFile(getFileName()+".dxf");
            }
            dialogExport.show();
            
            if(dialogExport.getFile() == null)
                return;
            String fName = dialogExport.getFile();
            String dName = dialogExport.getDirectory();
            
            exportPath = dName + fName;
            
            File file = new File(exportPath);
            f = new FileOutputStream(file);
            if(DEBUG)printf("saving polyhedron to %s\n",exportPath);
                  
            // save to stream 
            Polyhedron poly = stellation.getPolyhedron(currentCells);
            poly.scale(m_exportLengthUnit);

            if(DEBUG)printf("   polyhedron scaled by factor %9.5f\n",m_exportLengthUnit);

            String[] desc;
            switch(m_source){
            default: 
            case SOURCE_PLANES:
                desc = new String[]{
                    "polyhedron stellation generated from set of planes", 
                    "  planes: " + getPlanesString(m_canonicalPlanes),
                    "  symmetry: " + m_polySymmetry + " / " + m_stellationSymmetry,
                    "  cells: " + selection.getCells(),
                    "  exported from Stellation Program by Vladimir Bulatov", 
                    "  http://bulatov.org/polyhedra/stellation_applet/index.html" 
                };
                break;                
            case SOURCE_POLY:
                desc = new String[]{"polyhedron: " + polyhedronName, 
                                    "  symmetry: " + m_polySymmetry + " / " + m_stellationSymmetry,
                                    "  cells: " + selection.getCells(), 
                                    "  exported from Stellation Program by Vladimir Bulatov", 
                                    "  http://bulatov.org/polyhedra/stellation_applet/index.html" 
                };
                break;
            }

            if(DEBUG)printf("   init poly data \n");

            poly.setDescription(desc);
            poly.outFaces = true;
            poly.outEdges = true;
            poly.outVertices = true;
            poly.outColor = false;

            if(DEBUG)printf("start export\n");
            PrintStream ps = new PrintStream(f);
            if(outType.equals("POVRAY")){
                poly.writePOV(ps);
            } else if(outType.equals("VRML")){
                poly.writeVrml(ps);	
            } else if(outType.equals("STL")){
                poly.writeSTL(ps);	
            } else if(outType.equals("DXF")){
                poly.writeDXF(ps);	
            }
            if(DEBUG)printf("end export\n");
            ps.close();

            writeThumbnail(exportPath + ".png");
            if(f != Output.out){
                f.close();
            } else {
                Output.out.println("---------end of polyhedron");
            }
        } catch (Exception e){          
        }    
    }
    
    /**
     *
     *
     */
    public void save(){

        if(stellationPath == NEW_FILE){
            saveAs();
            return;
        }
        if(!stellationPath.endsWith(EXT_STEL))
            stellationPath = stellationPath + EXT_STEL;
        //TO-DO saving here 
        Output.out.println("saving stellation: " + stellationPath);
    
        String bakName = stellationPath+EXT_BAK;
        File bak = new File(bakName);
        bak.delete();
        File curFile = new File(stellationPath);
        if(curFile.exists()){
            boolean res = curFile.renameTo(new File(bakName));
        }
    
        File file = new File(stellationPath);
    
        try {      
            OutputStream out = new FileOutputStream(file);
            PrintWriter pw = new PrintWriter(out);
          
            switch(m_source){
            case SOURCE_PLANES:                
                pw.println("// stellation generated from a set of planes");
                pw.println("// exported from Stellation Program by Vladimir.Bulatov@gmail.com"); 
                pw.println("planes \"" + getPlanesString(m_canonicalPlanes) + "\"");
                break;
            case SOURCE_POLY:                
                pw.println("// stellation generated from polyhedron " + polyhedronName);
                pw.println("// exported from Stellation Program by Vladimir.Bulatov@gmail.com"); 
                pw.println("polyhedron \"" + polyhedronName  + "\""); 
            }    
            pw.printf("symmetry \"%s/%s\"\n", m_polySymmetry, m_stellationSymmetry);
            pw.printf("cells \"%s\"\n", selection.getCells());
            pw.printf("exportLengthUnit \"%s\"", getString(m_exportLengthUnit));

            pw.close();
        } catch(Exception e){
            e.printStackTrace();
        }
        writeThumbnail(stellationPath+".png");

    }

    FileDialog dialogSave;
    public void saveAs(){
        
        stellationPath = getSaveAsPathJ();
        stellationPath.replace('\\', '/');
        save();

    }

    String getSaveAsPath(){

        if(dialogSave == null){
            dialogSave = new FileDialog(WindowUtils.getFrame(m_mainFrame), "save stellation", FileDialog.SAVE);
        }
        dialogSave.setTitle("save stellation");
        dialogSave.setFile(getFileName());
        dialogSave.show();
    
        if(dialogSave.getFile() == null)
            return null;
        
        return dialogSave.getDirectory() + dialogSave.getFile();
    }

    /**
     *
     *  read stellationg file 
     *
     */ 
    FileDialog fileOpenDialog;

    /**
     *
     *
     *
     */
    public void onOpen(){

        String path = getOpenPathJ();
        //String path = getOpenPathFD();

        if(path == null)
            return;
        
        stellationPath = path;
        m_mainFrame.setTitle(getFileName());

        printf("\nreading stellation file: %s\n\n",stellationPath);

        try {

            FileInputStream inp = new FileInputStream(stellationPath);
      
            Reader r = new BufferedReader(new InputStreamReader(inp));
      
            FixedStreamTokenizer st = makeStreamTokenizer(r);
            String planes = null;
            String polyhedron = null;
            String cells = null;
            String symmetry = null;
            String exportLengthUnit = null;
            
            while(st.nextToken() != st.TT_EOF){	
	
                switch(st.ttype){
	  
                case StreamTokenizer.TT_WORD:
	  
                    if(st.sval.equalsIgnoreCase("polyhedron")){
                        st.nextToken();
                        polyhedron = st.sval;
                    } else if(st.sval.equalsIgnoreCase("cells")){
                        st.nextToken();
                        cells = st.sval;
                    } else if(st.sval.equalsIgnoreCase("symmetry")){
                        st.nextToken();
                        symmetry = st.sval;
                    } else if(st.sval.equalsIgnoreCase("planes")){
                        st.nextToken();
                        planes = st.sval;
                    } else if(st.sval.equalsIgnoreCase(EXPORT_LENGTH_UNIT)){
                        st.nextToken();
                        exportLengthUnit = st.sval;
                    } else {
                        
                        println("line: " + st.lineno());
                        println("wrong parameter in stellation: \"" + st.sval+"\"");
	    
                    }	
                    break;
                default: // should not happens 
                    Output.out.println("line: " + st.lineno());
                    Output.out.println("wrong character in stellation: \"" + (char)st.ttype+"\"");
                    break;
                }
            }	

            inp.close();
      
            println("planes:" + planes);
            println("polyhedron: " + polyhedron);
            println("symmetry: " + symmetry);
            println("cells: " + cells);
            println("exportLengthUnit: " + exportLengthUnit);
            
            if(polyhedron != null){

                printf("using polyhedron: %s\n",polyhedron);
                m_source = SOURCE_POLY;
                int [] cat = PolyNames.findPolyByName(polyhedron);
                if(cat == null){
                    printf("can't find polyheddron by name: %s\n", polyhedron);
                    return;
                }
        
                Output.out.println("found: " + cat[0] + ", " + cat[1]);
                currentCategory = cat[0];
                currentPoly = cat[1];
	
            } else if(planes != null){      
                m_source = SOURCE_PLANES;
                printf("using planes: %s\n", planes);                
                m_canonicalPlanes = parsePlanes(planes);
                //m_polyhedronPlanes = transformVectors(planesToVectors(m_canonicalPlanes),m_polySymmetry);
                if(DEBUG){
                    printf("parsed planes: %d\n",m_canonicalPlanes.length);
                    for(int i = 0; i < m_canonicalPlanes.length; i++){
                        printf("%s\n",m_canonicalPlanes[i]);
                    }
                }
            } else {
                printf("****no polyhedron or planes was found in the file******* - ignorng\n");
                return;
            }

            if(exportLengthUnit != null){
                m_exportLengthUnit = Double.parseDouble(exportLengthUnit);
            } else {
                m_exportLengthUnit = DEFAULT_EXPORT_LENGTH_UNIT;
            }
                
            setSymmetry(symmetry);
            initializePoly();
            startStellationThread(cells);

        } catch(Exception e){

            e.printStackTrace();

        }   
    }

    /**
     *
     *  it takes string of kind "Ih / I"   
     *
     */ 
    void setSymmetry(String symmetry){


        StringTokenizer st = new StringTokenizer(symmetry, " /", false);
        m_polySymmetry = st.nextToken();
        m_stellationSymmetry = st.nextToken();
        initSymmetryUI();
    
    }



    /**
     *
     *
     */
    class MenuDispatcher implements ActionListener {

        public void actionPerformed(ActionEvent e){
      
            String what = e.getActionCommand();
      
            if(what.equals(miOpen.getLabel())){
                onOpen();      
            } else if(what.equals("Quit")){
                doQuit();
            } else if(what.equals("About...")){
                doAbout();
            } else if(what.equals(miSaveAsSTL.getLabel())){
                doExport("STL");      
            } else if(what.equals(miSaveAsVRML.getLabel())){
                doExport("VRML");      
            } else if(what.equals(miSaveAs.getLabel())){
                saveAs();      
            } else if(what.equals(miSave.getLabel())){
                save();      
            } else if(what.equals(miSaveAsPOV.getLabel())){
                doExport("POVRAY");
            } else if(what.equals(miSaveAsDXF.getLabel())){
                doExport("DXF");
            } else if(what.equals(miUndo.getLabel())){
                selection.doUndo();
            } else if(what.equals(miClearAll.getLabel())){
                selection.doClearAll();
            } else if(what.equals(miMakePlanes.getLabel())){
                doMakePlanes(); 
            } else if(what.equals(miConnectivityGraph.getLabel())){
                printConnectivityGraph();
            } else if(what.equals("Stop")){
                stopStellationThread();
            } else if(what.equals(MakeStellation)){
                startStellationThread("");
            } else if(what.equals(btnTest.getLabel())){
                doTest();
            } else if(what.equals(btnTest1.getLabel())){
                doTest1();
            }
        }
    }

    /**
     *  doMakePlanes()
     */

    DlgPlanes dlgPlanes;
  
    void doMakePlanes(){

        if(dlgPlanes == null)
            dlgPlanes = new DlgPlanes(m_canonicalPlanes, m_polySymmetry);
        else 
            dlgPlanes.setPlanes(m_canonicalPlanes, m_polySymmetry);

        if(!dlgPlanes.edit(m_mainFrame))
            return;

        stellationPath = NEW_FILE;


        m_polySymmetry = dlgPlanes.getSymmetry();
        m_stellationSymmetry = m_polySymmetry;
        m_canonicalPlanes = dlgPlanes.getGeneratingPlanes();
        m_polyhedronPlanes = transformVectors(planesToVectors(m_canonicalPlanes),m_polySymmetry);

        initSymmetryUI();
        m_source = SOURCE_PLANES;
        initializePoly();
        startStellationThread(null);

    }

    void printConnectivityGraph(){

        Output.out.println("\nConnectivity Graph:");

        for(int layer = 0; layer < subcells.size(); layer++){

            Vector slayer = (Vector)subcells.elementAt(layer);
      
            for(int ind = 0; ind < slayer.size(); ind++){
                SSCell cell = (SSCell)slayer.elementAt(ind);
                Output.out.print(layer + "." + ind +": (");
                for(int i = 0; i < cell.bottom.size(); i++){
                    SSCell c = (SSCell)cell.bottom.elementAt(i);
                    Output.out.print(c.layer + "." + c.index + " ");
                }
                Output.out.print(") (");
                for(int i = 0; i < cell.top.size(); i++){
                    SSCell c = (SSCell)cell.top.elementAt(i);
                    Output.out.print(c.layer + "." + c.index + " ");
                }
                Output.out.println(")");
            }      
        }
    }

    Vector makeSubcells(Vector cells){

        subcells = new Vector();    
        int nlayers = cells.size();
        for(int l = 0; l < nlayers; l++){
            Vector layer = (Vector)cells.elementAt(l);
            Vector sublayer = new Vector();
            for(int c = 0; c < layer.size();c++){
                SSCell cell = (SSCell)layer.elementAt(c);
                if(cell.subCells != null){
                    for(int s = 0; s < cell.subCells.length; s++){
                        sublayer.addElement(cell.subCells[s]);
                    }
                }
            }
            subcells.addElement(sublayer);
        }
        return subcells;
    }

    class SymmetryListener implements ItemListener {
    
        public void itemStateChanged(ItemEvent e){
      
            if(e.getStateChange()== ItemEvent.SELECTED){	
                m_stellationSymmetry = (String)choice_symmetry.getSelectedItem();
                createSubcells(allcells,m_stellationSymmetry);
                initSubcells();
                println("symmetry changed: " + m_stellationSymmetry);
            }
        }
    }

    class FaceListener implements ItemListener {

        public void itemStateChanged(ItemEvent e){

            if(e.getStateChange()== ItemEvent.SELECTED){
                faceToShow = Integer.parseInt(choice_face.getSelectedItem());
                showDiagram(cellIndex); 
            }
        }
    }

    class VertexListener implements ItemListener {

        public void itemStateChanged(ItemEvent e){

            if(e.getStateChange()== ItemEvent.SELECTED){
                vertexUp = Integer.parseInt(choice_vertexUp.getSelectedItem());
                showDiagram(cellIndex); 
            }
        }
    }

    class WindowListenerClass extends WindowAdapter {

        public void windowClosing(WindowEvent e){
            doQuit();
        }    

        public void windowIconified(WindowEvent e){
            m_frame3D.hide();
            frameSelection.hide();
            frameOutput.hide();
            frameDiagram.hide();
        }

        public void windowDeiconified(WindowEvent e){
            m_frame3D.show(m_view3D);
            frameSelection.setVisible(viewCells);
            frameOutput.show(viewOutput);
            frameDiagram.show(viewDiagram);
        }
    }

    /**
     */
    Image loadImageFromJar(String imageName) {
    
        Toolkit tk = Toolkit.getDefaultToolkit();
        byte bytebuf[] = null;


        bytebuf = null;
        int n;
        try {
            InputStream is = getClass().getResourceAsStream(imageName);
            if (is == null) {
                Output.out.println("ImageLoader.loadFromJar getResourceAsStream failed on " + imageName);
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
            Output.out.println("ImageLoader.loadFromJar: " + imageName + " not found.");
            return null;
        }
        if (bytebuf.length == 0) {
            Output.out.println("ImageLoader.loadFromJar: " + imageName + " is zero-length");
            return null;
        }
        //Output.out.println("loadFromJar: " + imageName + " loaded");
        return tk.createImage(bytebuf);
    }

    /*
      public SSCell getSSCell(int layer, int cell){

      Vector v = (Vector)allcells.elementAt(layer);
      SSCell ssc = (SSCell)v.elementAt(cell);
      return ssc;
    
      }
    */
    DlgPrint dlgPrint;

    class PrintDiagram implements ActionListener{


        public void actionPerformed(ActionEvent e){

            try {
                if(dlgPrint == null){
	  
                    dlgPrint = new DlgPrint();
	  
                }
	
                boolean result = dlgPrint.edit(m_mainFrame, diagram.getRenderingShapes());

            } catch (Exception ex){
	
                // probably old java version, which has no support for Graphics2D
                // print it old way
                PrintJob pj = Toolkit.getDefaultToolkit().getPrintJob(m_mainFrame,"Print Diagram",null);
                if(pj == null)
                    return;
                Graphics gr = pj.getGraphics();
                Dimension dim = pj.getPageDimension();
                Output.out.println("printing diagram");
                diagram.drawContent(gr,dim.width, dim.height);
                pj.end();

            }      
        }
    }

    class OnVectorCalculator implements ActionListener{

        public void actionPerformed(ActionEvent e){

            new VectorCalculator().show();

        }

    }

    class OnPolygonDisplay implements ActionListener{

        public void actionPerformed(ActionEvent e){

            new PolygonDisplay().show();

        }

    }
    
    class Print3DModel implements ActionListener{

        public void actionPerformed(ActionEvent e){

            PrintJob pj = Toolkit.getDefaultToolkit().getPrintJob(m_mainFrame,"Print Diagram",null);
            if(pj == null)
                return;
            Graphics gr = pj.getGraphics();
            Dimension dim = pj.getPageDimension();
            Output.out.println("printing 3d model");
            m_canvas3D.paint(gr,dim.width, dim.height);
            pj.end();

        }
    }

    DlgSelectPoly dialogSelectPoly = null;

    class OnSelectPolyhedron implements ActionListener{

        public void actionPerformed(ActionEvent e){

            if(dialogSelectPoly == null){
                dialogSelectPoly = new DlgSelectPoly();
            }

            int[] result = dialogSelectPoly.getPolyhedron(m_mainFrame, currentCategory, currentPoly);

            if(result != null){

                stellationPath = NEW_FILE;
                currentCategory = result[0];
                currentPoly = result[1];
                m_source = SOURCE_POLY;
                m_polySymmetry = null; // to force it's initialisation in initializePoly()
                initializePoly();
                startStellationThread(null);
            }
        }
    }

    int getSymmetryIndex(String symmetry){

        for(int i =0; i < symnames.length; i++){
            if(symmetry.equals(symnames[i]))
                return i;
        }
        return 0;
    }

    /**
       calculates nonequivalent faces of polyhedron and select few "canonical" vectotrs
    */
    Vector3D[] makePolyhedronPlanes(Polyhedron poly){

        Vector3D planes[] = new Vector3D[poly.ifaces.length];

        for(int i = 0; i < poly.ifaces.length; i++){

            Plane plane = Stellation.getPlane(poly,i);
            planes[i] = plane.v.mul(plane.d);

        }
    
        return planes;
    }

    
    class FrameClosingListener extends WindowAdapter{

        public void  windowClosing(WindowEvent e){
      
            Component comp = e.getComponent();
            Output.out.println(comp);

            if(comp == frameDiagram){

                frameDiagram.setVisible(false);
                miViewDiagram.setState(false);
                viewDiagram = false;

            } else if(comp == frameSelection){

                frameSelection.setVisible(false);
                miViewCells.setState(false);
                viewCells = false;

            } else if(comp == m_frame3D){

                m_frame3D.setVisible(false);
                m_view3D = false;
                miView3D.setState(false);

            } else if(comp == frameOutput){

                frameOutput.setVisible(false);
                viewOutput = false;	
                miViewOutput.setState(false);
            }      
        }    
    }

    class ViewListener implements ItemListener {

        public void itemStateChanged(ItemEvent e){

            ItemSelectable comp = e.getItemSelectable();
            Output.out.println(comp);
            if(comp == miViewDiagram){

                viewDiagram = !viewDiagram;
                frameDiagram.setVisible(viewDiagram);
                miViewDiagram.setState(viewDiagram);

            } else if(comp == miViewCells){

                viewCells = !viewCells;
                frameSelection.setVisible(viewCells);
                miViewCells.setState(viewCells);

            } else if(comp == miView3D){

                m_view3D = !m_view3D;
                m_frame3D.setVisible(m_view3D);
                miView3D.setState(m_view3D);

            } else if(comp == miViewOutput){

                viewOutput = !viewOutput;	
                frameOutput.setVisible(viewOutput);
                miViewOutput.setState(viewOutput);
            }      
        }    

    }


    static FixedStreamTokenizer makeStreamTokenizer(Reader r){

        FixedStreamTokenizer st = new FixedStreamTokenizer(r);
      
        st.whitespaceChars((int)'=',(int)'=');
        st.slashSlashComments(true);
        st.slashStarComments(true);
        st.eolIsSignificant(false);
        st.quoteChar('"'); 
        st.wordChars('_','_'); 
        st.wordChars('0','9'); 
        st.wordChars('-','-'); 
        st.wordChars('.','.'); 
        return st;


    }

    static final int THUMB_SIZE = 400;

    void writeThumbnail(String path){

        Image cimg = m_canvas3D.getImage();
        BufferedImage img = new BufferedImage(THUMB_SIZE,THUMB_SIZE,BufferedImage.TYPE_INT_ARGB);
        
        Graphics2D g = img.createGraphics();
        AffineTransform trans = getBoxTransform(cimg.getWidth(null), cimg.getHeight(null),THUMB_SIZE,THUMB_SIZE);
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);

        g.drawImage(cimg,trans,null);
        try {
            ImageIO.write(img, "png", new File(path));
        } catch(Exception e){
            e.printStackTrace();
        }
        
    }

    String getFileName(){
        
        String s = stellationPath.replace('\\', '/');
        int ind = s.lastIndexOf("/");
        if(ind >=0) 
            return s.substring(ind+1,s.length());
        else 
            return s;
    }

    static private GridBagConstraints gbc = new GridBagConstraints();


    /**

     */
    public static void main(String args[]){

        String fname = "off/u27.off";
        String stellationSymmetry = "I";
    
        if(args.length == 0){
            Output.out.println("usage: ");
            Output.out.println(" -i <input file>");
            Output.out.println(" -y <stellationSymmetry>");
        }
        for(int i = 0; i < args.length; i++){
            if(args[i].charAt(0) == '-'){
	
                switch ( args[i].charAt(1) ){
                case 'i':
                    fname = args[++i];
                    break;
                case 'y':
                    stellationSymmetry = args[++i];
                    break;
                }	
            }
        }
    
        new StellationMain(fname,stellationSymmetry, null);

    }  

}
