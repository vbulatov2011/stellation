package pvs.polyhedra.stellation;

import static pvs.polyhedra.stellation.Utils.getPlanesString;
import static pvs.polyhedra.stellation.Utils.getString;
import static pvs.polyhedra.stellation.Utils.parsePlanes;
import static pvs.utils.Output.print;
import static pvs.utils.Output.printf;
import static pvs.utils.Output.println;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.PrintStream;
import java.io.PrintWriter;
import java.io.Reader;
import java.io.StreamTokenizer;
import java.util.StringTokenizer;
import java.util.Vector;

import pvs.polyhedra.Plane;
import pvs.polyhedra.Polyhedron;
import pvs.polyhedra.SSCell;
import pvs.polyhedra.Stellation;
import pvs.polyhedra.Symmetry;
import pvs.polyhedra.Vector3D;
import pvs.utils.Arrays;
import pvs.utils.Comparator;
import pvs.utils.FixedStreamTokenizer;
import pvs.utils.Output;

/**
   main class for Stellation program 
 */
@SuppressWarnings({ "rawtypes", "unchecked" })

public class StellationController
{
    static final boolean DEBUG = true;
    static final String EXPORT_LENGTH_UNIT = "exportLengthUnit";

    static final String LASTDIR_PROPERTY = "lastDir";
    static final double DEFAULT_EXPORT_LENGTH_UNIT = 0.01;

    double m_exportLengthUnit = DEFAULT_EXPORT_LENGTH_UNIT; // unit of length (in meters) for export 


    String m_polySymmetry = "Ih";
    String m_stellationSymmetry = "I";

    public static final String PLANES_SOURCE = "__PLANES";

    StellationData m_stelData;

    Stellation stellation = null;      

    Vector3D m_polyhedronPlanes[];
    //Vector3D m_canonicalPlanes[];
    Plane m_canonicalPlanes[];

    Vector allcells = null; // current Stellation cells 
    Vector subcells = null; // current Stellation subcells 
    SSCell[] currentCells; // currently selected cells 

    int maxIntersection = -1; // limit of intersections 
    int maxLayer = 1000; // limit number of layers
    int nFaces = 0;

    boolean bWriteCells = false;
    boolean bWriteLayers = false;
  
    // FrameClosingListener frameClosingListener = new FrameClosingListener();
  
    static String symnames[] = Symmetry.getSymmetryNames();
    PolyNames polyNames = new PolyNames();


    /**

       StellationMain

    */
    public StellationController( String fname, String stellationSymmetry ){

        this.m_stellationSymmetry = stellationSymmetry;

        String jvendor = System.getProperty("java.vendor");
        String jversion = System.getProperty("java.version");
        println("java vendor: " + jvendor);
        println("java version: " + jversion);    
    }    
  
    public void doTest(){

        stellation = new Stellation( Utils.planesToVectors(m_canonicalPlanes),m_polySymmetry,maxIntersection);
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


    public void createSubcells( String symmetry )
    {
        this.m_stellationSymmetry = symmetry;
        for(int l = 0; l < allcells.size(); l++){
            Vector layer = (Vector)allcells.elementAt(l);
            for(int c = 0; c < layer.size(); c++){
                SSCell cell = (SSCell)layer.elementAt(c);
                cell.setSubCells(Stellation.makeSymmetricalSubCells(cell, symmetry));	
            }
        }    
    }

    public void initSubcells(){

        subcells = makeSubcells(allcells);
        Stellation.makeConnectivityGraph(subcells);
        /*
          int[] layers = new int[allcells.size()];
          for(int i =0; i < allcells.size(); i++){
          layers[i] = ((Vector)allcells.elementAt(i)).size();
          }
        */
        // selection.setArray(allcells, subcells);
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


    /** -----------------------------------------------------------------
     *
     *   run()  creates stellation 
     *
     *
     */
    public void createStellation( int mi )
    {
        if(DEBUG)println("stellationSymmetry: " + m_stellationSymmetry);

        if(mi > 0){
            maxLayer = mi;
        }
        //readFile(fname);
        //Out.println();
        if(DEBUG) printf("making new Stellation() m_canonicalPlanes: %d\n", m_canonicalPlanes.length);
        stellation = new Stellation( Utils.planesToVectors(m_canonicalPlanes),m_polySymmetry,maxIntersection);
        nFaces = stellation.faces.length;

        allcells = stellation.makeCells2( m_polySymmetry, m_stellationSymmetry, maxLayer);
    }

    /**
     *
     *
     */
    public void save( File file, String polyhedronName )
    {    
        try {      
            OutputStream out = new FileOutputStream(file);
            PrintWriter pw = new PrintWriter(out);
          
            if ( polyhedronName == null ) {
                pw.println("// stellation generated from a set of planes");
                pw.println("// exported from Stellation Program by Vladimir.Bulatov@gmail.com"); 
                pw.println("planes \"" + getPlanesString(m_canonicalPlanes) + "\"");
            } else {
                pw.println("// stellation generated from polyhedron " + polyhedronName);
                pw.println("// exported from Stellation Program by Vladimir.Bulatov@gmail.com"); 
                pw.println("polyhedron \"" + polyhedronName  + "\""); 
            }
            pw.println( "symmetry \"" + m_polySymmetry + "/" + m_stellationSymmetry + "\"" );
            // pw.printf("cells \"%s\"\n", selection.getCells());

            pw.println( "exportLengthUnit \"" + getString(m_exportLengthUnit) + "\"" );

            pw.close();
        } catch(Exception e){
            e.printStackTrace();
        }
    }

    public String open( String path ) throws Exception
    {
        String response = null;
        if(path == null)
            return null;

        printf("\nreading stellation file: %s\n\n", path );

        FileInputStream inp = new FileInputStream( path );

        Reader r = new BufferedReader(new InputStreamReader(inp));

        FixedStreamTokenizer st = makeStreamTokenizer(r);
        String planes = null;
        String polyhedronName = null;
        String cells = null;  // TODO: NEED TO GET THIS BACK TO THE CALLER
        String symmetry = null;
        String exportLengthUnit = null;

        while(st.nextToken() != FixedStreamTokenizer.TT_EOF){	

            switch(st.ttype){

            case StreamTokenizer.TT_WORD:

                if(st.sval.equalsIgnoreCase("polyhedron")){
                    st.nextToken();
                    polyhedronName = st.sval;
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
        println("polyhedron: " + polyhedronName);
        println("symmetry: " + symmetry);
        println("cells: " + cells);
        println("exportLengthUnit: " + exportLengthUnit);

        if(polyhedronName != null){

            printf("using polyhedron: %s\n",polyhedronName);
            int [] cat = PolyNames.findPolyByName(polyhedronName);
            if(cat == null){
                printf("can't find polyhedron by name: %s\n", polyhedronName);
                return null;
            }
            response = polyhedronName + "/" + cells;

        } else if(planes != null){      
            response = PLANES_SOURCE + "/" + cells;
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
            return null;
        }

        if(exportLengthUnit != null){
            m_exportLengthUnit = Double.parseDouble(exportLengthUnit);
        } else {
            m_exportLengthUnit = DEFAULT_EXPORT_LENGTH_UNIT;
        }

        setSymmetry(symmetry);
        return response;
    }

    /**
     *
     *  it takes string of kind "Ih / I"   
     *
     */ 
    public void setSymmetry(String symmetry){


        StringTokenizer st = new StringTokenizer(symmetry, " /", false);
        m_polySymmetry = st.nextToken();
        m_stellationSymmetry = st.nextToken();    
    }


    public void printConnectivityGraph(){

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
    
        new StellationController( fname, stellationSymmetry );

    }

    public int[] findCell( int faceIndex, int facetIndex, int top)
    {
        return this.stellation .findCell( subcells, faceIndex, facetIndex, top );
    }

    public int[] findCell( Vector3D vector3d, boolean addCell )
    {
        return this.stellation .findCell( currentCells, vector3d, addCell );
    }

    public String getStellationSymmetry()
    {
        return this.m_stellationSymmetry;
    }

    public String getPolySymmetry()
    {
        return this.m_polySymmetry;
    }

    public Stellation getStellation()
    {
        return this.stellation;
    }
    
    public Integer[] getNonEquivalentFaces()
    {
        if( stellation .getFaces().length > 0 )
            return stellation .getNonEquivalentFaces( m_stellationSymmetry );
        else {
            return null;
        }
    }

    public void doExport( OutputStream f, String outType, String cells, String polyhedronName ) throws IOException
    {        
        // save to stream 
        Polyhedron poly = stellation.getPolyhedron(currentCells);
        poly.scale(m_exportLengthUnit);

        if(DEBUG)printf("   polyhedron scaled by factor %9.5f\n",m_exportLengthUnit);

        String[] desc;
        if ( polyhedronName == null ) {
            desc = new String[]{
                    "polyhedron stellation generated from set of planes", 
                    "  planes: " + getPlanesString(m_canonicalPlanes),
                    "  symmetry: " + m_polySymmetry + " / " + m_stellationSymmetry,
                    "  cells: " + cells,
                    "  exported from Stellation Program by Vladimir Bulatov", 
                    "  http://bulatov.org/polyhedra/stellation_applet/index.html" 
                };
        } else {
            desc = new String[]{"polyhedron: " + polyhedronName, 
                    "  symmetry: " + m_polySymmetry + " / " + m_stellationSymmetry,
                    "  cells: " + cells, 
                    "  exported from Stellation Program by Vladimir Bulatov", 
                    "  http://bulatov.org/polyhedra/stellation_applet/index.html" 
};
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
    }

    public Vector getSubcells()
    {
        return this.subcells;
    }

    public Vector getAllCells()
    {
        return this.allcells;
    }

    public void setCurrentCells(SSCell[] cells)
    {
        this.currentCells = cells;
    }

    public Vector3D[] getPolyhedronPlanes()
    {
        return this.m_polyhedronPlanes;
    }

    public void initPolyPlanes( Polyhedron polyhedron )
    {
        m_polyhedronPlanes = makePolyhedronPlanes(polyhedron);
        m_canonicalPlanes = Utils.vectorsToPlanes( Utils.getCanonicalVectors(m_polyhedronPlanes, m_polySymmetry));
        if(DEBUG) printf("m_polyhedronPlanes: %d\n", m_polyhedronPlanes.length);
        if(DEBUG) printf("m_canonicalPlanes: %d\n", m_canonicalPlanes.length);
    }

    public Plane[] getCanonicalPlanes()
    {
        return this.m_canonicalPlanes;
    }

    public void setCanonicalPlanes( Plane[] generatingPlanes )
    {
        this.m_canonicalPlanes = generatingPlanes;
    }
}
