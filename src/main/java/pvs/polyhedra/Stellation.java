package pvs.polyhedra;

import static pvs.utils.Output.printf;

import java.awt.Color;
import java.io.BufferedReader;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.io.Reader;
import java.io.StreamTokenizer;
//import java.util.FastHashtable;
import java.util.Enumeration;
import java.util.StringTokenizer;
import java.util.Vector;

import pvs.utils.Comparator;
import pvs.utils.FastHashtable;
import pvs.utils.IntegerComparator;
import pvs.utils.QSort;



/** 
    
    class Stellation
    
*/
public class Stellation {

    static final boolean DEBUG = true;

    public SFace[][] faces; // stellation faces, array of facets for every plane
    public Plane[] planes; // planes used to make this stellation 
    private Vector3D [] canonicalVectors;
    private Vector3Dsym [] planeVectors;

    public int maxlayer = 0;
    int negCellCount = 0;
    /**
       constructor,

       takes polyhedron and makes stellation of it
    */
    public Stellation(Polyhedron poly, int maxintersection){
        faces = makeStellationFaces(poly, maxintersection); 
        maxlayer = findMaxLayer(faces);
    }
   
    /**
       constructor,

       takes array of vectors and constructs stellation from planes
       orthogonal to vectors and passing through end of vector
    */
    public Stellation(Vector3D[] vectors, int maxintersection){
        faces = makeStellationFaces(vectors, maxintersection); 
        maxlayer = findMaxLayer(faces);
    }
   
    /**
       constructor,

       takes array of _canonical_ vectors with given symmetry,
       makes all orbits of the vectors,
       create a set of planes, orthogonal to the vectors,
       makes stellation only of canonical faces. 
    */
    public Stellation(Vector3D[] canvect, String symmetry, int maxintersection){
    
        canonicalVectors = canvect;
        int canlength = canvect.length;
        int totallen = 0;    
        Vector3Dsym [][]orb = new Vector3Dsym[canlength][];
        for(int i = 0; i < canlength; i++){
            orb[i] = Symmetry.getOrbit(canvect[i],symmetry,i); 
            totallen += orb[i].length;
        }

        Vector3Dsym[] vectors = new Vector3Dsym[totallen];
        planeVectors = vectors;
        int count = 0;
        // first vectors will be canonical vectors
        for(int i=0; i < canlength; i++){
            vectors[count++] = orb[i][0]; 
        }
        // other vectors are going after 
        for(int i=0; i < canlength; i++){
            for(int j = 1; j < orb[i].length; j++){
                vectors[count++] = orb[i][j]; 
            }
        }
        System.out.print("found ");
        if(canlength > 1){
            for(int i=0; i < canlength; i++){
                System.out.print(orb[i].length); 
                if(i < canlength-1)
                    System.out.print("+"); 
            }
            System.out.print(" = ");
        }
        System.out.println(vectors.length + " different vectors");

        // make planes 
        planes = new Plane[vectors.length];
        for(int i = 0; i < vectors.length; i++){
            Vector3D v = new Vector3D(vectors[i].x,vectors[i].y,vectors[i].z);
            double len = v.length();
            v.normalize();
            planes[i] = new Plane(v,len, i);
        }

        System.out.println("intersections... ");
        FastHashtable inttable = new FastHashtable();
        int zerocount = 0, intcount = 0;
        double maxlen = 0;
        //for(int i=0; i < planes.length; i++){
        for(int i=0; i < canvect.length; i++){

            for(int j=i+1; j < planes.length; j++){

                for(int k=j+1; k < planes.length; k++){
                    Vector3D v = Plane.intersect(planes[i],planes[j],planes[k]);
                    if(v == null){
                        zerocount++;
                    } else {
                        double len = v.length();
                        if(len > 1.E5){
                            zerocount++;
                        } else {
                            //System.out.println(v + " : " + len);
	    
                            intcount++;
                            if(inttable.get(v) == null){
                                inttable.put(v,v);
                            }
                            if(len > maxlen)
                                maxlen = len;
                        }
                    }	    
                }
            }
        }
        System.out.println("done: " + intcount + " no intersection: " + zerocount);
        System.out.println("unique vertices: " + inttable.size());
        System.out.println("max radius: " + maxlen);
        System.out.println("one face vertices");
        //printSortedVertices(inttable, 40);    

        FastHashtable symverttable = makeSymVertTable(inttable, symmetry);
        System.out.println("all symmetrical vertices");
        //printSortedVertices(symverttable, 40);    

        // make stellation faces 
    
        System.out.println("planes: " + planes.length);
        this.planes = planes;
        DoubleIndex[] pindex = new DoubleIndex[planes.length];    
        for(int i=0; i < pindex.length; i++){
            pindex[i] = new DoubleIndex(0.,i);
        }

        // all generated vertices
        //FastHashtable vtable = new FastHashtable();
        // we have put in the table all symmetrically generated vertices (2007.02.07)
        FastHashtable vtable = symverttable;
        faces = new SFace[planes.length][];
        for(int canface=0; canface < canlength; canface++){

            System.out.print(canface);System.out.flush();
            sortPlanes(pindex,planes,planes[canface]);
            Vector vfaces = new Vector();
            vfaces.addElement(makeSeedFace(planes[canface],canface));    

            for(int j = 0; j < planes.length; j++){
                if(pindex[j].index != canface)
                    intersectFacesWithPlane(vfaces,planes[pindex[j].index], vtable, canface, maxintersection);
            }
            faces[canface] = cleanFaces(vfaces);
            System.out.print("("+faces[canface].length+") ");
        }
        // make new table, which has only true vertices
        vtable = new FastHashtable();
        for(int i=0; i < canlength; i++){
            for(int j=0; j < faces[i].length; j++){
                SFace face = faces[i][j];
                for(int k =0; k < face.vertices.length; k++){
                    vtable.put(face.vertices[k],face.vertices[k]);
                }
            }      
        }
        System.out.println();    
        // add symmetrical copies of canonical faces 
        System.out.println("vertices: ");
        for(int i = canlength; i < vectors.length; i++){
            Vector3Dsym svector = vectors[i];
            int findex = svector.index;
            faces[i] = transformFace(faces[findex],svector.matrix,vtable,planes[i]);
            System.out.print(" " + vtable.size());System.out.flush();
            if((i + 1) % 20 == 0)
                System.out.println();      
        }
        System.out.println("\ndone");
        maxlen = 0;
        for(Enumeration e = vtable.elements(); e.hasMoreElements();){
            Vector3D v = (Vector3D)e.nextElement();
            double len = v.length();
            if(len > maxlen){
                maxlen = len;
            }
        }
        System.out.println("all vertices");
        //printSortedVertices(vtable, 40);    
        System.out.println("vertices: " + vtable.size());
        System.out.println("facets: " + (faces[0].length * faces.length));
        System.out.println("max radius: " + maxlen);
    
        maxlayer = findMaxLayer(faces);
        //faces = makeStellationFaces(vectors, maxintersection); 
        //maxlayer = findMaxLayer(faces);
    
    }

    SFace [] transformFace(SFace[] inface, Matrix3D matrix, FastHashtable vtable, Plane plane){

        SFace[] outface = new SFace[inface.length];
        Vector vert = new Vector();
    
        double det = matrix.getDeterminant();

        for(int i=0; i < inface.length; i++){
            // TO-DO 
            SFace face = inface[i];
            int nvert = face.vertices.length;
      
            for(int vi =0; vi < nvert; vi++){
                Vector3D v = face.vertices[vi].mul(matrix);
                Vector3D v_old = (Vector3D)vtable.get(v);
                if(v_old == null){
                    // new vertex 
                    vtable.put(v,v);
                    vert.addElement(v);
                } else {
                    vert.addElement(v_old);	  
                }
            }
            Vector3D vertices[] = new Vector3D[vert.size()];
            vert.copyInto(vertices);
            if(det < 0.){
                // change order of vertices 
                for(int v =0; v < vertices.length /2; v++){
                    Vector3D tmp = vertices[v];
                    vertices[v] = vertices[vertices.length-1-v];
                    vertices[vertices.length-1-v] = tmp;
                }
            }
            outface[i] = new SFace(vertices, plane, face.layer);
            vert.removeAllElements();   
        }
        return outface;
    }
   
    /**
       getPolyhedron
    
       takes all cells and given stellation array 
       (s[i][0] - layer, s[i][1] - cell in layer)
       and constructs polyhedron from it
    */
    public Polyhedron getPolyhedron(Vector cells, int [][] stellation) {
    
        SSCell[] scells = getStellation(cells, stellation);
        return getPolyhedron(scells);    
    }

    public SFace[][] getFaces(){
        return faces;
    }
    
    /**
       getPolyhedron
    
       returns main-line stellation of given layer
    */
    public Polyhedron getPolyhedron(int layer){
        int fcounter = 0;
        for(int i = 0; i < faces.length; i++){
            //for(int i = 0; i < 1; i++){
            for(int j = 0; j < faces[i].length; j++){
                if(faces[i][j].layer == layer)
                    fcounter++;	
            }
        }
        Polyhedron poly = new Polyhedron();
        poly.ifaces = new int[fcounter][];
        fcounter = 0;
        Vector vert = new Vector();
        FastHashtable table = new FastHashtable();

        for(int i = 0; i < faces.length; i++){

            for(int j = 0; j < faces[i].length; j++){

                if(faces[i][j].layer == layer){
                    //
                    int[] iface = new int[faces[i][j].vertices.length];
                    for(int k = 0; k < iface.length; k++){
                        iface[k] = findIndex(table, vert,faces[i][j].vertices[k]);
                    }
                    // remove double vertices
                    int vcounter = 0;
                    for(int k = 0; k < iface.length; k++){
                        if(iface[(k+1)%iface.length] != iface[k]){
                            vcounter++;
                        }
                    }

                    if(vcounter == 0){
                        poly.ifaces[fcounter] = null;
                    } else if(vcounter != iface.length){ // have double vertices
                        int[] newf = new int[vcounter];
                        vcounter = 0;
                        for(int k = 0; k < iface.length; k++){
                            if(iface[(k+1)%iface.length] != iface[k]){
                                newf[vcounter++] = iface[k];
                            }
                        }
                        poly.ifaces[fcounter] = newf;
                    } else {
                        poly.ifaces[fcounter] = iface;
                    }
	  
                    fcounter++;	   
                }
            }
        }

        int fc = 0;
        for(int i=0; i < poly.ifaces.length; i++){
            if(poly.ifaces[i]!= null)
                fc++;
        }

        if(fc != poly.ifaces.length){
            int [][]newif = new int[fc][];
            fc = 0;
            for(int i=0; i < poly.ifaces.length; i++){
                if(poly.ifaces[i] != null){
                    newif[fc++] = poly.ifaces[i];
                }
            }
            poly.ifaces = newif;
        }
    
        poly.vertices = new Vector3D[vert.size()];
        vert.copyInto(poly.vertices);
        return poly;
    }

    /**
       constructor 

       takes symmetrical stellation cell and makes polyhedron from it
    */
    public Polyhedron getPolyhedron(SSCell scell){
    
        int fcounter = 0;
        for(int i = 0; i < scell.cells.length; i++){
            SCell cell = scell.cells[i];
            fcounter += cell.top.length;
            fcounter += cell.bottom.length;
        }
        Polyhedron poly = new Polyhedron();

        poly.ifaces = new int[fcounter][];
        poly.icolor = new int[fcounter];
        fcounter = 0;
        // table of vertices
        FastHashtable vtable = new FastHashtable();
        // array of vertices
        Vector vert = new Vector();
        for(int i = 0; i < scell.cells.length; i++){
            SCell cell = scell.cells[i];

            for(int f = 0; f < cell.top.length; f++){
                SFace face = cell.top[f];
                int[] iface = new int[face.vertices.length];
                for(int v = 0; v < face.vertices.length; v++){
                    Integer index = (Integer)vtable.get(face.vertices[v]);
                    if(index == null){
                        index = new Integer(vert.size());
                        vtable.put(index,face.vertices[v]);
                        vert.addElement(face.vertices[v]);
                    }
                    iface[v] = index.intValue();
                }
                poly.ifaces[fcounter] = iface;
                poly.icolor[fcounter] = 1;
                fcounter ++;
            }

            for(int f = 0; f < cell.bottom.length; f++){
                SFace face = cell.bottom[f];
                int[] iface = new int[face.vertices.length];
                for(int v = 0; v < face.vertices.length; v++){
                    Integer index = (Integer)vtable.get(face.vertices[v]);
                    if(index == null){
                        index = new Integer(vert.size());
                        vtable.put(index,face.vertices[v]);
                        vert.addElement(face.vertices[v]);
                    }
                    // opposite order of vertices
                    iface[iface.length -1 - v] = index.intValue();
                }
                poly.ifaces[fcounter] = iface;
                poly.icolor[fcounter] = 0;
                fcounter ++;
            }
        } 

        poly.colors = makeTopBottomColors();
        poly.vertices = new Vector3D[vert.size()];
        vert.copyInto(poly.vertices);
        return poly;
    }

    /**
       return all nondublicated facets of set of sym cells
    */
    FastHashtable getAllFacets(SSCell[] scells){

        FastHashtable ftable = new FastHashtable();
        Integer topindex = new Integer(1);
        Integer bottomindex = new Integer(-1);

        for(int i =0; i < scells.length; i++){
            SSCell scell = scells[i];
      
            for(int c = 0; c < scell.cells.length; c++){
	
                // elementary cell 
                SCell cell = scell.cells[c];
                // top faces
                for(int f = 0; f < cell.top.length; f++){	  
                    SFace face = cell.top[f];
                    Integer index = (Integer)ftable.get(face);
                    if(index == null){
                        // face is not in ftable yet
                        ftable.put(face, topindex);	    
                    } else {
                        // face already there
                        if(index == bottomindex){
                            // face should be removed
                            ftable.remove(face);
                        } else {
                            // this should not happens
                            System.out.println("duplicate face in stellation!");
                        }
                    }
                }
                // bottom faces
                for(int f = 0; f < cell.bottom.length; f++){	  
                    SFace face = cell.bottom[f];
                    Integer index = (Integer)ftable.get(face);
                    if(index == null){
                        // face is not in ftable yet
                        ftable.put(face, bottomindex);
                    } else {
                        // face already there
                        if(index == topindex){
                            // face should be removed
                            ftable.remove(face);
                        } else {
                            // this should not happens
                            System.out.println("duplicate face in stellation!");
                        }
                    }
                }	
            }      
        }
        return ftable;
    }

    /**
       getPolyhedron

       takes array of symmetrical stellation cells (stellation) 
       and constructs polyhedron from it
    */
    public Polyhedron getPolyhedron_new(SSCell[] scells){

        Polyhedron poly = new Polyhedron();


        // make a table of all faces, eliminating duplicates
        FastHashtable ftable = getAllFacets(scells);

        // sort all facets into planes planes to which they belongs
        // and up and down faces separatelly.     
        FastHashtable[] tfaces = new FastHashtable[planes.length]; 
        FastHashtable[] bfaces = new FastHashtable[planes.length];
        for(int p = 0; p < tfaces.length; p++){
            tfaces[p] = new FastHashtable();
            bfaces[p] = new FastHashtable();
        }
       
        for(Enumeration e = ftable.keys(); e.hasMoreElements();){
            SFace face = (SFace)e.nextElement();
            Integer ind = (Integer)ftable.get(face);
            if(ind.intValue() > 0){ // top face
                tfaces[face.getPlaneIndex()].put(face,face);
            } else { // bottom face 
                bfaces[face.getPlaneIndex()].put(face,face);	
            }
        }    
    
        Vector[] tcluster = new Vector[tfaces.length];
        Vector[] bcluster = new Vector[tfaces.length];
        for(int p =0; p <  tfaces.length; p++){
            System.out.print("plane: "  + p);
            System.out.print(" top: " + tfaces[p].size());
            System.out.println("  bottom: " + bfaces[p].size());
            tcluster[p] = findFacetsClusters(tfaces[p]);
            bcluster[p] = findFacetsClusters(bfaces[p]);
        }
    
        return poly;    
    }

    /**
     *  joins incident facets into bigger facets
     */
    Vector findFacetsClusters(FastHashtable facets){

        Vector clusters = new Vector();

        FastHashtable edges = new FastHashtable();
        for(Enumeration e = facets.keys(); e.hasMoreElements();){

            SFace face = (SFace)e.nextElement();
            // for(int i = 0; i < )
        }

        while(facets.size() > 0){

            Enumeration e = facets.keys();
            if(!e.hasMoreElements())
                break;
            SFace facet = (SFace)e.nextElement();
            clusters.addElement(buildCluster(facet, facets, edges, new Vector()));
        }

        return clusters; 
    }

    /**
     *  creates cluster of faces insident to seed face
     *  removes found facets from hashtable 
     */
    Vector buildCluster(SFace seed, FastHashtable facets, FastHashtable edges, Vector result){
        // TO-DO 
        return result;
    }

    class OrientedEdge {
        int v1,v2;
    
        OrientedEdge(int _v1, int  _v2){
            v1 =_v1;
            v2 = _v2;
        }
    
        public int hashCode(){
            return v1+119*v2;
        }
    
        public boolean equals(Object o){
            if(!(o instanceof SEdge))
                return false;
            SEdge e = (SEdge)o;
            return 
                (e.v1 == v1 && e.v2 == v2 ); 
        }    
    }

    /**
       getPolyhedron

       takes array of symmetrical stellation cells (stellation) 
       and constructs polyhedron from it
    */
    public Polyhedron getPolyhedron(SSCell[] scells){

        // count faces
        FastHashtable ftable = new FastHashtable();

        Integer topindex = new Integer(1);
        Integer bottomindex = new Integer(-1);

        Polyhedron poly = new Polyhedron();

        for(int i =0; i < scells.length; i++){
            SSCell scell = scells[i];
      
            for(int c = 0; c < scell.cells.length; c++){
	
                // elementary cell 
                SCell cell = scell.cells[c];
                // top faces
                for(int f = 0; f < cell.top.length; f++){	  
                    SFace face = cell.top[f];
                    Integer index = (Integer)ftable.get(face);
                    if(index == null){
                        // face is not in ftable yet
                        ftable.put(face, topindex);	    
                    } else {
                        // face already there
                        if(index == bottomindex){
                            // face should be removed
                            ftable.remove(face);
                        } else {
                            // this should not happens
                            System.out.println("duplicate face in stellation!");
                        }
                    }
                }
                // bottom faces
                for(int f = 0; f < cell.bottom.length; f++){	  
                    SFace face = cell.bottom[f];
                    Integer index = (Integer)ftable.get(face);
                    if(index == null){
                        // face is not in ftable yet
                        ftable.put(face, bottomindex);
                    } else {
                        // face already there
                        if(index == topindex){
                            // face should be removed
                            ftable.remove(face);
                        } else {
                            // this should not happens
                            System.out.println("duplicate face in stellation!");
                        }
                    }
                }	
            }      
        }

        // now ftable contains all nondublicated faces
        poly.ifaces = new int[ftable.size()][];
        poly.icolor = new int[ftable.size()];
        Vector vert = new Vector();
        FastHashtable vtable = new FastHashtable();
        // edges of this stellation
        // all edges inside of faces should be eliminated
        // all esges on boundary of faces should be counted 
        // only once
        FastHashtable etable = new FastHashtable();

        int fcounter = 0;
        for(Enumeration keys = ftable.keys(); keys.hasMoreElements();){
            SFace face = (SFace)keys.nextElement();
            int [] iface = new int[face.vertices.length];
            // top or bottom face (+1 or -1)
            Integer findex = (Integer)ftable.get(face);
            for(int v = 0; v < face.vertices.length; v++){
                Integer vindex = (Integer)vtable.get(face.vertices[v]);
                if(vindex == null){
                    vindex = new Integer(vert.size());
                    vtable.put(face.vertices[v], vindex);
                    vert.addElement(face.vertices[v]);
                }
	
                if(findex == topindex){ // top face
                    iface[v] = vindex.intValue();
                } else { // bottom face - vertices are going in opposite direction
                    iface[iface.length -1 - v] = vindex.intValue();
                }
            }
            // add edges of this face
            Integer v1index = (Integer)vtable.get(face.vertices[face.vertices.length-1]);
            for(int v = 0; v < face.vertices.length; v++){
                Integer v2index = (Integer)vtable.get(face.vertices[v]);
                // edges for top and bottom planes should be different;
                // therefore they will be assigned different plane index
                //System.out.println(v1index+" "+v2index +" " + findex);
                FEdge edge = new FEdge(v1index.intValue(),
                                       v2index.intValue(),
                                       face.getPlaneIndex()*findex.intValue());
                if(etable.get(edge) != null){
                    // edge is alredy in the table - remove it.
                    //System.out.println("old fedge:" + v1index+" "+v2index +" " + findex);
                    etable.remove(edge);
                } else {
                    etable.put(edge,edge);
                    //System.out.println("new fedge:" + v1index+" "+v2index +" " + findex);
                }
                v1index = v2index;
            }
      
            poly.icolor[fcounter] = (findex == topindex)? 1: 0;
            poly.ifaces[fcounter] = iface;
            fcounter++;
        } // end of for(Enumeration keys = ftable.keys(); keys.hasMoreElements();)

        //joinEdgesToFaces(etable);
        poly.colors = makeTopBottomColors();
        poly.vertices = new Vector3D[vert.size()];
        vert.copyInto(poly.vertices);

        // now collect only unique edges
        FastHashtable setable = new FastHashtable();
        for(Enumeration e = etable.keys(); e.hasMoreElements();){
            FEdge fedge = (FEdge)e.nextElement();
            SEdge sedge = new SEdge(fedge.v1,fedge.v2);
            setable.put(sedge,sedge);
        }
        //System.out.println(" edges:"+setable.size());
        poly.edges = new int[setable.size()][2];
        int ecount =0;
        for(Enumeration e = setable.keys(); e.hasMoreElements();){
            SEdge sedge = (SEdge)e.nextElement();
            poly.edges[ecount][0] = sedge.v1;
            poly.edges[ecount][1] = sedge.v2;
            ecount++;
        }
        return poly;
    }

    /**
     *  joins edges into continuous chain to make bigger faces 
     */
    void joinEdgesToFaces(FastHashtable etable){

        int nfaces = faces.length;
        Vector[] sortedEdges = new Vector[nfaces*2];
        for(int i = 0; i < sortedEdges.length; i++){
            sortedEdges[i] = new Vector();
        }
        for(Enumeration e = etable.keys(); e.hasMoreElements();){
            FEdge edge = (FEdge)e.nextElement();
            if(edge.index < 0)
                sortedEdges[-edge.index + nfaces].addElement(edge);
            else 
                sortedEdges[edge.index].addElement(edge);
        }

        Vector sortedFaces[] = new Vector[sortedEdges.length];
        for(int fi = 0; fi < sortedEdges.length; fi++){
            sortedFaces[fi] = makeChains(sortedEdges[fi]);
        }

        for(int fi = 0; fi < sortedFaces.length; fi++){
            System.out.print("face index: " + fi+":");
            for(int si = 0; si < sortedFaces[fi].size(); si++){
                System.out.print("[");
                Vector subfaces = (Vector)sortedFaces[fi].elementAt(si);
                FEdge edge = null;
                for(int e = 0; e < subfaces.size(); e++){
                    edge = (FEdge)subfaces.elementAt(e);
                    System.out.print(edge.v1+" ");
                }
                if(edge != null){ // print last edge of the chain 
                    System.out.print(edge.v2);
                }
                System.out.print("]");
            }
            System.out.println();
        }
        /*
          for(int fi = 0; fi < sortedEdges.length; fi++){
          System.out.print("face index: " + fi+":");
          for(int e = 0; e < sortedEdges[fi].size(); e++){
          FEdge edge = (FEdge)sortedEdges[fi].elementAt(e);
          System.out.print("("+edge.v1+","+edge.v2+")");
          }
          System.out.println();
          }
        */
    }

    /**
     *  makes chains of sequential edges from a unordered vector 
     */
    Vector makeChains(Vector edges){

        Vector sfaces = new Vector();
        FastHashtable etable = new FastHashtable();
        Vector doubleVert = new Vector();
        for(int e = 0; e < edges.size(); e++){
            FEdge fe = (FEdge)edges.elementAt(e);
            Object o = etable.get(new Integer(fe.v1));
            if(o != null){
                // double vertex, this will be start of new face
                doubleVert.addElement(o);
            } else {
                etable.put(new Integer(fe.v1), fe);
            }	
        }
        // first we will take out edges, which start at double vertices
        for(int e = 0; e < doubleVert.size(); e++){
            sfaces.addElement(makeChainFromSeed((FEdge)doubleVert.elementAt(e), etable));
        }
        // continue with the rest
        while(true){
            // every cycle we start new enumeration 
            // because some edges may be removed inside of makeChainFromSeed()
            Enumeration e = etable.keys(); 
            if(!e.hasMoreElements())
                break;
            Integer ind = (Integer)e.nextElement();
            FEdge fe = (FEdge)etable.get(ind);
            etable.remove(ind);
            sfaces.addElement(makeChainFromSeed(fe,etable));
        }
        return sfaces;
    }

    /**
     *  creates chain of edges staring from given edge and removes 
     *  found edges from hashtable 
     */
    Vector makeChainFromSeed(FEdge edge, FastHashtable etable){
        Vector vect = new Vector();
        vect.addElement(edge);
        FEdge current = edge;
        while(true){
            Integer key = new Integer(current.v2);
            FEdge next = (FEdge)etable.get(key);
            if(next == null)
                break;
            vect.addElement(next);
            etable.remove(key);
            if(next.v2 == edge.v1){
                break;
            }
            current = next;
        }
        return vect;
    }
  
  
    /**
       returns vector of intersection of plane p and line v, passing through (0,0,0)
    */
    public static Vector3D intersect(Plane p, Vector3D v){
        // (t*v, p) - d = 0;
        double denom = (p.v.dot(v));
        if(Math.abs(denom) < Plane.TOLERANCE)
            return null;
        return v.mul(p.d / denom);
    }

    /**
     * calculates line of intersection of two planes P1 P2 and 
     * returns intersection of this line with sphere with radius r
     */
    public static Vector3D[] intersect(Plane P1, Plane P2, double r){
    
        double EPSILON = 0.001;
        Vector3D T = P1.v.cross(P2.v);
        Vector3D T1  = T.cross(P1.v);
        double t1p2 = T1.dot(P2.v);
        if(Math.abs(t1p2) < EPSILON){ // no planes intersection 
            return null;
        }	  
        double t1 = (P2.d - P1.d*P2.v.dot(P1.v))/t1p2;
        Vector3D P = T1.mul(t1).add(P1.v.mul(P1.d));
        double d = (r*r+1)-P.dot(P);
        if(d <= 0.){ // no intersection with sphere 
            return null;
        }
        Vector3D points[] = new Vector3D[2];
        double t12 = Math.sqrt(d/T.dot(T)); 
        points[0] = P.add(T.mul(t12));
        points[1] = P.add(T.mul(-t12));
        return points;

    }


    /**
       makeTopBottomColors
    
       just utility, returns two colors fro toa and bottom face
    */
    static Color[] makeTopBottomColors(){
    
        Color[] col = new Color[2];
        col[1] = new Color((int)(0.85*255),(int)(0.85*255),(int)(0.1*255));
        col[0] = new Color((int)(0.95*255),(int)(0.4*255),(int)(0.2*255));
        return col;

    }

    /**
       findIndex

       looks for vertex in vert, using table for fast search
       return vertex index if have found such a vertex,
       new vertex is added otherwise
    */
    int findIndex(FastHashtable table, Vector vert, Vector3D vector){

        Integer index = (Integer)table.get(vector);
        int result = 0;
        if(index == null){ // there is no such vertex, let's add new one
            Integer newindex = new Integer(vert.size());
            table.put(vector,newindex);
            vert.addElement(vector);
            result = newindex.intValue();
        } else {
            result = index.intValue();
        }
        //System.out.print(" " + result);System.out.flush();
        return result;
    }

    /**
       findIndex

       looks for vertex in vert, 
       return vertex index if have found such a vertex,
       new vertex is added otherwise
    */
    static int findIndex(Vector vert, Vector3D vect){
        int size = vert.size();
    
        for(int i = 0; i < size; i++){
            if(vect.equals((Vector3D)vert.elementAt(i)))
                return i;
        }
        vert.addElement(vect);
        return size;
    }

    /**
       getPlane

       returns equation of plane of given face of given poly
       equation: P.v.dot(X)-P.d = 0
       point P - point of the plane nearest to origin and 
       vector P.v is orthogonal to plane
       this does not work for planes passing through zero.
    */
    public static Plane getPlane(Polyhedron poly, int face){

        int iface[] = poly.ifaces[face];
        Vector3D v0 = poly.vertices[iface[0]];
        Vector3D v1 = poly.vertices[iface[1]];
        Vector3D v2 = poly.vertices[iface[2]];
        Vector3D normal = v2.sub(v1).cross(v0.sub(v1));
        normal.normalize();
        double dot = normal.dot(v1);
        return new Plane(normal, dot, face);

    }
    /*
      public static Vector3D getPlane(Vector3D[] vect){

      Vector3D v0 = vect[0];
      Vector3D v1 = vect[1];
      Vector3D v2 = vect[2];
      Vector3D normal = v2.sub(v1).cross(v0.sub(v1));
      normal.normalize();
      return normal.mulSet(normal.dot(v1));

      }
    */

    /**
       makeStellationFaces
    
    */  
    public SFace[][] makeStellationFaces(Vector3D[] vector, int maxintersection){
        Plane[] planes = new Plane[vector.length];
        for(int i = 0; i < vector.length; i++){
            Vector3D v = new Vector3D(vector[i]);
            double len = v.length();
            v.normalize();
            planes[i] = new Plane(v,len,i);
        }
        return makeStellationFaces(planes, maxintersection);
    }
  
    /**
       makeStellationFaces
    
       for each face plane constructs all intersections 
       with every other plane
    */  
    public SFace[][] makeStellationFaces(Plane[] planes, int maxintersection) {

        System.out.println("planes: " + planes.length);
        this.planes = planes;
        DoubleIndex[] pindex = new DoubleIndex[planes.length];    
        for(int i=0; i < pindex.length; i++){
            pindex[i] = new DoubleIndex(0.,i);
        }

        // all generated vertices
        FastHashtable vtable = new FastHashtable();
        SFace[][] faces = new SFace[planes.length][];
        //SFace[][] faces = new SFace[5][];
        for(int i=0; i < planes.length; i++){
            //for(int i=0; i < 5; i++){

            System.out.print(i);System.out.flush();
            sortPlanes(pindex,planes,planes[i]);
            Vector vfaces = new Vector();
            vfaces.addElement(makeSeedFace(planes[i],i));    

            for(int j = 0; j < planes.length; j++){
                if(pindex[j].index != i)
                    intersectFacesWithPlane(vfaces,planes[pindex[j].index], vtable, i, maxintersection);
            }
            faces[i] = cleanFaces(vfaces);
            System.out.print("("+faces[i].length+") ");
            if((i+1)%10 == 0)
                System.out.println("");
            //System.out.print(" "+Runtime.getRuntime().freeMemory()+":");
            //System.gc();
            //System.out.println(Runtime.getRuntime().freeMemory());
        }
    
        // make new table, which has only true vertices
        vtable = new FastHashtable();
        for(int i=0; i < faces.length; i++){
            for(int j=0; j < faces[i].length; j++){
                SFace face = faces[i][j];
                for(int k =0; k < face.vertices.length; k++){
                    vtable.put(face.vertices[k],face.vertices[k]);
                }
            }      
        }
        System.out.println("vertices found: " + vtable.size());
        return faces;    
    }

    /**
       makeStellationFaces
    
       for each face plane constructs all intersections 
       with every other plane
    */  
    SFace[][] makeStellationFaces(Polyhedron poly, int maxintersection){

        Plane[] planes = new Plane[poly.ifaces.length];
        for(int i = 0; i < poly.ifaces.length; i++){
            planes[i] = getPlane(poly,i);
        }
        return makeStellationFaces(planes, maxintersection);
    }
  
    /**
       sortPlanes
    
       sors planes indices according to their angle with given plane
    
    */
    static void sortPlanes(DoubleIndex[] pindex, Plane[] planes, Plane plane){

        for(int i=0; i < pindex.length; i++){
            pindex[i].value = -plane.v.dot(planes[pindex[i].index].v);
        }
        QSort.quickSort(pindex,0,pindex.length-1,pindex[0]);
        //for(int i = 0; i < pindex.length; i++){
        //  System.out.println(pindex[i].value);
        //}
    }

    // values of linear function, which is used to intersect polygons
    // we assume, that there will be less than 1000 vertices in polygon
    static double[] fval = new double[1000];
    // to breake a little bit symmetry of +/-
    static final double THRESHOLD = 1.e-7;
    /**
       intersect

       intersect all the faces with plane, incrementing counter of  
       external faces
       vtable - all generated vertices 
    */
    static void intersectFacesWithPlane(Vector faces, Plane plane, 
                                        FastHashtable vtable, int index, int maxintersection){
        double dist2 = plane.d;//length2();

        int fsize = faces.size();

        for(int i=0; i < fsize; i++){
	
            int nplus = 0, nminus = 0;
            SFace sface = (SFace)faces.elementAt(i);
            for(int j = 0; j < sface.vertices.length; j++){
                if(sface.vertices[j] == null){
                    System.out.println("\nnull pointer!!!!!!");
                    for(int k = 0; k < sface.vertices.length; k++){
                        System.out.print(sface.vertices[k]);
                    }
                    //System.out.println("\n" + sface.plane.v + plane.v);
                } else {
                    fval[j] =  sface.vertices[j].dot(plane.v) - dist2;
                    if(fval[j] < THRESHOLD )
                        nminus++;
                    else 
                        nplus++;	
                }
            }
      
            if(nminus == 0){ // polygon is outside of halfspace
                sface.layer++;  
                continue;
            } else if(nplus == 0){ // polygon lies inside of halfspace
                continue; 
            }

            //
            // face has intersection
            //
      
            // find first and last points inside and outside of halfplane
            int lastin = 0, lastout = 0, firstin = 0, firstout = 0;
            int polysize = sface.vertices.length;

            // find any positive point
            while(fval[lastout] < THRESHOLD)
                lastout = (++lastout)%polysize;

            // find last positive point
            firstin = (lastout+1)%polysize;
            while(fval[firstin] >= THRESHOLD){ // skeep all outside
                lastout = firstin;
                firstin = (++firstin)%polysize;
            }

            // find last negative point
            lastin = firstin;
            firstout = (lastin+1)%polysize;
            while(fval[firstout] < THRESHOLD){ // skeep all inside
                lastin = firstout;
                firstout = (++firstout)%polysize;	  
            }
      
            int inside = firstin;
            // store all negative points into inside polygon
            Vector3D[] vins = new Vector3D[nminus+2];
            Vector3D[] vout = new Vector3D[nplus+2];
            int count = 0;
            while(fval[inside] < THRESHOLD){ 
                vins[count++] = sface.vertices[inside];
                inside = (++inside)% polysize;
            }

            // last two points;
            // TO-DO - this is place, where significant roundof  error may come
            // instead of calculating intesection in plane we better calculate intersection of 3 planes forming that vertex
            Vector3D pnt1 = findVertex(vtable,interpolate(sface.vertices[lastin],
                                                          sface.vertices[firstout],
                                                          fval[lastin],fval[firstout]));
            Vector3D pnt2 = findVertex(vtable,interpolate(sface.vertices[lastout],
                                                          sface.vertices[firstin],
                                                          fval[lastout],fval[firstin]));
            vins[count++] = pnt1;
            vins[count++] = pnt2;
            // add these point to outside poly in opposite order
            count = 0;
            vout[count++] = pnt2;
            vout[count++] = pnt1;
      
            int outside = firstout;
            // store all positive points into outside polygon
            while(fval[outside] >= THRESHOLD){ 
                vout[count++] = sface.vertices[outside];
                outside = (++outside)% polysize;
            }

            SFace fout = new SFace(vout,sface.getPlane());
            fout.layer = sface.layer+1;

            // replace old polygon by new 
            sface.vertices = vins;
      
            // add another to the end of vector
            if(maxintersection < 0 || fout.layer < maxintersection)
                faces.addElement(fout); 
      
        }
    }

    /**
       findVertex

       looks for vertex in vtable, 
       returns old vertex if it is already in vtable
    */
    static Vector3D findVertex(FastHashtable vtable, Vector3D vector){
    
        Vector3D v = (Vector3D)vtable.get(vector);
        if(v != null)
            return v;
        vtable.put(vector,vector);
    
        return vector;
    }

    /**
       interpolate

       find point p = f(0.) and f satisfies: f(t1) = p1, f(t2) = p2
    */
    static Vector3D interpolate(Vector3D p1, Vector3D p2, double t1, double t2){
        // p = (p1*t2-p2*t1)/(t2-t1);
        double t12 = t2-t1;
        if(t12 == 0.0){
            System.out.println("t1 == t2");
            return new Vector3D(p1);      
        }
        t1 /= t12;
        t2 /= t12;

        return new Vector3D((p1.x*t2-p2.x*t1), (p1.y*t2-p2.y*t1), (p1.z*t2-p2.z*t1));
    }

    static double FACTOR = 5.e3;
    //static final double FACTOR = 1.e4;
    static double MAXVERTEX = 2.e3;

    /**
       return huge face collinear to face of polyhedron
    */
    static SFace makeSeedFace(Polyhedron poly, int face, Plane plane){
        Vector3D center = new Vector3D(0,0,0);
        int [] iface = poly.ifaces[face];
        for(int i=0; i < iface.length; i++){
            center.addSet(poly.vertices[iface[i]]);
        }
        center.mulSet(1.0/iface.length);
        Vector3D[] vert = new Vector3D[iface.length];
        for(int i = 0; i < iface.length; i++){
            vert[i]= new Vector3D();
            vert[i].set(poly.vertices[iface[i]]).subSet(center).mulSet(FACTOR).
                addSet(center);
        }
        return new SFace(vert,plane);
    }

    /**
       return huge face orthogonal to plane
    */
    static SFace makeSeedFace(Plane plane, int face){

        int n = 4;
        Vector3D[] vert = new Vector3D[n];

        Vector3D normal = new Vector3D(plane.v);
        normal.normalize();
        Vector3D x = new Vector3D(1,0,0);
        Vector3D y = x.cross(normal);
        if(y.length2() < 1.e-4){
            x = new Vector3D(0,1,0);
            y = x.cross(normal);
        }
        y.normalize();
        Vector3D z = normal.cross(y);

        //System.out.println("\n"+plane + y + z);
        Vector3D fpoint = plane.v.mul(plane.d);
        for(int i = 0; i < n; i++){
            Vector3D v1 = y.mul(FACTOR*Math.cos(2*Math.PI*i/n));
            Vector3D v2 = z.mul(FACTOR*Math.sin(2*Math.PI*i/n));
            vert[i] = fpoint.add(v1.add(v2));
            //System.out.println(vert[i]);
        }

        return new SFace(vert,plane);
    }

    /**
       cleanFaces

       removes all the faces, which have segments from original 
       huge faces 
       removes faces with zero area
       removes 
    */
    static SFace[] cleanFaces(Vector faces){
        int flag[] = new int[faces.size()];
        int count = 0;
        for(int i =0; i < flag.length; i++){
            SFace face = (SFace)faces.elementAt(i);
            // bad aproach !!!
            if(getLongestVertex(face.vertices) < MAXVERTEX){
                face.cleanVertices();
                if(face.vertices.length > 2){
                    flag[i] = 1;	  
                    count ++;
                }
            }
        }
        SFace sface[] = new SFace[count];
        count = 0;
        for(int i=0;  i < flag.length; i++){
            if(flag[i] != 0){
                sface[count] = (SFace)faces.elementAt(i);
                count++;
            }
        }
        return sface;
    }

    /**
       getLongestVertex
    */
    static double getLongestVertex( Vector3D[] vertices){
        double dist = 0;
        for(int i=0; i < vertices.length; i++){
            double l = vertices[i].length();
            if(l > dist)
                dist = l;
        }
        return dist;
    }

    /**
       findMaxLayer
    
       returns largest layer of stellation found 
    */
    static int findMaxLayer(SFace[] faces){
        int smax = 0;
        for(int i = 0; i < faces.length; i++){
            SFace sf = faces[i];
            if(sf.layer > smax)
                smax = sf.layer;
        }
        return smax;
    }

    static int findMaxLayer(SFace[][] faces){
        int smax = 0;
        for(int i=0; i < faces.length; i++){
            int s = findMaxLayer(faces[i]);
            if(s > smax)
                smax = s;
        }      
        return smax;
    }


    /**
       intersectCells

       takes vector of cells and intersects them with plane
    */
    static void intersectCells(Vector cells, Plane plane){
        int size = cells.size();
        for(int i=0; i < size; i++){
            SCell newcell = intersectCell((SCell)cells.elementAt(i),plane);
            if(newcell != null){
                // top part of intersection goes at the end of vector	
                cells.addElement(newcell);
            }
        }
    }
  
    /**
       intersectCell

       intersects one cell,
       it there is an intersection it will return top part of intersection 
       and replace input cell with bottom part of intersection
    */
    static SCell intersectCell(SCell cell, Plane plane){
        // TO DO
        Vector edges = new Vector();
        Vector top = new Vector();
        Vector bottom = new Vector();
        for(int i = 0; i < cell.top.length; i++){
            SFace face = intersectFace(cell.top[i], plane, edges);
            if(face != null){
                // top faces of top cell
                top.addElement(face);
            }
        }

        if(edges.size() > 0){

            SFace face = new SFace(arrangeEdges(edges),plane);
            // add this face to bottom cell
            bottom.addElement(face);

            // reverse vertices
            Vector3D[] v = new Vector3D[face.vertices.length];
            for(int i = 0; i < face.vertices.length; i++){
                v[v.length - 1 - i] = face.vertices[i];
            }
            // add reversed face to top cell
            top.addElement(new SFace(v,plane));
        }         
        return null;
    }

    /**
       intersectFace

       intersect face with plane.
       return null, if there is no intersection 
       return new SFace, which corresponds to top part 
       of intersection, replaces face with bottom part of intersection 
       and adds edge of intersection to edges    
    */
    static SFace intersectFace(SFace face, Plane plane, Vector edges){
        // TO DO
        return null;
    }

    /**
       arrangeEdges
    
       takes set of edges and build SFace from them 
       counterclockwise relative to origin
    */
    static Vector3D[] arrangeEdges(Vector edges){
        // TO DO
        return null;
    }


    /**
       countVertices
    */
    static int countVertices(SFace[][] faces){

        FastHashtable table = new FastHashtable();
        for(int i =0; i < faces.length; i++){
            for(int j =0; j < faces[i].length; j++){
                Vector3D[] vertices = faces[i][j].vertices;
                for(int k =0; k < vertices.length; k++){
                    table.put(vertices[k],vertices[k]);
                }
            }
        }
        return table.size();
    }

    /**
       makeLayers
    
    */
    static SFace[][][] makeLayers(SFace[][] faces){

        int nlayers = findMaxLayer(faces) + 1;
        SFace[][][] layers = new SFace[nlayers][][];

        for(int i=0; i < nlayers; i++){
            layers[i] = new SFace[faces.length][];
        }

        for(int i = 0; i < faces.length; i++){
            SFace[] pface = faces[i];
            int[] nl = new int[nlayers];
            for(int j = 0; j < pface.length; j++){
                nl[pface[j].layer]++;
            }
            for(int k=0; k < nlayers; k++){
                layers[k][i] = new SFace[nl[k]];
                nl[k] = 0;
            }
            for(int j = 0; j < pface.length; j++){
                layers[pface[j].layer] [i] [nl[pface[j].layer]] = pface[j];
                nl[pface[j].layer]++;
            }
        }    
        return layers;
    }

    /**
       makeFaceTable

    */
    static FastHashtable makeFaceTable(SFace[][] faces){
        FastHashtable table = new FastHashtable();    
        for(int i = 0; i < faces.length; i++){
            SFace[] pfaces = faces[i];
            for(int j = 0; j < pfaces.length; j++){
                table.put(pfaces[j],pfaces[j]);
            }
        }
        return table;
    }

    /**
       makeFaceTableCanon

    */
    static FastHashtable makeFaceTableCanon(SFace[][] faces, int maxindex){

        FastHashtable table = new FastHashtable();    
        //for(int i = 0; i < faces.length; i++){
        for(int i = 0; i < maxindex; i++){
            SFace[] pfaces = faces[i];
            for(int j = 0; j < pfaces.length; j++){
                table.put(pfaces[j],pfaces[j]);
            }
        }
        return table;
    }

    /**
       makeVertexTable

       creates table of SVertex, which can be used for fast search 
       of faces, adjacent to given vertex
    */
    static FastHashtable makeVertexTable(SFace[][] faces){
        FastHashtable table = new FastHashtable();    
        for(int i = 0; i < faces.length; i++){
            SFace[] pfaces = faces[i];
            for(int j = 0; j < pfaces.length; j++){
                SFace face = pfaces[j];
                Vector3D[] vert = face.vertices;
                for(int k = 0; k < vert.length; k++){
                    SVertex vertex = (SVertex)table.get(vert[k]);
                    if(vertex == null){
                        vertex = new SVertex(vert[k]);
                        table.put(vert[k], vertex);
                    }
                    vertex.addFace(face);
                }
            }
        }
        return table;
    }


    /**
       makeCellsFromFaceCells(Vector cells, String symmetry)
       takes a vector of cells in one layer and creates all the orbits of all cells
    */
    Vector makeCellsFromFaceCells(Vector cells, Matrix3D[] symMatrices, FastHashtable tbottom, FastHashtable ttop){
        int size = cells.size()*planes.length;
        if(DEBUG)printf("hashtable size: %d\n", size);
        FastHashtable tcells = new FastHashtable(size);

        for(Enumeration e = cells.elements(); e.hasMoreElements(); ){

            SCell cell= (SCell)e.nextElement();
            tcells.put(cell.getCenter(),cell);
        }

        for(Enumeration e = cells.elements(); e.hasMoreElements(); ){

            SCell cell = (SCell)e.nextElement();
            for(int m = 1; m < symMatrices.length; m++){
                Vector3D center = cell.getCenter();
                Vector3D tc = center.mul(symMatrices[m]);
                if(tcells.get(tc) == null){
                    // no such cell in the table yet
                    SCell ttanscell = cell.getTransformedCopy(symMatrices[m],tbottom,ttop);
                    tcells.put(ttanscell.getCenter(), ttanscell);
                }
            }
        }
        Vector result = new Vector(tcells.size());
        for(Enumeration e = tcells.elements(); e.hasMoreElements();){
            result.addElement(e.nextElement());
        }

        return result; 
    }

    /**
       makeCells2
    
       makes all symmetrical cells 
       1) makes cells, which are adjacent to canonical planes 
       2) makes symmetrical transformations of these cells. 
    */
    public Vector makeCells2(String fullSymmetry, String stellSymmetry, int maxLayer){

        SFace[][][] layers = makeLayers(faces); // [layer][plane][inplane]
        FastHashtable ftables[] = new FastHashtable[layers.length]; 
        for(int l=0; l < ftables.length; l++){
            ftables[l] = new FastHashtable();//layers[l].length*layers[l][0].length);
            for(int p = 0; p < layers[l].length; p++){
                for(int f = 0; f < layers[l][p].length; f++){
                    SFace sf = layers[l][p][f];
                    ftables[l].put(sf.getCenter(),sf);
                }
            }
        }
    
        int counter = 0;
        int scounter = 0;
    
        // allcells contains for every layer vector of 
        // SSCell belonging to this layer
        Vector allcells = new Vector();
        int maxlay = layers.length;
        System.out.println("\nLayers: " + layers.length);
        if(maxLayer < layers.length){
            maxlay = maxLayer;
            System.out.println("layer limit: " + maxLayer);
        }

        Matrix3D[] symMatrices = Symmetry.getMatrices(fullSymmetry);

        for(int i = 0; i < maxlay ; i++){

            Vector faceCells;
            Vector cells;
            if(i == 0) {
                faceCells = makeCellsFromLayers2(new SFace[0][0],layers[0], 0);
                cells = makeCellsFromFaceCells(faceCells, symMatrices, new FastHashtable(),ftables[0]);
            } else {
                faceCells = makeCellsFromLayers2(layers[i-1],layers[i], i);
                cells = makeCellsFromFaceCells(faceCells, symMatrices,ftables[i-1],ftables[i]);
            }
	
            counter += faceCells.size();	
            System.out.print("layer: " + i + " cells: " +faceCells.size());
      
      
            Vector scells = makeSymmetricalCells(cells, fullSymmetry, stellSymmetry);
      
            allcells.addElement(scells);
            System.out.print(" scell: "+scells.size() + ": ( ");
            scounter += scells.size();
            double volume = 0;

            for(int j = 0; j < scells.size(); j++){

                SSCell scell = (SSCell)scells.elementAt(j);
                System.out.print(scell.cells.length + ".");
                System.out.print(scell.getNFacets() + ".");
                System.out.print(scell.getNVertices() + " ");
                //System.out.print(scell.getSCellIndex().toString() + " ");
                volume += scell.getVolume();
            }
            System.out.println(") Vol: "+volume);
        }

        System.out.println(counter + " cells " + negCellCount + " neg cells");
        System.out.println(scounter + " scells");
        /*
          for(int i=0; i < allcells.size(); i++){
      
          Vector scells = (Vector)allcells.elementAt(i);
      
          for(int j = 0; j < scells.size()-1; j++){
	
          SSCell scell1 = (SSCell)scells.elementAt(j);
          SSCell scell2 = (SSCell)scells.elementAt(j+1);
          if(scell1.strictCompare(scell1,scell2) == 0){
          //System.out.println("#" + i + "("+j+"):"  + i + "("+(j+1)+")"+scell1.getInfo() + scell2.getInfo());
          System.out.println("[" + i + "("+j+"):"  + i + "("+(j+1)+") \t" + Fmt.fmt(scell1.getVolume(),8,5) + "," + 
          Fmt.fmt(scell2.getVolume(),8,5)+"]");
          }
          }
          }
        */
    
        //makeConnectivityGraph(allcells);
        return allcells;
    }

    /**
       makeCells
    
       makes all symmetrical cells
    */
    public Vector makeCells(String fullSymmetry, String stellSymmetry, int maxLayer){

        SFace[][][] layers = makeLayers(faces);
        int counter = 0;
        int scounter = 0;
    
        // allcells contains for every layer vector of 
        // SSCell belonging to this layer
        Vector allcells = new Vector();
        int maxlay = layers.length;
        System.out.println("\nLayers: " + layers.length);
        if(maxLayer < layers.length){
            maxlay = maxLayer;
            System.out.println("layer limit: " + maxLayer);
        }
        for(int i = 0; i < maxlay ; i++){


            Vector cells;
            if(i == 0)
                cells = makeCellsFromLayers(new SFace[0][0],layers[i], i);
            else 
                cells = makeCellsFromLayers(layers[i-1],layers[i], i);
	
            counter += cells.size();	
            System.out.print("layer: " + i + " cells: " +cells.size());
      
            Vector scells = makeSymmetricalCells(cells, fullSymmetry, stellSymmetry);
      
            allcells.addElement(scells);
            System.out.print(" scell: "+scells.size() + ": ( ");
            scounter += scells.size();
            double volume = 0;

            for(int j = 0; j < scells.size(); j++){

                SSCell scell = (SSCell)scells.elementAt(j);
                System.out.print(scell.cells.length + ".");
                System.out.print(scell.getNFacets() + ".");
                System.out.print(scell.getNVertices() + " ");
                //System.out.print(scell.getSCellIndex().toString() + " ");
                volume += scell.getVolume();
            }
            System.out.println(") Vol: "+volume);
        }

        System.out.println(counter + " cells " + negCellCount + " neg cells");
        System.out.println(scounter + " scells");

        for(int i=0; i < allcells.size(); i++){
      
            Vector scells = (Vector)allcells.elementAt(i);
      
            for(int j = 0; j < scells.size()-1; j++){
	
                SSCell scell1 = (SSCell)scells.elementAt(j);
                SSCell scell2 = (SSCell)scells.elementAt(j+1);
                if(scell1.strictCompare(scell1,scell2) == 0){
                    System.out.println("#" + i + "("+j+"):"  + i + "("+(j+1)+")"+scell1.getInfo() + scell2.getInfo());
                }
            }
        }
    
        makeConnectivityGraph(allcells);
        return allcells;
    }


    /**
       makeCellsFromLayers2

       constructs 3D stellation cells, which have given top and bottom facets
    */  
    Vector makeCellsFromLayers2(SFace[][] bottomfaces, SFace[][] topfaces, int layer){


        // tables of all faces
        // we will make only cells, which have top facets belonging canonical planes
        FastHashtable ttableCanon = makeFaceTableCanon(topfaces, canonicalVectors.length);
        FastHashtable ttable = makeFaceTable(topfaces);
        FastHashtable btable = makeFaceTable(bottomfaces);

        // tables for fast search of adjacent faces
        FastHashtable tvtable = makeVertexTable(topfaces);
        FastHashtable bvtable = makeVertexTable(bottomfaces);

        //Vector3D[] planes = new Vector3D[topfaces.length];
        //for(int i = 0; i < planes.length; i++){
        //  planes[i] = getPlane(topfaces[i][0].vertices);
        //}

        Vector cells = new Vector();

        // while something left in top faces
        while(ttableCanon.size() > 0){
            SFace face = (SFace)ttableCanon.elements().nextElement();
            ttableCanon.remove(face);
            ttable.remove(face);
            // vert_table holds all vertices of the given cell
            FastHashtable vert_table = new FastHashtable();
            // t_adj_faces holds all top faces adjacent to to vertices of the cell
            FastHashtable t_adj_faces = new FastHashtable();
            // b_adj_faces holds all bottom faces adjacent to vertices of the cell
            FastHashtable b_adj_faces = new FastHashtable();
            // put vertices of this face into table
            for(int i = 0; i < face.vertices.length; i++ ){
                Vector3D vert = face.vertices[i]; 
                vert_table.put(vert,vert);

                // find all faces adjacent to this vertex
                findAdjacentFaces(ttable, vert,t_adj_faces, tvtable);
                findAdjacentFaces(btable, vert,b_adj_faces, bvtable);
            }

            // top faces of the cell
            Vector tfaces = new Vector();
            tfaces.addElement(face);
            SFace iface;
            while((iface = findAdjacentFace(t_adj_faces, tfaces, 1)) != null){
                tfaces.addElement(iface);
                ttable.remove(iface);
                ttableCanon.remove(iface);
                t_adj_faces.remove(iface);
                // find new adjacent faces
                for(int i = 0; i < iface.vertices.length; i++ ){
                    Vector3D vert = iface.vertices[i]; 
                    if(vert_table.get(vert) == null){
                        // this is new vertex	    
                        findAdjacentFaces(ttable, vert,t_adj_faces, tvtable);
                        findAdjacentFaces(btable, vert,b_adj_faces, bvtable);
                        vert_table.put(vert,vert);
                    }
                }
            }
            // bottom faces of the cell
            Vector bfaces = new Vector();
            while((iface = findAdjacentFace(b_adj_faces, tfaces, -1)) != null){
                bfaces.addElement(iface);
                btable.remove(iface);
                b_adj_faces.remove(iface);
                for(int i = 0; i < iface.vertices.length; i++ ){
                    Vector3D vert = iface.vertices[i]; 
                    if(vert_table.get(vert) == null){
                        // this is new vertex	    
                        findAdjacentFaces(btable, vert,b_adj_faces, bvtable);
                        vert_table.put(vert,vert);
                    }
                }	
            }

            SFace[] top = new SFace[tfaces.size()];
            tfaces.copyInto(top);
            SFace[] bottom = new SFace[bfaces.size()];
            bfaces.copyInto(bottom);
            SCell sc = new SCell(top,bottom,layer);
            if(sc.getVolume() > 0){
                cells.addElement(sc);
            } else {
                negCellCount++;//System.out.print("."); // it is infinite cell 
            }
            //      System.out.println("cell: " + cells.size() + " (top: "+ tfaces.size()+
            //	  ", bottom: " + bfaces.size()+")");      
        } 
        return cells;    
    }

    /**
       makeCellsFromLayers

       constructs 3D stellation cells, which have given top and bottom facets
    */  
    Vector makeCellsFromLayers(SFace[][] bottomfaces, SFace[][] topfaces, int layer){


        // tables of all faces
        FastHashtable ttable = makeFaceTable(topfaces);
        FastHashtable btable = makeFaceTable(bottomfaces);

        // tables for fast search of adjacent faces
        FastHashtable tvtable = makeVertexTable(topfaces);
        FastHashtable bvtable = makeVertexTable(bottomfaces);

        //Vector3D[] planes = new Vector3D[topfaces.length];
        //for(int i = 0; i < planes.length; i++){
        //  planes[i] = getPlane(topfaces[i][0].vertices);
        //}

        Vector cells = new Vector();

        // while something left in top faces
        while(ttable.size() > 0){
            SFace face = (SFace)ttable.elements().nextElement();
            ttable.remove(face);
            // vert_table holds all vertices of the given cell
            FastHashtable vert_table = new FastHashtable();
            // t_adj_faces holds all top faces adjacent to to vertices of the cell
            FastHashtable t_adj_faces = new FastHashtable();
            // b_adj_faces holds all bottom faces adjacent to vertices of the cell
            FastHashtable b_adj_faces = new FastHashtable();
            // put vertices of this face into table
            for(int i = 0; i < face.vertices.length; i++ ){
                Vector3D vert = face.vertices[i]; 
                vert_table.put(vert,vert);

                // find all faces adjacent to this vertex
                findAdjacentFaces(ttable, vert,t_adj_faces, tvtable);
                findAdjacentFaces(btable, vert,b_adj_faces, bvtable);
            }

            // top faces of the cell
            Vector tfaces = new Vector();
            tfaces.addElement(face);
            SFace iface;
            while((iface = findAdjacentFace(t_adj_faces, tfaces, 1)) != null){
                tfaces.addElement(iface);
                ttable.remove(iface);
                t_adj_faces.remove(iface);
                // find new adjacent faces
                for(int i = 0; i < iface.vertices.length; i++ ){
                    Vector3D vert = iface.vertices[i]; 
                    if(vert_table.get(vert) == null){
                        // this is new vertex	    
                        findAdjacentFaces(ttable, vert,t_adj_faces, tvtable);
                        findAdjacentFaces(btable, vert,b_adj_faces, bvtable);
                        vert_table.put(vert,vert);
                    }
                }
            }
            // bottom faces of the cell
            Vector bfaces = new Vector();
            while((iface = findAdjacentFace(b_adj_faces, tfaces, -1)) != null){
                bfaces.addElement(iface);
                btable.remove(iface);
                b_adj_faces.remove(iface);
                for(int i = 0; i < iface.vertices.length; i++ ){
                    Vector3D vert = iface.vertices[i]; 
                    if(vert_table.get(vert) == null){
                        // this is new vertex	    
                        findAdjacentFaces(btable, vert,b_adj_faces, bvtable);
                        vert_table.put(vert,vert);
                    }
                }	
            }

            SFace[] top = new SFace[tfaces.size()];
            tfaces.copyInto(top);
            SFace[] bottom = new SFace[bfaces.size()];
            bfaces.copyInto(bottom);
            SCell sc = new SCell(top,bottom,layer);
            if(sc.getVolume() > 0){
                cells.addElement(sc);
            } else {
                negCellCount++;//System.out.print("."); // it is infinite cell 
            }
            //      System.out.println("cell: " + cells.size() + " (top: "+ tfaces.size()+
            //	  ", bottom: " + bfaces.size()+")");      
        } 
        return cells;    
    }

    /**
       findAdjacentFaces
    
       finds faces from pool, which are adjacent to vert and puts them into faces
    
    */
    static void findAdjacentFaces(FastHashtable pool, Vector3D vert, 
                                  FastHashtable faces, FastHashtable vtable){
    
        SVertex vertex = (SVertex)vtable.get(vert);
        if(vertex == null)
            return;
        Vector afaces = vertex.faces;
        //System.out.print(afaces.size()+" ");
        for(int i = 0; i < afaces.size(); i++){
            SFace aface = (SFace)afaces.elementAt(i);
            if(pool.get(aface) != null){ 
                // this face is actually in pool
                faces.put(aface,aface);
            }
        }
        /*
          for(Enumeration e = pool.elements(); e.hasMoreElements();){
          SFace aface = (SFace)e.nextElement();
          for(int i=0; i < aface.vertices.length; i++){
          if(aface.vertices[i] == vert){
          faces.put(aface,aface);	  
          break;
          }
          }
          }
        */
    }

    /**
       findAdjacentFace
    
       finds face from pool adjacent to some face from faces
    */
    static SFace findAdjacentFace(FastHashtable pool, Vector faces, int direction){

        for(int i=0; i < faces.size(); i++){

            SFace face = (SFace)faces.elementAt(i);

            Plane p = face.getPlane();
            Vector3D plane = p.v;
            double length2 = p.d;//length2();

            for(Enumeration e = pool.elements(); e.hasMoreElements();){

                SFace pface = (SFace)e.nextElement();

                if(plane.dot(pface.getCenter()) - length2 < 0){
                    if(pface.adjacent(face, direction) ){
	    
                        return pface;
                    }
                }
            }
        }
        return null;
    }

    /**
       makeSymmetricalSubCells

    */
    static public Vector makeSymmetricalSubCells(SSCell superCell, String symmetry){

        Vector scells = new Vector();
        SCell[] cells = superCell.cells;

        FastHashtable table = new FastHashtable();
        for(int i = 0; i < cells.length; i++){
            table.put(cells[i].getCenter(),cells[i]);
        }

        Matrix3D[] matrices = Symmetry.getMatrices(symmetry);

        while(table.size() > 0){

            Vector scell = new Vector();
            SCell cell = (SCell)table.elements().nextElement();
            scell.addElement(cell);
            table.remove(cell.getCenter());
            Vector3D center = cell.getCenter();
            // apply symmetry operation to cell      
            for(int i = 0; i < matrices.length; i++){
                Vector3D tc = center.mul(matrices[i]);
                //System.out.println(tc);
                SCell tcell = (SCell)table.get(tc);
                if(tcell != null){
                    table.remove(tc);
                    scell.addElement(tcell);	  
                }
            } 
            SSCell sscell = new SSCell(scell,symmetry);
            sscell.setSuperCell(superCell);
            scells.addElement(sscell);
        }

        if(scells.size() > 0){
            QSort.quickSort(scells,0,scells.size()-1,(SSCell)scells.elementAt(0));
        }
        return scells;
    }

    
    /**
       makeSymmetricalCells

    */
    static Vector makeSymmetricalCells(Vector cells, String cellSymmetry, String subCellSymmetry){

        Vector scells = new Vector();

        //FastHashtable table = new FastHashtable(cells.size());
        FastHashtable table = new FastHashtable();
        for(int i = 0; i < cells.size(); i++){
            SCell cell = (SCell)cells.elementAt(i);
            table.put(cell.getCenter(),cell);
        }

        Matrix3D[] matrices = Symmetry.getMatrices(cellSymmetry);

        while(table.size() > 0){

            Vector scell = new Vector();
            SCell cell = (SCell)table.elements().nextElement();
            scell.addElement(cell);
            table.remove(cell.getCenter());
            Vector3D center = cell.getCenter();
            // apply symmetry operation to cell      
            //System.out.println("symmetry: "+matrices.length + " " + center);
            for(int i = 0; i < matrices.length; i++){
                Vector3D tc = center.mul(matrices[i]);
                //System.out.println(tc);
                SCell tcell = (SCell)table.get(tc);
                if(tcell != null){
                    table.remove(tc);
                    scell.addElement(tcell);	  
                }
            } 
            SSCell sscell = new SSCell(scell,cellSymmetry);      
            sscell.makeCanonicalOrder();
            scells.addElement(sscell);
      
            sscell.setSubCells(makeSymmetricalSubCells(sscell, subCellSymmetry));
            
        }

        if(scells.size() > 0){
            QSort.quickSort(scells,0,scells.size()-1,(SSCell)scells.elementAt(0));
        }
        return scells;
    }

    /**
       makeConnectivityGraph
    
       initialises all connections between cells
       in consequent layers
    */
    static public void makeConnectivityGraph(Vector allcells){
    
        System.out.print("Making Connectivity Graph ...");System.out.flush();
    
        // init cells layers 
        for(int layer = 0; layer < allcells.size(); layer ++){
            Vector bcells = (Vector)allcells.elementAt(layer);
            for(int j = 0; j < bcells.size(); j++){
                SSCell bcell = (SSCell)bcells.elementAt(j);
                bcell.setIndex(layer, j);	
                bcell.top.removeAllElements();
                bcell.bottom.removeAllElements();
                bcell.initTopAndBottom();
            }
        }

        for(int layer = 0; layer < allcells.size()-1; layer ++){
            //System.out.print("layer:"+layer +" ");
            Vector bcells = (Vector)allcells.elementAt(layer);
            Vector tcells = (Vector)allcells.elementAt(layer+1);

            for(int j = 0; j < bcells.size(); j++){

                SSCell bcell = (SSCell)bcells.elementAt(j);
                //System.out.print((layer+1) + "." + j + "-(");
                //System.out.print(":" +j+"("+bcell.cells.length+")");

                for(int k = 0; k < tcells.size(); k++){
                    SSCell tcell = (SSCell)tcells.elementAt(k);
                    //System.out.print(" " +k+"("+tcell.cells.length+")");
                    if(bcell.isTopAdjacent(tcell)){
                        tcell.bottom.addElement(bcell);
                        bcell.top.addElement(tcell);
                        //System.out.print((layer+1)+"."+k+" ");
                    }	
                }
                //System.out.print(") ");
            }      
            //System.out.println("");
        }
    
        System.out.println("done");System.out.flush();
    }

    /**
       getFullSupportedStellations
    
    */
    static Vector getFullSupportedStellations(Vector allcells){
        // TODO !!!
        Vector stellations = new Vector();

        FastHashtable table = new FastHashtable();

        for(int i = 0; i < allcells.size(); i++){
            Vector layer = (Vector)allcells.elementAt(i);
            for(int j = 0; j < layer.size(); j++){
                SSCell scell = (SSCell)layer.elementAt(j);
                table.put(scell,scell);	
            }
        }

        //getTopStellations();

        return stellations;
    }
  
    /**
       writeVrmlScene
    
    */
    public static void writeVrmlScene(Vector cells, String prefix){
        try {
            String cellfname = prefix + "_cells";

            PrintStream fout = new PrintStream(new FileOutputStream(cellfname));
            fout.print("Roller{\n object[\n DEF TRANSFORM Transform {\n children [\n");
            for(int i =0; i < cells.size(); i++){
                Vector layer = (Vector)cells.elementAt(i);
                for(int j = 0; j < layer.size(); j++){
                    String fname = prefix + "_" + i + "_"+j + ".wrl";	
                    fout.println(" DEF S_" +i+ "_" +j+ " Cell {url \""+fname+"\"}");
                }        
            }
            fout.print("]\n}\n]\n}\n");
            fout.print("Transform {\n translation 7 -2 0\n rotation 1 0 0 -1.57\n");
            fout.print("scale 0.4 0.4 0.4 \n    children [\n");
            for(int i =0; i < cells.size(); i++){
                Vector layer = (Vector)cells.elementAt(i);
                for(int j = 0; j < layer.size(); j++){
                    fout.print("    Transform { translation "+j+ " 0 " +i+ " children DEF B_" +i+ "_"+j);
                    fout.print(" RadioButton{shapeRaised USE SR shapePressed USE SP}}\n");
                }
            }
            fout.print("    ]\n}\n");
            fout.print("ButtonGroup {\n    buttons [\n");
            for(int i =0; i < cells.size(); i++){
                Vector layer = (Vector)cells.elementAt(i);
                for(int j = 0; j < layer.size(); j++){
                    fout.print(" USE B_"+i+"_"+j);
                }
                fout.print("\n");
            }
            fout.print("]\ncells [\n");
            for(int i =0; i < cells.size(); i++){
                Vector layer = (Vector)cells.elementAt(i);
                for(int j = 0; j < layer.size(); j++){
                    fout.print(" USE S_"+i+"_"+j);
                }
                fout.print("\n");
            }    
            fout.print("]\n}\n");
            fout.print("ROUTE SLIDER.value_changed TO INTERPOLATOR.set_fraction\n");
            fout.print("ROUTE INTERPOLATOR.value_changed TO TRANSFORM.set_scale\n");
            fout.close();
        } catch(Exception e){
            e.printStackTrace(System.out);
        }
    }

    /**
       writeCells
    
    */
    public void writeCells(Vector cells, String prefix, String outType){

        System.out.println("writing..");
        for(int i =0; i < cells.size(); i++){
            Vector layer = (Vector)cells.elementAt(i);
            for(int j = 0; j < layer.size(); j++){
                SSCell cell = (SSCell)layer.elementAt(j);
                Polyhedron poly = getPolyhedron(cell);
                String fname = prefix + "_" + i + "_"+j + 
                    Polyhedron.getPostfix(outType);
                poly.writeToFile( fname, outType);
                System.out.println(fname);
            }
        }
    }


    /**
       reads file with description of stellations
    */
    public static int[][][] readStellations(String fname){
        Vector st = new Vector();
        try {
            BufferedReader in = new BufferedReader(new InputStreamReader(new FileInputStream(fname)));
            //DataInputStream in = new DataInputStream(new FileInputStream(fname));
            String line;
            while((line = in.readLine()) != null){
                int [][] stellation = parseStellationLine(line);
                if(stellation != null){
                    st.addElement(stellation);
                } 
            }
        } catch(Exception e){
            e.printStackTrace(System.out);
        }
        int[][][] array = new int[st.size()][][];
        st.copyInto(array);
        return array;
    }

    /**
       parseStellationLine
    */
    static int [][] parseStellationLine(String line){
        System.out.println(line);
        Vector v = new Vector();
        int count = 0;
        int slen = line.length();
        while(true){
            if(count >= slen)
                break;
            char b = line.charAt(count);
            System.out.println(b);
            if(b < '0' || b > '9') // non number
                break;
            StringBuffer num = new StringBuffer();
            int layer = 0;
            while(true){
                num.append(b);
                count++;
                if(count >= slen)
                    break;
                b = line.charAt(count);
                System.out.println(b);
                if(b < '0' || b > '9'){ // non number
                    layer = Integer.parseInt(num.toString());
                    break;
                }
            }
            while(true){
                if(b < 'a' || b > 'z'){
                    break;
                }
                int[] cell = new int[2];
                cell[0] = layer;
                cell[1] = b-'a';
                v.addElement(cell);
                count++;
                if(count >= slen)
                    break;
                b = line.charAt(count);	
                System.out.println(b);
            }
        }
        System.out.println(v);
        if(v.size() == 0)
            return null;
        int[][] array = new int[v.size()][];
        v.copyInto(array);
        return array;
    }

    static int [][] parseStellationLineOld(String line){
        StringTokenizer st = new StringTokenizer(line," _,\n\r\t");
        Vector v = new Vector();
        while(st.hasMoreTokens()){
            int[] cell = new int[2];
            String token = st.nextToken();
            if(token.charAt(0) == '#')
                break;
            cell[0] = Integer.parseInt(token);
            cell[1] = Integer.parseInt(st.nextToken());
            v.addElement(cell);
        }
        if(v.size() == 0)
            return null;
        int[][] array = new int[v.size()][];
        v.copyInto(array);
        return array;
    }


    /**
       readVectors

    */
    public static Vector3D[] readVectors(String filename){    
        Vector3D[] v = null;
        try{

            FileInputStream f = new FileInputStream(filename);
            if(filename.endsWith(".off")){
                Polyhedron poly = new Polyhedron();
                poly.readOFF(f);
                v = poly.vertices;

            } else {
	
                Reader r = new BufferedReader(new InputStreamReader(f));
                StreamTokenizer tok = new StreamTokenizer(r);
	
                Vector vv = new Vector();
	
                while(tok.nextToken() != StreamTokenizer.TT_EOF){
                    double x,y,z;
                    x = tok.nval;
                    if(tok.nextToken() == StreamTokenizer.TT_EOF)
                        break;
                    y = tok.nval;
                    if(tok.nextToken() == StreamTokenizer.TT_EOF)
                        break;
                    z = tok.nval;
                    Vector3D v1 = new Vector3D(x,y,z); 
                    if(v1.length2() != 0.0)
                        vv.addElement(v1);
                } 
	
                int len = vv.size();
                v = new Vector3D[len];
                for(int i=0; i < len; i++){
                    v[i] = (Vector3D)vv.elementAt(i);
                }
            }
            f.close();
        } catch (Exception e){
            e.printStackTrace(System.err);
        }
        return v;
    
    }


//    /**
//       showDiagram
//    
//       creates window with stellation diagramm 
//    */
//    static Frame showDiagram(SFace[] ffaces, int vertexUp){
//        int index = -1;
//        int layer = 10000; // riduculosly big layer
//        // search of face with lowest index
//        for(int i=0; i < ffaces.length; i++){
//            if(ffaces[i].layer < layer){
//                index = i;
//                layer = ffaces[i].layer;
//                //break; //??
//            }
//        }
//
//        //System.out.println("index: "+index);
//        SFace[] nfaces = null;
//        if(index != -1){
//
//            nfaces = new SFace[ffaces.length];
//            // make copy of faces
//            for(int i = 0; i < ffaces.length; i++){
//                nfaces[i] = new SFace(ffaces[i]);
//            }
//      
//            SFace face = nfaces[index];
//      
//
//            Vector3D center = new Vector3D(0.,0.,0.);
//            for(int i=0; i < face.vertices.length; i++){
//                center.addSet(face.vertices[i]);
//            }
//            center.mulSet(1.0/face.vertices.length);
//
//            // move selected face to center
//            //System.out.println("translation " + round(center.x) + " " + round(center.y) + " " + round(center.z) + "]");
//            for(int i = 0; i < nfaces.length; i++ ){
//                Vector3D[] v = nfaces[i].vertices;
//                for(int j = 0; j < v.length; j++){
//                    v[j].subSet(center);
//                }
//            }       
//      
//      
//            Vector3D y = new Vector3D(0,1,0);
//            Vector3D z = new Vector3D(0,0,1);
//            Vector3D[] vert = face.vertices;
//            Vector3D normal = vert[1].sub(vert[0]).cross(vert[2].sub(vert[1]));
//            normal.normalize();
//            // rotate face normal to Z-axis
//            //printRotation("rotation ", normal, z);
//            for(int i = 0; i < nfaces.length; i++ ){
//                Vector3D[] v = nfaces[i].vertices;
//                for(int j = 0; j < v.length; j++){
//                    v[j].rotateSet(normal,z);
//                }
//            }
//      
//            Vector3D v1 = new Vector3D(face.vertices[vertexUp]);
//            v1.normalize();
//            //printRotation("rotation ", v1,y);
//            // rotate vertexUp to Y-axis
//            for(int i = 0; i < nfaces.length; i++ ){
//                Vector3D[] v = nfaces[i].vertices;
//                for(int j = 0; j < v.length; j++){
//                    v[j].rotateSet(v1,y);
//                }
//            }           
//        }
//
//        Frame frame = new Frame("Stellation Diagram");
//        StellationCanvas canvas = new StellationCanvas(nfaces, nfaces, null, null);
//        frame.add("Center",canvas);
//        frame.pack();
//        frame.show();         
//        return frame;
//    }

    static void printRotation(String name, Vector3D from, Vector3D to){
  
        Vector3D axis = from.cross(to);
        double sinangle = axis.length();
        double cosangle = from.dot(to);

        //if(sinangle > 0.0001TOL ||  sinangle < -TOL){
        axis.normalize();
        double angle = Math.atan2(sinangle, cosangle);
        //}  
        System.out.println(name + round(axis.x) + " " + round(axis.y) + " " + round(axis.z) + " " + round(-angle));
    }


    public static void rotateFaces(SFace[] f, Vector3D from, Vector3D to){
        for(int i = 0; i < f.length; i++ ){
            Vector3D[] v = f[i].vertices;
            for(int j = 0; j < v.length; j++){
                v[j].rotateSet(from,to);
            }
        }      
    }

    public static void translateFaces(SFace[] f, Vector3D center){
        for(int i = 0; i < f.length; i++ ){
            Vector3D[] v = f[i].vertices;
            for(int j = 0; j < v.length; j++){
                v[j].subSet(center);
            }
        }  
    }     

    double maxRadius = 0;
    public double getMaxRadius(){
        if(maxRadius == 0){
            for(int i =0 ; i < faces.length; i++){
                for(int j =0 ; j < faces[i].length; j++){
                    double r2 = faces[i][j].getRadius();
                    if(r2 > maxRadius)
                        maxRadius = r2;
                }
            }
        }      
        return maxRadius;
    }

    /**
       getStellation

       returns set of cells corresponding to given stellation
    */
    public SSCell[] getStellation(Vector cells, int [][] stellation) {
        SSCell[] scells = new SSCell[stellation.length];
        for(int i =0; i < stellation.length; i++){
            scells[i] = (SSCell)((Vector)cells.elementAt(stellation[i][0])).
                elementAt(stellation[i][1]);
        }    
        return scells;
    }

    /**
       findCell 
    
       find symmetrical cell, which has faceIndex, facetIndex among 
       its top or bottom faces
    */
    public int[] findCell(Vector cells, 
                          int faceIndex, int facetIndex, int top){

        SFace face = faces[faceIndex][facetIndex];
        int imax = cells.size();

        for(int i = 0; i < imax; i++){
            Vector slayer = (Vector)cells.elementAt(i);
            int jmax = slayer.size();

            for(int j = 0; j < jmax; j++){
                SCell[] scells = ((SSCell)slayer.elementAt(j)).cells;

                for(int k = 0; k < scells.length; k++ ){
                    SFace[] f = null;
                    if(top == 1){
                        f = scells[k].top;
                    } else {
                        f = scells[k].bottom;
                    }

                    for(int m = 0; m < f.length; m++){
                        if(f[m] == face){
                            int[] index = new int[2];
                            index[0] = i;
                            index[1] = j;
                            return index;
                        }
                    }
                }
            }
        }
        return null;
    } 

    /**
       findCell 
    
       find cell among "cells" cell, which has facet with given "center".
       if "adjacent" is true, return cell adjacent to this facet. 

    */
    public int[] findCell(SSCell[] sscells, Vector3D center, boolean adjacent){
    
        SSCell foundSSCell = null;
        Vector adjacentSSCells = null;
        SFace foundFace = null;
        SCell adjacentSCell = null;

        main: 
        for(int s = 0; s  < sscells.length; s++){
            SCell cells[] = sscells[s].cells;
            for(int c = 0; c < cells.length; c++){
                SFace[] faces = cells[c].top;
                if(faces != null){
                    for(int f = 0; f < faces.length; f++){
                        if(faces[f].getCenter().equals(center)){
                            foundSSCell = sscells[s];
                            foundFace = faces[f];
                            adjacentSSCells = foundSSCell.top;
                            adjacentSCell = faces[f].cellAbove;
                            break main;
                        }              
                    }          
                }
                faces = cells[c].bottom;
                if(faces != null){
                    for(int f = 0; f < faces.length; f++){
                        if(faces[f].getCenter().equals(center)){
                            foundSSCell = sscells[s];
                            foundFace = faces[f];
                            adjacentSSCells = foundSSCell.bottom;
                            adjacentSCell = faces[f].cellBelow;
                            break main;
                        }              
                    }          
                }
            }
        }

        if(foundSSCell != null){
            // TO DO 
            if(adjacent){
                // find adjacent cell 
                for(int c = 0; c < adjacentSSCells.size(); c++){
                    SSCell sscell =  (SSCell)adjacentSSCells.elementAt(c);
                    if(sscell.hasSCell(adjacentSCell)){
                        return new int[]{sscell.layer, sscell.index};      
                    }            
                }
            } else {
                // cell itself 
                return new int[]{foundSSCell.layer, foundSSCell.index};      
            }
        }

        return null;
    }

    /**
       getStellationDiagram

       returns non duplicated faces belonging to plane pindex 
       from array of symmetrical cells (stellation)
    */
    public static Object[][] getStellationDiagram(SSCell[] scells, int pindex){

        // count faces
        FastHashtable ftable = new FastHashtable();

        Integer topindex = new Integer(1);
        Integer bottomindex = new Integer(0);

        for(int i = 0; i < scells.length; i++){
            SSCell scell = scells[i];
      
            for(int c = 0; c < scell.cells.length; c++){
	
                // elementary cell 
                SCell cell = scell.cells[c];
                // top faces
                for(int f = 0; f < cell.top.length; f++){	  
                    SFace face = cell.top[f];
                    if(face.getPlaneIndex() != pindex)
                        continue;
                    Integer index = (Integer)ftable.get(face);
                    if(index == null){
                        // face is not in ftable yet
                        ftable.put(face, topindex);	    
                    } else {
                        // face already there
                        if(index == bottomindex){
                            // face should be removed
                            ftable.remove(face);
                        } else {
                            // this should not happens
                            System.out.println("duplicate face in stellation!");
                        }
                    }
                }
                // bottom faces
                for(int f = 0; f < cell.bottom.length; f++){	  
                    SFace face = cell.bottom[f];
                    if(face.getPlaneIndex() != pindex)
                        continue;
                    Integer index = (Integer)ftable.get(face);
                    if(index == null){
                        // face is not in ftable yet
                        ftable.put(face, bottomindex);
                    } else {
                        // face already there
                        if(index == topindex){
                            // face should be removed
                            ftable.remove(face);
                        } else {
                            // this should not happens
                            System.out.println("duplicate face in stellation!");
                        }
                    }
                }	
            }      
        }
    
        //SFace[] faces = new SFace[ftable.size()];
        Object [][] facets = new Object[ftable.size()][2];
        int count = 0;
        for(Enumeration keys = ftable.keys(); keys.hasMoreElements();){
            SFace face = (SFace)keys.nextElement();

            Integer index = (Integer)ftable.get(face);

            facets[count][0] = face;
            facets[count][1] = index;

            count++;
        }
        return facets;
    }


    public Integer[] getNonEquivalentFaces(String symmetry){

        Matrix3D[] sym = Symmetry.getMatrices(symmetry);
    
        FastHashtable table = new FastHashtable();    

        // first plane is always added 
        table.put(faces[0][0].getPlane(),new Integer(0));

        for(int i = 1; i < faces.length; i++){

            Plane plane = faces[i][0].getPlane();      
            boolean found = false;

            // find if the plane is equivalent to some plane already in table 
            for(int s = 0; s < sym.length; s++){
                Plane pl = new Plane(plane.v.mul(sym[s]),plane.d,s);
                if(table.get(pl) != null){
                    found = true;
                    break;
                }
            }
            if(!found){
                table.put(plane,new Integer(i));
                //System.out.print("plane: " + plane + " ind: " + i);
            }
        }

        Integer[] ind = new Integer[table.size()];
        int count = 0;
        for(Enumeration keys = table.keys(); keys.hasMoreElements();){
            Plane plane = (Plane)keys.nextElement();
            ind[count++] = (Integer)table.get(plane);
        }
        QSort.quickSort(ind,0,ind.length-1,new IntegerComparator());
        return ind;    
    }


    static double chop(double x){
        if(x > -1.e-10 && x < 1.e-10)
            return 0;
        return x;
    }

    static final double ROUND_FACTOR = 1.e6;
    static double round(double x){
    
        return Math.floor(x * ROUND_FACTOR + 1/(2*ROUND_FACTOR))/ROUND_FACTOR;
    }

    void printSortedVertices(FastHashtable table, int maxCount){

        Vector vert = new Vector();
        for(Enumeration e = table.elements(); e.hasMoreElements(); ){
            vert.add(e.nextElement());
        }
    
        QSort.quickSort(vert,0,vert.size() - 1,new Vector3DLengthComparator());
        for(int i=0; i < vert.size() && i < maxCount; i++){
            System.out.println(vert.elementAt(i));
        }
    
    }

    class Vector3DLengthComparator implements Comparator {
        public int compare(Object o1, Object o2){

            Vector3D v1 = (Vector3D)o1;
            Vector3D v2 = (Vector3D)o2;
            double d = v1.length() - v2.length();
            if(d < 0)
                return -1;
            else if(d > 0)
                return 1;
            return 0;
        }
    }

    FastHashtable makeSymVertTable(FastHashtable table, String symmetry){

        Matrix3D[] sm = Symmetry.getMatrices(symmetry);
        FastHashtable ht = new FastHashtable();    
        for(Enumeration e = table.elements(); e.hasMoreElements(); ){

            Vector3D v = (Vector3D)e.nextElement();
      
            for(int i=0; i < sm.length; i++){
                Vector3D v1 = v.mul(sm[i]);
                if(ht.get(v1) == null){
                    ht.put(v1,v1);
                }
            }
        }
    
        return ht;
    
    }


}

