package pvs.utils;

import pvs.polyhedra.PolygonDisplayNode;

public interface PVSObserver { 
    
    /**
     * Called when observers need to be updated.
     * @param who - who is informing
     * @param what - the argument being sent
     */
    void update(Object who, Object what);
    
    /**
     * A bit of a hack, piling on to gain access to the top-level resolver
     * @param nodeID
     * @return
     */
    PolygonDisplayNode findNode(String nodeID);
}
