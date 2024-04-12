package pvs.polyhedra.stellation;

import java.io.File;
import java.io.FilenameFilter;


public class ExtensionFilter implements FilenameFilter {

    String ext[];

    public ExtensionFilter(String ext[]){
        this.ext = ext;
    }

    public boolean accept(File dir, String name){
        for(int i = 0; i < ext.length; i++){           
            if(name.endsWith(ext[i]))
                return true;
            
        }
        return false;
    }
}
