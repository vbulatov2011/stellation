package pvs.polyhedra.ui;

import java.awt.Frame;
import java.io.FileInputStream;
import java.io.PrintStream;
import java.util.Vector;

import pvs.polyhedra.Axis;
import pvs.polyhedra.Plane;
import pvs.polyhedra.Polyhedron;
import pvs.polyhedra.SFace;
import pvs.polyhedra.SSCell;
import pvs.polyhedra.Stellation;
import pvs.polyhedra.Symmetry;
import pvs.polyhedra.Vector3D;
import pvs.utils.ui.WindowOutputStream;

public class StellationUI
{
    public static void showCells( Stellation stellation, Vector cells, int faceToShow, int vertexUp, String symmetry ){

        SSCell[] scell = new SSCell[1];
        int [][] st = new int[1][2];

        for(int i = 0; i < cells.size(); i++){
            Vector scells = (Vector)cells.elementAt(i);
            st[0][0] = i;
            for(int j = 0; j < scells.size(); j++){
                scell[0] = (SSCell)scells.elementAt(j);
                st[0][1] = j;
                Object[][] facets = Stellation.getStellationDiagram(scell, faceToShow);
                showStellationDiagram( stellation, facets,makeStellationName(st), 
                        faceToShow, vertexUp,  symmetry,null);    
            }
        }    
    }

    /**
       showStellationDiagram
    
       creates window with stellation diagram
       findex - which face we are looking at
       vertexUp - which vertex of this face should point along Y axis
    */
    public static StellationCanvas showStellationDiagram( Stellation stellation,
                                                  Object [][] facets, 
                                                  String name, 
                                                  int findex, int vertexUp,
                                                  String symmetry, 
                                                  StellationCanvas canvas){
    
        int index = 0;
        //int layer = 10000; // ridiculosly big layer
        double rMin = 1.e20; // 
        // search of facet with lowest layer (should be zero for convex polyhedra)
        SFace[] ffaces = stellation.faces[findex];
        //System.out.println("face: " + findex);
        for(int i=0; i < ffaces.length; i++){
            double r = ffaces[i].getCenter().length2();
            if(r < rMin){
                rMin = r;
                index = i;
            }
      
            //if(ffaces[i].layer < layer){
            //  index = i;
            //layer = ffaces[i].layer;
            // 
            //}      
        }

        // new selected facets 
        SFace[] nsfaces = new SFace[facets.length];
        // make copy of faces
        for(int i = 0; i < nsfaces.length; i++){
            nsfaces[i] = new SFace((SFace)facets[i][0]);
            nsfaces[i].layer = ((Integer)facets[i][1]).intValue();
        }
        // new facets 
        SFace[] nffaces = new SFace[ffaces.length];
        for(int i = 0; i < ffaces.length; i++){
            nffaces[i] = new SFace(ffaces[i]);
        }    

        Axis[] symAxes  = Symmetry.getAxes(symmetry);
        // make a copy of axes 
        Axis[] axes = new Axis[symAxes.length];
        Plane plane = stellation.faces[findex][0].getPlane();
        for(int i =0; i < axes.length; i++){
            Vector3D v = Stellation.intersect(plane,symAxes[i].vector);
            // new axis will keep intersection 
            if(v != null)
                axes[i] = new Axis(v, symAxes[i].order);
        }

        Plane symPlanes[] = Symmetry.getSymmetryPlanes(symmetry);
        Vector3D [][]planes = new Vector3D[symPlanes.length][];
        double maxradius = stellation.getMaxRadius();
        for(int i =0; i < planes.length; i++){      
            planes[i] = Stellation.intersect(plane, symPlanes[i], maxradius);
        }

        SFace face = nffaces[index]; 
        // find center of selected face 
        Vector3D center = face.getCenter();
        // move selected face to center
        //System.out.println("translation " + round(center.x) + " " + round(center.y) + " " + round(center.z));
        Stellation.translateFaces(nsfaces, center);
        Stellation.translateFaces(nffaces, center);

        for(int i =0; i < axes.length; i++){
            if(axes[i] != null)
                axes[i].vector.subSet(center);
        }
        for(int i =0; i < planes.length; i++){ 
            if(planes[i] != null){
                planes[i][0].subSet(center);
                planes[i][1].subSet(center);
            }
        }
    
        Vector3D y = new Vector3D(0,1,0);
        Vector3D z = new Vector3D(0,0,1);
        Vector3D[] vert = face.vertices;
        Vector3D normal = vert[1].sub(vert[0]).cross(vert[2].sub(vert[1]));
        normal.normalize();
        // rotate face normal to Z-axis
        //printRotation("rotation ", normal, z);
        Stellation.rotateFaces(nffaces, normal,z);
        Stellation.rotateFaces(nsfaces, normal,z);
        for(int i =0; i < axes.length; i++){
            if(axes[i] != null)
                axes[i].vector.rotateSet(normal, z);
        }
        for(int i =0; i < planes.length; i++){ 
            if(planes[i] != null){
                planes[i][0].rotateSet(normal, z);
                planes[i][1].rotateSet(normal, z);
            }
        }

        if(vertexUp < face.vertices.length){

            Vector3D v1 = new Vector3D(face.vertices[vertexUp]);
            v1.normalize();
            // rotate vertexUp to Y-axis
            //printRotation("rotation ", v1, y);
            Stellation.rotateFaces(nsfaces, v1,y);
            Stellation.rotateFaces(nffaces, v1,y);
            for(int i =0; i < axes.length; i++){
                if(axes[i] != null)
                    axes[i].vector.rotateSet(v1,y);
            }
            for(int i =0; i < planes.length; i++){ 
                if(planes[i] != null){
                    planes[i][0].rotateSet(v1,y);
                    planes[i][1].rotateSet(v1,y);
                }
            }
        }
            
        if(canvas == null){
            Frame frame = new Frame(name);
            canvas = new StellationCanvas(nsfaces, nffaces, axes, planes);
            frame.add("Center",canvas);
            frame.pack();
            frame.show();         
            frame.validate();
        } else {
            canvas.setFaces(nsfaces, nffaces, axes, planes);
            canvas.getFrame().validate();
        }
        return canvas;
    }

    /**
       printHelp
    */
    static void printHelp(PrintStream out){
        out.println("program for polyhedra stellation");
        out.println("parameters:");
        out.println("-i <input file with polyhedron (OFF format)>");
        out.println("-v <input file with vectors>");
        out.println("-c  makeCells");
        out.println("-C  showCells");
        out.println("-o <Vrml2 | POV | OFF> - output type");
        out.println("-Oc - write cells ");
        out.println("-Ol - write layers ");
        out.println("-Of - write polyhedra faces ");
        out.println("-Of - write polyhedra edges ");
        out.println("-Of - write polyhedra vertices ");
        out.println("-Le <end layer> ");
        out.println("-Ls <start layer> ");
        out.println("-p <prefix of ouput files>");
        out.println("-s <file with stellations> (to write specific stellations)");
        out.println("-t <max number of intersections>");
        out.println("-d  show diagramm");
        out.println("-f <face to show diagramm>");
        out.println("-u <vertexUp on diagramm>");
        out.println("-w print output to window");
        out.println("-y <O | Oh | I | Ih | T | Th> symmetry to use");    
    }
    
    /**
       makeStellationName

    */

    public static String makeStellationName(int [][] stellation){
        StringBuffer s = new StringBuffer();
        int layer = -1;
        for(int i = 0; i < stellation.length; i++){
            if(stellation[i][0] != layer){
                s.append(stellation[i][0]);
                layer = stellation[i][0];
            }

            int index = stellation[i][1];
            int offset = index % ('z'-'a'+1);
            int segment = index / ('z'-'a'+1);
            switch(segment){
            case 0: 
                s.append((char)('a'+offset));   
                break;
            case 1: 
                s.append((char)('A'+offset));
                break;
            case 2: 
                s.append('_');  
                s.append((char)('a'+offset));   
                break;
            case 3: 
                s.append("__"); 
                s.append((char)('A'+offset));   
                break;
    
            default: 
    
                // TO-DO 
            }
        }    
        return s.toString();
    }

    /**
       makeSFileName

    */
    public static String makeSFileName(int [][] stellation, String prefix,
                                       String outType){
        StringBuffer s = new StringBuffer(prefix);
        s.append('_');
        s.append(makeStellationName(stellation));
        s.append(Polyhedron.getPostfix(outType));
        return s.toString();
    }

    /**
       MAIN
    */
    public static void main(String args[]){

        int start = 0, end = -1, maxintersection = -1;
        String outType = "none"; // what format to write "Vrml2" "POV" "OFF"
        String fname = null; // file with polyhedron
        String vname = null; // file with vectors
        String prefix = "s";
        boolean hasOutput = false;
        boolean printToWindow = false;
        boolean bShowDiagram = false;
        boolean bMakeCells = false, bShowCells = false;
        boolean doVrmlWriteScene = false;
        String symmetry = "none";
        String stellations = null;

        int vertexUp = 0;
        int faceToShow = 0;
        boolean bWriteCells = false, bWriteLayers = false;
        
        PrintStream out = System.out;

        for(int i =0; i < args.length; i++){
            if(args[i].charAt(0)=='-' || 
               args[i].charAt(0)=='+'){
                switch(args[i].charAt(1)){
                case 'C':
                    bShowCells = true;
                    break;
                case 'c':
                    bMakeCells = true;
                    break;
                case 'd':
                    bShowDiagram = true;
                    break;    
                case 'f':
                    faceToShow = Integer.parseInt(args[++i]);
                    break;
                case 'h':
                    printHelp(System.err);
                    break;
                case 'i':
                    fname = args[++i];
                    break;
                case 'o':
                    outType = args[++i];
                    break;
                case 'O':
                    switch(args[i].charAt(2)){
                    case 'c': bWriteCells = true; break;
                    case 'l': bWriteLayers = true; break;
                    case 'f': Polyhedron.outFaces = (args[i].charAt(0)=='+'); break;
                    case 'e': Polyhedron.outEdges = (args[i].charAt(0)=='+'); break;
                    case 'v': Polyhedron.outVertices = (args[i].charAt(0)=='+'); break;
                    }     
                    break;
                case 'L':
                    switch(args[i].charAt(2)){      
                    case 's':
                        start = Integer.parseInt(args[++i]);
                        break;
                    case 'e':
                        end = Integer.parseInt(args[++i]);
                        break;
                    } break;
                case 'p':
                    prefix = args[++i];
                    break;
                case 's':
                    stellations = args[++i];
                    break;
                case 't':
                    maxintersection = Integer.parseInt(args[++i]);
                    break;
                case 'u':
                    vertexUp = Integer.parseInt(args[++i]);
                    break;
                case 'v':
                    vname = args[++i];
                    break;
                case 'w':
                    printToWindow = true;
                    break;
                case 'y':
                    symmetry = args[++i];
                    break;
                }
            }
        }
      
        if(outType.equals("Vrml2") || 
           outType.equals("OFF") || 
           outType.equals("POV")){
            hasOutput = true;    
        }
    
        if(printToWindow){
            out = new PrintStream(new WindowOutputStream());
        }

        Stellation stell = null;
        if(fname != null){

            Polyhedron poly = new Polyhedron();
            try {
                FileInputStream f = new FileInputStream(fname);
                poly.readOFF(f);
                poly.makeCCW();
                f.close();
            } catch(Exception e){
                e.printStackTrace(out);
                System.exit(-1);
            }        
            out.println(fname+" read OK");out.flush();
            stell = new Stellation(poly,maxintersection);

        } else if(vname != null){

            Vector3D[] vectors = Stellation.readVectors(vname);
            out.println(vname+" read OK");out.flush();
            stell = new Stellation(vectors,maxintersection);
        } else {

            System.err.println("no input file given");
            System.exit(-1);

        }

        out.println("\nlayers found: " + stell.maxlayer);out.flush();
        /*
          if(bShowDiagram){
          stell.showDiagram(stell.faces[faceToShow], vertexUp);
          }
        */
        if(bWriteCells || bShowCells || bShowDiagram || stellations != null){
            Vector allcells = stell.makeCells( symmetry, symmetry, 1000);

            //stell.makeConnectivityGraph(allcells);

            if(bWriteCells){
                stell.writeCells(allcells, prefix, outType);
                if( outType.equals("Vrml2")){
                    Stellation.writeVrmlScene(allcells,prefix);
                }
            }
            if(bShowCells){
                showCells( stell, allcells, faceToShow, vertexUp, symmetry);
            }
            if(stellations != null){
                int[][][] st = Stellation.readStellations(stellations);
                System.out.println(st);
                for(int i=0; i < st.length; i++){
                    if(bShowDiagram){
                        SSCell[] cells = stell.getStellation(allcells,st[i]);
                        Object[][] facets = Stellation.getStellationDiagram(cells, faceToShow);
                        showStellationDiagram( stell, facets, makeStellationName(st[i]),
                                                    faceToShow, vertexUp,  symmetry, null);
                    }

                    if(hasOutput){
                        Polyhedron poly = stell.getPolyhedron(allcells, st[i]);
                        poly.writeToFile(makeSFileName(st[i],prefix,outType),outType);
                    }
                }
            }
        }

    
        if(bWriteLayers){
            if(end < 0)
                end = stell.maxlayer;
            for(int i = start; i <= end ; i++){
    
                out.print(i);out.flush();
                boolean result = false;
    
                Polyhedron poly = stell.getPolyhedron(i);
                poly.generateRandomColors(poly.paintFacesByArea());
                poly.outColor = true;
                out.print(".");out.flush();
                poly.writeToFile( poly.makeFileName(prefix,outType,i,stell.maxlayer), 
                                  outType);
    
            }
        }     
    }

}
