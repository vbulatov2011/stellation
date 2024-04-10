package pvs.g3d;

/** A conventional 3D matrix object that can transform sets of
    3D points and perform a variety of manipulations on the transform */
import pvs.utils.Fmt;

public class Vec3 {

  public double x, y, z;


  public Vec3() {
    this.x = 0.;
    this.y = 0.;
    this.z = 0.;
  }

  public Vec3(double x, double y, double z) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  
  /**
    dot product two vectors 
   */
  public static double dot(Vec3 v1, Vec3 v2){
    return (v1.x*v2.x+v1.y*v2.y+v1.z*v2.z);
  }

  public double dot(Vec3 v1){
    return (x*v1.x+y*v1.y+z*v1.z);
  }

  /**
    cross product two vectors 
   */
  public static Vec3 cross(Vec3 v1, Vec3 v2){
    return new Vec3(v1.y*v2.z-v1.z*v2.y,
		    v1.z*v2.x-v1.x*v2.z,
		    v1.x*v2.y-v1.y*v2.x);
  }

  /**
    cross product this vector 
   */
  public Vec3 cross(Vec3 v){
    double x,y,z;       
    x = this.y*v.z-this.z*v.y;
    y = this.z*v.x-this.x*v.z;
    z = this.x*v.y-this.y*v.x;
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  /**
    add vector to this vector
   */
  public Vec3 add(Vec3 v){
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }

  /**
    multiply thios vector by scalar
   */
  public Vec3 mul(double a){
    this.x *= a;
    this.y *= a;
    this.z *= a;
    return this;
  }

  /**
    normalize this vector
   */
  public double normalize(){
    double l = length();
    x /= l;
    y /= l;
    z /= l;
    return l;
  }
  
  /**
    length of this vector
   */
  public double length(){
    return Math.sqrt(length2()); 
  }

  /**
    squire of length of this vector
   */
  public double length2(){
    return x*x + y*y + z*z; 
  }

  static double TOL = 1.e-10;
  static double chop(double x){
    if(x < TOL && x > -TOL)
      return 0;
    else 
      return x;
  }

  public String toString() {
    return "{" + Fmt.fmt(chop(x),8,5) + " " + 
		   Fmt.fmt(chop(y),8,5) + " " + 
		   Fmt.fmt(chop(z),8,5) + "}";
    //return ("[" + x + "," + y + "," + z + "]");
  }

  public int hashCode(){
    int value = (int)(331345.563*x)+
      (int)(412345.891*y)+(int)(71341.678*z);
    //System.out.println(this + ":"+value);
    return value;
  }

  static final double tolerance=1.e-6;

  public boolean equals(Object o){
    //System.out.print("e:");
    if(o == this)
      return true;
    Vec3 v = (Vec3)o;
    double dx = v.x - x;
    double dy = v.y - y;
    double dz = v.z - z;
    if(dx < 0) dx = -dx;
    if(dy < 0) dy = -dy;
    if(dz < 0) dz = -dz;

    return dx < tolerance && dy < tolerance && dz < tolerance;
  }


}
