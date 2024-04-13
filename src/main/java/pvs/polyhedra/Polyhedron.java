package pvs.polyhedra;

import static pvs.utils.Output.printf;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.PrintStream;
import java.io.Reader;
import java.io.StreamTokenizer;
import java.util.Hashtable;
import java.util.Vector;

import pvs.g3d.STLWriter;
import pvs.utils.DoubleComparator;
import pvs.utils.Fmt;
import pvs.utils.QSort;

public class Polyhedron {

    static final boolean DEBUG = true;

    public Vector3D[] vertices = new Vector3D[0];
    public int[][] ifaces = new int[0][0];

    public java.awt.Color[] colors = new java.awt.Color[0];
    public int[] icolor = new int[0];

    public int[][] edges = new int[0][0];
    public String[] description;

    public static boolean Debug = false;
    public static double tolerance = Vector3D.tolerance;

    public static PrintStream Out = System.out;

    public static boolean outFaces = true,
        outEdges = false,
        outVertices = false,
        outColor = true;

    /**
       constructor 
    */
    public Polyhedron(){
    
    }

    public void setDescription(String[] description){
        this.description = description;
    }

    /**
       scale polyhedron by given factor
     */
    public void scale(double factor){
        for(int i = 0; i  < vertices.length; i++){
            // make copy ov vertex 
            vertices[i] = new Vector3D(vertices[i]);
            vertices[i].mulSet(factor);
        }
    }

    /**
       makes all faces counterclockwise
       relatively to origin (in case if input faces were 
       oriented wrong way)
    */
    public void makeCCW(){
        for(int f = 0; f < ifaces.length; f++ ){
            Vector3D center = new Vector3D(0,0,0);
            int iface[] = ifaces[f];
            for(int i = 0; i < iface.length; i++)
                center.addSet(vertices[iface[i]]);
            center.mulSet(1.0/iface.length);
            if(vertices[iface[0]].cross(vertices[iface[1]]).dot(center) < 0.0){      
                //wrong orientation
                for(int i = 0; i < iface.length/2; i++){
                    int  t = iface[i];
                    iface[i] = iface[iface.length-1-i];
                    iface[iface.length-1-i] = t;
                }
            }
        }
    }
   
    /**
       return color of given face
    */
    public java.awt.Color getColor(int face){
        if(icolor != null)
            return colors[icolor[face]];
        else 
            return java.awt.Color.lightGray;
    }

    /**
       assigns given color to all faces
    */
    public void setColor(java.awt.Color color){
        colors = new java.awt.Color[1];
        colors[0] = color;
        int nfaces = ifaces.length;
        if(icolor == null || icolor.length < nfaces)
            icolor = new int[nfaces];
        for(int i=0; i < nfaces; i++){
            // System.out.println(" I: " + i);
            icolor[i] = 0;
        }
    }

    /**
       returns index of given color
    */
    public int getColorIndex(int color){
        // ******* TO-DO
        return 0;
    }


    /**
       return index of integer in list or add new one
    */
    int findOffColorIndex(Vector color,int newcolor){
        int len = color.size();
        for(int i = 0; i < len; i++){
            int d = ((Integer)color.elementAt(i)).intValue();
            if(d - newcolor == 0)
                return i;
        }
        color.addElement(new Integer(newcolor));
        return color.size()-1;
    }

    /*
      reads OFF files 
    */
    public void readOFF(InputStream instr){

        try {
            int nvert = 0, nfaces = 0, nedges = 0; 
            Reader r = new BufferedReader(new InputStreamReader(instr));
            StreamTokenizer stream = new StreamTokenizer (r);
            stream.eolIsSignificant(false);
            stream.commentChar('#');
      
            if(stream.nextToken() != StreamTokenizer.TT_WORD || 
               !stream.sval.equals("OFF"))
                throw new IOException("wrong header in OFF stream");
            while(stream.nextToken()!=StreamTokenizer.TT_NUMBER)
                ;
            nvert = (int)stream.nval;
            stream.nextToken();nfaces = (int)stream.nval;
            stream.nextToken();nedges = (int)stream.nval;
      
            vertices = new Vector3D[nvert];
            int num = 0;
            while (num < nvert) {
                double x,y,z;
                stream.nextToken();x = (double)stream.nval; 
                stream.nextToken();y = (double)stream.nval;
                stream.nextToken();z = (double)stream.nval;	
                vertices[num] = new Vector3D(x,y,z);
                num ++;
            }
      
            ifaces = new int[nfaces][];
            icolor = new int[nfaces];
      
            num = 0;
      
            int fcolor = 0;
            Vector color = new Vector();
            stream.eolIsSignificant(true);
            while(num < nfaces ){
                while(stream.nextToken() != StreamTokenizer.TT_NUMBER){
                    ;
                }
                int nf = (int)stream.nval;
                int[] iface = new int[nf];
                ifaces[num] = iface;      
                for(int i=0; i < nf; i++){
                    stream.nextToken();
                    iface[i] = (int)stream.nval;	
                }
                // read color specification
                fcolor = 0;
                for(int i=0; i < 3; i++){
                    if(stream.nextToken() != StreamTokenizer.TT_NUMBER)
                        break;
                    fcolor <<= 8; 
                    int c = (stream.nval <= 1.0) ? 
                        (int)(255*stream.nval) : (int)(stream.nval); 
                    fcolor = (fcolor | (c & 0xFF));
                }
                icolor[num] = findOffColorIndex(color,fcolor);
                num++;
                while(stream.nextToken() != StreamTokenizer.TT_EOL){
                    ;      
                }
            }
            // create colors array;
            colors = new java.awt.Color[color.size()];
            for(int i=0; i < colors.length; i++){
                colors[i] = new 
                    java.awt.Color(((Integer)color.elementAt(i)).intValue());
            }
      
        } catch (Exception e){
            e.printStackTrace(System.err);
        }
      
    }

    /**
       calculates triangle count after splitting each face into triangles
     */
    public int getTriCount(){

        int count = 0;
        for(int i=0; i < ifaces.length; i++){
            count += ifaces[i].length-2;
        }
        return count;        
    }

    /**
       writes polyhedron into STL file
     */
    public void writeSTL(OutputStream out) throws IOException {
        
        int tcount = getTriCount();
        if(DEBUG) printf("writeSTL() tri count: %d\n", tcount);
        STLWriter writer = new STLWriter(out,tcount);
        int count = 0;
        for(int i = 0; i < ifaces.length; i++){
            int[] iface = ifaces[i];
            for(int j = 0; j < iface.length-2; j++){
                // split polygon into triangles 
                writer.addTri(vertices[iface[0]],vertices[iface[j+1]],vertices[iface[j+2]]);
                count++;
            }            
        }
        if(DEBUG) printf("writeSTL() done %d triangles\n", count);
    }

    /*
      writes OFF files 
    */
    public void writeOFF(OutputStream out){
        PrintStream pout = new PrintStream(out);
        pout.println("OFF");
        if(description != null){
            for(int i =0; i < description.length; i++){
                pout.print("#");
                pout.println(description[i]);
            }
        }

        pout.print(vertices.length);pout.print(" ");
        pout.print(ifaces.length);pout.print(" ");
        if(edges != null)
            pout.println(edges.length);
        else 
            pout.println(0);      

        for(int i=0; i < vertices.length; i++){
            Vector3D v = vertices[i];
            pout.print(Fmt.fmt(chop(v.x),18,15));pout.print(" ");
            pout.print(Fmt.fmt(chop(v.y),18,15));pout.print(" ");
            pout.println(Fmt.fmt(chop(v.z),18,15));
        }

        for(int i=0; i< ifaces.length; i++){
            int[] iface = ifaces[i];
            pout.print(iface.length);pout.print(" ");
            for(int j =0; j < iface.length; j++ ){
                pout.print(iface[j]);pout.print(" ");
            }
            java.awt.Color c = getColor(i);
            pout.print(c.getRed());pout.print(" ");
            pout.print(c.getGreen());pout.print(" ");
            pout.println(c.getBlue());
        }
    }


    static final String DXFHeader = "0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n0\n0\nLAYER\n2\npoly\n6\nCONTINUOUS\n0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nBLOCKS\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n";
    static final String DXFTail = "0\nENDSEC\n0\nEOF\n";

    private void writeDXFTriangle(PrintStream pout, Vector3D v1, Vector3D v2, Vector3D v3 ){
    
        pout.print("0\n3DFACE\n8\n0\n");
        pout.print("10\n");
        pout.print(chop(v1.x));
        pout.print("\n20\n");
        pout.print(chop(v1.y));
        pout.print("\n30\n");
        pout.print(chop(v1.z));
        pout.print("\n11\n");
        pout.print(chop(v2.x));
        pout.print("\n21\n");
        pout.print(chop(v2.y));
        pout.print("\n31\n");
        pout.print(chop(v2.z));
        pout.print("\n12\n");
        pout.print(chop(v3.x));
        pout.print("\n22\n");
        pout.print(chop(v3.y));
        pout.print("\n32\n");
        pout.print(chop(v3.z));
        pout.print("\n13\n");
        pout.print(chop(v1.x));
        pout.print("\n23\n");
        pout.print(chop(v1.y));
        pout.print("\n33\n");
        pout.print(chop(v1.z));
        pout.print("\n");
    }

    private void writeDXFQuadrangle(PrintStream pout, Vector3D v1, Vector3D v2, Vector3D v3, Vector3D v4 ){
    
        pout.print("0\n3DFACE\n8\n0\n");
        pout.print("10\n");
        pout.print(chop(v1.x));
        pout.print("\n20\n");
        pout.print(chop(v1.y));
        pout.print("\n30\n");
        pout.print(chop(v1.z));
        pout.print("\n11\n");
        pout.print(chop(v2.x));
        pout.print("\n21\n");
        pout.print(chop(v2.y));
        pout.print("\n31\n");
        pout.print(chop(v2.z));
        pout.print("\n12\n");
        pout.print(chop(v3.x));
        pout.print("\n22\n");
        pout.print(chop(v3.y));
        pout.print("\n32\n");
        pout.print(chop(v3.z));
        pout.print("\n13\n");
        pout.print(chop(v4.x));
        pout.print("\n23\n");
        pout.print(chop(v4.y));
        pout.print("\n33\n");
        pout.print(chop(v4.z));
        pout.print("\n");
    }

    private void writeDXFFace(PrintStream pout, int vert[]){
        if(vert.length == 3){
            writeDXFTriangle(pout,vertices[vert[0]],vertices[vert[1]],vertices[vert[2]]);
        } else if(vert.length == 4){
            writeDXFQuadrangle(pout,vertices[vert[0]],vertices[vert[1]],vertices[vert[2]],vertices[vert[3]]);
        } else if(vert.length > 4){
            writeDXFQuadrangle(pout,vertices[vert[0]],vertices[vert[1]],vertices[vert[2]],vertices[vert[3]]);
            for(int i = 4; i < vert.length; i++){
                writeDXFTriangle(pout,vertices[vert[0]],vertices[vert[i-1]],vertices[vert[i]]);
            }          
        }
    }

    /**
     
     */
    public void writeDXF(OutputStream out){

        PrintStream pout = new PrintStream(out);
        if(description != null){
            for(int i =0; i < description.length; i++){
                pout.print("999\n");
                pout.print(description[i]+"\n");
            }
        }
        pout.print(DXFHeader);
        for(int i=0; i < ifaces.length; i++){
            writeDXFFace(pout, ifaces[i]);
        }
        pout.print(DXFTail);

    }



    /*
      returns coordinates in format acceptable in VRML
    */
    public double[][] _getCoordinates(){

        double[][] coordinates = new double[vertices.length][3];
        int len = vertices.length;
        for(int i=0; i < len; i++){
            vertices[i].getCoord(coordinates[i]);
        }  
        return coordinates;
    }

    /*
      return a set of different colors of faces
    */
    public void generateRandomColors(int ncolors){
        colors = new java.awt.Color[ncolors];
        float c = (float)Math.random();
        for(int i=0; i < ncolors; i++){
            colors[i] = java.awt.Color.getHSBColor(c, 0.5f,0.9f);
            c += 1.0f/ncolors;
            if(c > 1.0f)
                c -= 1.0f;
        }

        /*
          colors[i] = new java.awt.Color((float)Math.random(),
          (float)Math.random(),
          (float)Math.random());
        */
    
    }
 
    /*
      returns area of given face
    */
    double faceArea(int face){
        Vector3D area = new Vector3D();
        int[] f = ifaces[face];
        int length = f.length;
        for(int i=0; i < f.length; i++){
            area.addSet(vertices[f[i]].cross(vertices[f[(i+1)% length]]));
        }
        area.mulSet(0.5);
        return area.length();
    }

    /*
      find if such area already exists
    */
    int findAreaColorIndex(Vector areas, double a){
        for(int i = 0; i < areas.size(); i++){
            double d = ((Double)areas.elementAt(i)).doubleValue();
            if(Math.abs(d - a) < 0.001)
                return i;
        }
        areas.addElement(new Double(a));
        return areas.size()-1;
    }

    /*
      assigns Color to faces according the face area
    */
    public int paintFacesByArea(){

        Vector areas = new Vector();
        icolor = new int[ifaces.length];
        for(int i = 0; i < ifaces.length; i++){
            icolor[i] = findAreaColorIndex(areas,faceArea(i));
        }    

        QSort.quickSort(areas,0,areas.size()-1,new DoubleComparator());
        // unefficient way to store areas in increasing order
        for(int i = 0; i < ifaces.length; i++){
            icolor[i] = findAreaColorIndex(areas,faceArea(i));
        }    
        return areas.size();
    }

  
    /*
      count number of entries for index in IndexedFaceSet()
    */
    int countIndex(){
        int sum = 0;
        for(int i=0;i < ifaces.length; i++){
            sum += ifaces[i].length+1;
        }
        return sum;
    }

    /*
      return colors in Vrml-sutable representation
    */
    float [][] getVrmlColors(){
        if(colors != null){
            float [][] col = new float[colors.length][3];
            for(int i=0; i < col.length; i++){
                java.awt.Color color = colors[i];
                col[i][0] = (float)((color.getRed())/255.);
                col[i][1] = (float)((color.getGreen())/255.);
                col[i][2] = (float)((color.getBlue())/255.);
            }
            return col;
        }
        return null;
    }

    /*
      returns IndexedFaceSet
    */
    /*
      public IndexedFaceSet getIndexedFaceSet(){

      IndexedFaceSet ifs = new   
      IndexedFaceSet(true,//ccw, // boolean ccw,
      null, // int colorIndex[],
      null,// int coordIndex[],
      false,// boolean colorPerVertex,
      true, // boolean convex,
      0.0F, // float creaseAngle,
      null, // int normalIndex[],
      true, // boolean normalPerVertex,
      true, //solid,// boolean solid,
      null // int texCoordIndex[])
      );
    
      int [] index = new int[countIndex()];

      int k = 0;
      for(int i=0; i < ifaces.length; i++){
      for(int j=0; j < ifaces[i].length; j ++){
      index[k++]   = ifaces[i][j];
      }
      index[k++] = -1;
      }
      ifs.set_coordIndex(index);
      Coordinate coord = new Coordinate();
      coord.set_point(getCoordinates());
      ifs.set_coord(coord);
    
      if(outColor && 
      icolor != null && icolor.length != 0 
      && colors != null && colors.length != 0){
      ifs.set_colorIndex(icolor);
      vlc.vrml.generic.geometry.Color color = 
      new vlc.vrml.generic.geometry.Color();
      color.set_color(getVrmlColors());
      ifs.set_color(color);
      }

      return ifs;
      }
    */

    /*
      returns VRML representation of this polyhedron
    */
    public String getVrmlString(){
        ByteArrayOutputStream ba = new ByteArrayOutputStream();
        PrintStream ps = new PrintStream(ba);
        writeVrml(ps);
        return ba.toString();  
    }

    /*
      writes VRML representation of this polyhedron
    */
    public void writeVrml(PrintStream out){
        out.print("#VRML V2.0 utf8\n");
        if(description != null){
            for(int i =0; i < description.length; i++){
                out.print("#");
                out.println(description[i]);
            }
        } 
        out.print("NavigationInfo {\n\ttype \"EXAMINE\"\n\theadlight TRUE\n}\n"); 
        if(outEdges){
            for(int i =0; i < VRMLEdge.length; i++){
                out.println(VRMLEdge[i]);
            }
        }

        out.print("PROTO Piece [\n]{\nGroup {\n children [\n");

        if(outFaces){
            writeVRMLIndexedFaceSet(out);      
        }
        if(outEdges){
            for(int i = 0; i < edges.length; i++){
                out.print("Edge{start ");
                Vector3D v = vertices[edges[i][0]];
                out.print(Fmt.fmt(chop(v.x),8,6));out.print(" ");
                out.print(Fmt.fmt(chop(v.y),8,6));out.print(" ");
                out.print(Fmt.fmt(chop(v.z),8,6));out.print(" ");
                out.print("end ");
                v = vertices[edges[i][1]];
                out.print(Fmt.fmt(chop(v.x),8,6));out.print(" ");
                out.print(Fmt.fmt(chop(v.y),8,6));out.print(" ");
                out.print(Fmt.fmt(chop(v.z),8,6));out.print(" ");
                out.print("}\n");
            }
        }

        out.print("]\n}\n}\n"); // end of PROTO
        out.print("Piece{}\n");

    }

    void writeVRMLIndexedFaceSet(PrintStream out){
    
        out.println("Shape {");
        out.println("  geometry IndexedFaceSet {");
        out.println("    solid TRUE");
        out.println("    creaseAngle 0");
        out.println("    coord Coordinate {");
        out.println("      point[");
        // coordinates 
        for(int i = 0; i < vertices.length; i++){
            out.print("      ");
            out.print(Fmt.fmt(chop(vertices[i].x),8,6));out.print(" ");
            out.print(Fmt.fmt(chop(vertices[i].y),8,6));out.print(" ");
            out.print(Fmt.fmt(chop(vertices[i].z),8,6));
            out.println("");
        }
        out.println("      ]");
        out.println("    }");
        out.println("    coordIndex [");   
        // coordinate index 
        for(int i = 0; i < ifaces.length; i++){
            out.print("      ");
            for(int f = 0; f < ifaces[i].length; f++){
                out.print(ifaces[i][f]);out.print(" ");
            }
            out.println("-1");
        }
    
        out.println("    ]");
        out.println("  }");
    
        out.println("  appearance Appearance {");
        out.println("    material Material{");
        out.println("      diffuseColor 0.3 0.5 0.9");
        out.println("    }");
        out.println("  }");
        out.println("}");

    }

    static double chop(double x){
        if(x > -tolerance && x  < tolerance)
            return 0.0;
        else 
            return x;
    }

    public void printVertices(PrintStream out){
        int len = vertices.length;
        for(int i=0; i < len; i++){
            out.print(Fmt.fmt(chop(vertices[i].x),19,16));
            out.print(" ");
            out.print(Fmt.fmt(chop(vertices[i].y),19,16));
            out.print(" ");
            out.println(Fmt.fmt(chop(vertices[i].z),19,16));
        }  
    }

    public void printFaceCenters(PrintStream out){

    }

    public void printEdges(PrintStream out){

    }

    public void printEdgeCenters(PrintStream out){

    }

    /*
      writes POVRAY representation of this polyhedron
    */
    public void writePOV(PrintStream out){

        if(description != null){
            for(int i =0; i < description.length; i++){
                out.print("// ");
                out.println(description[i]);
            }
        }
        for(int i =0; i < POVStart.length; i++){
            out.println(POVStart[i]);
        }
        /*
          for(int i=0; i < colors.length; i++){
          out.print("#declare T");
          out.print(i);
          out.print(" = texture{pigment{color rgb <");
          out.print(colors[i].getRed()/255.);
          out.print(" ");
          out.print(colors[i].getGreen()/255.);
          out.print(" ");      
          out.print(colors[i].getBlue()/255.);
          out.print(">}finish{FinF}}\n");      
          }
        */

        out.print("#declare PolyRadius = ");
        out.println(getRadius()+";");

    
        int len = vertices.length;
        for(int i=0; i < len; i++){
            out.print("#declare V");
            out.print(i);
            out.print(" = <");
            Vector3D v = vertices[i];
            out.print(Fmt.fmt(chop(v.x),18,16)); out.print(",");
            out.print(Fmt.fmt(chop(v.y),18,16)); out.print(",");
            out.print(Fmt.fmt(chop(v.z),18,16)); out.println(">;");
        }
        /*
          if(outVertices){
          for(int i=0; i < len; i++){
          out.print("sphere{ V");
          out.print(i);
          out.println(", RadiusV texture{TextureE}}");
          }  
          }
        */
        if(outFaces){
            for(int i=0; i < ifaces.length; i++){
                out.print("polygon {");
                int []iface = ifaces[i];
                out.print((iface.length+1));out.print(",");
                for(int j=0; j < iface.length; j ++){
                    out.print("V"); 
                    out.print(iface[j]);
                    out.print(",");
                }
                out.print("V"); 
                out.print(iface[0]); // close the face
                out.println(" texture{TextureF}}");
                /*
                  if(outColor && icolor != null) {
                  out.print(icolor[i]);
                  } else {
                  out.print(iface.length);
                  }
                  out.println("}}");
                */
            }
        }

        if(outEdges){
            if(edges.length == 0){
                // twice as much. than necessary
                for(int i=0; i < ifaces.length; i++){
                    int []iface = ifaces[i];
                    for(int j=0; j < iface.length; j ++){
                        out.print("cylinder{V");
                        out.print(iface[j]);
                        out.print(",V");
                        out.print(iface[(j+1)%iface.length]);
                        out.println(",RadiusE open texture {TextureE}}");
                    }
                }
            } else {
                for(int i = 0; i < edges.length; i++){
                    out.print("cylinder{V");
                    out.print(edges[i][0]);
                    out.print(",V");
                    out.print(edges[i][1]);
                    out.println(",RadiusE open texture {TextureE}}");	  
                }
            }
        }

        for(int i =0; i < POVEnd.length; i++){
            out.println(POVEnd[i]);
        }

    }
  

    /*
      looks for vertex from Vector newv and 
      add new one if there in no such a vertex
    */
    int findVertex(Vector newv, Vector3D vertex){
        int size = newv.size();
        for(int i = 0; i < size; i++){
            if(((Vector3D)newv.elementAt(i)).equals(vertex))
                return i;
        }
        newv.addElement(vertex);
        return size;
    }

    /*
      clears duplicates 
    */
    void clearDoubleVertices(){
        Vector3D[] oldvertices = vertices;
        Vector newvertices = new Vector();
        int[] index = new int[vertices.length];
        for(int i=0; i < vertices.length; i++){
            index[i] = findVertex(newvertices, oldvertices[i]);
        }
        vertices = new Vector3D[newvertices.size()];
        newvertices.copyInto(vertices);
        for(int i = 0; i < ifaces.length; i++){
            int[] iface = ifaces[i];
            for(int j = 0; j < iface.length; j++){
                iface[j] = index[iface[j]];
            }
        }
    }

    public double getRadius(){
        double r = 0;
        for(int i=0; i < vertices.length; i++){
            double r1 = vertices[i].length2();
            if(r1 > r)
                r = r1;
        }
        return Math.sqrt(r);
    }

    /**
     *  adds new polyhedron to this
     *    
     */
    void addPoly(Polyhedron poly){
        if(vertices == null){
            vertices = poly.vertices;
            ifaces = poly.ifaces;
            colors = poly.colors;
            icolor = poly.icolor;
            clearDoubleVertices();
            return;
        }    

        // add vertices
        Vector3D[] oldvert = vertices;
        int oldvertlength = oldvert.length;
        int newvertlen = poly.vertices.length;
        int[] newvertindex = new int[newvertlen];
        Vector newvert = new Vector();
    
        Hashtable table = new Hashtable();
        for(int i=0; i < vertices.length; i++){
            VectorIndex key = new VectorIndex(i, vertices[i]);
            table.put(key,key);
        }
    

        for(int i = 0; i < newvertlen; i++){
      
            Vector3D vert = poly.vertices[i];
            VectorIndex key = new VectorIndex(i,vert);
            VectorIndex obj = (VectorIndex)table.get(key);
      
            if(obj == null){ // there is no such vertex, let add new one
                key.index =  vertices.length + newvert.size();
                table.put(key,key);
                newvert.addElement(vert);
                newvertindex[i] = key.index;
            } else { // vertex is already in table
                newvertindex[i] = obj.index;
            }
      
            //newvertindex[i] = findVertex(oldvert,newvert, poly.vertices[i]);
            //System.err.print(newvertindex[i] + " ");
        }
        //System.err.println();

        vertices = new Vector3D[oldvert.length + newvert.size()];
        System.arraycopy(oldvert,0,vertices,0,
                         oldvert.length);
        for(int i = 0; i < newvert.size(); i++){
            vertices[i + oldvertlength] = (Vector3D)newvert.elementAt(i);
        }

        // add faces
        int [][] oldfaces = ifaces;
        ifaces = new int[oldfaces.length + poly.ifaces.length][];
    
        System.arraycopy(oldfaces,0,ifaces,0,
                         oldfaces.length);
        System.arraycopy(poly.ifaces,0,ifaces,oldfaces.length,
                         poly.ifaces.length);

        // shift indexes in new faces;
        for(int i=oldfaces.length; i < ifaces.length; i++){
            int[] iface = ifaces[i];
            for(int j = 0; j < iface.length; j++){
                iface[j] = newvertindex[iface[j]];
            }
        }    

        // add colors
        //Color[] oldcolors = colors;
        // indices of new colors in reallocated array
        int[] newcolorind = new int[poly.colors.length];
    
        for(int i =0; i < poly.colors.length; i++){
            // try to find new color among old colors
            // we start from last color because it is likely 
            // to have it just at the end of array
            java.awt.Color newcolor = poly.colors[i];
            search: {
                for(int j = colors.length -1; j >=0; j--){
                    if(colors[j].equals(newcolor)){
                        newcolorind[i] = j;
                        break search;
                    }
                }
                //we have found nothing -> reallocate colors
                // this will not happens too often
                java.awt.Color[] newcolors = new java.awt.Color[colors.length+1];
                System.arraycopy(colors,0,newcolors,0,colors.length);
                newcolors[colors.length] = newcolor;
                newcolorind[i] = colors.length;
                colors = newcolors;
            } // end search
        }

        // add color indices
        int[] oldicolor = icolor;
        icolor = new int[oldicolor.length + poly.icolor.length];
        System.arraycopy(oldicolor,0,icolor,0, oldicolor.length);
        System.arraycopy(poly.icolor,0,icolor,oldicolor.length, 
                         poly.icolor.length);

        // shift new color indices
        for(int i=oldicolor.length; i < icolor.length; i++){
            icolor[i] = newcolorind[icolor[i]];
        }            
    }

    /**
     *  void writeToFile(Polyhedron poly, String fname, String ftype)
     *  
     */
    static void writeToFile(Polyhedron poly, String fname, String ftype){
        try {
            FileOutputStream file = 
                new FileOutputStream(fname);
            PrintStream out = new PrintStream(file);
            if(ftype.equals("Vrml2")){
                poly.writeVrml(out);  	    
            } else if(ftype.equals("POV")){
                poly.writePOV(out);  	    
            } else if(ftype.equals("OFF")){
                poly.writeOFF(out);  	    
            }	  
            file.close();
        } catch (Exception e){
            e.printStackTrace(Out);
        }
    }

    /**
     *   writeToFile
     *
     */
    public void writeToFile(String fname, String ftype){
        try {
            FileOutputStream file = 
                new FileOutputStream(fname);
            PrintStream out = new PrintStream(file);
            if(ftype.equals("Vrml2")){
                writeVrml(out);  	    
            } else if(ftype.equals("POV")){
                writePOV(out);  	    
            } else if(ftype.equals("OFF")){
                writeOFF(out);  	    
            }	  
            file.close();
        } catch (Exception e){
            e.printStackTrace(Out);
        }
    }

    public static String getPostfix(String type){

        if(type.equals("Vrml2"))
            return ".wrl";
        else if(type.equals("OFF"))
            return ".off";
        else if(type.equals("POV"))
            return ".inc";
        return "";    
    }

    static String zeroes = "00000000000";

    /**
       generates file name from given prefix, output type, number and maximal number
    */
    public static String makeFileName(String prefix, String type, int n, int maxn){
        String ext = getPostfix(type);
        String maxlen = "";
        if(maxn > 0){
            maxlen = Integer.toString(maxn,10);
            String current = Integer.toString(n,10);
            int l = maxlen.length() - current.length();
            return prefix+zeroes.substring(0,l)+current+ext;
        } else {
            return prefix+Integer.toString(n,10)+ext;      
        }
    }

    /*
      public static void main(String args[]){

      String fname = args[0];

      Polyhedron poly = new Polyhedron();
      try {
      FileInputStream f = new FileInputStream(fname);
      poly.readOFF(f);
      } catch(Exception e){
      e.printStackTrace(System.err);
      }
    
      poly.outColor = true;

      poly.writeVrml(System.out);
    
      }
    */

    static final String VRMLEdge[] = {
        "Background {skyColor 1 1 1}",
        "PROTO Edge [",
        "field SFVec3f start 0 -1 0",
        "field SFVec3f end   0  1 0",
        "field SFFloat radius 0.01",
        "exposedField SFNode appearance Appearance {",
        "    material Material{",
        "	diffuseColor 0.6 0.4 0.4",
        "    }",
        "}",
        "]{",
        "    DEF TRANSFORM Transform{",
        "	children [",
        "	DEF CYLINDER Shape{ ",
        "	    geometry Cylinder{}",
        "	    appearance IS appearance",
        "	}",
        "	]",
        "    }    ",
        "   Script {",
        "	directOutput TRUE",
        "	field SFVec3f start IS start",
        "	field SFVec3f end IS end",
        "	field SFFloat radius IS radius",
        "	field SFNode cylinder USE CYLINDER",
        "	field SFNode transform USE TRANSFORM",
        "	url [\"javascript:",
        "	function initialize(){",
        "	    transform.set_rotation = new SFRotation(",
        "                            new SFVec3f(0,1,0),start.subtract(end));",
        "	    transform.set_translation = start.add(end).multiply(0.5);",
        "	    var len = start.subtract(end).length();",
        "	    cylinder.set_geometry = ",
        "	    Browser.createVrmlFromString(",
        "	    'Cylinder { radius '",
        "	          +radius + ' height '+len+	    ",
        "	    '}'",
        "	    )[0];",
        "	}	",
        "	\"]",
        "   }",
        "}"
    };

    static final String POVStart[] = {
        "#version 3.1",
        "global_settings",
        "{",
        "  assumed_gamma 1.0",
        "}",
        "camera",
        "{",
        "  location  <0.01, 0.01, -3.0>",
        "  direction 1.5*z",
        "  right     4/3*x",
        "  look_at   <0.0, 0.0,  0.0>",
        "}",
        "background { color red 1 green 1 blue 1 }",
        "light_source{ <0, 10, -10> color rgb <1,0,0> }",
        "light_source { <7, -5, -10> color rgb <0,1,0>}",
        "light_source { <-7, -5, -10> color rgb <0,0,1> }",
        "#declare FinF = finish {reflection 0 ambient 0.2 diffuse 0.8 phong 0.1 metallic 0}",
        "#declare TextureE = texture{",
        "  pigment {color rgb <0.1,0.1,0.1>}",
        "  finish {reflection 0 ambient 0.1  diffuse 0.5 phong 1.0}",
        "}",
        "#declare TextureF = texture{pigment{color rgb <1 1 1>}finish{FinF}}",
        "#declare RadiusE = 0.01;",
        "// stat of polyhedron ",
        "#declare Polyhedron = union {",
    };

    static final String POVEnd[] = {
        "}",
        "// end of polyhedron ",
        "object { Polyhedron ",
        "scale 1/PolyRadius",
        "rotate <0 0 0> ",
        "no_shadow",
        "}"
    };


    final static double MINAREA = 1.E-3;
    
    double getArea(int face[]){

        Vector3D area = new Vector3D(0,0,0);
        int length = face.length;
        for( int i = 0; i < length; i++ ){
            area.addSet(vertices[face[i]].cross(vertices[face[(i+1)%length]]));
        }
        area.mulSet(0.5);
        return area.length();
    }

    boolean isCollinerar(int face[]){
    
        double area = getArea(face);
        if(area < MINAREA)
            return true;
        else 
            return false;
    } 
}
