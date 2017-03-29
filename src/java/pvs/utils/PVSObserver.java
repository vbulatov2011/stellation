package pvs.utils;

public interface PVSObserver { 
    
    /**
     * Called when observers need to be updated.
     * @param who - who is informing
     * @param what - the argument being sent
     */
    void update(Object who, Object what);
}
