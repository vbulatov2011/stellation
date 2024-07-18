package pvs.polyhedra;


public class Matrix3D {

  public double[][] m = new double[3][3];  

  /**
    constructor

   */
  public Matrix3D(){
    m[0][0] = m[1][1] = m[2][2] = 1;
  }

  public Matrix3D(double m00, double m01, double m02,
		  double m10, double m11, double m12,
		  double m20, double m21, double m22){
    m[0][0] = m00; m[0][1] = m01; m[0][2] = m02;
    m[1][0] = m10; m[1][1] = m11; m[1][2] = m12;
    m[2][0] = m20; m[2][1] = m21; m[2][2] = m22;
    
  }

// PB! 

  public Matrix3D(Vector3D column1, Vector3D column2, Vector3D column3){
    m[0][0] = column1.x; m[0][1] = column2.x; m[0][2] = column3.x;
    m[1][0] = column1.y; m[1][1] = column2.y; m[1][2] = column3.y;
    m[2][0] = column1.z; m[2][1] = column2.z; m[2][2] = column3.z;
    
  }

  /**
     reflection
	 
	 returns matrix representing reflection by plane THROUGH origin with normal as normalvector
	 (normal will be normalized!)
	 
  */	 
 

  public static Matrix3D reflection(Vector3D normal){

    return new Matrix3D (new Vector3D(1,0,0).reflect(normal,0),
	                     new Vector3D(0,1,0).reflect(normal,0),
	       			     new Vector3D(0,0,1).reflect(normal,0));
 
  }


// PB! end


  /**
    rotation
    
    returns matrix representing rotation about given axis on given angle
  */
  public static Matrix3D rotation(Vector3D axis, double angleRad){

    double  
	    c = Math.cos(angleRad),
	    s = Math.sin(angleRad),
	    t = 1.0 - c;

    axis.normalize();
    double a0 = axis.x;
    double a1 = axis.y;
    double a2 = axis.z;

    return new Matrix3D(t * a0 * a0 + c,
		    t * a0 * a1 - s * a2,
		    t * a0 * a2 + s * a1,
		    t * a0 * a1 + s * a2,
		    t * a1 * a1 + c,
		    t * a1 * a2 - s * a0,
		    t * a0 * a2 - s * a1,
		    t * a1 * a2 + s * a0,
		    t * a2 * a2 + c);
    
  }

  public Matrix3D mul(Matrix3D matrix){
    double [][] a = matrix.m;
    return new Matrix3D(
			m[0][0]*a[0][0]+m[0][1]*a[1][0]+m[0][2]*a[2][0],
			m[0][0]*a[0][1]+m[0][1]*a[1][1]+m[0][2]*a[2][1],
			m[0][0]*a[0][2]+m[0][1]*a[1][2]+m[0][2]*a[2][2],
			m[1][0]*a[0][0]+m[1][1]*a[1][0]+m[1][2]*a[2][0],
			m[1][0]*a[0][1]+m[1][1]*a[1][1]+m[1][2]*a[2][1],
			m[1][0]*a[0][2]+m[1][1]*a[1][2]+m[1][2]*a[2][2],
			m[2][0]*a[0][0]+m[2][1]*a[1][0]+m[2][2]*a[2][0],
			m[2][0]*a[0][1]+m[2][1]*a[1][1]+m[2][2]*a[2][1],
			m[2][0]*a[0][2]+m[2][1]*a[1][2]+m[2][2]*a[2][2]
			);
  }

  private double determinant = 0;
  private boolean isDeterminantInitialized = false;

  public double getDeterminant(){

    if(isDeterminantInitialized)
      return determinant;
    isDeterminantInitialized = true;
    determinant = 
      m[0][0] * ( m[1][1]*m[2][2] - m[1][2]*m[2][1]) - 
      m[1][0] * ( m[0][1]*m[2][2] - m[2][1]*m[0][2]) + 
      m[2][0] * ( m[0][1]*m[1][2] - m[1][1]*m[0][2]);    
      return determinant;    
  }

} // class Matrix3D
