package pvs.polyhedra;

import static pvs.utils.Output.fmt;

import Jama.Matrix;

public class Plane {
  
    protected Vector3D m_point;
    // notmal used to create plane possibe not unit normal, to use convenient vector like (1,1,1) 
    protected Vector3D m_normal;
    //protected Vector3D m_unitNormal;
    // unit normal 
    public Vector3D v;
    // distance to origin 
    public double d;
    public int index;

    // "randon" direction to choose "canonical" plane in case of d == 0
    static Vector3D rndDir = new Vector3D(3.1415926, 2.718281828459045, 1.718281828459045);

    /**
       plane is represented via point on plane closest to origin
     */
    public Plane(Vector3D point){

        this.v = new Vector3D(point);
        this.d = v.length();
        this.v.normalize();
        this.m_normal = new Vector3D(point);
        this.m_point = new Vector3D(point);
    }

    /** 
        plane is defined by unit normal  v
        and distance from origin d
    */
    public Plane(Vector3D v, double d, int index){
        this.d = d;
        this.v = new Vector3D(v);
        this.v.normalize();
        this.m_normal = new Vector3D(v);
        this.m_point = new Vector3D(d*v.x,d*v.y,d*v.z);
        this.index = index;
    }
  
    public Plane(Vector3D v, double d){
        this(v,d,0);
    }

    public Plane(Plane p){

        m_normal = new Vector3D(p.m_normal);
        m_point = new Vector3D(p.m_point);
        d = p.d;
        v = new Vector3D(p.v);


    }
  
    /** 
        plane passing through 3 point
    */
    public Plane(Vector3D v0, Vector3D v1, Vector3D v2){
        this(v0,v1,v2,0);
    }

    /**
       plane is represented via normal and point on plane 
     */
    public Plane(Vector3D normal, Vector3D point){
        this(normal, point, 0);
    }
    public Plane(Vector3D normal, Vector3D point, int index){

        this.m_normal = new Vector3D(normal);
        this.v = new Vector3D(normal);
        this.v.normalize();
        d = this.v.dot(point);
        this.m_point = new Vector3D(point);
    }

    public Plane(Vector3D v0, Vector3D v1, Vector3D v2, int index){

        m_point = new Vector3D(v0);
        this.index = index;
        
        Vector3D normal = v2.sub(v1).cross(v0.sub(v1));
        normal.normalize();
        double dot = normal.dot(v1);
        v = normal;
        d = dot;
        if(d < -TOLERANCE){
            d = -d;
            v.x = -v.x;
            v.y = -v.y;
            v.z = -v.z;
        } else if(d < TOLERANCE){
            d = 0; // special case 
            // test for orientation in some "random" direction 
            if(v.dot(rndDir) < 0){
                v.x = -v.x;
                v.y = -v.y;
                v.z = -v.z;
            }
        }
        m_normal = new Vector3D(v);
    }
    
    /**
       to put this plane into hashtable
    */
    public int hashCode(){
        int value = 
            (int)(3345.563*v.x) +
            (int)(4345.891*v.y) +
            (int)(7341.678*v.z) + 
            (int)(4134.178*d);
        // System.out.println(value);
        return value;
    }
    
    static final double TOLERANCE=1.e-10;//10;
    
    public boolean equals(Object o){
        
        if(o == this)
            return true;
        Plane p = (Plane)o;
        
        // System.out.println("plane.equals: " + p + " " + this);
        
        double dx = v.x - p.v.x;if(dx < 0) dx = -dx;
        double dy = v.y - p.v.y;if(dy < 0) dy = -dy;
        double dz = v.z - p.v.z;if(dz < 0) dz = -dz;
        double dd = d - p.d; if(dd < 0) dd = -dd;
        return 
            (dx < TOLERANCE) && 
            (dy < TOLERANCE) && 
            (dz < TOLERANCE) && 
            (dd < TOLERANCE);
    }
    
    static double TOL = 1.e-10;
    static double chop(double x){
        if(x < TOL && x > -TOL)
            return 0;
        else 
            return x;
    }

    public String toString(){
        
        return fmt("{(%8.5f,%8.5f,%8.5f) (%8.5f,%8.5f,%8.5f) %8.5f ;%d}",m_normal.x, m_normal.y, m_normal.z, m_point.x,m_point.y,m_point.z, d, index);

    }

    double distance(Vector3D v){
        return distance(v.x, v.y, v.z);
    }
    
    
    double distance(double x,double y, double z){

        return x*v.x+y*v.y+z*v.z-d;
    
    }

    /**
       return point of intersection of 3 planes, or null, if there is 
       no intersection
    */
    public static Vector3D intersect(Plane p1, Plane p2, Plane p3){
    
        try {
            double[][] vals = {{p1.v.x,p1.v.y,p1.v.z},
                               {p2.v.x,p2.v.y,p2.v.z},
                               {p3.v.x,p3.v.y,p3.v.z}};
            double[][] d = {{p1.d},{p2.d},{p3.d}};
      
            Matrix A = new Matrix(vals);
            Matrix B = new Matrix(d);
            Matrix result = A.solve(B);
            double[][] arr = result.getArray();
      
            Vector3D v = new Vector3D(arr[0][0],arr[1][0],arr[2][0]);
            //System.out.println("v: " + v);
            //System.out.println("intersection: " + p1.distance(v) + ", " + p2.distance(v) +  ", " + p3.distance(v));

            return v;
        } catch (Exception e){
      
        }
        return null;
    }  

    static Plane getRandomPlane(){
        return new Plane(new Vector3D(Math.random(),Math.random(),Math.random()).normalize(),
                         Math.random(),0);
    }

    /**
       convert plane into old represetation as vector 
       vector represets point on plane closest to origin
       this converesion fails for planes passing via origin 
     */
    public Vector3D toVector(){

        if(d == 0.) {
            throw new RuntimeException(fmt("plane %s cant be converted to vector\n", this));
        }
            
        return new Vector3D(d*v.x,d*v.y,d*v.z);
    }

    /**
       return point on plane 
     */
    public Vector3D getPoint(){
        return m_point;
    }

    /**
       retursn plane normal
     */
    public Vector3D getNormal(){
        return m_normal;
    }

    /**
       retursn plane normal
     */
    public Vector3D getUnitNormal(){
        return v;
    }

    public static void main(String[] arg){
    
        int count = 0;
        double maxerr = 0;
        double maxrad = 0;
        for(int i=0; i < 100000; i++){
            Plane p1 = getRandomPlane();
            Plane p2 = getRandomPlane();
            Plane p3 = getRandomPlane();
            Vector3D res = intersect(p1,p2,p3);
            if(res == null){
                count++;
            } else {
                double d1 = p1.distance(res.x,res.y,res.z);
                double d2 = p2.distance(res.x,res.y,res.z);
                double d3 = p3.distance(res.x,res.y,res.z);
                double er = (Math.abs(d1) + Math.abs(d2) + Math.abs(d3));
                if(er > maxerr){
                    maxerr = er;
                    maxrad = res.length();
                }
            }
        }
        System.out.println("no intersection: " + count);
        System.out.println("maxerr: " + maxerr);
        System.out.println("maxrad: " + maxrad);

        /*
          if(res != null)
          System.out.println(Fmt.fmt(res.x,20,17) + Fmt.fmt(res.y,20,17) + Fmt.fmt(res.z,20,17));
          else 
          System.out.println("no intersection");
        */   
    }
}
