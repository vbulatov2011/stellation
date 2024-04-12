package pvs.polyhedra.stellation;

import static java.lang.Double.parseDouble;
import static java.lang.Math.abs;
import static java.lang.Math.floor;
import static pvs.utils.Output.fmt;
import static pvs.utils.Output.printf;

import java.awt.Component;
import java.awt.Container;
import java.awt.Font;
import java.awt.geom.AffineTransform;
import java.util.Enumeration;
import java.util.Hashtable;
import java.util.StringTokenizer;
import java.util.Vector;

import pvs.polyhedra.Matrix3D;
import pvs.polyhedra.Plane;
import pvs.polyhedra.Symmetry;
import pvs.polyhedra.Vector3D;

public class Utils {

    static final boolean DEBUG = false;
    /**
     *  transforms vectors according to given symmetry and removes duplicates 
     *
     */
    public static Vector3D[] transformVectors(Vector3D vec[], String symmetry){
        printf("transformVectors(vec:%d %s)\n", vec.length, symmetry);
        Matrix3D[] matr = Symmetry.getMatrices(symmetry);

        Hashtable ht = new Hashtable();
        for(int i = 0; i < vec.length; i++){
            Vector3D v = vec[i];
            for(int k =0; k < matr.length; k++){
                Vector3D v1 = v.mul(matr[k]);
                if(ht.get(v1) == null)
                    ht.put(v1,v1);
            }
        }
        
        int count = 0;
        Vector3D tvec[] = new Vector3D[ht.size()];
        for(Enumeration e = ht.keys(); e.hasMoreElements();){
            Vector3D v = (Vector3D)e.nextElement();      
            tvec[count++] = v;
        }
        printf("generated %d vectors\n", tvec.length);
        return tvec;
    }

    
    /**
       convert string into array of vectors 
       it takes a input as a "[(x0,y0,z0)(x1,y1,z1)(x2,y2,z2)]"
    */
    public static Vector3D[] parseVectors(String planes){

        StringTokenizer st = new StringTokenizer(planes, " ()[],", false);
        Vector coord = new Vector();
        while(st.hasMoreTokens()){
            coord.addElement(st.nextToken());
        }
        int size = coord.size()/3;
        Vector3D pplanes[] = new Vector3D[size];
    
        for(int i=0; i < size; i++){

            double x = Double.parseDouble((String)coord.elementAt(i*3));
            double y = Double.parseDouble((String)coord.elementAt(i*3+1));
            double z = Double.parseDouble((String)coord.elementAt(i*3+2));
            pplanes[i] = new Vector3D(x,y,z);

        }
        return pplanes;
    }

    /**
       convert string into array of vectors 
       it takes a input as a "[(nx0,ny0,nz0, px0,py0,pz0)(nx1,ny1,nz1, px1,py1,pz1)]"
       px, py pz may be absent
    */
    public static Plane[] parsePlanes(String splanes){

        StringTokenizer st = new StringTokenizer(splanes, " ()[],", true);
        
        Vector<String> coord = new Vector<String>(6);
        Vector<Plane> vplanes = new Vector<Plane>();

        while(st.hasMoreTokens()){
            
            String token = st.nextToken();
            //printf("token:'%s'\n", token);
            if(token.equals("[") || token.equals(" ") || token.equals(",")){
                // do nothing
                //printf("do nothing: %s\n", token);
            } else if(token.equals("(")) {
                // start of plane 
                coord.clear();
            } else if(token.equals(")")) {
                // printf("end of plane: %s\n", token);
                // printf("  count: %d\n", coord.size());
                // end of plane 
                if(coord.size()==3){
                    double nx = parseDouble(coord.get(0));
                    double ny = parseDouble(coord.get(1));
                    double nz = parseDouble(coord.get(2));                   
                    Plane plane = new Plane(new Vector3D(nx, ny, nz));
                    vplanes.add(plane); 
                    printf("plane: %s\n", plane);
                } else if(coord.size()==6){
                    double nx = parseDouble(coord.get(0));
                    double ny = parseDouble(coord.get(1));
                    double nz = parseDouble(coord.get(2));                   
                    double px = parseDouble(coord.get(3));                   
                    double py = parseDouble(coord.get(4));                   
                    double pz = parseDouble(coord.get(5));                   
                    Plane plane = new Plane(new Vector3D(nx, ny, nz),new Vector3D(px, py, pz));
                    vplanes.add(plane);
                    printf("plane: %s\n", plane);
                }
                        
            } else {
                // should be a number
                //printf("adding number: %s\n", token);
                coord.add(token);
            }
        }
        printf("plane parsed: %d\n", vplanes.size());

        //return (Plane[])vplanes.toArray();
        Plane planes[] = new Plane[vplanes.size()];
        vplanes.copyInto(planes);
        return planes;
    }


    /**
       return affine transform which transform 
       rect (inWidth x inHeight) into rect(outWidth, outHeight)
       
     */
    public static AffineTransform getBoxTransform(int inWidth, int inHeight,
                                        int outWidth, int outHeight){
        if(DEBUG)printf("in: %d x %d out: %d x %d\n", inWidth, inHeight, outWidth, outHeight);
        double s1 = ((double)outWidth)/inWidth;
        double s2 = ((double)outHeight)/inHeight;
        double scale;
        if(s1 < s2) 
            scale = s1;            
        else 
            scale = s2;
        if(DEBUG)printf("thumbnail scale: %7.3f\n", scale);
        return AffineTransform.getScaleInstance(scale, scale);
    }


    public static void setFont(Component comp, Font font){

        comp.setFont(font);
        if(comp instanceof Container){            
            Component comps[] = ((Container)comp).getComponents();
            for(int i = 0; i < comps.length; i++){
                setFont(comps[i], font);
            }
        }
    }

    public static String getVectorsString(Vector3D planes[]){

        StringBuffer ba = new StringBuffer();
        ba.append("[");
        for(int i = 0; i < planes.length; i++){
            ba.append(fmt("(%s,%s,%s)",getString(planes[i].x),getString(planes[i].y),getString(planes[i].z)));
        }
        ba.append("]");
        return ba.toString();    
    }

    public static String getPlanesString(Plane planes[]){

        StringBuffer ba = new StringBuffer();
        ba.append("[");
        for(int i = 0; i < planes.length; i++){
            Plane p = planes[i];
            Vector3D norm = p.getNormal();
            Vector3D point = p.getPoint();
            if(abs(norm.x-point.x)<EPS && abs(norm.y-point.y) < EPS && abs(norm.z-point.z)< EPS)
                ba.append(fmt("(%s,%s,%s)",getString(norm.x),getString(norm.y),getString(norm.z))); 
            else 
                ba.append(fmt("(%s,%s,%s,%s,%s,%s)",getString(norm.x),getString(norm.y),getString(norm.z),getString(point.x),getString(point.y),getString(point.z)));
        }
        ba.append("]");
        return ba.toString();    
    }

    /**
       formats double as string without extra zeroes at the end 
     */
    public static String getString(double v){

        int n = 0;
        double u = v;
        for( ; n < 10; n++) {            
            if(abs(u - floor(u+0.5)) < EPS){
                break;
            }
            u *= 10;
        }
        String format = "%."+n+"f";
        return fmt(format, v);
    }

    static final double EPS = 1.e-12;

    public static double chop(double v){
        if(v < -EPS || v > EPS)
            return v;
        else 
            return 0;    
    }


    /**
     *  return non-equivalent vectors inside of fundamental domain of symmetry group 
     *
     */
    static Vector3D[] getCanonicalVectors(Vector3D planes[], String polySymmetry){
    
        printf("getCanonicalVectors(planes: %d symmetry:%s\n", planes.length, polySymmetry);
        Symmetry.CanonicalTester tester = Symmetry.getCanonicalTester(polySymmetry);
        Vector cv = new Vector();
        Hashtable ht = new Hashtable();
        for(int i=0; i < planes.length; i++){
      
            if(tester.test(planes[i])){
	
                Vector3D v = new Vector3D(chop(planes[i].x),
                                          chop(planes[i].y),
                                          chop(planes[i].z));
                if(ht.get(v) == null){
	  
                    ht.put(v,v);
                    cv.addElement(v);
                    printf("%2d: %17.14f, %17.14f, %17.14f  adding canonical vector\n", i, v.x, v.y, v.z);
                } else {
                    printf("%2d: %17.14f, %17.14f, %17.14f  duplicated canonical vector, ignored\n", i, v.x, v.y, v.z);
                }
            } else {
                printf("%2d: %17.14f, %17.14f, %17.14f  tester.test() failed,  ignoring\n", i, planes[i].x,planes[i].y,planes[i].z);                
            }
        }   
        Vector3D cplanes[] = new Vector3D[cv.size()];
        if(cplanes.length != 0)
            cv.copyInto(cplanes);

        //if(dlgPlanes != null){
        //    dlgPlanes.setPlanes(cplanes, polySymmetry);
        //}
        printf("selected %d canonical planes\n", cplanes.length);
        return cplanes;
    }

    static Vector3D[] copyVectors(Vector3D v[]){

        Vector3D cv[] = new Vector3D[v.length];
        for(int i = 0; i < v.length; i++){
            cv[i] = new Vector3D(v[i]);
        }
        return cv;
    }

    static Plane[] copyPlanes(Plane planes[]){

        Plane cplanes[] = new Plane[planes.length];
        for(int i = 0; i < planes.length; i++){
            cplanes[i] = new Plane(planes[i]);
        }
        return cplanes;
    }

    static Vector3D[] planesToVectors(Plane planes[]){

        Vector3D v[] = new Vector3D[planes.length];
        for(int i = 0; i < v.length; i++){
            v[i] = planes[i].toVector();
        }
        return v;
    }

    static Plane[] vectorsToPlanes(Vector3D vectors[]){

        Plane planes[] = new Plane[vectors.length];
        for(int i = 0; i < vectors.length; i++){
            planes[i] = new Plane(vectors[i]);
        }
        return planes;
    }


}