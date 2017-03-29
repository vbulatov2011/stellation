package pvs.polyhedra;


/**
   class SEdge

   represents stellation edge
*/
class SEdge {

    int v1,v2;

    SEdge(int _v1, int  _v2){
        v1 =_v1;
        v2 = _v2;
    }

    public int hashCode(){
        return v1*v2;
    }

    public boolean equals(Object o){
        if(!(o instanceof SEdge))
            return false;
        SEdge e = (SEdge)o;
        return 
            (e.v1 == v1 && e.v2 == v2 ) || 
            (e.v2 == v1 && e.v1 == v2 );
    }
}

