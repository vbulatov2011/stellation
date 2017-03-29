package pvs.polyhedra.stellation;

import static pvs.utils.Output.printf;

public class Tests {

    
    static void testString(){

        double v[] = new double[]{0.0123, 0.0625};
        for(int i = 0; i < v.length; i++){            
            String s = Utils.getString(v[i]);
            printf("%f -> %s\n", v[i], s);
        }
    }

    public static void main(String arg[]){
        testString();
    }
}