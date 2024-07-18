package pvs.polyhedra;

/**
  stellation face (vertices are 3D)
 */
public class SFace {

  
  public SCell cellAbove; // cell which is above this face
  public SCell cellBelow; // cell which is below this face

  // stellation layer
  public int layer = 0;

  // vertices of this face
  public Vector3D[] vertices = null;

  // plane, which this face belongs to
  // (described by equation plane.dot(x)-plane.dot(plane)==0)
  // (may be it is not necessary)
  private Plane plane; 

  Vector3D center = null;

  /**
    main constructor
   */
  public SFace (Vector3D[] _vertices, Plane _plane){
    vertices = _vertices;
    plane = _plane;
    //index = _index;
  }

  public SFace (Vector3D[] _vertices, Plane _plane, int layer){
    vertices = _vertices;
    plane = _plane;
    this.layer = layer;
  }
  
  /**
    copy constructor
    does copy of vertices also
   */
  public SFace (SFace face){
    layer = face.layer;
    vertices = new Vector3D[face.vertices.length];
    for(int i = 0; i < vertices.length; i++){
      vertices[i] = new Vector3D(face.vertices[i]);
    }
  }
  
  /**
    getCenter
   */
  public Vector3D getCenter(){
    if(center == null){
      center = new Vector3D(vertices[0]);
      for(int i = 1; i < vertices.length; i++){
	center.addSet(vertices[i]);	
      }
      center.mulSet(1./vertices.length);
    }
    return center;
  }
  
  /**
    adjacent
    direction = 1 for both faces with same orientation
    direction = -1 for faces with opposite orientation
   */
  public boolean adjacent(SFace face, int direction){    
    int flength = face.vertices.length;
    int length = vertices.length;

    for(int i=0; i < length; i++){
      Vector3D vertex = vertices[i];

      for(int j=0; j < flength; j++){	
	if(vertex == face.vertices[j]){
	  if(vertices[(i+1)%length] == 
	     face.vertices[(j-direction+flength)%flength] ||
	     vertices[(i-1+length)%length] == 
	     face.vertices[(j+direction+flength)%flength])
	    return true;
	  else 
	    return false;
	}
      }
    }
    return false;
  }

  /**
    cleanVertices
    
    checks if vertices have duplicates 
  */
  public void cleanVertices(){
    // remove double vertices
    int vcounter = 0;
    for(int k = 0; k < vertices.length; k++){
      if(vertices[(k+1)%vertices.length] != vertices[k]){
	vcounter++;
      }
    }

    if(vcounter == 0){
      vertices = new Vector3D[0];
    } else if(vcounter != vertices.length){ // have double vertices
      Vector3D[] newv = new Vector3D[vcounter];
      vcounter = 0;
      for(int k = 0; k < vertices.length; k++){
	if(vertices[(k+1)%vertices.length] != vertices[k]){
	  newv[vcounter++] = vertices[k];
	}
      }
      vertices = newv;
    } 
    
  }

  /**
    getArea

    calculates area of the face
   */
  Vector3D area = null;
  public Vector3D getArea(){

    if(area == null){
      area = new Vector3D(0,0,0);
      int length = vertices.length;
      for( int i = 0; i < length; i++ ){
	area.addSet(vertices[i].cross(vertices[(i+1)%length]));
      }
      area.mulSet(0.5);
    }
    return area;
  }

  public int getLayer(){
    return layer;
  }

  public Plane getPlane(){
    return plane;
  }

  public int getPlaneIndex(){
    return plane.index;
  }

  /**
     returns longest vertex of the frame
   */
  public double getRadius(){
    double r = 0;
    if(vertices != null){
      for(int i =0; i < vertices.length;i++){
	double r1 = vertices[i].length2();
	if(r1 > r)
	  r = r1;
      }
    }
    return Math.sqrt(r);
  }

  public int hashCode(){
    return getCenter().hashCode();
  }

  public void printVertices(){
    
    for(int i=0; i < vertices.length; i++){
      System.out.print(vertices[i] + " ");
    }
    System.out.println();
  }
}

