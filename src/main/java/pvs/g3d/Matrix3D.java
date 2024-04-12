package pvs.g3d;

/** A conventional 3D matrix object that can transform sets of
    3D points and perform a variety of manipulations on the transform */

public class Matrix3D {
    double xx, xy, xz, xo;
    double yx, yy, yz, yo;
    double zx, zy, zz, zo;
    static final double pi = Math.PI;

    /** Create a new unit matrix */
    public Matrix3D () {
      xx = 1.0f;
      yy = 1.0f;
      zz = 1.0f;
    }

    public Matrix3D (Matrix3D matr) {
      xx = matr.xx;
      xy = matr.xy;
      xz = matr.xz;
      xo = matr.xo;

      yx = matr.yx;
      yy = matr.yy;
      yz = matr.yz;
      yo = matr.yo;

      zx = matr.zx;
      zy = matr.zy;
      zz = matr.zz;
      zo = matr.zo;      

    }


    /** Create a new matrix, which rotates fi radian around given axis */
    public Matrix3D (Vec3 axis, double angleRad) {
      
      double c = Math.cos(angleRad), s = Math.sin(angleRad);
      double t = 1.0 - c;
      
      axis.normalize();
      init(new Vec3(t * axis.x * axis.x + c,
		    t * axis.x * axis.y - s * axis.z,
		    t * axis.x * axis.z + s * axis.y),
	   new Vec3(t * axis.x * axis.y + s * axis.z,
		    t * axis.y * axis.y + c,
		    t * axis.y * axis.z - s * axis.x),
	   new Vec3(t * axis.x * axis.z - s * axis.y,
		    t * axis.y * axis.z + s * axis.x,
		    t * axis.z * axis.z + c));
    }

    /** Create a new matrix, with Vec3 as a rows */
    public Matrix3D (Vec3 v1, Vec3 v2, Vec3 v3) {
      init(v1,v2,v3);
    }
    
    /** Scale by f in all dimensions */
    public void scale(double f) {
      xx *= f; xy *= f; xz *= f; xo *= f; 
      yx *= f; yy *= f; yz *= f; yo *= f;
      zx *= f; zy *= f; zz *= f; zo *= f;
    }
    /** Scale along each axis independently */
    public void scale(double xf, double yf, double zf) {
	xx *= xf; xy *= xf; xz *= xf; xo *= xf;
	yx *= yf; yy *= yf; yz *= yf; yo *= yf;
	zx *= zf; zy *= zf; zz *= zf; zo *= zf;
    }
    /** Translate the origin */
    public void translate(double x, double y, double z) {
	xo += x; yo += y; zo += z;
    }
    /** rotate theta degrees about the y axis */
    public void yrot(double theta) {
	theta *= (pi / 180);
	double ct = Math.cos(theta);
	double st = Math.sin(theta);

	double Nxx = (double) (xx * ct + zx * st);
	double Nxy = (double) (xy * ct + zy * st);
	double Nxz = (double) (xz * ct + zz * st);
	double Nxo = (double) (xo * ct + zo * st);

	double Nzx = (double) (zx * ct - xx * st);
	double Nzy = (double) (zy * ct - xy * st);
	double Nzz = (double) (zz * ct - xz * st);
	double Nzo = (double) (zo * ct - xo * st);

	xo = Nxo; xx = Nxx; xy = Nxy; xz = Nxz;
	zo = Nzo; zx = Nzx; zy = Nzy; zz = Nzz;
    }
    /** rotate theta degrees about the x axis */
    public void xrot(double theta) {
	theta *= (pi / 180);
	double ct = Math.cos(theta);
	double st = Math.sin(theta);

	double Nyx = (double) (yx * ct + zx * st);
	double Nyy = (double) (yy * ct + zy * st);
	double Nyz = (double) (yz * ct + zz * st);
	double Nyo = (double) (yo * ct + zo * st);

	double Nzx = (double) (zx * ct - yx * st);
	double Nzy = (double) (zy * ct - yy * st);
	double Nzz = (double) (zz * ct - yz * st);
	double Nzo = (double) (zo * ct - yo * st);

	yo = Nyo; yx = Nyx; yy = Nyy; yz = Nyz;
	zo = Nzo; zx = Nzx; zy = Nzy; zz = Nzz;
    }

    /** rotate theta degrees about the z axis */
    public void zrot(double theta) {
	theta *= (pi / 180);
	double ct = Math.cos(theta);
	double st = Math.sin(theta);

	double Nyx = (double) (yx * ct + xx * st);
	double Nyy = (double) (yy * ct + xy * st);
	double Nyz = (double) (yz * ct + xz * st);
	double Nyo = (double) (yo * ct + xo * st);

	double Nxx = (double) (xx * ct - yx * st);
	double Nxy = (double) (xy * ct - yy * st);
	double Nxz = (double) (xz * ct - yz * st);
	double Nxo = (double) (xo * ct - yo * st);

	yo = Nyo; yx = Nyx; yy = Nyy; yz = Nyz;
	xo = Nxo; xx = Nxx; xy = Nxy; xz = Nxz;
    }

    /** Multiply this matrix by a second: M = M*R */
    public Matrix3D mul(Matrix3D rhs) {
      double lxx = xx * rhs.xx + yx * rhs.xy + zx * rhs.xz;
      double lxy = xy * rhs.xx + yy * rhs.xy + zy * rhs.xz;
      double lxz = xz * rhs.xx + yz * rhs.xy + zz * rhs.xz;
      double lxo = xo * rhs.xx + yo * rhs.xy + zo * rhs.xz + rhs.xo;
      
      double lyx = xx * rhs.yx + yx * rhs.yy + zx * rhs.yz;
      double lyy = xy * rhs.yx + yy * rhs.yy + zy * rhs.yz;
      double lyz = xz * rhs.yx + yz * rhs.yy + zz * rhs.yz;
      double lyo = xo * rhs.yx + yo * rhs.yy + zo * rhs.yz + rhs.yo;
      
      double lzx = xx * rhs.zx + yx * rhs.zy + zx * rhs.zz;
      double lzy = xy * rhs.zx + yy * rhs.zy + zy * rhs.zz;
      double lzz = xz * rhs.zx + yz * rhs.zy + zz * rhs.zz;
      double lzo = xo * rhs.zx + yo * rhs.zy + zo * rhs.zz + rhs.zo;
      
      xx = lxx; xy = lxy; xz = lxz; xo = lxo;
      yx = lyx; yy = lyy; yz = lyz; yo = lyo;
      zx = lzx; zy = lzy; zz = lzz; zo = lzo;
      
      return this;
    }
    
    /** Reinitialize to the unit matrix */
    public void unit() {
      xo = 0; xx = 1; xy = 0; xz = 0;
      yo = 0; yx = 0; yy = 1; yz = 0;
      zo = 0; zx = 0; zy = 0; zz = 1;
    }

    /** Reinitialize to the unit matrix */
    public void unit_flipped() {
      xo = 0; xx = 1; xy = 0; xz = 0;
      yo = 0; yx = 0; yy = -1; yz = 0;
      zo = 0; zx = 0; zy = 0; zz = -1;
    }

    /** Reinitialize to given rows */
    public void init(Vec3 v1, Vec3 v2, Vec3 v3) {
      xx = v1.x; xy = v1.y; xz = v1.z; xo = 0;
      yx = v2.x; yy = v2.y; yz = v2.z; yo = 0;
      zx = v3.x; zy = v3.y; zz = v3.z; zo = 0;
    }

    /** Transform nvert points from v into tv.  v contains the input
        coordinates in doubleing point.  Three successive entries in
	the array constitute a point.  tv ends up holding the transformed
	points as integers; three successive entries per point */
    public void transform(double v[], int tv[], int nvert) {
	double lxx = xx, lxy = xy, lxz = xz, lxo = xo;
	double lyx = yx, lyy = yy, lyz = yz, lyo = yo;
	double lzx = zx, lzy = zy, lzz = zz, lzo = zo;
	for (int i = nvert * 3; (i -= 3) >= 0;) {
	    double x = v[i];
	    double y = v[i + 1];
	    double z = v[i + 2];
	    tv[i    ] = (int) (x * lxx + y * lxy + z * lxz + lxo);
	    tv[i + 1] = (int) (x * lyx + y * lyy + z * lyz + lyo);
	    tv[i + 2] = (int) ((x * lzx + y * lzy + z * lzz + lzo)*1000000.0f);
	}
    }

    public void transform(double v[], double tv[], int nvert) {
	double lxx = xx, lxy = xy, lxz = xz, lxo = xo;
	double lyx = yx, lyy = yy, lyz = yz, lyo = yo;
	double lzx = zx, lzy = zy, lzz = zz, lzo = zo;
	for (int i = nvert * 3; (i -= 3) >= 0;) {
	    double x = v[i];
	    double y = v[i + 1];
	    double z = v[i + 2];
	    tv[i    ] = (x * lxx + y * lxy + z * lxz + lxo);
	    tv[i + 1] = (x * lyx + y * lyy + z * lyz + lyo);
	    tv[i + 2] = (x * lzx + y * lzy + z * lzz + lzo);
	}
    }

    public void transform(Vec3 v[], Vec3 tv[], int nvert) {
    
      //System.out.println(this);
      double lxx = xx, lxy = xy, lxz = xz, lxo = xo;
      double lyx = yx, lyy = yy, lyz = yz, lyo = yo;
      double lzx = zx, lzy = zy, lzz = zz, lzo = zo;
      
      for (int i = nvert; --i  >= 0;) {
	if(v[i] == null) 
	  continue;
	double x = v[i].x;
	double y = v[i].y;
	double z = v[i].z;
	Vec3 v3 = tv[i];
	v3.x = (x * lxx + y * lxy + z * lxz);
	v3.y = (x * lyx + y * lyy + z * lyz);
	v3.z = (x * lzx + y * lzy + z * lzz);
      }
    }
    
    public String toString() {
	return ("[" + xo + "," + xx + "," + xy + "," + xz + ";"
		+ yo + "," + yx + "," + yy + "," + yz + ";"
		+ zo + "," + zx + "," + zy + "," + zz + "]");
    }
}

