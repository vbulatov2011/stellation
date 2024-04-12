package pvs.polyhedra;

import java.io.PrintWriter;

import pvs.Expression.Expr;
import pvs.Expression.FunctionSpec;
import pvs.Expression.Variable;
import pvs.utils.FixedStreamTokenizer;
import pvs.utils.PVSObserver;

/**
   class PolygonParametrical
 */
class PolygonParametrical implements PolygonDisplayNode {

  private String id = "param";

  double start = 0;
  double end = 1;
  int nPoints = 11;
  String formula = "x = cos(2*pi*t); y = sin(2*pi*t);";
  Vector3D[] points = null;

  private Dlg_PolygonParametrical editor = null;

  public PolygonParametrical(){

    id = getNewPolyName();

    FunctionSpec.registerFunctions(m_parser);

  }

  public PolygonNodeParser getParser (){

    return new Parser();

  }  

  static int count = 0;

  static String getNewPolyName(){

    count++;
    return "param_"+ count;

  }


  public String getNodeName(){
    return "PolygonParametrical";
  }
  
  public String getNodeID(){
    return id;
  }

  pvs.Expression.Parser m_parser = new pvs.Expression.Parser();  

  public void calculatePolygon(){       

    try {

      Expr expr = m_parser.parse (formula);
      // special variables 
      Variable g = expr.getVariable ("g");
      g.setValue((Math.sqrt(5)+1)/2);
      Variable pi = expr.getVariable ("pi");
      pi.setValue(Math.PI);

      Variable vT = expr.getVariable ("t");
      Variable vX = expr.getVariable ("x");
      Variable vY = expr.getVariable ("y");
      Variable vZ = expr.getVariable ("z");

      double Dt = (end - start)/(nPoints-1);
      Vector3D vectors[] = new Vector3D[nPoints];
      for(int i=0; i < nPoints; i++){
	double t = start + Dt*i;
	vT.setValue(start + Dt*i);
	expr.value();
	vectors[i] = new Vector3D(vX.value(), vY.value(), vZ.value());
      }

      setPolygon(vectors);
      
    } catch(Exception e){      
      e.printStackTrace();
    }
  }


  public void setPolygon(Vector3D[] points){

    this.points = points; 
    if(observer != null){
      observer.update(this,null);
    }
  }


  public void write(PrintWriter out, String indent){

    out.println(indent + this.getNodeName() + " {");
    String indent1 = indent + indentStep;
    out.println(indent1 + "id " + id);
    out.println(indent1 + "start " + start);
    out.println(indent1 + "end " + end);
    out.println(indent1 + "points " + nPoints);
    out.print(indent1 + "formula \"");
    int len = formula.length();
    String indent_form = "\n" + indent1 + "         ";
    for(int i = 0; i < len; i++){
      char c = formula.charAt(i);
      if(c == '\n'){
        out.print(indent_form);
      } else {
        out.print(c);
      }
    }
    //out.print(indent1 + formula);
    out.println(indent1 + "\"");
    out.println(indent + "}");
    
  }

  public int getPolygonCount(){
    return 1; 
  }
  
  public Vector3D[] getPolygon(int index){

    if(points != null)
      return points;
    else 
      return new Vector3D[0];
  }
    
  public PolygonEditor getEditor(){

    if(editor == null){
      editor = new Dlg_PolygonParametrical(this);
    }
    return editor;
    
  }

  PVSObserver observer;

  public void setObserver(PVSObserver observer){

    this.observer = observer;

  }

  /***
   *
   *  class Parser 
   *
   */
  class Parser implements PolygonNodeParser {
    
    Parser(){
      
    }

    String clearLeadingSpaces(String src){

      StringBuffer sb = new StringBuffer();
      int i = 0; 
      int len = src.length();
      while(i < len ){
        char c = src.charAt(i++);
        sb.append(c);
        switch(c){
        case '\n':
          while(i < len && src.charAt(i) == ' '){
            // skip spaces 
            i++;
          }           
          break;
        }
      }
      return sb.toString();
    }

    public PolygonDisplayNode parse(FixedStreamTokenizer st){
      
      try {
        
        st.nextToken();
        if(st.ttype != '{'){
          System.out.println("wrong start of " + getNodeName()+ ". \"{\" expected, but \"" + 
                      st.ttype + "\" found instead");
          return PolygonParametrical.this;
        }
        
        while(st.nextToken() != st.TT_EOF){	
          switch(st.ttype){
          case FixedStreamTokenizer.TT_WORD:	
            if(st.sval.equalsIgnoreCase("id")){
              st.nextToken();
              id = st.sval;
            } else if(st.sval.equalsIgnoreCase("start")){
              st.nextToken();
              start = Double.parseDouble(st.sval);
            } else if(st.sval.equalsIgnoreCase("end")){
              st.nextToken();
              end = Double.parseDouble(st.sval);
            } else if(st.sval.equalsIgnoreCase("points")){
              st.nextToken();
              nPoints = Integer.parseInt(st.sval);
            } else if(st.sval.equalsIgnoreCase("formula")){
              st.nextToken();
              formula = clearLeadingSpaces(st.sval);
            } else {
              System.out.println("line: " + st.lineno());
              System.out.println("wrong parameter in " + getNodeName() + ": " + st.sval);
            }
            break;
          case '}': // end of model 
            return PolygonParametrical.this;
          default: // should not happens 
            System.out.println("line: " + st.lineno());
            System.out.println("wrong character in " + getNodeName() + ": " + (char)st.ttype);
            return PolygonParametrical.this;
          }         
        }     
      } catch(Exception e){
        e.printStackTrace(System.out);
      }
      
      return PolygonParametrical.this;

    }
    
  } // PolygonParametrical.Parser


}

