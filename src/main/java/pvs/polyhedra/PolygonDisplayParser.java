package pvs.polyhedra;

import java.io.StreamTokenizer;
import java.util.Vector;

import pvs.utils.FixedStreamTokenizer;
import pvs.utils.PVSObserver;

public class PolygonDisplayParser
{
    static public void parseChildren(FixedStreamTokenizer st, Vector children, 
                     PVSObserver observer) throws Exception{
      
      while(st.nextToken() != st.TT_EOF){ 
        
        switch(st.ttype){
      
        case StreamTokenizer.TT_WORD:
      
      if(st.sval.equalsIgnoreCase("PolygonParametrical")){
        
        PolygonParametrical poly = new PolygonParametrical();
        poly.parse(st);
        children.addElement(poly);
        poly.calculatePolygon();
        poly.setObserver(observer);
        
      } else if(st.sval.equalsIgnoreCase("PolygonArray")){
        
        PolygonArray poly = new PolygonArray();
        poly.parse(st);
        children.addElement(poly);
        poly.calculatePolygon();
        poly.setObserver(observer);
        
      } else if(st.sval.equalsIgnoreCase("SubdivisionCurve")){
        
        SubdivisionCurve poly = new SubdivisionCurve();
        poly.parse(st);
        children.addElement(poly);
        poly.setObserver(observer);
        
      } else if(st.sval.equalsIgnoreCase("Transform")){
        
        TransformNode poly = new TransformNode();
        poly.parse(st);
        children.addElement(poly);
        poly.setObserver(observer);

      } else if(st.sval.equalsIgnoreCase("SceneNormal")){
        
            //TO-DO parse scene normal 

      } else if(st.sval.equalsIgnoreCase("SceneCenter")){
        
            //TO-DO parse scene center

      } else if(st.sval.equalsIgnoreCase("SceneScale")){
        
            //TO-DO parse scene scale 
        
      } else if(st.sval.equalsIgnoreCase("Use")){
        
        UseNode poly = new UseNode();
        poly.parse(st);
        children.addElement(poly);
        poly.setObserver(observer);
        
      } else{
        
        System.out.println("line: " + st.lineno());
        System.out.println("unknown node: " + st.sval); 
        throw new Exception(" parsing error");

      }
      break;
        case ']': // end of children list 
      return; 
        default: // should not happens 
      System.out.println("line: " + st.lineno());
      System.out.println("wrong token in the file: " + (char)st.ttype);
      throw new Exception(" parsing error");
      //break;
        }         
      } 
    }

}
