package pvs.polyhedra;

import pvs.utils.Fmt;

public class Vector3D {
  public double x, y, z;

  public Vector3D(){
    
  }
  
  public Vector3D(Vector3D v){
    x = v.x;
    y = v.y;
    z = v.z;
  }

  public Vector3D(double x, double y, double z){
    this.x = x;
    this.y = y;
    this.z = z;
  }

  public Vector3D(double[] v){
    this.x = v[0];
    this.y = v[1];
    this.z = v[2];
  }

  public Vector3D set(Vector3D v){
    x = v.x;
    y = v.y;
    z = v.z;
    hashCode = 0;
    return this;
  }

  public Vector3D set(double x, double y, double z){

    this.x = x;
    this.y = y;
    this.z = z;
    hashCode = 0;
    return this;
  }

  public Vector3D add(Vector3D v){
    return new Vector3D(x+v.x,y+v.y,z+v.z);
  }

  public Vector3D addSet(Vector3D v){
    x += v.x;
    y += v.y;
    z += v.z;
    hashCode = 0;
    return this;
  }
  
  public Vector3D sub(Vector3D v){
    return new Vector3D(x-v.x,y-v.y,z-v.z);
  }

  public Vector3D subSet(Vector3D v){
    x -= v.x;
    y -= v.y;
    z -= v.z;
    hashCode = 0;
    return this;
  }

  public Vector3D mul(double a){
    return new Vector3D(x*a,y*a, z*a);
  }

  public Vector3D mul(double sx, double sy, double sz){
    return new Vector3D(x*sz,y*sy, z*sz);
  }

  public Vector3D mulSet(double a){
    x *= a;
    y *= a;
    z *= a;
    hashCode = 0;
    return this;
  }
  
  public Vector3D mulSet(double sx, double sy, double sz){
    x *= sx;
    y *= sy;
    z *= sz;
    hashCode = 0;
    return this;
  }
    
  public Vector3D mul(Matrix3D matrix){
    double [][]m = matrix.m;

    double m00 = m[0][0];
    double m01 = m[0][1];
    double m02 = m[0][2];
    double m10 = m[1][0];
    double m11 = m[1][1];
    double m12 = m[1][2];
    double m20 = m[2][0];
    double m21 = m[2][1];
    double m22 = m[2][2];

    return new Vector3D(x*m00+y*m01+z*m02,
			x*m10+y*m11+z*m12,
			x*m20+y*m21+z*m22);
  }

  public Vector3D mulSet(Matrix3D matrix){
    double [][]m = matrix.m;

    double m00 = m[0][0];
    double m01 = m[0][1];
    double m02 = m[0][2];
    double m10 = m[1][0];
    double m11 = m[1][1];
    double m12 = m[1][2];
    double m20 = m[2][0];
    double m21 = m[2][1];
    double m22 = m[2][2];

    double x1 = x*m00+y*m01+z*m02;
    double y1 = x*m10+y*m11+z*m12;
    double z1 = x*m20+y*m21+z*m22;
    this.x = x1;
    this.y = y1;
    this.z = z1;

    hashCode = 0;
    return this;
			
  }

  public Vector3D cross(Vector3D v){
    return new Vector3D(y*v.z - z*v.y,z*v.x - x*v.z, x*v.y - y*v.x);
  }

  public double dot(Vector3D v){
    return x*v.x + y*v.y + z*v.z;
  }

  public Vector3D getCoord(double f[]){
    f[0] = x;
    f[1] = y;
    f[2] = z;
    hashCode = 0;
    return this;
  }
  
  public Vector3D normalize(){
    double len = length();
    if(len != 0.0)
      mulSet(1./len);
    hashCode = 0;
    return this;
  }

  public double length(){
    return Math.sqrt(length2());
  }

  public double length2(){
    return x*x + y*y +z*z;
  }

  /**
    rotates this vector around axis on given angle. Axis should be normalized!
   */
  public Vector3D rotate (Vector3D axis, double angle){
    return rotate(axis,Math.sin(angle),Math.cos(angle));
  }

  /**
    rotates this vector around axis on given angle. Axis should be normalized!
   */
  public Vector3D rotate (Vector3D axis, double sinangle, double cosangle){
    Vector3D p = axis.mul(this.dot(axis));
    p.addSet(this.sub(p).mulSet(cosangle));
    p.addSet(axis.cross(this).mulSet(sinangle));
    return p;
  }

  /**
    rotates this vector around axis on given angle. Axis should be normalized!
   */
  public Vector3D rotateSet (Vector3D axis, double sinangle, double cosangle){
    Vector3D p = rotate(axis, sinangle, cosangle);
    x = p.x; 
    y = p.y; 
    z = p.z;
    hashCode = 0;
    return this;
  }

  public Vector3D rotateSet (Vector3D axis, double angle){
    Vector3D p = rotate(axis, Math.sin(angle), Math.cos(angle));
    x = p.x; 
    y = p.y; 
    z = p.z;
    hashCode = 0;
    return this;
  }

  // returns vector on line parametrized by t such that at t = 0 retuyrn v1, at t = 1 return v2;
  public static Vector3D interpolate(Vector3D v1, Vector3D v2, double t){

    double x,y,z;

    x = v1.x * (1-t) + v2.x * (t);
    y = v1.y * (1-t) + v2.y * (t);
    z = v1.z * (1-t) + v2.z * (t);

    return new Vector3D(x,y,z);

  }



  /**
    rotates this vector with transform, which rotates vector 'from' 
    into vector 'to'
   */
  public void rotateSet (Vector3D from, Vector3D to){ 

    double sinangle, cosangle;
  
    Vector3D axis = from.cross(to);
    sinangle = axis.length();
    cosangle = from.dot(to);

    if(sinangle > TOL ||  sinangle < -TOL){
      axis.normalize();
      rotateSet(axis,sinangle,cosangle);
    }  
  }

// PB!

  /** 
    reflects this vector normal to the plane   a.x + a0 = 0
    n will be normalized
  */  

  public Vector3D reflect(Vector3D a, double a0){
    Vector3D x = new Vector3D(this);
    x = x.subSet(a.mul(2 * (x.dot(a.normalize()) + a0)));
    return x;
  }

// PB! end

  static final double tolerance=1.e-6;

  public boolean collinear(Vector3D v){
    return (cross(v).length() < tolerance);  
  }

  public boolean equals(Object o){
    //System.out.print("e:");
    if(o == this)
      return true;
    Vector3D v = (Vector3D)o;
    double dx = v.x - x;
    double dy = v.y - y;
    double dz = v.z - z;
    if(dx < 0) dx = -dx;
    if(dy < 0) dy = -dy;
    if(dz < 0) dz = -dz;

    return dx < tolerance && dy < tolerance && dz < tolerance;
  }

  int hashCode = 0;

  public int hashCode(){
    if(hashCode != 0)
      return hashCode;
    int value = (int)(331345.563*x)+
      (int)(412345.891*y)+(int)(71341.678*z);
    //System.out.println(this + ":"+value);
    return value;
  }

  static double TOL = 1.e-10;
  static double chop(double x){
    if(x < TOL && x > -TOL)
      return 0;
    else 
      return x;
  }

  public String toString(){
    return "{" + Fmt.fmt(chop(x),19,16) + " " + 
		   Fmt.fmt(chop(y),19,16) + " " + 
		   Fmt.fmt(chop(z),19,16) + "}";
  }

  public static void main(String[] v){
    int i = 0;
    Vector3D from = new Vector3D(Double.valueOf(v[i++]).doubleValue(),
				 Double.valueOf(v[i++]).doubleValue(),
				 Double.valueOf(v[i++]).doubleValue());
    Vector3D two = new Vector3D(Double.valueOf(v[i++]).doubleValue(),
				Double.valueOf(v[i++]).doubleValue(),
				Double.valueOf(v[i++]).doubleValue());
    Vector3D x = new Vector3D(Double.valueOf(v[i++]).doubleValue(),
			      Double.valueOf(v[i++]).doubleValue(),
			      Double.valueOf(v[i++]).doubleValue());
    System.out.println(x);
    x.rotateSet(from.normalize(),two.normalize());
    System.out.println(x);    
  }

} // class Vector3D

