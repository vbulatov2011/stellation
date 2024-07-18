package pvs.g3d;

/*
Binary STL

Because ASCII STL files can become very large, a binary version of STL exists. A binary STL file has an 80 character header (which is generally ignored - but which should never begin with 'solid' because that will lead most software to assume that this is an ASCII STL file). Following the header is a 4 byte unsigned integer indicating the number of triangular facets in the file. Following that is data describing each triangle in turn. The file simply ends after the last triangle.

Each triangle is described by twelve floating point numbers: Three for the normal and then three for the X/Y/Z coordinate of each vertex - just as with the ASCII version of STL. After the twelve float's there is a two byte unsigned 'short' integer that is the 'attribute byte count' - in the standard format, this should be zero because most software does not understand anything else.

Floating point numbers are represented as IEEE floating point numbers and the endianness is assumed to be little endian although this is not stated in documentation.
*/


import java.awt.Color;
import java.io.DataInputStream;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.io.PrintStream;
import java.util.Hashtable;
import java.util.Vector;

public class STL {

  double vert[]; // array of vertex coordinates 
  int faces[][]; // array of faces, each has 3 vertice, which are indexis in array of vertices 

  /**
   *
   *
   *
   */
  public STL(double vert[], int[][] faces){

    this.vert = vert;
    this.faces = faces; 

  }

  static final String VRMLhead = "";
  static final String VRMLtail = "";

  void writeVRML(String fname) throws IOException{
    

    FileOutputStream out = new FileOutputStream(fname);
    PrintStream pout = new PrintStream(out);
    pout.print(VRMLhead);
    
	
    pout.println("geometry IndexedFaceSet {");
    pout.println("#vertexOrdering COUNTERCLOCKWISE");
    pout.println("solid TRUE");
    pout.println("#convexfaceType CONVEX");
    pout.println("creaseAngle 0");
    pout.println("coord DEF COORD Coordinate {");
    pout.println("point [");
    for(int i=0; i < vert.length; i += 3){
      pout.println(" " + ((float)vert[i]) + " " + ((float)vert[i+1]) + " " + ((float)vert[i+2]));
    }
    pout.println("]");
    pout.println("}");
    pout.println("coordIndex [");
    for(int i=0; i < faces.length; i++){
      pout.println(" " + faces[i][0]/3 + " " + faces[i][1]/3  + " " + faces[i][2]/3 +" -1");
    }
    pout.println("]");
    pout.println("}");

    pout.print(VRMLtail);

    out.close();

  }


  static int readInt(DataInputStream data) throws IOException{

    int i = data.readUnsignedByte() | (data.readUnsignedByte()<<8)|
      (data.readUnsignedByte()<<16)|(data.readUnsignedByte()<<24);      

    return i;
  }

  static float readFloat(DataInputStream data) throws IOException{

    int i = data.readUnsignedByte() | (data.readUnsignedByte()<<8)|
      (data.readUnsignedByte()<<16)|(data.readUnsignedByte()<<24);      
    return Float.intBitsToFloat(i);

  }

  static Vec3f readVec3f(DataInputStream data) throws IOException{

    return new Vec3f(readFloat(data),readFloat(data),readFloat(data));

  }

  static void readVector(DataInputStream data, Vec3 v) throws IOException{

    if(v == null)
      v = new Vec3();
    v.x = readFloat(data);
    v.y = readFloat(data);
    v.z = readFloat(data);

  }

  static double[] cross(double v1[], double v2[]){
    double r[] = new double[3];
    r[0] = v1[1]*v2[2] - v1[2]*v2[1];
    r[1] = v1[2]*v2[0] - v1[0]*v2[2];
    r[2] = v1[0]*v2[1] - v1[1]*v2[0];
    return r;
  }

  static double[] subtract(double v1[], double v2[]){
    double r[] = new double[3];
    r[0] = v1[0] - v2[0];
    r[1] = v1[1] - v2[1];
    r[2] = v1[2] - v2[2];
    return r;
  }

  static void normalize(double v[]){
    double l = getLength(v);
    v[0] /= l;
    v[1] /= l;
    v[2] /= l;
  }

  static void print(double[] v){

    System.out.println("[" + v[0] + "," + v[1] + ", " + v[2]);

  }

  static double getLength(double v[]){
    return Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
  }

    /*
	geometry IndexedFaceSet {
	    #vertexOrdering COUNTERCLOCKWISE
	    solid TRUE
	    #convexfaceType CONVEX
	    creaseAngle 0
	    coord DEF COORD Coordinate {
		point [
		-0.031323991 -0.090661071  0.070021085,
		-0.066705709 -0.053035441  0.082711335,
    */

  static public void writeVRML(String fname, OutputStream out){

  }

  public static STL readFacesSet( String fname ) throws IOException {
    
    FileInputStream instr = new FileInputStream(fname);
    DataInputStream data = new DataInputStream(instr);
    
    instr.skip(80);
    
    int size = readInt(data);      
    System.out.println("size: " + size);
    int ifaces[][] = new int[size][3];
    int vindex = 0;
    Hashtable vtable = new Hashtable();
    Vector vvector = new Vector();
    for(int f = 0; f < size; f++){
      // normal
      //readFloat(data);  readFloat(data); readFloat(data);
      instr.skip(3*4);
      for(int i = 0; i < 3; i++){
        Vec3f vnew = readVec3f(data);
        Vec3f vold = (Vec3f)vtable.get(vnew);
        if(vold == null){
          vnew.index = vindex++;
          vtable.put(vnew, vnew);
          vvector.add(vnew);
          vold = vnew;
        } 
        vold.fcount++;
        ifaces[f][i] = vold.index*3;
      }
      instr.skip(2);        
    }
    
    instr.close();
    int vcount = vvector.size();
    System.out.println("vcount: " + vcount);
    double vert[] = new double[vcount*3];
    int count = 0;      
    int facesPerVertex = 0;
    int fhistogram[] = new int[20];
    for(int i=0; i < vcount; i++){
      Vec3f v = (Vec3f)vvector.elementAt(i);
      facesPerVertex += v.fcount;
      fhistogram[v.fcount]++;
      vert[count++] = v.x;
      vert[count++] = v.y;
      vert[count++] = v.z;
    }
    System.out.println("facesPerVertex: " + facesPerVertex/((double)vcount));
    System.out.println("histogram: ");
    for(int i=0; i < fhistogram.length; i++){
      if(fhistogram[i] != 0){
        System.out.println(" " + i + "->" + fhistogram[i]);
      }
    }
    
    STL faces = new STL(vert, ifaces);
    return faces; 
  }
  
  
  public static Model3D readModel( String fname){

    try {

      STL stl = readFacesSet(fname);

      int iedges[][] = new int[0][0];
      Color[] colors = new Color[]{Color.red};
      int [] cindex = new int [stl.faces.length];      

      return new Model3D(stl.vert, stl.faces, iedges, colors, cindex);

    } catch(Exception e){
      e.printStackTrace();
    }
    return null;
  }

  public static void main(String [] args) throws IOException{
   
    if(args.length == 0){
      System.out.println("STL to VRML convertor.\n Use java STL fname");      
    }
      
    for(int i=0; i < args.length; i++){

      STL stl = readFacesSet(args[i]);
      stl.writeVRML(args[i]+".wrl");
    }    
  }
}


class Vec3f {

  float x, y, z;
  int hcode;
  int fcount = 0;
  int index = 0;

  Vec3f(float _x, float _y, float _z){
    x = _x;
    y = _y;
    z = _z;
    hcode = Float.floatToIntBits(x) + Float.floatToIntBits(y) + Float.floatToIntBits(z);
  }

  public int hashCode(){
    return hcode;
  }

  public boolean equals(Object obj){

    if(obj instanceof Vec3f){
      Vec3f v = (Vec3f)obj;
      return (v.x == x && v.y == y && v.z == z);
    } else {
      return false;
    }
  }
}
