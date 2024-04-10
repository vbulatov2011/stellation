package pvs.polyhedra;

import java.util.Hashtable;
import java.util.Enumeration;
import java.util.Vector;

import pvs.utils.*;

import static pvs.utils.Output.println;
import static pvs.utils.Output.printf;

public class Symmetry {

    public static Axis[] getAxes(String symmetry){
        if(symmetry.equals("O")) {
            return getAxesO();
        } else if(symmetry.equals("Oh")) {
            return getAxesO();
        } else if(symmetry.equals("I")) {
            return getAxesI();
        } else if(symmetry.equals("Ih")) {
            return getAxesI();
        } else if(symmetry.equals("T")) {
            return getAxesT();
        } else if(symmetry.equals("Th")) {
            return getAxesT();
        } else if(symmetry.equals("Td")) {
            return getAxesT();
        }    
        return new Axis[0];
    }


    public static Matrix3D[] getMatrices(String symmetry){

        if(symmetry.equals("E") || symmetry.equals("C1")) {
            return getE();
        } else if(symmetry.equals("Ci") || symmetry.equals("S2")) {
            return getS2();
        } else if(symmetry.equals("C2")) {
            return getC2();
        } else if(symmetry.equals("C2v")) {
            return getC2v();
        } else if(symmetry.equals("Cs")) {
            return getCs();
        } else if(symmetry.equals("O")) {
            return getO();
        } else if(symmetry.equals("Oh")) {
            return getOh();
        } else if(symmetry.equals("D3d(O)")) {
            return getD3d_O();
        } else if(symmetry.equals("D3(O)")) {
            return getD3_O();
        } else if(symmetry.equals("C3v(O)")) {
            return getC3v_O();
        } else if(symmetry.equals("C3(O)")) {
            return getC3_O();
        } else if(symmetry.equals("D2(O)")) {
            return getD2_O();
        } else if(symmetry.equals("D2h(O)")) {
            return getD2h_O();
        } else if(symmetry.equals("C2(O)")) {
            return getC2_O();
        } else if(symmetry.equals("C2v(O)")) {
            return getC2v_O();
        } else if(symmetry.equals("I")) {
            return getI();
        } else if(symmetry.equals("D5d(I)")) {
            return getD5d_I();
        } else if(symmetry.equals("D5(I)")) {
            return getD5_I();
        } else if(symmetry.equals("C5(I)")) {
            return getC5_I();
        } else if(symmetry.equals("C5v(I)")) {
            return getC5v_I();
        } else if(symmetry.equals("D3d(I)")) {
            return getD3d_I();
        } else if(symmetry.equals("D3(I)")) {
            return getD3_I();
        } else if(symmetry.equals("C3(I)")) {
            return getC3_I();
        } else if(symmetry.equals("C3v(I)")) {
            return getC3v_I();
        } else if(symmetry.equals("Ih")) {
            return getIh();
        } else if(symmetry.equals("T")) {
            return getT();
        } else if(symmetry.equals("Th")) {
            return getTh();
        } else if(symmetry.equals("Td")) {
            return getTd();
        } else if(symmetry.equals("D2h")) {
            return getDnh(2);
        } else if(symmetry.equals("D3h")) {
            return getDnh(3);
        } else if(symmetry.equals("D4h")) {
            return getDnh(4);
        } else if(symmetry.equals("D5h")) {
            return getDnh(5);
        } else if(symmetry.equals("D6h")) {
            return getDnh(6);
        } else if(symmetry.equals("D7h")) {
            return getDnh(7);
        } else if(symmetry.equals("D2d")) {
            return getDnd(2);
        } else if(symmetry.equals("D3d")) {
            return getDnd(3);
        } else if(symmetry.equals("D4d")) {
            return getDnd(4);
        } else if(symmetry.equals("D5d")) {
            return getDnd(5);
        } else if(symmetry.equals("D6d")) {
            return getDnd(6);
        } else if(symmetry.equals("D7d")) {
            return getDnd(7);
        } else if(symmetry.equals("D8d")) {
            return getDnd(8);
        } else if(symmetry.equals("D9d")) {
            return getDnd(9);
        } else if(symmetry.equals("D10d")) {
            return getDnd(10);
        } else if(symmetry.equals("D11d")) {
            return getDnd(11);
        } else if(symmetry.equals("D12d")) {
            return getDnd(12);
        } else if(symmetry.equals("D2")) {
            return getDn(2);
        } else if(symmetry.equals("D3")) {
            return getDn(3);
        } else if(symmetry.equals("D4")) {
            return getDn(4);
        } else if(symmetry.equals("D5")) {
            return getDn(5);
        } else if(symmetry.equals("D6")) {
            return getDn(6);
        } else if(symmetry.equals("D7")) {
            return getDn(7);
        } else if(symmetry.equals("D8")) {
            return getDn(8);
        } else if(symmetry.equals("D9")) {
            return getDn(9);
        } else if(symmetry.equals("D10")) {
            return getDn(10);
        } else if(symmetry.equals("D11")) {
            return getDn(11);
        } else if(symmetry.equals("D12")) {
            return getDn(12);
        } else if(symmetry.equals("C2")) {
            return getCn(2);
        } else if(symmetry.equals("C3")) {
            return getCn(3);
        } else if(symmetry.equals("C4")) {
            return getCn(4);
        } else if(symmetry.equals("C5")) {
            return getCn(5);
        } else if(symmetry.equals("C6")) {
            return getCn(6);
        } else if(symmetry.equals("C7")) {
            return getCn(7);
        } else if(symmetry.equals("C2v")) {
            return getCnv(2);
        } else if(symmetry.equals("C3v")) {
            return getCnv(3);
        } else if(symmetry.equals("C4v")) {
            return getCnv(4);
        } else if(symmetry.equals("C5v")) {
            return getCnv(5);
        } else if(symmetry.equals("C6v")) {
            return getCnv(6);
        } else if(symmetry.equals("C7v")) {
            return getCnv(7);
        } else if(symmetry.equals("C2h")) {
            return getCnh(2);
        } else if(symmetry.equals("C3h")) {
            return getCnh(3);
        } else if(symmetry.equals("C4h")) {
            return getCnh(4);
        } else if(symmetry.equals("C5h")) {
            return getCnh(5);
        } else if(symmetry.equals("C6h")) {
            return getCnh(6);
        } else if(symmetry.equals("C7h")) {
            return getCnh(7); 
            // PB! added rotationreflexion-groups...
        } else if(symmetry.equals("S4")) {
            return getSn(4);
        } else if(symmetry.equals("S6")) {
            return getSn(6);
        } else if(symmetry.equals("S8")) {
            return getSn(8);
        } else if(symmetry.equals("S10")) {
            return getSn(10);
        } else if(symmetry.equals("S12")) {
            return getSn(12);
        } else if(symmetry.equals("S14")) {
            return getSn(14); 
        } else if(symmetry.equals("S6(O)")) {
            return getS6_O();
        } else if(symmetry.equals("S10(I)")) {
            return getS10_I();
        } else if(symmetry.equals("S6(I)")) {
            return getS6_I();
            // ... and dihedral axessettings    
        } else if(symmetry.equals("C2v(D)")) {
            return getC2v_D();
        } else if(symmetry.equals("C2h(D)")) {
            return getC2h_D();
        } else if(symmetry.equals("C2(D)")) {
            return getC2_D();
        } else if(symmetry.equals("Cs(D2d)")) {
            return getCs_Dd(2);
        } else if(symmetry.equals("Cs(D3d)")) {
            return getCs_Dd(3);
        } else if(symmetry.equals("Cs(D4d)")) {
            return getCs_Dd(4);
        } else if(symmetry.equals("Cs(D5d)")) {
            return getCs_Dd(5);
        } else if(symmetry.equals("Cs(D6d)")) {
            return getCs_Dd(6);
        } else if(symmetry.equals("Cs(D7d)")) {
            return getCs_Dd(7);
        } else if(symmetry.equals("Cs(D2h)")||
                  symmetry.equals("Cs(C2v)")){
            return getCs_Dh(2);
        } else if(symmetry.equals("Cs(D3h)")||
                  symmetry.equals("Cs(C3v)")){
            return getCs_Dh(3);
        } else if(symmetry.equals("Cs(D4h)")||
                  symmetry.equals("Cs(C4v)")){
            return getCs_Dh(4);
        } else if(symmetry.equals("Cs(D5h)")||
                  symmetry.equals("Cs(C5v)")){
            return getCs_Dh(5);
        } else if(symmetry.equals("Cs(D6h)")||
                  symmetry.equals("Cs(C6v)")){
            return getCs_Dh(6);
        } else if(symmetry.equals("Cs(D7h)")||
                  symmetry.equals("Cs(C7v)")){
            return getCs_Dh(7);
    	  
	  
            // PB! end
        }      
        println("Can't find symmetry [" + symmetry + "]");
        return new Matrix3D[0];
    }

    static final double PI = Math.PI;
    static Matrix3D[] O = null;
    static Matrix3D[] T = null;
    static Matrix3D[] I = null;
    static Matrix3D[] E = null;

    static Matrix3D[] getE(){

        if(E == null){
            E = new Matrix3D[1];
        }
        E[0] = new Matrix3D();
        return E;
    }

    static Matrix3D[] S2 = null;  
    static Matrix3D[] getS2(){

        if(S2 == null){
            S2 = new Matrix3D[2];
        }
        S2[0] = new Matrix3D();
        S2[1] = new Matrix3D(-1,0,0, 0,-1,0, 0, 0, -1);
        return S2;
    }
    static Matrix3D[] C2 = null;  
    static Matrix3D[] getC2(){

        if(C2 == null){
            C2 = new Matrix3D[2];
            C2[0] = new Matrix3D();
            C2[1] = new Matrix3D(-1,0,0, 0,-1,0, 0, 0, 1);
        }
        return C2;
    }


    static Matrix3D[] C2v = null;  
    static Matrix3D[] getC2v(){

        if(C2v == null){
            C2v = new Matrix3D[4];
            C2v[0] = new Matrix3D();
            C2v[1] = new Matrix3D(-1,0,0, 0,-1,0, 0, 0, 1);
            C2v[2] = new Matrix3D(-1,0,0, 0,1,0, 0, 0, 1);
            C2v[3] = new Matrix3D(1,0,0, 0,-1,0, 0, 0, 1);
        }
        return C2v;
    }

    static Matrix3D[] Cs = null;  
    static Matrix3D[] getCs(){

        if(Cs == null){
            Cs = new Matrix3D[2];
        }
        Cs[0] = new Matrix3D();
        // VB!    Cs[1] = new Matrix3D(-1,0,0, 0,1,0, 0, 0, 1);
        // PB!
        Cs[1] = new Matrix3D(1,0,0, 0,1,0, 0, 0, -1);
        return Cs;
    }
    /**
       getO

    */
    static Matrix3D[] getO(){    

        if(O == null){
            O = new Matrix3D[24];
            O[0] = new Matrix3D();
            O[1] = Matrix3D.rotation(new Vector3D(1,0,0),PI/2);
            O[2] = Matrix3D.rotation(new Vector3D(1,0,0),PI);
            O[3] = Matrix3D.rotation(new Vector3D(1,0,0),3*PI/2);

            O[4] = Matrix3D.rotation(new Vector3D(0,1,0),PI/2);
            O[5] = Matrix3D.rotation(new Vector3D(0,1,0),PI);
            O[6] = Matrix3D.rotation(new Vector3D(0,1,0),3*PI/2);

            O[7] = Matrix3D.rotation(new Vector3D(0,0,1),PI/2);
            O[8] = Matrix3D.rotation(new Vector3D(0,0,1),PI);
            O[9] = Matrix3D.rotation(new Vector3D(0,0,1),3*PI/2);

            O[10] = Matrix3D.rotation(new Vector3D(1,1,1),2*PI/3);
            O[11] = Matrix3D.rotation(new Vector3D(1,1,1),-2*PI/3);

            O[12] = Matrix3D.rotation(new Vector3D(-1,1,1),2*PI/3);
            O[13] = Matrix3D.rotation(new Vector3D(-1,1,1),-2*PI/3);

            O[14] = Matrix3D.rotation(new Vector3D(1,-1,1),2*PI/3);
            O[15] = Matrix3D.rotation(new Vector3D(1,-1,1),-2*PI/3);

            O[16] = Matrix3D.rotation(new Vector3D(-1,-1,1),2*PI/3);
            O[17] = Matrix3D.rotation(new Vector3D(-1,-1,1),-2*PI/3);

            O[18] = Matrix3D.rotation(new Vector3D( 1,  1, 0),PI);
            O[19] = Matrix3D.rotation(new Vector3D(-1,  1, 0),PI);

            O[20] = Matrix3D.rotation(new Vector3D( 1,  0, 1),PI);
            O[21] = Matrix3D.rotation(new Vector3D(-1,  0, 1),PI);

            O[22] = Matrix3D.rotation(new Vector3D(0,  1, 1),PI);
            O[23] = Matrix3D.rotation(new Vector3D(0, -1, 1),PI);

        }
        return O;
    }

    /**
       getT

    */
    static Matrix3D[] getT(){    

        if(T == null){
            T = new Matrix3D[12];
            T[0] = new Matrix3D();
            T[1] = Matrix3D.rotation(new Vector3D(1,0,0),PI);
            T[2] = Matrix3D.rotation(new Vector3D(0,1,0),PI);
            T[3] = Matrix3D.rotation(new Vector3D(0,0,1),PI);
            T[4] = Matrix3D.rotation(new Vector3D(1,1,1),2*PI/3);
            T[5] = Matrix3D.rotation(new Vector3D(1,1,1),-2*PI/3);
            T[6] = Matrix3D.rotation(new Vector3D(-1,1,1),2*PI/3);
            T[7] = Matrix3D.rotation(new Vector3D(-1,1,1),-2*PI/3);
            T[8] = Matrix3D.rotation(new Vector3D(1,-1,1),2*PI/3);
            T[9] = Matrix3D.rotation(new Vector3D(1,-1,1),-2*PI/3);
            T[10] = Matrix3D.rotation(new Vector3D(-1,-1,1),2*PI/3);
            T[11] = Matrix3D.rotation(new Vector3D(-1,-1,1),-2*PI/3);

        }
        return T;
    }

    static Matrix3D[] Th;
    static Matrix3D[] getTh(){    

        if(Th == null){
            Th = new Matrix3D[24];
            Matrix3D[] t = getT();
            for(int i =0; i < 12; i++)
                Th[i] = t[i];
      
            // reflection in plane (100)
            Matrix3D reflection = new Matrix3D(-1,0,0, 0,1,0, 0,0,1);
      
            for(int i = 0; i < 12; i++){
                Th[12+i] = reflection.mul(t[i]);
            }      
        }      
        return Th;
    }

    static Matrix3D[] Td;

    static Matrix3D[] getTd(){    

        if(Td == null){
            Td = new Matrix3D[24];
            Matrix3D[] t = getT();
            for(int i =0; i < 12; i++)
                Td[i] = t[i];
      
            // reflection in plane (110)
            Matrix3D reflection = new Matrix3D(0,-1,0, -1,0,0, 0,0,1);
      
            for(int i = 0; i < 12; i++){
                Td[12+i] = reflection.mul(t[i]);
            }      
        }      
        return Td;
    }

    /**
       getI

    */
    static Matrix3D[] getI(){
        if(I == null){
            double g = (Math.sqrt(5)+1)/2, g1 = 1/g;
      
            I = new Matrix3D[60];
            I[0] = new Matrix3D();

            I[1] = Matrix3D.rotation(new Vector3D(0,g,1),2*PI/5);
            I[2] = Matrix3D.rotation(new Vector3D(0,g,1),-2*PI/5);
            I[3] = Matrix3D.rotation(new Vector3D(0,g,1),4*PI/5);
            I[4] = Matrix3D.rotation(new Vector3D(0,g,1),-4*PI/5);

            I[5] = Matrix3D.rotation(new Vector3D(0,g,-1),2*PI/5);
            I[6] = Matrix3D.rotation(new Vector3D(0,g,-1),-2*PI/5);
            I[7] = Matrix3D.rotation(new Vector3D(0,g,-1),4*PI/5);
            I[8] = Matrix3D.rotation(new Vector3D(0,g,-1),-4*PI/5);

            I[9] = Matrix3D.rotation(new Vector3D(g,1,0),2*PI/5);
            I[10] = Matrix3D.rotation(new Vector3D(g,1,0),-2*PI/5);
            I[11] = Matrix3D.rotation(new Vector3D(g,1,0),4*PI/5);
            I[12] = Matrix3D.rotation(new Vector3D(g,1,0),-4*PI/5);

            I[13] = Matrix3D.rotation(new Vector3D(g,-1,0),2*PI/5);
            I[14] = Matrix3D.rotation(new Vector3D(g,-1,0),-2*PI/5);
            I[15] = Matrix3D.rotation(new Vector3D(g,-1,0),4*PI/5);
            I[16] = Matrix3D.rotation(new Vector3D(g,-1,0),-4*PI/5);

            I[17] = Matrix3D.rotation(new Vector3D(1,0,g),2*PI/5);
            I[18] = Matrix3D.rotation(new Vector3D(1,0,g),-2*PI/5);
            I[19] = Matrix3D.rotation(new Vector3D(1,0,g),4*PI/5);
            I[20] = Matrix3D.rotation(new Vector3D(1,0,g),-4*PI/5);
      
            I[21] = Matrix3D.rotation(new Vector3D(-1,0,g),2*PI/5);
            I[22] = Matrix3D.rotation(new Vector3D(-1,0,g),-2*PI/5);
            I[23] = Matrix3D.rotation(new Vector3D(-1,0,g),4*PI/5);
            I[24] = Matrix3D.rotation(new Vector3D(-1,0,g),-4*PI/5);

            I[25] = Matrix3D.rotation(new Vector3D(g1,g,0),2*PI/3);
            I[26] = Matrix3D.rotation(new Vector3D(g1,g,0),-2*PI/3);
      
            I[27] = Matrix3D.rotation(new Vector3D(-g1,g,0),2*PI/3);
            I[28] = Matrix3D.rotation(new Vector3D(-g1,g,0),-2*PI/3);

            I[29] = Matrix3D.rotation(new Vector3D(g,0,g1),2*PI/3);
            I[30] = Matrix3D.rotation(new Vector3D(g,0,g1),-2*PI/3);

            I[31] = Matrix3D.rotation(new Vector3D(g,0,-g1),2*PI/3);
            I[32] = Matrix3D.rotation(new Vector3D(g,0,-g1),-2*PI/3);

            I[33] = Matrix3D.rotation(new Vector3D(0,g1,g),2*PI/3);
            I[34] = Matrix3D.rotation(new Vector3D(0,g1,g),-2*PI/3);

            I[35] = Matrix3D.rotation(new Vector3D(0,-g1,g),2*PI/3);
            I[36] = Matrix3D.rotation(new Vector3D(0,-g1,g),-2*PI/3);

            I[37] = Matrix3D.rotation(new Vector3D(1,1,1),2*PI/3);
            I[38] = Matrix3D.rotation(new Vector3D(1,1,1),-2*PI/3);

            I[39] = Matrix3D.rotation(new Vector3D(1,-1,1),2*PI/3);
            I[40] = Matrix3D.rotation(new Vector3D(1,-1,1),-2*PI/3);

            I[41] = Matrix3D.rotation(new Vector3D(-1,-1,1),2*PI/3);
            I[42] = Matrix3D.rotation(new Vector3D(-1,-1,1),-2*PI/3);

            I[43] = Matrix3D.rotation(new Vector3D(-1,1,1),2*PI/3);
            I[44] = Matrix3D.rotation(new Vector3D(-1,1,1),-2*PI/3);

            I[45] = Matrix3D.rotation(new Vector3D(1,0,0),PI);
            I[46] = Matrix3D.rotation(new Vector3D(0,1,0),PI);
            I[47] = Matrix3D.rotation(new Vector3D(0,0,1),PI);

            double gg1 = 1+g1, gg = 1+g;
            I[48] = Matrix3D.rotation(new Vector3D( 1, gg1,gg),PI);
            I[49] = Matrix3D.rotation(new Vector3D(-1, gg1,gg),PI);
            I[50] = Matrix3D.rotation(new Vector3D( 1,-gg1,gg),PI);
            I[51] = Matrix3D.rotation(new Vector3D(-1,-gg1,gg),PI);

            I[52] = Matrix3D.rotation(new Vector3D(gg, 1,gg1),PI);
            I[53] = Matrix3D.rotation(new Vector3D(gg,-1,gg1),PI);
            I[54] = Matrix3D.rotation(new Vector3D(gg, 1,-gg1),PI);
            I[55] = Matrix3D.rotation(new Vector3D(gg,-1,-gg1),PI);
      
            I[56] = Matrix3D.rotation(new Vector3D(gg1,gg, 1),PI);
            I[57] = Matrix3D.rotation(new Vector3D(gg1,gg,-1),PI);
            I[58] = Matrix3D.rotation(new Vector3D(-gg1,gg, 1),PI);
            I[59] = Matrix3D.rotation(new Vector3D(-gg1,gg,-1),PI);
        }
        return I;
    }

    static Matrix3D[] Ih;
    /**
       getIh
    */
    static Matrix3D[] getIh(){    

        if(Ih == null){
            Ih = new Matrix3D[120];
            Matrix3D[] t = getI();
            for(int i =0; i < 60; i++)
                Ih[i] = t[i];
      
            // reflection in plane (100)
            Matrix3D reflection = new Matrix3D(-1,0,0, 0,1,0, 0,0,1);
      
            for(int i = 0; i < 60; i++){
                Ih[60+i] = reflection.mul(t[i]);
            }      
        }      
        return Ih;
    }

    static Matrix3D[] Oh;
    /**
       getOh
    */
    static Matrix3D[] getOh(){    

        if(Oh == null){
            Oh = new Matrix3D[48];
            Matrix3D[] t = getO();
            for(int i =0; i < 24; i++)
                Oh[i] = t[i];
      
            // reflection in plane (100)
            Matrix3D reflection = new Matrix3D(-1,0,0, 0,1,0, 0,0,1);
      
            for(int i = 0; i < 24; i++){
                Oh[24+i] = reflection.mul(t[i]);
            }      
        }      
        return Oh;
    }
  
    static Matrix3D[] D2h;  
    /**
     
     */
    static Matrix3D[] getD2h(){

        if(D2h == null){

            D2h = new Matrix3D[8];

            D2h[0] = new Matrix3D();      
            D2h[1] = Matrix3D.rotation(new Vector3D(1,0,0),PI);
            D2h[2] = Matrix3D.rotation(new Vector3D(0,1,0),PI);
            D2h[3] = Matrix3D.rotation(new Vector3D(0,0,1),PI);

            // reflection in plane (100)
            Matrix3D reflection = new Matrix3D(-1,0,0, 0,1,0, 0,0,1);
      
            for(int i = 0; i < 4; i++){
                D2h[4+i] = reflection.mul(D2h[i]);
            }
        }

        return D2h;
    }

    static Matrix3D[] D2d;  
    /**
     
     */
    static Matrix3D[] getD2d(){

        if(D2d == null){

            D2d = new Matrix3D[8];

            D2d[0] = new Matrix3D();      
            D2d[1] = Matrix3D.rotation(new Vector3D(1,1,0),PI);
            D2d[2] = Matrix3D.rotation(new Vector3D(-1,1,0),PI);
            D2d[3] = Matrix3D.rotation(new Vector3D(0,0,1),PI);

            // reflection in plane (100)
            Matrix3D reflection = new Matrix3D(-1,0,0, 0,1,0, 0,0,1);
      
            for(int i = 0; i < 4; i++){
                D2d[4+i] = reflection.mul(D2d[i]);
            }
        }

        return D2d;
    }
  
  
    static Matrix3D [] D5d_I;

    // subgroup of Icosahedral group 
    static Matrix3D[] getD5d_I(){

        if(D5d_I != null)
            return D5d_I;

        double gam = (Math.sqrt(5)+1)/2;
        int n = 5;
        Matrix3D[] D = new Matrix3D[4*n];
        Vector3D ax2 = new Vector3D(1,0,0); // axis of 2nd order 
        Vector3D ax5 = new Vector3D(0,gam,1).normalize();
        for(int i = 0; i < n; i++){
            D[i] = Matrix3D.rotation(ax5,i*2*PI/5);
            double f = i*PI/n;
            D[i+n] = Matrix3D.rotation(ax2.mul(D[i]), PI);
        }
        // reflection in plane (010)
        Matrix3D reflection = new Matrix3D(-1,0,0, 0,1,0, 0,0,1);
        for(int i = 0; i < 2*n; i++){
            D[2*n+i] = reflection.mul(D[i]);
        }    
        D5d_I = D;
        return D5d_I;
    }


    // subgroup of Icosahedral group 
    static Matrix3D[] D5_I;
    static Matrix3D[] getD5_I(){

        if(D5_I != null){
            return D5_I;
        }
        double gam = (Math.sqrt(5)+1)/2;
        int n = 5;
    
        Matrix3D[] D = new Matrix3D[2*n];
        Vector3D ax2 = new Vector3D(1,0,0); // axis of 2nd order 
        Vector3D ax5 = new Vector3D(0,gam,1).normalize();
        for(int i = 0; i < n; i++){
            D[i] = Matrix3D.rotation(ax5,i*2*PI/5);
            double f = i*PI/n;
            D[i+n] = Matrix3D.rotation(ax2.mul(D[i]), PI);
        }

        D5_I = D;
        return D5_I;
    }
  
    // subgroup of Icosahedral group 
    static Matrix3D[] C5_I;
    static Matrix3D[] getC5_I(){

        if(C5_I != null){
            return C5_I;
        }

        double gam = (Math.sqrt(5)+1)/2;
        int n = 5;
    
        Matrix3D[] D = new Matrix3D[n];
        Vector3D ax5 = new Vector3D(0,gam,1).normalize();
        for(int i = 0; i < n; i++){
            D[i] = Matrix3D.rotation(ax5,i*2*PI/5);
        }

        C5_I = D;
        return C5_I;
    }
  
    // subgroup of Icosahedral group 
    static Matrix3D[] C5v_I;
    static Matrix3D[] getC5v_I(){

        if(C5v_I != null){
            return C5v_I;
        }

        double gam = (Math.sqrt(5)+1)/2;
        int n = 5;
    
        Matrix3D[] D = new Matrix3D[2*n];
        Vector3D ax5 = new Vector3D(0,gam,1).normalize();
        for(int i = 0; i < n; i++){
            D[i] = Matrix3D.rotation(ax5,i*2*PI/5);
        }
        Matrix3D reflection = new Matrix3D(-1,0,0, 0,1,0, 0,0,1);
        for(int i = 0; i < n; i++){
            D[n+i] = reflection.mul(D[i]);
        }    
    
        C5v_I = D;
        return C5v_I;
    }
  
    // subgroup of Icosahedral group 
    static Matrix3D[] getD3d_I(){

        double gam = (Math.sqrt(5)+1)/2;
        int n = 3;
        Matrix3D[] D = new Matrix3D[4*n];
        Vector3D ax2 = new Vector3D(1,0,0).normalize(); // axis of 2nd order 
        //Vector3D ax2 = new Vector3D(-(1+gam),1,gam).normalize(); // axis of 2nd order 
        Vector3D ax3 = new Vector3D(0,1/gam,gam).normalize();  // 3-fold axis
        //Vector3D ax3 = new Vector3D(1,1,1).normalize();  // 3-fold axis
        for(int i = 0; i < n; i++){
            D[i] = Matrix3D.rotation(ax3,i*2*PI/3);

            D[i+n] = Matrix3D.rotation(ax2.mul(D[i]), PI);
        }

        Matrix3D reflection = new Matrix3D(-1,0,0, 0,1,0, 0,0,1);
        // reflection in mirror plane passing through (1,1,1) and (-1,0.gam)
        //Matrix3D rot5 = Matrix3D.rotation(new Vector3D(1,0,gam).normalize(),2*PI/5);
        //Matrix3D rot_5 = Matrix3D.rotation(new Vector3D(1,0,gam).normalize(),-2*PI/5);
        //reflection = rot_5.mul(reflection.mul(rot5));

        for(int i = 0; i < 2*n; i++){
            D[2*n+i] = reflection.mul(D[i]);
        }    
        return D;
    }
    // subgroup of Icosahedral group 
    static Matrix3D[] getD3_I(){

        double gam = (Math.sqrt(5)+1)/2;
        int n = 3;
        Matrix3D[] D = new Matrix3D[2*n];
        Vector3D ax2 = new Vector3D(1,0,0).normalize(); // axis of 2nd order 
        //Vector3D ax2 = new Vector3D(-(1+gam),1,gam).normalize(); // axis of 2nd order 
        Vector3D ax3 = new Vector3D(0,1/gam,gam).normalize();  // axis of 3th order 
        //Vector3D ax3 = new Vector3D(1,1,1).normalize();  // 3-fold axis
        for(int i = 0; i < n; i++){
            D[i] = Matrix3D.rotation(ax3,i*2*PI/3);

            D[i+n] = Matrix3D.rotation(ax2.mul(D[i]), PI);
        }
        return D;
    }

    static Matrix3D[] C3_I;

    // subgroup of Icosahedral group 
    static Matrix3D[] getC3_I(){

        if(C3_I == null){

            double gam = (Math.sqrt(5)+1)/2;
            int n = 3;
            C3_I = new Matrix3D[n];
            Vector3D ax3 = new Vector3D(0,1/gam,gam).normalize();  // axis of 3th order 
            //Vector3D ax3 = new Vector3D(1,1,1).normalize();  // axis of 3th order 
            for(int i = 0; i < n; i++){
                C3_I[i] = Matrix3D.rotation(ax3,i*2*PI/3);
            }
        }
        return C3_I;
    }
  
    static Matrix3D[] C3v_I;
    // subgroup of Icosahedral group 
    static Matrix3D[] getC3v_I(){

        if(C3v_I == null){

            double gam = (Math.sqrt(5)+1)/2;

            Matrix3D reflection = new Matrix3D(-1,0,0, 0,1,0, 0,0,1);
            // reflection in mirror plane passing through (1,1,1) and (-1,0.gam)
            //Matrix3D rot5 = Matrix3D.rotation(new Vector3D(1,0,gam).normalize(),2*PI/5);
            //Matrix3D rot_5 = Matrix3D.rotation(new Vector3D(1,0,gam).normalize(),-2*PI/5);
            //reflection = rot_5.mul(reflection.mul(rot5));

            int n = 3;
            C3v_I = new Matrix3D[2*n];
            Vector3D ax3 = new Vector3D(0,1/gam,gam).normalize();  // axis of 3th order 
            //Vector3D ax3 = new Vector3D(0,1/gam,gam).normalize();  // axis of 3th order 
            for(int i = 0; i < n; i++){
                C3v_I[i] = Matrix3D.rotation(ax3,i*2*PI/3);
                // reflect
                C3v_I[i+n] = reflection.mul(C3v_I[i]);
            }
        }
        return C3v_I;
    }
  
    static Matrix3D[] D3d_O;
    static Matrix3D[] getD3d_O(){

        if(D3d_O == null){
            int n = 3;
            D3d_O = new Matrix3D[4*n];
            Vector3D ax2 = new Vector3D(1,-1,0).normalize(); // axis of 2nd order 
            Vector3D ax3 = new Vector3D(1,1,1).normalize();  // axis of 3th order 
            for(int i = 0; i < n; i++){
                D3d_O[i] = Matrix3D.rotation(ax3,i*2*PI/3);
                D3d_O[i+n] = Matrix3D.rotation(ax2.mul(D3d_O[i]), PI);
            }
            // reflection in plane (1-10)
            Matrix3D reflection = new Matrix3D(0,1,0, 1,0,0, 0,0,1);
            for(int i = 0; i < 2*n; i++){
                D3d_O[2*n+i] = reflection.mul(D3d_O[i]);
            }    
        }
        return D3d_O;
    }


    static Matrix3D[] D3_O;
    static Matrix3D[] getD3_O(){

        if(D3_O == null){
      
            int n = 3;
            Matrix3D[] D = new Matrix3D[2*n];
            Vector3D ax2 = new Vector3D(1,-1,0).normalize(); // axis of 2nd order 
            Vector3D ax3 = new Vector3D(1,1,1).normalize();  // axis of 3th order 
            for(int i = 0; i < n; i++){
                D[i] = Matrix3D.rotation(ax3,i*2*PI/3);
                D[i+n] = Matrix3D.rotation(ax2.mul(D[i]), PI);
            }
            D3_O = D;
        }

        return D3_O;
    }
    static Matrix3D[] C3v_O;
    static Matrix3D[] getC3v_O(){
        if(C3v_O == null){

            // reflection in plane (110)
            Matrix3D reflection = new Matrix3D(0,1,0, 1,0,0, 0,0,1);
            int n = 3;
            C3v_O = new Matrix3D[2*n];
            Vector3D ax3 = new Vector3D(1,1,1).normalize();  // axis of 3th order 
            for(int i = 0; i < n; i++){
                C3v_O[i] = Matrix3D.rotation(ax3,i*2*PI/3);
                // reflect in (110)
                C3v_O[i+n] = reflection.mul(C3v_O[i]);
            }
        }
        return C3v_O;
    }
    static Matrix3D[] C3_O;
    static Matrix3D[] getC3_O(){

        if(C3_O == null){

            int n = 3;
            C3_O = new Matrix3D[n];
            Vector3D ax3 = new Vector3D(1,1,1).normalize();  // axis of 3th order 
            for(int i = 0; i < n; i++){
                C3_O[i] = Matrix3D.rotation(ax3,i*2*PI/3);
            }
        }
        return C3_O;
    }
    static Matrix3D[] C2_O;
    static Matrix3D[] getC2_O(){
    
        if(C2_O == null){

            int n = 2;
            Matrix3D[] D = new Matrix3D[n];
            Vector3D ax = new Vector3D(1,1,0).normalize();  // 2-fold axis
            for(int i = 0; i < n; i++){
                D[i] = Matrix3D.rotation(ax,i*2*PI/2);
            }

            C2_O = D;
        }
        return C2_O;
    }
    static Matrix3D[] C2v_O;
    static Matrix3D[] getC2v_O(){
    
        if(C2v_O == null){

            int n = 2;
            Matrix3D[] D = new Matrix3D[2*n];
            Vector3D ax2 = new Vector3D(1,1,0).normalize();  // 2-fold axis
            // reflection in plane (001)
            Matrix3D reflection = new Matrix3D(1,0,0, 0,1,0, 0,0,-1);

            for(int i = 0; i < n; i++){
                D[i] = Matrix3D.rotation(ax2,i*2*PI/2);
                // reflect
                D[i+n] = reflection.mul(D[i]);
            }

            C2v_O = D;
        }
        return C2v_O;
    }

    static Matrix3D[] D2h_O;
    static Matrix3D[] getD2h_O(){

        if(D2h_O == null){
            int n = 2;
            Matrix3D[] D = new Matrix3D[4*n];

            Vector3D ax2 = new Vector3D(1,0,0).normalize();
            Vector3D axn = new Vector3D(0,1,1).normalize();
      
            D[0] = new Matrix3D();
            D[1] = Matrix3D.rotation(axn,PI);
            D[2] = Matrix3D.rotation(ax2,PI);
            D[3] = Matrix3D.rotation(new Vector3D(0,1,-1).normalize(),PI);
      
            // reflection in plane (011)
            Matrix3D reflection = new Matrix3D(1,0,0, 0,0,-1,  0,-1,0);
      
            for(int i = 0; i < 2*n; i++){
                D[2*n+i] = reflection.mul(D[i]);
            }
            D2h_O = D;
        }
        return D2h_O;
    }

    static Matrix3D[] D2_O;
    static Matrix3D[] getD2_O(){
        // D2 with main axis parallel to 2-fold axis of cube 
        if(D2_O == null){

            Matrix3D[] D = new Matrix3D[4];

            Vector3D ax2 = new Vector3D(1,0,0).normalize();
            Vector3D axn = new Vector3D(0,1,1).normalize();
      
            D[0] = new Matrix3D();
            D[1] = Matrix3D.rotation(axn,PI);
            D[2] = Matrix3D.rotation(ax2,PI);
            D[3] = Matrix3D.rotation(new Vector3D(0,1,-1).normalize(),PI);
      
            D2_O = D;
        }
        return D2_O;
    }

    /**
       Dnd
    */
    static Matrix3D[] getDnd(int n){
    
        Matrix3D[] D = new Matrix3D[4*n];
        for(int i = 0; i < n; i++){
            D[i] = Matrix3D.rotation(new Vector3D(0,0,1),i*2*PI/n);
            //double f = i*PI/n + PI/(2*n);
            double f = i*PI/n;
            D[i+n] = Matrix3D.rotation(
                                       new Vector3D(Math.cos(f),Math.sin(f),0),PI);
        }
        // reflection in plane (010)
        Matrix3D reflection = new Matrix3D(1,0,0, 0,-1,0, 0,0,1);
        Matrix3D rot = Matrix3D.rotation(new Vector3D(0,0,1), PI/(2*n));
        Matrix3D rot1 = Matrix3D.rotation(new Vector3D(0,0,1), -PI/(2*n));
        reflection = rot.mul(reflection.mul(rot1));
        for(int i = 0; i < 2*n; i++){
            D[2*n+i] = reflection.mul(D[i]);
        }
    
        return D;
    }


    /**
       Dnh
    */
    static Matrix3D[] getDnh(int n){
    
        Matrix3D[] D = new Matrix3D[4*n];
        for(int i = 0; i < n; i++){
            D[i] = Matrix3D.rotation(new Vector3D(0,0,1),i*2*PI/n);
            double f = i*PI/n;
            D[i+n] = Matrix3D.rotation(
                                       new Vector3D(Math.cos(f),Math.sin(f),0),PI);
        }
        // reflection in plane (010)
        Matrix3D reflection = new Matrix3D(1,0,0, 0,-1,0, 0,0,1);
    
        for(int i = 0; i < 2*n; i++){
            D[2*n+i] = reflection.mul(D[i]);
        }
    
        return D;
    }
  
    /**
       Dn
    */
    static Matrix3D[] getDn(int n){
    
        Matrix3D[] D = new Matrix3D[2*n];
        for(int i = 0; i < n; i++){
            D[i] = Matrix3D.rotation(new Vector3D(0,0,1),i*2*PI/n);
            double f = i*PI/n;
            D[i+n] = Matrix3D.rotation(new Vector3D(Math.cos(f),Math.sin(f),0),PI);
        }
        return D;
    }

    /**
       Cn
    */
    static Matrix3D[] getCn(int n){
    
        Matrix3D[] D = new Matrix3D[n];
        for(int i = 0; i < n; i++){
            D[i] = Matrix3D.rotation(new Vector3D(0,0,1),i*2*PI/n);
        }
        return D;
    }

    /**
       Cnv
    */
    static Matrix3D[] getCnv(int n){
    
        Matrix3D[] D = new Matrix3D[2*n];
        for(int i = 0; i < n; i++){
            D[i] = Matrix3D.rotation(new Vector3D(0,0,1),i*2*PI/n);
        }
        // reflection in plane (010)
        Matrix3D reflection = new Matrix3D(1,0,0, 0,-1,0, 0,0,1);
    
        for(int i = 0; i < n; i++){
            D[n+i] = reflection.mul(D[i]);
        }
        return D;
    }

    /**
       Cnh
    */
    static Matrix3D[] getCnh(int n){
    
        Matrix3D[] D = new Matrix3D[2*n];
        for(int i = 0; i < n; i++){
            D[i] = Matrix3D.rotation(new Vector3D(0,0,1),i*2*PI/n);
        }
        // reflection in plane (001)
        Matrix3D reflection = new Matrix3D(1,0,0, 0,1,0, 0,0,-1);
    
        for(int i = 0; i < n; i++){
            D[n+i] = reflection.mul(D[i]);
        }
        return D;
    }

    // PB! start

    /**
       Sn 
    */
    static Matrix3D[] getSn(int n){ // n should be even !!
    
        Matrix3D[] D = new Matrix3D[n];
        Matrix3D first = new Matrix3D();
        first = Matrix3D.rotation(new Vector3D(0,0,1),2*PI/n);

        // reflection in plane (001)
        Matrix3D reflection = new Matrix3D(1,0,0, 0,1,0, 0,0,-1);
        first = reflection.mul(first);	
        D[0] = new Matrix3D(); // ident
        for(int i = 1; i < n; i++){
            D[i] = first.mul(D[i-1]);
        }
        return D;
    }
  
    /**
       S6_O 
    */
  
    static Matrix3D[] S6_O;
    static Matrix3D[] getS6_O(){

        if(S6_O == null){
            int n = 6;
            S6_O = new Matrix3D[n];
            Vector3D normal = new Vector3D(1,1,1).normalize();
            Matrix3D rot =  Matrix3D.rotation(normal,2*PI/n);
  
            // reflection in plane (111)
            Matrix3D refl = Matrix3D.reflection(normal);
            Matrix3D rotreflect = refl.mul(rot);	
            S6_O[0] = rotreflect;
            for(int i = 1; i < n; i++){
                S6_O[i] = rotreflect.mul(S6_O[i-1]);
            }
        }
        return S6_O;
    }   

    /**
       S10_I 
    */
  
    static Matrix3D[] S10_I;
    static Matrix3D[] getS10_I(){
        double g = (Math.sqrt(5)+1)/2;
        if(S10_I == null){
            int n = 10;
            S10_I = new Matrix3D[n];
            Vector3D normal = new Vector3D(0,g,1).normalize();
            Matrix3D rot =  Matrix3D.rotation(normal,2*PI/n);
  
            // reflection in plane (0g1)
            Matrix3D refl = Matrix3D.reflection(normal);
            Matrix3D rotreflect = refl.mul(rot);	
            S10_I[0] = rotreflect;
            for(int i = 1; i < n; i++){
                S10_I[i] = rotreflect.mul(S10_I[i-1]);
            }
        }
        return S10_I;
    }   

    /**
       S6_I 
    */
  
    static Matrix3D[] S6_I;
    static Matrix3D[] getS6_I(){
        double g = (Math.sqrt(5)+1)/2, g1 = 1/g;
        if(S6_I == null){
            int n = 6;
            S6_I = new Matrix3D[n];
            Vector3D normal = new Vector3D(0,g1,g).normalize();
            Matrix3D rot =  Matrix3D.rotation(normal,2*PI/n);
  
            // reflection in plane (0g1)
            Matrix3D refl = Matrix3D.reflection(normal);
            Matrix3D rotreflect = refl.mul(rot);	
            S6_I[0] = rotreflect;
            for(int i = 1; i < n; i++){
                S6_I[i] = rotreflect.mul(S6_I[i-1]);
            }
        }
        return S6_I;
    }   

    /**
       C2(D)
    */
    static Matrix3D[] getC2_D(){
        int n = 2;
        Matrix3D[] D = new Matrix3D[n];
        for(int i = 0; i < n; i++){
            D[i] = Matrix3D.rotation(new Vector3D(1,0,0),i*2*PI/n);
        }
        return D;
    }

    /**
       C2v(D)
    */
    static Matrix3D[] getC2v_D(){
        int n = 2;
        Matrix3D[] D = new Matrix3D[2*n];
        for(int i = 0; i < n; i++){
            D[i] = Matrix3D.rotation(new Vector3D(1,0,0),i*2*PI/n);
        }
        // reflection in plane (010)
        Matrix3D reflection = new Matrix3D(1,0,0, 0,-1,0, 0,0,1);
    
        for(int i = 0; i < n; i++){
            D[n+i] = reflection.mul(D[i]);
        }
        return D;
    }

    /**
       C2h(D)
    */
    static Matrix3D[] getC2h_D(){
        int n = 2;
        Matrix3D[] D = new Matrix3D[2*n];
        for(int i = 0; i < n; i++){
            D[i] = Matrix3D.rotation(new Vector3D(1,0,0),i*2*PI/n);
        }
        // reflection in plane (100)
        Matrix3D reflection = new Matrix3D(-1,0,0, 0,1,0, 0,0,1);
    
        for(int i = 0; i < n; i++){
            D[n+i] = reflection.mul(D[i]);
        }
        return D;
    }
  
    /**
       Cs(Dnd)
    */	 
 
    static Matrix3D[] getCs_Dd(int n){

        Matrix3D[] D = new Matrix3D[2];
        D[0] = new Matrix3D();
        int i = 0;
        double f = n % 2 == 0 ? (i + 0.5) * Math.PI / n: i * Math.PI / n;
        D[1] = Matrix3D.reflection(new Vector3D(Math.cos(f),Math.sin(f),0));
        return D;
    }
    /**
       Cs(Dnh) = Cs(Cnv)
    */	 
 
    static Matrix3D[] getCs_Dh(int n){

        Matrix3D[] D = new Matrix3D[2];
        D[0] = new Matrix3D();
        D[1] = Matrix3D.reflection(new Vector3D(0, 1, 0));
        return D;
    }
    
    

    // PB! end

    static Axis[] axesO = {
        new Axis(new Vector3D(1,0,0),4),
        new Axis(new Vector3D(0,1,0),4),
        new Axis(new Vector3D(0,0,1),4),
        new Axis(new Vector3D(1,1,1),3),
        new Axis(new Vector3D(-1,1,1),3),
        new Axis(new Vector3D(1,-1,1),3),
        new Axis(new Vector3D(-1,-1,1),3),
        new Axis(new Vector3D( 1,  1, 0),2),
        new Axis(new Vector3D(-1,  1, 0),2),
        new Axis(new Vector3D( 1,  0, 1),2),
        new Axis(new Vector3D(-1,  0, 1),2),
        new Axis(new Vector3D(0,  1, 1),2),
        new Axis(new Vector3D(0, -1, 1),2)
    };
    static Axis[] axesT = {
        new Axis(new Vector3D(1,0,0),2),
        new Axis(new Vector3D(0,1,0),2),
        new Axis(new Vector3D(0,0,1),2),
        new Axis(new Vector3D(1,1,1),3),
        new Axis(new Vector3D(-1,1,1),3),
        new Axis(new Vector3D(1,-1,1),3),
        new Axis(new Vector3D(-1,-1,1),3)
    };


    static double g = (Math.sqrt(5)+1)/2;
    static double g1 = 1/g, gg1 = 1+g1, gg = 1+g;

    static Axis[] axesI = {

        new Axis(new Vector3D(0,g,1),5),
        new Axis(new Vector3D(0,g,-1),5),
        new Axis(new Vector3D(g,1,0),5),
        new Axis(new Vector3D(g,-1,0),5),
        new Axis(new Vector3D(1,0,g),5),      
        new Axis(new Vector3D(-1,0,g),5),
        new Axis(new Vector3D(g1,g,0),3),
        new Axis(new Vector3D(-g1,g,0),3),
        new Axis(new Vector3D(g,0,g1),3),
        new Axis(new Vector3D(g,0,-g1),3),
        new Axis(new Vector3D(0,g1,g),3),
        new Axis(new Vector3D(0,-g1,g),3),
        new Axis(new Vector3D(1,1,1),3),
        new Axis(new Vector3D(1,-1,1),3),
        new Axis(new Vector3D(-1,-1,1),3),
        new Axis(new Vector3D(-1,1,1),3),

        new Axis(new Vector3D(1,0,0),2),
        new Axis(new Vector3D(0,1,0),2),
        new Axis(new Vector3D(0,0,1),2),

        new Axis(new Vector3D( 1, gg1,gg),2),
        new Axis(new Vector3D(-1, gg1,gg),2),
        new Axis(new Vector3D( 1,-gg1,gg),2),
        new Axis(new Vector3D(-1,-gg1,gg),2),

        new Axis(new Vector3D(gg, 1,gg1),2),
        new Axis(new Vector3D(gg,-1,gg1),2),
        new Axis(new Vector3D(gg, 1,-gg1),2),
        new Axis(new Vector3D(gg,-1,-gg1),2),
      
        new Axis(new Vector3D(gg1,gg, 1),2),
        new Axis(new Vector3D(gg1,gg,-1),2),
        new Axis(new Vector3D(-gg1,gg, 1),2),
        new Axis(new Vector3D(-gg1,gg,-1),2)
    };

  
    static Axis[] getAxesO(){
        return axesO;
    }
    static Axis[] getAxesI(){
        return axesI;
    }
    static Axis[] getAxesT(){
        return axesT;
    }

  
    static Vector3D[] planes_Ih;
    static Vector3D[] planes_Oh;
    static Vector3D[] planes_Th;
    static Vector3D[] planes_Td;

    static void makePlanes_Ih(){
        Vector3D[] planes = new Vector3D[15];

        planes[0] = new Vector3D(0,1,0);
        planes[1] = new Vector3D(1,0,0);
        double tau = (Math.sqrt(5)+1)/2;
        Vector3D g1 = (new Vector3D(1,0,tau)).normalize();
        Vector3D g2 = (new Vector3D(-1,0,tau)).normalize();
        Vector3D c7 = (new Vector3D(tau,0,1/tau)).normalize();
        Vector3D c8 = (new Vector3D(-tau,0,1/tau)).normalize();
        planes[2] = planes[0].rotate(g1,-Math.PI/5);
        planes[3] = planes[0].rotate(g2,Math.PI/5);
        planes[4] = planes[0].rotate(g1,-2*Math.PI/5);
        planes[5] = planes[0].rotate(g2,2*Math.PI/5);
        planes[6] = planes[0].rotate(g1,-3*Math.PI/5);
        planes[7] = planes[0].rotate(g2,3*Math.PI/5);
        planes[8] = planes[0].rotate(g1,-4*Math.PI/5);
        planes[9] = planes[0].rotate(g2,4*Math.PI/5);
        planes[10] = planes[0].rotate(c7,-Math.PI/3);
        planes[11] = planes[0].rotate(c8,Math.PI/3);
        planes[12] = planes[0].rotate(c7,-2*Math.PI/3);
        planes[13] = planes[0].rotate(c8,2*Math.PI/3);
    
        planes[14] = new Vector3D(0,0,1);
        planes_Ih = planes;

    }

    static void makePlanes_Oh() {
      
        Vector3D[] planes = new Vector3D[9];
        planes = new Vector3D[9];
        planes[0] = new Vector3D(1,1,0);
        planes[1] = new Vector3D(-1,1,0);
        planes[2] = new Vector3D(1,0,1);
        planes[3] = new Vector3D(1,0,-1);
        planes[4] = new Vector3D(0,1,1);
        planes[5] = new Vector3D(0,1,-1);
        planes[6] = new Vector3D(1,0,0);
        planes[7] = new Vector3D(0,1,0);
        planes[8] = new Vector3D(0,0,1);
        planes_Oh = planes;
    }

    static void makePlanes_Td() {

        Vector3D [] planes = new Vector3D[6];
        planes[0] = new Vector3D(1,1,0);
        planes[1] = new Vector3D(-1,1,0);
        planes[2] = new Vector3D(1,0,1);
        planes[3] = new Vector3D(1,0,-1);
        planes[4] = new Vector3D(0,1,1);
        planes[5] = new Vector3D(0,1,-1);

        planes_Td = planes;

    }

    static void makePlanes_Th() {

        Vector3D[] planes = new Vector3D[3];
        planes[0] = new Vector3D(1,0,0);
        planes[1] = new Vector3D(0,1,0);
        planes[2] = new Vector3D(0,0,1);
        planes_Th = planes;
    }
      

    public static Plane[] getSymmetryPlanes(String symmetry){
    
        Vector3D[] planes = new Vector3D[0];

        if(symmetry.equals("Ih") || symmetry.equals("I")){
            if(planes_Ih == null){
                makePlanes_Ih();
            }
            planes = planes_Ih;      
      
        } else if(symmetry.equals("Oh") || symmetry.equals("O")){  

            if(planes_Oh == null){
                makePlanes_Oh();
            }
            planes = planes_Oh;      
      
        } else if(symmetry.equals("Td") || symmetry.equals("T")){  

            if(planes_Td == null){
                makePlanes_Td();
            }
      
            planes = planes_Td;      

        } else if(symmetry.equals("Th")){  

            if(planes_Th == null){
                makePlanes_Th();
            }
      
            planes = planes_Th;      
        } 

        Plane pl[] = new Plane[planes.length];
        for(int i = 0; i < planes.length; i++){
            planes[i].normalize();
            pl[i] = new Plane(planes[i],0.,i);
        }
    
        return pl;
    }

    static double tau = (Math.sqrt(5)+1)/2;



    // canonical point is in one of segments adjacent to (0 0 1), and above x axis. 
    // we can define, that point has "right" handeness if p.x > 0
    // and "left" handness p.x < 0

    static Vector3D make_canonical_point_Ih(Vector3D v){

        if(planes_Ih == null){
            makePlanes_Ih();
        }

        Vector3D planes[] = planes_Ih;

        Vector3D p = new Vector3D(v.x,v.y,v.z);
        int sign = 1; // we should count number of reflections introduced 
        if(p.x < 0){
            sign *= -1;
            p.x = -p.x;
        }
        if(p.y < 0){
            sign *= -1;
            p.y = -p.y;
        }
        if(p.z < 0){
            sign *= -1;
            p.z = -p.z;
        }
    
        double s10 = p.dot(planes[10]);
        double s6 = p.dot(planes[6]);
        double s3 = p.dot(planes[3]);

        //rot_c5_1 = new SFRotation(1,1,1,2*Math.PI/3);
        //rot_c5_2 = new SFRotation(1,1,1,4*Math.PI/3);
        //rot_g1_1 = new SFRotation(g1,2*Math.PI/5);
        //rot_g1_2 = new SFRotation(g1,4*Math.PI/5);
    
        if(s10 > 0 && s6 > 0){

            p.rotateSet(new Vector3D(1,1,1).normalize(),4*Math.PI/3); // rot_c5_2.multVec(p);

        } else if(s6 < 0 && s3 > 0) {

            p.rotateSet(new Vector3D(1,1,1).normalize(),2*Math.PI/3); // rot_c5_1.multVec(p);		

        }
    
        double s2 = p.dot(planes[2]);
        s6 = p.dot(planes[6]);
        if(s6 > 0){
            p.rotateSet(new Vector3D(1,0,tau).normalize(),4*Math.PI/5); //rot_g1_2.multVec(p);
        } else if( s2 > 0) {
            p.rotateSet(new Vector3D(1,0,tau).normalize(),2*Math.PI/5); //rot_g1_1.multVec(p);		
        }

        if(p.y < 0){
            sign *= -1;
            p.y = - p.y;
        }

        p.x *= sign;
        return p;
    }

  
    static Vector3D make_canonical_point_Oh(Vector3D v){
    
        Vector3D p = new Vector3D(v.x,v.y,v.z);
        int sign = 1;
        if(p.x < 0){
            sign *= -1;
            p.x = -p.x;
        }
        if(p.y < 0){
            sign *= -1;
            p.y = -p.y;
        }
        if(p.z < 0){
            sign *= -1;
            p.z = -p.z;
        }
      
        if(p.x > p.z){
            double t = p.z;
            p.z = p.x;
            p.x = t;
            sign*= -1;
        }
        if(p.y > p.x){
            double t = p.y;
            p.y = p.x;
            p.x = t;
            sign*= -1;      
        }
        if(p.x > p.z){ // once more 
            double t = p.z;
            p.z = p.x;
            p.x = t;
            sign*= -1;      
        }
    
        p.x *= sign; 
        return p;
    }
  
    static Vector3D make_canonical_point_Td(Vector3D v){

        // these are empirical rules 
    
        Vector3D p = new Vector3D(v);
        int sign = 1;

        if(p.y > p.x){ // test X and Y 
            double t = p.y; p.y = p.x; p.x = t;
            sign *= -1;
        }

        if(p.y < -p.x){
            double t = p.y; p.y = -p.x; p.x = -t;		
            sign *= -1;
        }

        if(p.z < p.x){ // test X and Z 

            double t = p.z; p.z = p.x; p.x = t;		
            sign *= -1;

        }
        if(p.z < -p.x){
            double t = p.z; p.z = -p.x; p.x = -t;		
            sign *= -1;

        }
        if(p.y > p.x){  // test Y and Y (once more)
            double t = p.y; p.y = p.x; p.x = t;
            sign *= -1;
        }
        if(p.y < -p.x){
            double t = p.y; p.y = -p.x; p.x = -t;		
            sign *= -1;
        }

        if(sign < 0){ // last adjutement 
            double t = p.y; p.y = p.x; p.x = t;		      
        }
        return p;
    }

    static Vector3D make_canonical_point_Th(Vector3D v){
   
        Vector3D p = new Vector3D(v);
        int sign = 1;
        if(p.x < 0){
            sign *= -1;
            p.x = -p.x;
        }
        if(p.y < 0){
            sign *= -1;
            p.y = -p.y;
        }
        if(p.z < 0){
            sign *= -1;
            p.z = -p.z;
        }

        if(p.z < p.x){
            double t = p.x; p.x = p.y; p.y = p.z; p.z = t;		
        }
        if(p.z < p.y){
            double t = p.x; p.x = p.z; p.z = p.y; p.y = t;		
        }
        if(p.z < p.x){
            double t = p.x; p.x = p.y; p.y = p.z; p.z = t;		
        }

        p.x *= sign;
      
        return p;
    }

    //static final double TOL = 0.00001;

    static boolean test_point_at_plane(Vector3D[] planes, Vector3D v){
        for(int i = 0; i < planes.length; i++){
            double dot = planes[i].dot(v);
            if(dot < 0)
                dot = -dot;
            if(dot < TOL)
                return true;
        }
        return false;
    }


    public static int get_handedness(Vector3D v, String symmetry){


        if(symmetry.equals("O")){
            if(planes_Oh == null)
                makePlanes_Oh();
            if(test_point_at_plane(planes_Oh,v))
                return 0;

            Vector3D p = make_canonical_point_Oh(v);
            if(p.x < -TOL)
                return -1;
            else if(p.x > TOL)
                return 1;
            else 
                return 0;
        } else if(symmetry.equals("I")){

            if(planes_Ih == null)
                makePlanes_Ih();
            if(test_point_at_plane(planes_Ih,v))
                return 0;
            Vector3D p = make_canonical_point_Ih(v);
            //System.out.println(p);
            if(p.x < -TOL)
                return -1;
            else if(p.x > TOL)
                return 1;
            return 0;

        } else if(symmetry.equals("Th") || symmetry.equals("T")){
            Vector3D p = make_canonical_point_Ih(v);
            if(p.x < -TOL)
                return -1;
            else if(p.x > TOL)
                return 1;
            return 0;
        } else if(symmetry.equals("Td")){
            Vector3D p = make_canonical_point_Ih(v);
            if(p.x - p.y < -TOL)
                return -1;
            else if(p.x - p.y > TOL)
                return 1;
            return 0;
        }
        // for others symmetries we don't know yet
        return 0;
    }

  
    static String symNames[][] = {
        {"T",     "[3, 3]+",  "A_4",      "Tetrahedral"},
        {"Td",    "[3, 3]",   "S_4",      "Diploid tetrahedral"},
        {"Th",    "[3+, 4]",  "A_4 x C_2","Central tetrahedral"},
        {"O" ,    "[3, 4]+",  "S_4","Octahedral"},
        {"Oh",    "[3, 4]",   "S_4 x C_2","Diploid octahedral"},
        {"I" ,    "[3, 5]+",  "A_5","Icosahedral"},
        {"Ih",    "[3, 5]",   "A_5 x C_2","Diploid icosahedral"},

        {"C1"  ,  "[ ]+",     "C_1","Identity"},
        {"Cs"  ,  "[ ]",      "D_1","Bilateral"},
        {"S2"  ,  "[2+, 2+]", "C_2","Central"},
        {"Cn"  ,  "[n]+",     "C_n","n-gonal"},
        {"Dn"  ,  "[n, 2]+",  "D_n","n-dihedral"},
        {"Cnv" ,  "[n]",      "D_n","Diploid n-gonal"},
        {"S2n" ,  "[2n+, 2+]","C_2n","Skew 2n-gonal"},
        {"Cnh" ,  "[n+, 2]",  "C_n x D_1","Diploid n-cyclic"},
        {"Dnd" ,  "[2n, 2+]", "D_2n","Diploid skew 2n-gonal"},
        {"Dnh" ,  "[n, 2]",   "D_n x D_1","   Diploid n-dihedral"}    
    };
    //  VB! original included for reference
    //  static String allgroups[] = {
    //    "Ih","I","Th","T","D5d(I)","D5(I)","C5v(I)","C5(I)","D3d(I)","D3(I)","C3v(I)","C3(I)", 
    //            "D2h","D2","C2","Ci","Cs","E",
    //    "Oh","O","Th","Td","T","D4h","D4d","D4","D3d(O)","D3(O)","C3v(O)","C3(O)",
    //            "D2h","D2h(O)","D2d","D2","C2","D2h(O)","D2(O)","C2(O)",
    //    "Td","T","D2d","C2","Ci","Cs","E",
    //    "D3d","D4d","D5d","D6d","D7d",
    //    "D3h","D4h","D5h","D6h","D7h",
    //    "D3","D4","D5","D6","D7",
    //    "C3","C4","C5","C6","C7",
    //    "C3h","C4h","C5h","C6h","C7h",
    //    "C3v","C4v","C5v","C6v","C7v"
    //  };
    //
    //
    //  static String subgroups[][][] = {
    //    {{"Ih"},
    //     {"Ih","I","Th","T","D5d(I)","D5(I)","C5v(I)","C5(I)","D3d(I)","D3(I)","C3v(I)","C3(I)", "D2h","D2","C2v","C2","Ci","Cs","E"}},
    //    {{"I"},
    //     {"I","T","D5(I)","C5(I)","D3(I)","C3(I)","D2","C2","Ci","Cs","E"}},
    //    {{"Oh"},
    //     {"Oh","O","Th","Td","T","D4h","D4","D3d(O)","D3(O)","C3v(O)","C3(O)",
    //      "D2h","D2d","D2","C2","D2h(O)","D2(O)","C2(O)","Ci","Cs","E"}},
    //    {{"O"},
    //     {"O","T","D4","D3(O)","C3(O)","D2","C2","C2(O)","Ci","Cs","E"}},
    //    {{"Td"},
    //     {"Td","T","C3v(O)","C3(O)","D2d","D2","C2v","C2","Ci","Cs","E"}},
    //    {{"Th"}, // ?? 
    //     {"Th","T","C3(O)","D2d","D2","C2v","C2","Ci","Cs","E"}},
    //    {{"D7h"},  // ??
    //     {"D7h","D7","C7h","C7v","C7","Ci","Cs","E"}},
    //    {{"D7d"},  // ??
    //     {"D7d","D7","C7","Ci","Cs","E"}},
    //    {{"D6h"},  // ??
    //     {"D6h","D6","C6h","C6v","C6","D3d","D3h","D3","C3v","C3h","C2h","C2v","C2","Ci","Cs","E"}},
    //    {{"D6d"},  // ??
    //     {"D6d","D6","C6v","C6","D3d","D3h","D3","C3v","C3h","C2h","C2v","C2","Ci","Cs","E"}},
    //  };
    // VB! end

    // PB! updated list of groups and subgroups
    static String allgroups[] = {
        // Crystalographic groups
        "Oh","Td","O","Th","T", // cubic
        "D3d(O)","D3(O)","C3v(O)","C3(O)", // cubic subgroups with axis (1,1,1)
        "D2h(O)","D2(O)","C2(O)", //  cubic subgroups with axis (1,1,0)groups 
        "D6h","D3h","C6v","D6","C6h","C3h","C6",// hexagonal
        "D3d","C3v","D3","S6","C3",             // trigonal
        "D4h","D2d","C4v","D4","C4h","S4","C4", // tetragonal
        "D2h","C2v","D2",                      // orthorombic
        "C2h","Cs","C2",                        // triclinic
        "Ci","E",                               // monoclinic
	
        // Non-crystallographic groups
        // icosahedral + special axessettings
        "Ih","I",  // "D5d(I)","D5(I)","C5v(I)","C5(I)","D3d(I)","D3(I)","C3v(I)","C3(I)", 
        // other groups
        "D4d",
        "D5d","D6d","D7d","D8d","D9d","D10d","D11d","D12d",
        "D5h","D7h","D7d","D8h","D9h","D10h","D11h","D12h",
        "D5", "D7","D7","D8","D9","D10","D11","D12",
        "C5", "C7","C8","C9","C10","C11","C12",
        "C5h","C7h","C8h","C9h","C10h","C11h","C12h",
        "C5v","C7v","C8v","C9v","C10v","C11v","C12v",
    };


    static String subgroups[][][] = {
        // Crystalographic groups
        // should all be OK

        // cubic 
        {{"Oh"},
         {"Oh","O","Th","Td","T","D4h","D4","C4v","C4h","C4","S4","D3d(O)","D3(O)","S6(O)",
          "C3v(O)","C3(O)","D2h","D2d","D2","C2v","C2h","C2",
          "D2h(O)","D2(O)","C2(O)","Ci","Cs","E"}},
	  
        {{"Td"},
         {"Td","T","C3v(O)","C3(O)","D2d","D2","C2v","C2","Ci","Cs","E"}},

        {{"O"}, 	 
         {"O","T","D4","C4","D3(O)","C3(O)","D2","D2(O)","C2","C2(O)","E"}}, 
	 
        {{"Th"}, 
         {"Th","T","S6(O)","C3(O)","D2d","D2","C2v","C2h","C2","Ci","Cs","E"}},
	 
        {{"T"}, 
         {"T","C3(O)","D2","C2","E"}}, 
	 
        // hexagonal
        {{"D6h"},
         {"D6h","D6","S6","C6h","C6v","C6","D3d","D3h","D3","C3v","C3h","C3",
          "D2h","D2","C2v","C2h","C2","Ci","Cs","E",
          "C2v(D)","C2h(D)","C2(D)","Cs(D6h)"}},
	  
        {{"D3h"},
         {"D3h","D3","C3v","C3h","C3","C2v(D)","C2(D)","Cs","Cs(D3h)","E"}},
      
        {{"C6v"},
         {"C6v","C6","C3v","C3","C2v","C2","Cs(C6v)","E"}},

        {{"D6"},
         {"D6","C6","D3","C3","D2","C2","C2(D)","E"}},

        {{"C6h"}, 
         {"C6h","C6","S6","C3h","C3","C2h","C2","Ci","Cs","E"}},
	  
        {{"C3h"},
         {"C3h","C3","Cs","E"}},

        {{"C6"},
         {"C6","C3","C2","E"}},
       
        // trigonal
        {{"D3d"},
         {"S6","D3d","D3","C3v","C3","C2h(D)","C2(D)","Ci","Cs(D3d)","E"}},
	  
        {{"C3v"},
         {"C3v","C3","Cs(C3v)","E"}},
        {{"D3"},
         {"D3","C3","C2(D)","E"}},

        {{"S6"},
         {"S6","C3","Ci","E"}},
       
        {{"C3"},
         {"C3","E"}},

        {{"C3(O)"},
         {"C3(O)","E"}},
	 
        // tetragonal
        {{"D4h"},
         {"D4h","D4","C4v","C4h","C4","S4","D2h","D2d","D2","C2v","C2h","C2","Ci","Cs","E",
          "C2v(D)","C2h(D)","C2(D)","Cs(D4h)"}},

        {{"D2d"},
         {"D2d","S4","D2","C2v","C2","C2(D)","Cs(D2d)","E"}},

        {{"C4v"},
         {"C4v","C4","C2v","C2","Cs(C4v)","E"}},

        {{"D4"},
         {"D4","C4","D2","C2","C2(D)","E"}},
 
        {{"C4h"},
         {"C4h","C4","S4","C2h","C2","Ci","Cs","E"}},

        {{"S4"},
         {"S4","C2","E"}},
        
        {{"C4"},
         {"C4","C2","E"}},

        // orthorombic
        {{"D2h"},
         {"D2h","D2","C2v","C2h","C2","Ci","Cs","E"}},

        {{"C2v"},
         {"C2v","C2","Cs(C2v)","E"}},
 
        {{"D2"},
         {"D2","C2","E"}},
	 
        // triclinic
        {{"C2h"},
         {"C2h","C2","Ci","Cs","E"}},
	
        {{"Cs"},
         {"Cs","E"}},
	 
        {{"C2"},
         {"C2","E"}},
	  
        // monoclinic
        {{"Ci"},
         {"Ci","E"}},
	
        {{"E"},
         {"E"}},
	 
        // Non-crystallographic groups
        // icosahedral
        {{"Ih"}, // complete !
         {"Ih","I","Th","T","D5d(I)","D5(I)","S10(I)","C5v(I)","C5(I)",
          "D3d(I)","D3(I)","S6(I)","C3v(I)","C3(I)", "D2h","D2","C2v","C2h","C2","Ci","Cs","E"}},
        
        {{"I"},  // complete
         {"I","T","D5(I)","C5(I)","D3(I)","C3(I)","D2","C2","E"}},
       
        // other groups	  
        // subgroups of D4d not mentioned elsewhere
        {{"D4d"},
         {"D4d","S8","D4","C4v","C4","D2","C2v","C2","C2(D)","Cs(D4d)","E"}},

        {{"S8"},
         {"S8","C4","C2","E"}},
	 
	 
        // subgroups of D5d
        {{"D5d"},
         {"D5d","S10","D5","C5v","C5","C2h(D)","C2(D)","Ci","Cs(D5d)","E"}},
	  
        {{"S10"},
         {"S10","C5","Ci","E"}},
      
        {{"D5h"},
         {"D5h","D5","C5h","C5v","C5","C2v(D)","C2(D)","Cs(D5h)","Cs","E"}},
	 
        {{"D5"},
         {"D5","C5","C2(D)","E"}},
       
        {{"C5h"},
         {"C5h","C5","Cs","E"}},
       
        {{"C5v"},
         {"C5v","C5","Cs(C5v)","E"}},
        
        // subgroups of D6d not mentioned elsewhere       
        {{"D6d"}, 
         {"D6d","S12","D6","C6v","C6","D3","C3v","C3","S4","D2","C2v","C2","C2(D)","Cs(D6d)","E"}},

        {{"S12"},
         {"S12","C6","C3","S4","C2","E"}},
     
        // subgroups of D7d (same subgroup lattice structure as D5d or D3d or D_prime_d !!)
        {{"D7d"},
         {"D7d","S14","D7","C7v","C7","C2h(D)","C2(D)","Ci","Cs(D7d)","E"}},

        // subgroups of D8d 
        {{"D8d"},
         {"D8d","E"}}, //TODO 
        // subgroups of D8d 
        {{"D9d"},
         {"D9d","E"}}, //TODO 
        {{"D10d"},
         {"D10d","E"}}, //TODO 
        {{"D11d"},
         {"D11d","E"}}, //TODO 
        {{"D12d"},
         {"D12d","E"}}, //TODO 
       
        {{"S14"},
         {"S14","C7","Ci","E"}},
       
        {{"D7h"},
         {"D7h","D7","C7h","C7v","C7","C2v(D)","C2(D)","Cs(D7h)","Cs","E"}},
      
        {{"D7"},
         {"D7","C7","C2(D)","E"}},
        
        {{"C7h"},
         {"C7h","C7","Cs","E"}},
       
        {{"C7v"},
         {"C7v","C7","Cs(C7v)","E"}},
         
    };

    // PB! end 
    public static String [] getSubgroups(String group){

        for(int i=0; i < subgroups.length; i++){
            if(subgroups[i][0][0].equals(group))
                return subgroups[i][1];
        }
        // not found anything 
        return new String[]{group};
    }


    static double gam = (Math.sqrt(5)+1)/2;

    static public String[] getSymmetryNames(){
        Hashtable ht = new Hashtable();
        for(int i=0; i < allgroups.length; i++){
            ht.put(allgroups[i],allgroups[i]);
        }
    
        String snames [] = new String[ht.size()];
        int c = 0;
        for(Enumeration e = ht.elements();  e.hasMoreElements(); ){
            snames[c++] = (String)e.nextElement();
        }
        QSort.quickSort(snames,0,snames.length-1,new StringComparator());
        return snames;
    }

    public static CanonicalTester getCanonicalTester(String symmetry){

        if(symmetry.equals("E") || symmetry.equals("C1")) {
            return new Test_E();
        } else if(symmetry.equals("O")) {
            return new Test_O();
        } else if(symmetry.equals("Oh")) {
            return new Test_Oh();
        } else if(symmetry.equals("I")) {
            return new Test_I();
        } else if(symmetry.equals("Ih")) {
            return new Test_Ih();
        } else if(symmetry.equals("T")) {
            //return getT();
        } else if(symmetry.equals("Th")) {
            //return getTh();
        } else if(symmetry.equals("Td")) {
            //return getTd();
        } else if(symmetry.equals("D3d")) {
            return new Test_Dnd(3);
        } else if(symmetry.equals("D4d")) {
            return new Test_Dnd(4);
        } else if(symmetry.equals("D5d")) {
            return new Test_Dnd(5);
        } else if(symmetry.equals("D6d")) {
            return new Test_Dnd(6);
        } else if(symmetry.equals("D7d")) {
            return new Test_Dnd(7);
        } else if(symmetry.equals("D8d")) {
            return new Test_Dnd(8);
        } else if(symmetry.equals("D9d")) {
            return new Test_Dnd(9);
        } else if(symmetry.equals("D10d")) {
            return new Test_Dnd(10);
        } else if(symmetry.equals("D11d")) {
            return new Test_Dnd(11);
        } else if(symmetry.equals("D12d")) {
            return new Test_Dnd(12);
        } else if(symmetry.equals("D3")) {
            return new Test_Dn(3);
        } else if(symmetry.equals("D4")) {
            return new Test_Dnd(4);
        } else if(symmetry.equals("D5")) {
            return new Test_Dn(5);
        } else if(symmetry.equals("D6")) {
            return new Test_Dn(6);
        } else if(symmetry.equals("D7")) {
            return new Test_Dn(7);
        } else if(symmetry.equals("D8")) {
            return new Test_Dn(8);
        } else if(symmetry.equals("D9")) {
            return new Test_Dn(9);
        } else if(symmetry.equals("D10")) {
            return new Test_Dn(10);
        } else if(symmetry.equals("D11")) {
            return new Test_Dn(11);
        } else if(symmetry.equals("D12")) {
            return new Test_Dn(12);
        }      
        //println("using fake canonical tester for symmetry [" + symmetry + "]");
        return new Test_Fake();
    }

    static final double TOL = Vector3D.TOL;

    public interface CanonicalTester {
        public boolean test(Vector3D v);    
    }

    public static class Test_Oh implements CanonicalTester {

        Vector3D norm1 = new Vector3D(1,-1,0).normalize();
        Vector3D norm2 = new Vector3D(-1,0,1).normalize();

        public boolean test(Vector3D v){
            /*
              triangle (0,0,1), (1,1,1), (1,0,1)
            */
            if(v.y < -TOL)
                return false;
            if(norm1.dot(v) < -TOL)
                return false;
            if(norm2.dot(v) < -TOL)
                return false;
            return true;
        }
    }			

    public static class Test_O implements CanonicalTester {

        Vector3D norm1 = new Vector3D(1,-1,0).normalize();
        Vector3D norm2 = new Vector3D(-1,0,1).normalize();
        Vector3D norm3 = new Vector3D(1,1,0).normalize();

        public boolean test(Vector3D v){
            /*
              closed triangle (0,0,1), (1,1,1), (1,0,1)
              + open triangle (0,0,1), (1,-1,1), (1,0,1)
            */
            if(norm1.dot(v) < -TOL)
                return false;
            if(norm2.dot(v) < -TOL)
                return false;
            if(v.y > -TOL) // inside of upper triangle 
                return true; 
            if(norm3.dot(v) < TOL)
                return false;
            if(norm2.dot(v) < TOL)
                return false;
            return true;
        }
    }			

    public static class Test_Ih implements CanonicalTester {

        Vector3D norm = new Vector3D(1,0,gam).cross(new Vector3D(0,1/gam,gam)).normalize();

        public boolean test(Vector3D v){
            // canonical triagle is triangle between Z-axis (0,0,1), 
            // 5-fold axis (1,0,gam)
            // and 3-fold axis (0,1/gam,gam)
            if(v.x < -TOL)
                return false;
            if(v.y < -TOL)
                return false;
            if(norm.dot(v) < -TOL)
                return false;
            return true;
        }
    }			

    public static class Test_I implements CanonicalTester {


        Vector3D norm1 = new Vector3D(1,0,gam).cross(new Vector3D(0,1/gam,gam)).normalize();
        Vector3D norm2 = new Vector3D(0,-1/gam,gam).cross(new Vector3D(1,0,gam)).normalize();

        public boolean test(Vector3D v){

            // canonical area is a union of closed triangle 
            // (0,0,1),(1,0,g),(0,1/g,g)
            // and open triagle (0,0,1),(1,0,g),(0,-1/g,g)
      
            if(v.x < -TOL) 
                return false;
            if(norm1.dot(v) < -TOL) // upper side of top triangle 
                return false;
            if(v.y > -TOL) // upper triangle 
                return true;  
            if(v.x < TOL)  // to the left from lower triangle 
                return false;
            if(norm2.dot(v) < TOL) // below lower triangle 
                return false;
            return true;
        }
    }			

    public static class Test_E implements CanonicalTester {

        public boolean test(Vector3D v){
            return true;
        }
    }			

    public static class Test_Dnd implements CanonicalTester {

        int m_order = 3;
        Vector3D normal;

        Test_Dnd(int order){
            m_order = order;
            double phi = 2*Math.PI/m_order;
            normal = new Vector3D(Math.sin(phi),-Math.cos(phi) ,0);
      
        }

        public boolean test(Vector3D v){

            if(v.y < 0)
                return false; 
            if(v.z < 0)
                return false; 
            if(normal.dot(v) < 0)
                return false;
      
            return true;
        }
    
    }

    public static class Test_Dn implements CanonicalTester {

        int m_order = 3;
        Vector3D normal;

        Test_Dn(int order){
            m_order = order;
            double phi = 2*Math.PI/m_order;
            normal = new Vector3D(Math.sin(phi),-Math.cos(phi) ,0);
      
        }

        public boolean test(Vector3D v){

            if(v.y < 0)
                return false; 
            if(v.z < 0)
                return false; 
            if(normal.dot(v) < 0)
                return false;
      
            return true;
        }
    
    }

    /*
      this class just defines first vector as canonical 
      this is temporary solution untill all OK symmetris are implemented
    */
    public static class Test_Fake implements CanonicalTester {

        public boolean test(Vector3D v){
            return true;
        }
    }			


    public static Vector3Dsym[] getOrbit(Vector3D v, String symmetry, int index){

        Matrix3D[] sm = getMatrices(symmetry);
        Vector arr = new Vector();
        Hashtable ht = new Hashtable();
    
        for(int i=0; i < sm.length; i++){
            Vector3D v1 = v.mul(sm[i]);
            if(ht.get(v1) == null){
                ht.put(v1,v1);
                arr.addElement(new Vector3Dsym(v1,v,sm[i],index));
            }
        }
        Vector3Dsym[] result = new Vector3Dsym[arr.size()];
        arr.copyInto(result);
        return result;
    }

    static void main(String[] args){

        String symm = "Oh";
        Matrix3D[] matr = getMatrices(symm);
        CanonicalTester tester = getCanonicalTester(symm);
        Vector3D v = new Vector3D(1,1,1);
        Vector3D vv[] = new Vector3D[matr.length];
        for(int i=0; i < vv.length; i++){
            vv[i] = v.mul(matr[i]);
        }
    
        for(int i =0; i <  vv.length; i++){
            boolean result = tester.test(vv[i]);
            if(result){
                println("i: " + i + " v: " + vv[i]);
            }
        }
        /*
          int N = 10000;
          for(int i =0; i < N; i++){
          Vector3D v = new Vector3D(2*Math.random()-1,2*Math.random()-1,2*Math.random()-1).normalize();      
          Vector3D p = make_canonical_point_Th(v);
          //Vector3D p = make_canonical_point_Td(v);
          //Vector3D p = make_canonical_point_Oh(v);
          //Vector3D p = make_canonical_point_Ih(v);
          if(p.x > 0){ // Ih, Oh, Th
          //if(p.x > p.y){ // Td
          System.out.println("Point{v " + v.x + " " + v.y + " " + v.z + " c " + "0 0 1}"); 
          } else {
          System.out.println("Point{v " + v.x + " " + v.y + " " + v.z + " c " + "1 0 0}"); 
          }
          }
        */
    }
  
} // class Symmetry




  /*
    subgroups of Ih 
    I    [3, 5]+ = A_5           Icosahedral
    Th   [3+, 4]   = A_4 x C_2   Central tetrahedral  - 
    T    [3, 3]+   = A_4         Tetrahedral          - rotational symmetry of tetrahedron
    D5d  [10, 2+]  = D_10        Diploid skew 10-gonal - full symmetry of pentagonal antiprism.
    D5   [5, 2]+   = D_5         5-dihedral            - rotational symmetry of pentagonal antiprism.
    D3d  [6, 2+]   = D_6         Diploid skew 6-gonal - full symmetry of trigonal antiprism.
    D3   [3, 2]+   = D_3         3-dihedral           - rotational symmetry of trigonal antiprism.

    subgroups of Oh

    Oh   [3, 4]  = S_4 x C_2   Diploid octahedral
    O    [3, 4]+ = S_4         Octahedral
    Td   [3, 3]  = S_4         Diploid tetrahedral
    Th   [3+, 4] = A_4 x C_2   Central tetrahedral
    T    [3, 3]+ = A_4         Tetrahedral


    D4d    [8, 2+]  =  D_8         Diploid skew 8-gonal
    D4h    [4, 2]    = D_4 x D_1   Diploid 4-dihedral
    D4     [4, 2]+   = D_4         4-dihedral

    D3     [3, 2]+   = D_3         3-dihedral            
    D3d    [6, 2+]  =  D_6         Diploid skew 3-gonal

  */
