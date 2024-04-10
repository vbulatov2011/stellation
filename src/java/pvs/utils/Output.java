package pvs.utils;

import java.io.PrintStream;

public class Output {

    public static PrintStream out = System.out;

    public static void print(String s){
        out.print(s);   
    }

    public static void println(String s){
        out.println(s);
    }

    public static void printf(String s,Object... args){
        try {
            out.printf(s, args);
        } catch(Exception e) {
            println("bad format string in printf(): " + s );
            for(int k = 0; k < args.length; k++){                
                print(" " + args[k].toString());
            }
            println("");
        }
    }

    public static String fmt(String s,Object... args){
        return String.format(s, args);
    }

}
