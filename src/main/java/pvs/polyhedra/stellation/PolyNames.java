package pvs.polyhedra.stellation;

public class PolyNames {

  static final int NAME=0;
  static final int FNAME=1;
  static final int SYMMETRY=2;

  int category = 0;
  int representation = 0;

  public PolyNames(){
  }

  public static int [] findPolyByName(String name){
    
    for(int cat=0; cat < poly.length; cat++){
      for(int i=0; i < poly[cat].length; i++){
	if(poly[cat][i][NAME].equalsIgnoreCase(name))
	  return new int[]{cat, i};
      }      
    }
    return null;
    
  }

    
  public String name(int i){
    return poly[category][i][NAME];
  }

  public String fname(int i){

    return poly[category][i][FNAME];

  }
  
  public String fname(int cat, int i){

    return poly[cat][i][FNAME];

  }

  public String symmetry(int cat, int i){

    return poly[cat][i][SYMMETRY];

  }
  
  public String name(int cat, int i){

    return poly[cat][i][NAME];

  }
  
  public int length(){
    return poly[category].length;
  }
  
  public int getCategoryLength(int cat){
    return poly[cat].length;
  }
  
  int setCategory(String name){

    category = 0;
    for(int i=0; i < categories.length; i++){
      if(name.equals(categories[i])){
	category = i;
	break;
      }
    }
    return category;
  }

  public String[] getCategories(){
    return categories;
  }

  int setRepresentation(String name){

    representation = 0;
    for(int i=0; i < representations.length; i++){
      if(name.equals(representations[i])){
	representation = i;
	break;
      }
    }
    return representation;
  }



  static String modifiers[] = {
    "",
    "e",
    "r",
    "s"
  };

  static String representations[] = {
    "faces",
    "edges",
    "Escher's style",
    "spherical"
  };

  static String categories[] = {
    "regular polyhedra",
    "archimedean solids",
    "archimedean duals",
    "nonconvex uniform polyhedra",
    "duals to uniform polyhedra",
    /*
    "tetrahedral symmetry",
    "octahedral symmetry",
    "icosahedral symmetry"
    */
  };
    
  static String poly[][][] = 
    {
      { // regular solids
	{"tetrahedron", "u06", "Td"},	
	{"octahedron", "u10", "Oh"},
	{"cube", "u11", "Oh"},

	{"icosahedron", "u27", "Ih"},
	{"dodecahedron", "u28", "Ih"},
	{"small stellated dodecahedron", "u39", "Ih"},
	{"great dodecahedron", "u40", "Ih"},
	{"great stellated dodecahedron", "u57", "Ih"},
	{"great icosahedron", "u58", "Ih"}

      },

      { // archimedean solids
	{"truncated tetrahedron", "u07", "Td"},

	{"cuboctahedron", "u12", "Oh"},
	{"truncated ochahedron","u13", "Oh"},
	{"truncated cube","u14", "Oh"},
	{"rhombicuboctahedron","u15", "Oh"},
	{"truncated cuboctahedron","u16", "Oh"},
	{"snub cube","u17", "O"},

	{"icosidodecahedron","u29", "Ih"},
	{"truncated icosahedron","u30", "Ih"},
	{"truncated dodecahedron","u31", "Ih"},
	{"rhombicosidodecahedron","u32", "Ih"},
	{"truncated icosidodechedon","u33", "Ih"},
	{"snub dodecahedron","u34", "I"}
      },

      { // archimedean duals
	{"triakistetrahedron", "d07", "Td"},

	{"rhombic dodecahedron", "d12", "Oh"},
	{"tetrakishexahedron","d13", "Oh"},
	{"triakisoctahedron","d14", "Oh"},
	{"strombic icositetrahedron","d15", "Oh"},
	{"disdyakisdodecahedron","d16", "Oh"},
	{"pentagonal icositetrahedron","d17", "O"},
			
	{"rhombic triacontahedron","d29","Ih"},
	{"pentakisdodecahedron","d30","Ih"},
	{"triakisicosahedron","d31","Ih"},
	{"strombic hexecontahedron","d32","Ih"},
	{"disdyakistriacontahedron","d33","Ih"},
	{"pentagonal hexecontahedron","d34","I"}

      },

      {
	// "nonconvex uniform polyhedra"

	{"small cubicuboctahedron","u18", "Oh"},
	{"great cubicuboctahedron","u19", "Oh"},
	{"cubitruncated cuboctahedron","u21", "Oh"},
	{"great rhombicuboctahedron","u22", "Oh"},
	{"small rhombihexahedron","u23", "Oh"},
	{"stellated truncated hexahedron","u24", "Oh"},
	{"great truncated cuboctahedron","u25", "Oh"},
	{"great rhombihexahedron","u26", "Oh"},

	{"small ditrigonal icosidodecahedron","u35","Ih"},
	{"small icosicosidodecahedron","u36","Ih"},
	{"small snub icosicosidodecahedron","u37","Ih"},
	{"small dodecicosidodecahedron","u38","Ih"},
	{"great dodecadodecahedron","u41","Ih"},
	{"truncated great dodecahedron","u42","Ih"},
	{"rhombidodecadodecahedron","u43","Ih"},
	{"small rhombidodecahedron","u44","Ih"},
	{"ditrigonal dodecadodecahedron","u46","Ih"},
	{"great ditrigonal dodecicosidodecahedron","u47","Ih"},
	{"small ditrigonal dodecicosidodecahedron","u48","Ih"},
	{"icosidodecadodecahedron","u49","Ih"},
	{"icositruncated dodecadodecahedron","u50","Ih"},
	{"great ditrigonal icosidodecahedron","u52","Ih"},
	{"great icosicosidodecahedron","u53","Ih"},
	{"small dodecicosahedron","u55","Ih"},
	{"great icosidodecahedron","u59","Ih"},
	{"great truncated icosahedron","u60","Ih"},
	{"rhombicosahedron","u61","Ih"},
	{"small stellated truncated dodecahedron","u63","Ih"},
	{"truncated dodecadodecahedron","u64","Ih"},
	{"great dodecicosidodecahedron","u66","Ih"},
	{"great dodecicosahedron","u68","Ih"},
	{"great stellated truncated dodecahedron","u71","Ih"},
	{"great rhombicosidodecahedron","u72","Ih"},
	{"great truncated icosidodecahedron","u73","Ih"},
	{"small retrosnub icosicosidodecahedron","u77","Ih"},
	{"great rhombidodecahedron","u78","Ih"},
	//{"great dirhombicosidodecahedron","u80","Ih"},// it has hemi faces passing through center

	{"snub dodecadodecahedron","u45","I"},
	{"snub icosidodecadodecahedron","u51","I"},
	{"great snub icosidodecahedron","u62","I"},
	{"inverted snub dodecadodecahedron","u65","I"},
	{"great snub dodecicosidodecahedron","u69","I"},
	{"great inverted snub icosidodecahedron","u74","I"},
	{"great retrosnub icosidodecahedron","u79","I"},

	//{"octahemioctahedron","u08"},	
	//{"tetrahemihexahedron","u09"},	
	//{"cubohemioctahedron","u20"},
	//{"small icosihemidodecahedron","u54"},
	//{"small dodecahemidodecahedron","u56"},
	//{"small dodecahemicosahedron","u67"},
	//{"great dodecahemicosahedron","u70"},
	//{"great dodecahemidodecahedron","u75"},
	//{"great icosihemidodecahedron","u76"},


      },
      
      {
	// "duals to noncovex uniform polyhedra"	


	{"small hexacronic icositetrahedron","d18","Oh"},
	{"great hexacronic icositetrahedron","d19","Oh"},
	{"tetradyakishexahedron","d21","Oh"},
	{"great strombic icositetrahedron","d22","Oh"},
	{"small rhombihexacron","d23","Oh"},
	{"great triakisoctahedron","d24","Oh"},
	{"great disdyakisdodecahedron","d25","Oh"},
	{"great rhombihexacron","d26","Oh"},

	{"small triambic icosahedron","d35","Ih"},
	{"small icosacronic hexecontahedron","d36","Ih"},
	{"small hexagonal hexecontahedron","d37","Ih"},
	{"small dodecacronic hexecontahedron","d38","Ih"},
	{"medial rhombic triacontahedron","d41","Ih"},
	{"small stellapentakisdodecahedron","d42","Ih"},
	{"medial strombic hexecontahedron","d43","Ih"},
	{"small rhombidodecacron","d44","Ih"},
	{"medial triambic icosahedron","d46","Ih"},
	{"great ditrigonal dodecacronic hexecontahedron","d47","Ih"},
	{"small ditrigonal dodecacronic hexecontahedron","d48","Ih"},
	{"medial icosacronic hexecontahedron","d49","Ih"},
	{"tridyakisicosahedron","d50","Ih"},
	{"great triambic icosahedron","d52","Ih"},
	{"great icosacronic hexecontahedron","d53","Ih"},
	{"small dodecicosacron","d55","Ih"},
	{"great rhombic triacontahedron","d59","Ih"},
	{"great stellapentakisdodecahedron","d60","Ih"},
	{"rhombicosacron","d61","Ih"},
	{"great pentakisdodekahedron","d63","Ih"},
	{"medial disdyakistriacontahedron","d64","Ih"},
	{"great dodecacronic hexecontahedron","d66","Ih"},
	{"great dodecicosacron","d68","Ih"},
	{"great triakisicosahedron","d71","Ih"},
	{"great strombic hexecontahedron","d72","Ih"},
	{"great disdyakistriacontahedron","d73","Ih"},
	{"small hexagrammic hexecontahedron","d77", "Ih"},
	{"great rhombidodecacron","d78","Ih"},
	//{"great dirhombicosidodecacron","d80","Ih"},

	{"medial pentagonal hexecontahedron","d45", "I"},
	{"medial hexagonal hexecontahedron","d51", "I"},
	{"great pentagonal hexecontahedron","d62", "I"},
	{"medial inverted pentagonal hexecontahedron","d65", "I"},
	{"great hexagonal hexecontahedron","d69", "I"},
	{"great inverted pentagonal hexecontahedron","d74", "I"},
	{"great pentagrammic hexecontahedron","d79", "I"},


	//{"octahemioctacron","d08"},	
	//{"tetrahemihexacron","d09"},	
	//{"hexahemioctacron","d20"},
	//{"small icosihemidodecacron","d54"},
	//{"small dodecahemidodecacron","d56"},
	//{"small dodecahemicosacron","d67"},
	//{"great dodecahemicosacron","d70"},
	//{"great dodecahemidodecacron","d75"},
	//{"great icosihemidodecacron","d76"},
	
      },
    };


}

