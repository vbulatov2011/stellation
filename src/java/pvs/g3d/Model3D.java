package pvs.g3d;

/**
 *
 * Author: Daeron Meyer
 * Copyright (c) 1995 by The Geometry Center, University of Minnesota
 * Distributed under the terms of the GNU Library General Public License
 * 12-14-95
 *
 */

import java.applet.Applet;
import java.awt.Graphics;
import java.awt.Color;
import java.awt.Event;
import java.lang.*;
import java.io.*;
import java.net.URL;

import pvs.utils.Fmt;
/**
 *  class Model3D: a class for rendering 3D models
 *
 *  For more information about OFF files and other OOGL (Object Oriented
 *  Graphics Library) file formats, check the following URL:
 *
 *  http://www.geom.umn.edu/software/geomview/docs/oogltour.html
 */

public class Model3D {

    Face		face[];				// array of faces
  
    boolean	transformed, gothead;
    Matrix3D	mat;				// applied 3D transformation
    public double	
        xmin, xmax,			// bounding box parameters
		ymin, ymax,
		zmin, zmax;
    double	vert[];				// array of vertex coordinates
    int		nverts, nfaces, nedges,		// # of vertices, faces, edges
		vx[], vy[],			// coords for rendering faces
		tvert[],			// transformed vertices
		findex[];			// indices into face list
    Color		gr[];				// face colors
    final int	MAX_VERTS = 20;		        // assume each polygonal face
    // has less than 20 vertices.
    Vec3 normals[], tnormals[];  // normals of faces 

    //Vec3[] light = new Vec3[]{new Vec3(0,1,1),new Vec3(0.7,-0.5,1),new Vec3(-0.7,-0.5,1)};
    Vec3[] light;
    Color[] light_color;

    //Vec3[] light_normal = new Vec3[]{new Vec3(0,10,10),new Vec3(10,0,10),new Vec3(0,-10,10)}; // good
    Vec3[] light_normal = new Vec3[]{new Vec3(10,0,10),new Vec3(10,10,10),new Vec3(0,10,10)}; // MMA
    //Color[] light_color_normal = new Color[]{new Color(255,0,0),new Color(0,255,0),new Color(0,0,255)};
    //Color[] light_color_normal = new Color[]{new Color(200,30,30),new Color(30,200,30),new Color(30,30,200)}; // good 
    Color[] light_color_normal = new Color[]{new Color(225,0,0),new Color(0,225,0),new Color(0,0,225)}; // MMA
    /*
      {{1., 0., 1.}, RGBColor[1, 0, 0]},
      {{1., 1., 1.}, RGBColor[0, 1, 0]},
      {{0., 1., 1.}, RGBColor[0, 0, 1]}}
    */
    Vec3[] light_anaglyph = new Vec3[]{new Vec3(10,10,10), new Vec3(-10,5,10), };
    Color[] light_color_anaglyph = 
        new Color[]{new Color(150,150,150), new Color(150,150,150)};
    //Vec3 light = new Vec3(0.3,0.3,1);
    //Color light_color = new Color(255,255,210);
    double ambient = 0.25;
    boolean drawAnaglyph = false;

    Canvas3D canvas; 

    public Model3D() {
        mat		= new Matrix3D();
        vx		= new int[MAX_VERTS];
        vy		= new int[MAX_VERTS];
        nverts	= 0;
        nedges	= 0;
        nfaces	= 0;
        vert	= null;
        gr		= null;
        for(int i =0; i < light_normal.length; i++){
            light_normal[i].normalize();
        }
        for(int i =0; i < light_anaglyph.length; i++){
            light_anaglyph[i].normalize();
        }
        light = light_normal;
        light_color = light_color_normal;
        //mat.xrot(0); mat.yrot(0);
    }

    static final double CHOP = 1.e-10;
    double chop(double d){
        if(d < -CHOP)
            return d;
        if(d > CHOP)
            return d;
        return 0;
    }

    public Model3D(double _vert[], int[][] ifaces, int iedges[][], Color[] colors, int[] cindex, String symmetry){
        this(_vert, ifaces,iedges,colors,cindex);
    }
    /**
       constructor
    
    */
    public Model3D(double _vert[], int[][] ifaces, int iedges[][], Color[] colors, int[] cindex){

        this();
        vert = _vert;
        /*
          System.out.println("vert:");
          for(int i = 0; i < vert.length/3; i++){
          System.out.print(Fmt.fmt(chop(vert[3*i]),8,4));
          System.out.print(Fmt.fmt(chop(vert[3*i+1]),8,4));
          System.out.println(Fmt.fmt(chop(vert[3*i+2]),8,4));
          }
        */
        face = new Face[ifaces.length + iedges.length];
      
        for(int i = 0; i < ifaces.length; i++){
            Face f = new Face();
            f.nverts = ifaces[i].length;
            f.index = ifaces[i];
            Color c= colors[cindex[i]];
            f.cr = c.getRed();
            f.cg = c.getGreen();
            f.cb = c.getBlue();
            face[i] = f;
        }

        int offset = ifaces.length;
        for(int i = 0; i < iedges.length; i++){
            Face f = new Face(iedges[i],0,0,0);
            face[i + offset] = f;
      
        }

        nverts = (vert.length)/3;
        nfaces = face.length;
        init();    
    }

    /**
       constructor
    
    */
    public Model3D(URL loc) {	       // read object from any URL

        this();
        try {
            readObject(loc.openStream());
        } catch (IOException e) {
            System.out.println(e.getMessage());
        }

    }
  
    /**
       constructor
    
    */
    public Model3D(InputStream is) {  // read object from a stream

        this();
        try {
            readObject(is);
        } catch (IOException e) {
            System.out.println(e.getMessage());
        }
    }

    public void setCanvas(Canvas3D canvas){

        this.canvas = canvas;

    }

    public void clearCanvas(Canvas3D canvas){
        // DO NOTHING 
    }


    /* This method parses an OFF file. */

    public void readObject(InputStream is) throws IOException {

        Reader r = new BufferedReader(new InputStreamReader(is));
        StreamTokenizer stream = new StreamTokenizer (r);

        stream.eolIsSignificant(true);
        stream.commentChar('#');
        gothead = false;

        scanhead:					// read the header

        while (!gothead) {

            switch (stream.nextToken()) {

            default:
                break scanhead;

            case StreamTokenizer.TT_EOL:
                break;

            case StreamTokenizer.TT_WORD:

                if ("OFF".equals(stream.sval)) {

                    nverts = 0; nfaces = 0; nedges = 0;
                    while (stream.nextToken() == StreamTokenizer.TT_EOL) {};

                    if (stream.ttype == StreamTokenizer.TT_NUMBER) {

                        nverts = (int)stream.nval;
                        if (stream.nextToken() == StreamTokenizer.TT_NUMBER) {

                            nfaces = (int)stream.nval;
                            if (stream.nextToken() == StreamTokenizer.TT_NUMBER) {

                                nedges = (int)stream.nval;
                                gothead = true;

                            } else throw new IOException("Can't read OFF file");

                        } else throw new IOException("Can't read OFF file");

                    } else throw new IOException("Can't read OFF file");

                }
                break;

            case StreamTokenizer.TT_NUMBER:
                break;

            }

        }

        vert = new double[nverts * 3];
        face = new Face[nfaces]; 

        int num = 0; 
        int coordnum = 0;

        scanverts:						// read the vertices
    
        while (num < nverts) {
            switch (stream.nextToken()) {
	
            default:
                break;
	
            case StreamTokenizer.TT_EOL:
                if (coordnum > 2) {
                    coordnum = 0; num++;
                }
                break;
	
            case StreamTokenizer.TT_NUMBER:
                if (coordnum < 3) {
                    vert[num*3 + coordnum] = (double)stream.nval;
                    coordnum++;
                }
	
            }
      
        }
    
        num = 0; coordnum = 0;
        boolean gotnum = false;
    
        scanfaces:						// read the faces
    
        while (num < nfaces) {
            switch (stream.nextToken()) {
	
            default:
                break;
	
            case StreamTokenizer.TT_EOL:
                if (gotnum) { num++; }
                gotnum = false;
                break;
	
            case StreamTokenizer.TT_NUMBER:
                if (!gotnum) {	  
                    face[num] = new Face();
                    face[num].numVerts((int)stream.nval);
                    gotnum = true; coordnum = 0;	  
                } else if (coordnum < face[num].nverts) {	  
                    face[num].index[coordnum] = 3 * (int)stream.nval;
                    coordnum++;	  
                } else {
                    face[num].cr = 255; face[num].cg = 255; face[num].cb = 255;
                    double val = (double)stream.nval;	  
                    if (val <= 1) { 
                        val *= 255; 
                    }	  
                    face[num].cr = (int)val;	  
                    if (stream.nextToken() != StreamTokenizer.TT_EOL) {	    
                        val = (double)stream.nval;
                        if (val <= 1) { val *= 255; }
                        face[num].cg = (int)val;	    
                        if (stream.nextToken() != StreamTokenizer.TT_EOL) {	      
                            val = (double)stream.nval;
                            if (val <= 1) { val *= 255; }
                            face[num].cb = (int)val;	      
                        } else {
                            face[num].cr = 255; face[num].cg = 255; face[num].cb = 255;
                            num++; gotnum = false;
                        }
                    } else {	    
                        face[num].cr = 255; face[num].cg = 255; face[num].cb = 255;
                        num++; gotnum = false;	    
                    }
                }
	
                break;	
            }
      
        }
    
        init();    
    }

    /**
    
     */
    void init(){

        normals = new Vec3[nfaces];    
        tnormals = new Vec3[nfaces];
        findex = new int[nfaces];

        for (int i = 0; i < nfaces; i++) { 
            findex[i] = i; 
        }

        gr = new Color[nfaces];		     
    

        for (int f = 0; f < nfaces; f++) {

            Face facei = face[f];
            int nv = facei.nverts;
       
            int [] index = facei.index;
            if(index.length >=3){
                int v0 = index[0], v1 = index[1], v2 = index[2];
                Vec3 vec0 = new Vec3(vert[v1]-vert[v0], 
                                     vert[v1+1]-vert[v0+1], 
                                     vert[v1+2]-vert[v0+2]);
                Vec3 vec1 = new Vec3(vert[v2]-vert[v1], 
                                     vert[v2+1]-vert[v1+1], 
                                     vert[v2+2]-vert[v1+2]);
                Vec3 norm = Vec3.cross(vec1,vec0);
                norm.normalize();
                normals[f] = norm;
                tnormals[f] = new Vec3();
                face[f].nindex = f;
                face[f].findex = f;
            } else { // this is actualy an edge
                normals[f] = null;
                tnormals[f] = null;
            }

            gr[f] = new Color(face[f].cr, face[f].cg, face[f].cb);
        }    

    }
    

    /**
       transform all points in model 
    */
    public void transform() {

        if (transformed || nverts <= 0)
            return;

        if (tvert == null)
            tvert = new int[nverts*3];

        mat.transform(vert, tvert, nverts);
        mat.transform(normals, tnormals, normals.length);
        //    System.out.println(mat);

        for(int i=0; i < tnormals.length; i++){
            if(tnormals[i] != null)
                tnormals[i].normalize();
        }

        transformed = true;
    }


    /**
       qs 

       The quick sort algorithm in this method is used for sorting faces
       from back to front by z depth values.
    */
    void qs(int left, int right) {

        int		i, j, y;
        double x;

        i = left; j = right;
        x = face[findex[(left+right)/2]].zdepth;

        do {

            while (face[findex[i]].zdepth > x && i < right) i++;
            while (x > face[findex[j]].zdepth && j > left) j--;

            if (i <= j) {
                y = findex[i];
                findex[i] = findex[j];
                findex[j] = y;
                i++; j--;
            }

        } while (i <= j);

        if (left < j) qs(left, j);
        if (i < right) qs(i, right);

    }

    /** 
        Make shadow color
    */  
    public Color makeColor(Color c,Vec3 normal){

        int cred = c.getRed(), cgreen = c.getGreen(), cblue = c.getBlue(); 
        //int red = (int)cred, green = (int)cgreen, blue = (int)cblue;
        int red = 50, green = 50, blue = 50;

        for(int i =0; i < light.length; i++){
      
            double dot = Vec3.dot(light[i],normal);

            if(dot < 0.){ // we are looking from opposite side
                continue;
            } else {
                //dot *= dot;//dot *= dot;
                double dot1 = 1-dot;
                red   += dot*light_color[i].getRed(); //dot1*cred;//   + 
                green += dot*light_color[i].getGreen(); //dot1*cgreen;// + 
                blue  += dot*light_color[i].getBlue(); //dot1*cblue;// + 
            }
        }
    
        return new Color(Math.min(255,red),Math.min(255,green),Math.min(255,blue));
    }

    /*
      double dot = Vec3.dot(light,normal);
      //System.out.println(light + "," + normal + ", "+ dot );

      if(dot < 0.){ // we are looking from opposite side
      return c;
      } else {
      dot *= dot;//dot *= dot;
      double dot1 = 1-dot;
      Color col = 
      new Color(Math.min(255,(int)(dot1*c.getRed()+
      dot*light_color.getRed())),
      Math.min(255,(int)(dot1*c.getGreen()+
      dot*light_color.getGreen())),
      Math.min(255,(int)(dot1*c.getBlue()+
      dot*light_color.getBlue())));
      //System.out.println(dot + ":"+col);
      return col;
      }
    */

    /**
       Paint myself to the graphics context. 
    */  
    public void paint(Graphics g) {

        if(canvas != null) {
            if(canvas.displayType == Canvas3D.ANAGLYPH_RC || canvas.displayType == Canvas3D.ANAGLYPH_CR){
                drawAnaglyph = true;
                light = light_anaglyph;
                light_color = light_color_anaglyph;
            } else {
                drawAnaglyph = false;
                light = light_normal;
                light_color = light_color_normal;
            }
        }

        if (vert == null || nverts <= 0)
            return;
        transform();

        /*
         *  Calculate the average z depth of faces and use this to sort them.
         *  This is called the "Painter's algorithm" and although it works in
         *  some case, does *not* always provide a correct ordering. Sometimes
         *  a correct ordering is impossible, especially in the case of mutually
         *  overlapping polygons.
         */

        for (int i = 0; i < nfaces; i++) {

            face[i].zdepth = 0;
            Face facei = face[i];
            int nv = facei.nverts;    
            int[] index = facei.index;
            for (int c = 0; c < nv; c++) {
                facei.zdepth += tvert[index[c]+2];
            }
            facei.zdepth /=  facei.nverts;
        }

        qs(0, nfaces-1);					// quick sort the faces

        for (int f = 0; f < nfaces; f++) {

            int i = findex[f];

            if(tnormals[i] != null && tnormals[i].z < 0 && canvas.drawFaces ) // it is backface
                continue;

            int v = 0;
      
            Face facei = face[i];
            int nv = facei.nverts;
      
            int [] index = facei.index;
      
            for (int c = 0; c < nv; c++) {
                int vi = index[c]; 
                vx[c] = tvert[vi]; 
                vy[c] = tvert[vi + 1];
            }

            if(canvas.drawFaces){
                if(nv >=3 ){
                    Color c = makeColor(gr[i],tnormals[i]);
                    g.setColor(c);
                    g.fillPolygon(vx, vy, nv);		// draw each face
                } else {
                    g.setColor(Color.black);
                    g.drawLine(vx[0],vy[0],vx[1],vy[1]); // draw each edge	  
                }

            }
            if(canvas.drawLines){
                g.setColor((drawAnaglyph && !canvas.drawFaces) ? Color.white:Color.black);
                nv -= 1;      
                for (v = 0; v < nv; v++) { // each line is drawn usually twice 
                    g.drawLine(vx[v], vy[v], vx[v+1], vy[v+1]);	// draw the face edges
                }
                g.drawLine(vx[v], vy[v], vx[0], vy[0]);
            }
        }

    }

    /** 
        calculate the bounding box of our object: 
    */

    void findBB() {
    
        if (nverts <= 0)
            return;
    
        double v[] = vert;
        double xmin = v[0], xmax = xmin;
        double ymin = v[1], ymax = ymin;
        double zmin = v[2], zmax = zmin;
    
        for (int i = nverts * 3; (i -= 3) > 0;) {
      
            double x = v[i];
            if (x < xmin)
                xmin = x;
            if (x > xmax)
                xmax = x;
            double y = v[i + 1];
            if (y < ymin)
                ymin = y;
            if (y > ymax)
                ymax = y;
            double z = v[i + 2];
            if (z < zmin)
                zmin = z;
            if (z > zmax)
                zmax = z;
      
        }

        this.xmax = xmax;
        this.xmin = xmin;
        this.ymax = ymax;
        this.ymin = ymin;
        this.zmax = zmax;
        this.zmin = zmin;

    }

    public Model3D getCopy(){
        return null;
    }

}
