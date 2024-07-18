package pvs.polyhedra;

/**
   class FEdge

   edge with plane it belongs to
*/
public class FEdge {

    int v1,v2,index;

    FEdge(int  _v1, int _v2, int _index){
        v1 =_v1;
        v2 = _v2;
        index = _index;
    }

    public int hashCode(){
        return v1*v2;
    }

    public boolean equals(Object o){
        if(!(o instanceof FEdge))
            return false;
        FEdge e = (FEdge)o;
        if(e.index != index)
            return false;
        return 
            (e.v1 == v1 && e.v2 == v2 ) || 
            (e.v2 == v1 && e.v1 == v2 );
    }
}

