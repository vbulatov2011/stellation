package pvs.g3d;

/**
 *
 * Copyright (c) 2001-2017  Vladimir Bulatov
 *
 */

import java.applet.Applet;
import java.awt.Graphics;
import java.awt.Color;
import java.awt.Event;
import java.awt.event.*;
import java.lang.*;
import java.io.*;
import java.net.URL;

import pvs.utils.Fmt;
import pvs.utils.FastHashtable;
import pvs.utils.FastVector;

import pvs.polyhedra.Vector3D;
import pvs.utils.PVSObserver;

import pvs.polyhedra.Vector3D;

public class Stellation3D extends Model3D {

    Vec3 [] planes, tplanes;
    //Face	   work1[],work2[], work3[];    // array of faces
    int	   index1[],index2[], index3[];    // array of faces
    int sortedFaces[];

    // array consists of -1 if face below plane
    //                   0  if face belongs to plane
    //                   1  if face above plane
    byte [][] facePlaneDist; 
    double [] zcompOld;
    Color [] colors;

    //MouseListenerClass listener;

    private static final double Z_EMPTY = 1.23454567456e20;
  

    public Stellation3D(double _vert[], int[][] ifaces, int iedges[][], Color[] colors, int[] cindex, 
                        String symmetry, Vector3D [] planes){

        super(_vert, ifaces,iedges,colors,cindex);
        this.planes = new Vec3[planes.length];
        this.tplanes = new Vec3[planes.length];
        this.zcompOld = new double[planes.length];


        for(int i =0; i < planes.length; i++){

            this.planes[i] = new Vec3(planes[i].x,planes[i].y,planes[i].z);
            this.tplanes[i] = new Vec3();
            zcompOld[i] = Z_EMPTY;

        }

        initFacePlaneDist();

        index1 = new int[face.length];
        for(int i = 0; i < index1.length; i++)
            index1[i] = i;
        index2 = new int[face.length];
        index3 = new int[face.length];
    
        //for(int i=0; i < planes.length; i++){
        //  System.out.println(planes[i]);
        //}

    
    
    }

    private static final double EPS = 1.e-6;

    private void initFacePlaneDist(){

        for (int i = 0; i < nfaces; i++) {

            Face facei = face[i];
            int nv = facei.nverts;    
            int[] index = facei.index;
            double x = 0, y = 0, z = 0;
            for (int c = 0; c < nv; c++) {
                int ind = index[c];
                x += vert[ind];
                y += vert[ind+1];
                z += vert[ind+2];
            }
            facei.center = new Vec3(x/facei.nverts,y/facei.nverts,z/facei.nverts);
            facei.findex = i;
        }

        facePlaneDist = new byte[planes.length][face.length];
        for(int p = 0; p < planes.length; p++){
            Vec3 plane = planes[p];
            for(int f = 0; f < face.length; f++){
                Vec3 center = face[f].center;
                double dist = (plane.dot(plane,center) - plane.length2());
                if(dist < -EPS){
                    facePlaneDist[p][f] = -1;
                } else if (dist > EPS){
                    facePlaneDist[p][f] = 1;        
                }
                // System.out.print(facePlaneDist[p][f] + " ");
            }
            // System.out.println();
        }        
    }

    /**
       overload Model3D init - changes in normals. There are fewer normals in 
       stellation. 
    */
    void init(){

        findex = new int[nfaces];

        for (int i = 0; i < nfaces; i++) { 
            findex[i] = i; 
        }

        gr = new Color[nfaces];		     
    
        FastHashtable htNormals = new FastHashtable();
        FastVector vNormals = new FastVector();
        FastVector tNormals = new FastVector();

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
                Object o = htNormals.get(norm);
                if(o == null){
                    face[f].nindex = vNormals.size();
                    htNormals.put(norm, new Integer(face[f].nindex));
                    vNormals.addElement(norm);
                    Vec3 tnorm = new Vec3();
                    tNormals.addElement(tnorm);         
                    //face[f].normal = norm;
                    //face[f].tnormal = tnorm;
                } else {
                    face[f].nindex = ((Integer)o).intValue();
                    //face[f].normal = (Vec3)vNormals.elementAt();
                    //  face[f].tnormal = (Vec3)tNormals.elementAt(((Integer)o).intValue());
                }
        
            } else { // this is actualy an edge
                //normals[f] = null;
                //tnormals[f] = null;
            }

            gr[f] = new Color(face[f].cr, face[f].cg, face[f].cb);
        }    

        normals = new Vec3[vNormals.size()];    
        vNormals.copyInto(normals);
        tnormals = new Vec3[tNormals.size()];
        tNormals.copyInto(tnormals);
        colors = new Color[tNormals.size()];

        //System.out.println("faces: " + nfaces);
        //System.out.println("normals: " + normals.length);

    }

    public void setCanvas(Canvas3D canvas){

        super.setCanvas(canvas);

    }


    public void clearCanvas(Canvas3D canvas){
        
    }


    /**
       Paint myself to the graphics context. 
    */  
    public void paint(Graphics g) {
    
        paintSlow(g);
        /*
          if(canvas.eventCallback != null || canvas.mouseDragged){
          super.paint(g);
          } else {
          paintSlow(g);
          }
        */
    }

    void paintSlow(Graphics g){

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

        card_shuffle(); // different algorithm of sorting 

        //qs(0, nfaces-1);					// quick sort the faces

        for(int i = 0; i < colors.length; i++){
            if(tnormals[i].z > 0)
                colors[i] = makeColor(Color.white, tnormals[i]);
        }

        for (int i = 0; i < nfaces; i++) {
            //for (int f = 0; i < visibleCount; i++) {

            int v = 0;
      
            Face facei = face[sortedFaces[i]];
            int nindex = facei.nindex;
            if(tnormals[nindex] != null && 
               tnormals[facei.nindex].z <= 0 && 
               canvas.drawFaces ) // it is backface
                continue;
            int nv = facei.nverts;
      
            int [] index = facei.index;
      
            for (int c = 0; c < nv; c++) {
                int vi = index[c]; 
                vx[c] = tvert[vi]; 
                vy[c] = tvert[vi + 1];
            }

            if(canvas.drawFaces){
                if(nv >=3 ){
                    //Color c = makeColor(gr[i],facei.tnormal);
                    g.setColor(colors[nindex]);
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
     *
     this algorithm specifically works for stellations. 
     Stellation is formed by intersection of (limited) set of planes. 
     For every plane we will make the following: 
     we will check for every face if it is in front of plane or behind it.
     we will take all faces, which are in behind and move them in the beginning of array (without changing internal order)
     Similar to card shuffling procedure. 
    
     We will repeat this for every plane. 
    

    */
    void card_shuffle(){

        // if we don't draw faces, we don't need sorting
        sortedFaces = index1;

        if(!canvas.drawFaces){
            return;
        }

    
        // back faces cooling
        /*
          int count = 0;
          for(int i=0; i < face.length; i++){
          //if(tnormals[i] != null && tnormals[i].z > 0){ // it is frontface
          work1[count] = face[i];
          count++;
          //}
          }
        */

        //
        sortedFaces = index1;
    
        for(int p = 0; p < planes.length; p++){
            int [] src   = index1;
            int [] front = index2;
            int [] back  = index3;
            int fcount = 0;
            int bcount = 0;
            double zcomp = tplanes[p].z;
            /*
            // this trick probably doesn't work 
            if ( zcompOld[p] != Z_EMPTY && zcomp * zcompOld[p] > 0){
            // there was no change in orientation 
            // so we will not sort against this plane 
            continue; 
            }
            */
            zcompOld[p] = zcomp;
            // System.out.print("->");      printFaces(src, visibleCount);      System.out.print(" : ");
            for(int f = 0; f < src.length; f++){
                int faceIndex = src[f];
                int s = facePlaneDist[p][src[f]];
                if(s *  zcomp > 0.0001){
                    //if(getFrontDistance(p, src[f]) > 0.0001){
                    //System.out.print(Fmt.fmt(src[f].findex,3));
                    front[fcount] = faceIndex;
                    fcount++;
                } else {
                    back[bcount] = faceIndex;
                    bcount++;	  
                }
            }

            int scount = 0;
            for(int f = 0; f < fcount; f++){
                src[scount++] = front[f];
            }
            for(int f = 0; f < bcount; f++){
                src[scount++] = back[f];
            }
        }    
    

        sortedFaces = index1;
        //System.out.print("==");    printFaces(visibleFaces, visibleCount);   System.out.println();
    }

    void printFaces(Face[] src, int len){

        for(int f = 0; f < len; f++){
            System.out.print(Fmt.fmt(src[f].findex,3));
        } 
    }
    
    boolean isFaceInFront(int planeIndex, Face face){

        Vec3 plane = planes[planeIndex];
        Vec3 center = face.center;
        double res = (plane.dot(plane,center) - plane.length2())*tplanes[planeIndex].z;
        if(res > 0)
            return true;
        else 
            return false;
    }

    double getFrontDistance(int planeIndex, Face face){

        Vec3 plane = planes[planeIndex];
        Vec3 center = face.center;
        double res = (plane.dot(plane,center) - plane.length2())*tplanes[planeIndex].z;
        return res;
    }

    public void transform(){

        super.transform();

        mat.transform(planes, tplanes, planes.length);

    }

    /**
       int findFaceAtPoint(int x, int y)
       returns face index and closest vertex index 
    */
    int[] findFaceAtPoint(int x, int y){

        if(sortedFaces == null || face == null)
            return new int[]{-1,-1};
        for (int i = nfaces-1; i >= 0; i--) {
      
            Face facei = face[sortedFaces[i]];
            int nindex = facei.nindex;
            if(tnormals[nindex] != null && 
               tnormals[facei.nindex].z <= 0 
               ) // it is backface
                continue;
            int nv = facei.nverts;
      
            int [] index = facei.index;
      
            for (int c = 0; c < nv; c++) {
                int vi = index[c]; 
                vx[c] = tvert[vi]; 
                vy[c] = tvert[vi + 1];
            }
            if(isInsidePolygon(vx,vy,nv,x,y)){
                int vindex = findClosestVertex(facei,x,y);
                return new int[]{facei.findex, vindex};
            }
        }
        return new int[]{-1,-1};
    }

    int findClosestVertex(Face face, int x, int y){

        int nv = face.nverts;
      
        int [] index = face.index;
      
        int dmin = 1000;
        int indmin = 0;
        for (int c = 0; c < nv; c++) {
            int vi = index[c]; 
            int vx = tvert[vi]; 
            int vy = tvert[vi + 1];
            int d = ABS(x-vx) + ABS(y-vy);
            if(d < dmin){
                dmin = d;
                indmin = c;
            }	  
        }  
        return indmin;
    }

    static double MIN(double x,double y) {
        return (x < y ? x : y);
    }

    static int ABS(int x) {
        return (x >= 0)? x : -x;
    }

    static double MAX(double x, double y) {
        return (x > y ? x : y);
    }

    // determines if point p lies inside of polygon 
    // for selfintersection polygons it will use 
    // even-od rule
    static boolean isInsidePolygon(int vx[], int vy[], int nv, int x, int y) {
    
        int cnt = 0;
    
        int x1 = vx[nv-1];
        int y1 = vy[nv-1];
    
        for (int i=0; i < nv; i++) {
      
            int x2 = vx[i];
            int y2 = vy[i];
            if (y > MIN(y1,y2)) {
                if (y <= MAX(y1,y2)) {
                    if (x <= MAX(x1,x2)) {
                        if (y1 != y2) {
                            int xinters = 
                                (y-y1) * (x2-x1) / (y2-y1) + x1;
                            if (x1 == x2 || x <= xinters)
                                cnt++;
                        }
                    }
                }
            }   
            x1 = x2;
            y1 = y2;      
        }
    
        if (cnt % 2 == 0)
            return false; //(OUTSIDE);
        else
            return true; //(INSIDE);
    }  

    public Vector3D getFacePlane(int faceIndex){

        Face f = face[faceIndex];
        int ind0 = f.index[0];
        int ind1 = f.index[1];
        int ind2 = f.index[2];
        Vector3D v0 = new Vector3D(vert[ind0],vert[ind0+1],vert[ind0+2]); 
        Vector3D v1 = new Vector3D(vert[ind1],vert[ind1+1],vert[ind1+2]); 
        Vector3D v2 = new Vector3D(vert[ind2],vert[ind2+1],vert[ind2+2]); 
        Vector3D normal = v2.sub(v1).cross(v0.sub(v1));
        normal.normalize();
        double d = normal.dot(v1);
        return normal.mul(d);

    }

    public Vector3D getVertex(int faceIndex, int vertIndex){

        Face f = face[faceIndex];

        int [] index = f.index;
        int vi = index[vertIndex];    
        return new Vector3D(vert[vi],vert[vi+1],vert[vi+2]);

    }

}

