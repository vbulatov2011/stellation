package pvs.polyhedra.stellation;

import java.io.*;
import java.util.*;
import java.awt.*;
import java.awt.event.*;
import java.net.URL;
import java.applet.*;


import pvs.polyhedra.Plane;
import pvs.polyhedra.*;
import pvs.utils.*;
import pvs.Expression.*;

import static pvs.utils.WindowUtils.constrain;
import static pvs.utils.Output.fmt;
import static pvs.utils.Output.printf;
import static pvs.polyhedra.stellation.Utils.getString;
import static pvs.polyhedra.stellation.Utils.copyPlanes;
import static pvs.polyhedra.stellation.Utils.planesToVectors;
import static pvs.polyhedra.stellation.Utils.vectorsToPlanes;

public class DlgPlanes {

    static final boolean DEBUG = true;
    Plane[] m_generatingPlanes;
    String polySymmetry = "";

    public DlgPlanes(Plane[] planes, String polySymmetry){
        // this is to initialize planes with initial values
        //generatingPlanes = vectorsToPlanes(vectors);
        m_generatingPlanes = copyPlanes(planes);
        this.polySymmetry = polySymmetry;    
       
    }

    Dialog dialog; 

    public boolean edit(Frame frame){

        if(dialog == null)
            createUI(frame);

        initUI();

        btnOK.setEnabled(false);
        dialog.show();

        return result;
    
    }
  
    public String getSymmetry(){
        return polySymmetry;
    }

    public Plane[] getGeneratingPlanes(){
        
        return m_generatingPlanes;
        //return planesToVectors(m_generatingPlanes);
    }

    Vector3D[] m_allPlanes = new Vector3D[0];
    boolean result;
    static final int MAXPLANES = 12;

    TextArea textArea = new TextArea();
    TextField normalX[] = new TextField[MAXPLANES];
    TextField normalY[] = new TextField[MAXPLANES];
    TextField normalZ[] = new TextField[MAXPLANES];
    TextField pntX[] = new TextField[MAXPLANES];
    TextField pntY[] = new TextField[MAXPLANES];
    TextField pntZ[] = new TextField[MAXPLANES];

    Choice choiceSymmetry = new Choice();

    Button btnOK = new Button("OK");
    Button btnCancel = new Button("Cancel");
    Button btnGenerate = new Button("Generate");

    static String symnames[] = Symmetry.getSymmetryNames();
    /*
      new String[] {"T","Th","Td",
      "Td","T","D3_T","D2d","C2","Ci","Cs","E",
      "Ih","I","Th","T","D5d(I)","D5(I)","C5v(I)","C5(I)","D3d(I)","D3(I)",
      "C3v(I)","C3(I)", "D2h","D2","C2",
      "Oh","O","Th","Td","T","D4h","D4d","D4","D3d(O)","D3(O)","C3v(O)","C3(O)",
      "D2h","D2d","D2","C2","D2h(O)","D2(O)","C2(O)",    
      "D3d","D4d","D5d","D6d","D7d","D8d","D9d","D10d","D11d","D12d",
      "D3h","D4h","D5h","D6h","D7h",
      "D3","D4","D5","D6","D7"};
    */


    void createUI(Frame frame){

        dialog = new Dialog(frame);
        dialog.setTitle("Make Planes");

        GridBagLayout gb = new GridBagLayout();
        dialog.setLayout(gb);

        Panel panel1 = new Panel();
        panel1.setLayout(gb);
        
        {
            int c = 0;
            constrain(panel1,new Label("plane "),c++,0,1,1, gbc.NONE, gbc.CENTER,0.,0.);
            constrain(panel1,new Label("Nx "),    c++,0,1,1, gbc.NONE, gbc.CENTER,1.,0.);
            constrain(panel1,new Label("Ny "),    c++,0,1,1, gbc.NONE, gbc.CENTER,1.,0.);
            constrain(panel1,new Label("Nz "),    c++,0,1,1, gbc.NONE, gbc.CENTER,1.,0.);
            //constrain(panel1,new Label("Px "),    c++,0,1,1, gbc.NONE, gbc.CENTER,1.,0.);
            //constrain(panel1,new Label("Py "),    c++,0,1,1, gbc.NONE, gbc.CENTER,1.,0.);
            //constrain(panel1,new Label("Pz "),    c++,0,1,1, gbc.NONE, gbc.CENTER,1.,0.);
        }

        for(int k = 0; k < symnames.length; k++){
            choiceSymmetry.addItem(symnames[k]);
        }

        for(int i =0; i < MAXPLANES; i++){
            int tfSize = 12;
            normalX[i] = new TextField(tfSize);
            normalY[i] = new TextField(tfSize);
            normalZ[i] = new TextField(tfSize);
            pntX[i] = new TextField(tfSize);
            pntY[i] = new TextField(tfSize);
            pntZ[i] = new TextField(tfSize);
            int y = (i+1);
            int c = 0;
            constrain(panel1,new Label(""+y),c++,y,1,1, gbc.NONE, gbc.CENTER,0.,0.);
            constrain(panel1,normalX[i], c++,y,1,1, gbc.HORIZONTAL, gbc.NORTH,1.,0.);
            constrain(panel1,normalY[i], c++,y,1,1, gbc.HORIZONTAL, gbc.NORTH,1.,0.);
            constrain(panel1,normalZ[i], c++,y,1,1, gbc.HORIZONTAL, gbc.NORTH,1.,0.);
            constrain(panel1,pntX[i], c++,y,1,1, gbc.HORIZONTAL, gbc.NORTH,1.,0.);
            constrain(panel1,pntY[i], c++,y,1,1, gbc.HORIZONTAL, gbc.NORTH,1.,0.);
            constrain(panel1,pntZ[i], c++,y,1,1, gbc.HORIZONTAL, gbc.NORTH,1.,0.);
      
        }
    

    
        Panel panelBtn = new Panel();
        btnOK.setEnabled(false);
        panelBtn.setLayout(new GridLayout(1,3,3,3));
        panelBtn.add(btnGenerate);
        panelBtn.add(btnOK);
        panelBtn.add(btnCancel);
        btnOK.addActionListener(new OnOK());
        btnCancel.addActionListener(new OnCancel());
        btnGenerate.addActionListener(new OnGenerate());

        Panel symPanel = new Panel();    symPanel.setLayout(gb);
        constrain(symPanel,new Label("Symmetry "), 0,0,1,1, gbc.NONE, gbc.CENTER,0.,0.);
        constrain(symPanel,choiceSymmetry,1,0,1,1, gbc.NONE, gbc.CENTER,0.,0.);
    
        Panel panel2 = new Panel();panel2.setLayout(gb);
        constrain(panel2,symPanel, 0,0,1,1,   gbc.NONE, gbc.CENTER,0.,0.,0,0,10,0);
        constrain(panel2,panelBtn, 1,0,1,1, gbc.NONE, gbc.CENTER,0.,0.);
    
        constrain(dialog,panel1,0,0,1,1,gbc.HORIZONTAL, gbc.NORTH,1.,0.);
        constrain(dialog,textArea,0,1,1,1,gbc.BOTH, gbc.NORTH,1.,1.);    
        constrain(dialog,panel2,0,2,1,1,gbc.NONE, gbc.CENTER,0.,0.,3,3,3,3);    
    

        dialog.addWindowListener(new CloseWindowListener());
    
        dialog.pack();
        dialog.validate();
        dialog.setModal(true);
        
    }

    Parser parser;

    void writeVector(Vector3D v){

        textArea.append(Fmt.fmt(v.x,17,14));      
        textArea.append(Fmt.fmt(v.y,17,14));
        textArea.append(Fmt.fmt(v.z,17,14));

    }

    /**
       may be called form outside to re-init dialog 
     */
    //public void setVectors(Vector3D[] vectors, String sym){
    //    m_generatingPlanes = vectorsToPlanes(vectors);        
    //}

    public void setPlanes(Plane[] planes, String sym){
        
        polySymmetry = sym;
        m_generatingPlanes = copyPlanes(planes);
        initUI();
        
    }
    
    void initUI(){

        if(DEBUG)printf("%s.initUI()\n",this);
        if(DEBUG){
            for(int i = 0; i < m_generatingPlanes.length; i++){
                printf("%s\n", m_generatingPlanes[i]);
            }
        } 
        
        

        choiceSymmetry.select(polySymmetry);
        
        for(int i=0; i < m_generatingPlanes.length; i++){
            if(i < normalX.length){
                //printf("genPlane[%2d]: (%7.5f,%7.5f,%7.5f)\n",i,m_generatingPlanes[i].x,m_generatingPlanes[i].y,m_generatingPlanes[i].z);
                //System.out.println("" + i + " ," + planes[i] + ", " + normalX[i]);
                Vector3D norm = m_generatingPlanes[i].getNormal();
                Vector3D point = m_generatingPlanes[i].getPoint();
                normalX[i].setText(getString(norm.x));
                normalY[i].setText(getString(norm.y));
                normalZ[i].setText(getString(norm.z));
                pntX[i].setText(getString(point.x));
                pntY[i].setText(getString(point.y));
                pntZ[i].setText(getString(point.z));
            }
        }
        // clean the rest 
        for(int i=m_generatingPlanes.length; i < normalX.length; i++){
            normalX[i].setText("");
            normalY[i].setText("");
            normalZ[i].setText("");
            pntX[i].setText("");
            pntY[i].setText("");
            pntZ[i].setText("");
        }
        
    }
    
    static final double EPS = 1.e-12;
    
    static double chop(double v){
        if(v < -EPS || v > EPS)
            return v;
        else 
            return 0;    
    }
    
    /*
    public String getSourceVectorsAsString6(){
        
        StringBuffer ba = new StringBuffer();
        ba.append("[");
        for(int i =0; i < MAXPLANES; i++){      
            String tx = normalX[i].getText();
            String ty = normalY[i].getText();
            String tz = normalZ[i].getText();
            String px = pntX[i].getText();
            String py = pntY[i].getText();
            String pz = pntZ[i].getText();
            
            if(tx.length()>0 && ty.length()>0 && tz.length() > 0 &&
               px.length()>0 && py.length()>0 && pz.length() > 0 
               ){
                ba.append("(");
                ba.append(tx);
                ba.append(",");
                ba.append(ty);
                ba.append(",");
                ba.append(tz);
                ba.append(",");
                ba.append(px);
                ba.append(",");
                ba.append(py);
                ba.append(",");
                ba.append(pz);
                ba.append(")");
            }
        }
        ba.append("]");
        return ba.toString();
    }
    
    public String getSourceVectorsAsString(){
        
        StringBuffer ba = new StringBuffer();
        ba.append("[");
        for(int i =0; i < MAXPLANES; i++){      
            String tx = normalX[i].getText();
            String ty = normalY[i].getText();
            String tz = normalZ[i].getText();
            
            if(tx.length()>0 && ty.length()>0 && tz.length() > 0){
                ba.append("(");
                ba.append(tx);
                ba.append(",");
                ba.append(ty);
                ba.append(",");
                ba.append(tz);
                ba.append(")");
            }
        }
        ba.append("]");
        return ba.toString();
    }
    */

    Vector3D readPlane6(int i){
        String tnx = normalX[i].getText();
        String tny = normalY[i].getText();
        String tnz = normalZ[i].getText();        
        String tpx = pntX[i].getText();
        String tpy = pntY[i].getText();
        String tpz = pntZ[i].getText();
        if(tnx.length()>0 && tny.length()>0 && tnz.length() > 0 &&
           tpx.length()>0 && tpy.length()>0 && tpz.length() > 0 
           ){
            double nx = calculate(tnx);
            double ny = calculate(tny);
            double nz = calculate(tnz);
            double px = calculate(tpx);
            double py = calculate(tpy);
            double pz = calculate(tpz);
            Vector3D n = new Vector3D(nx, ny, nz);
            n.normalize();
            Vector3D p = new Vector3D(px, py, pz);
            n.mulSet(n.dot(p));
            return n;
        } else {
            return null;
        }       
    }

    Vector3D readPlane(int i){
        String tnx = normalX[i].getText();
        String tny = normalY[i].getText();
        String tnz = normalZ[i].getText();        
        if(tnx.length()>0 && tny.length()>0 && tnz.length() > 0){
            double nx = calculate(tnx);
            double ny = calculate(tny);
            double nz = calculate(tnz);
            Vector3D p = new Vector3D(nx, ny, nz);
            return p;
        } else {
            return null;
        }
        
    }

    /**
       generatePlanes(){
       
    */
    public void generatePlanes(){
        
        parser = new Parser();
        
        polySymmetry = choiceSymmetry.getSelectedItem();
        
        Vector vectors = new Vector();
        for(int i =0; i < MAXPLANES; i++){   
            Vector3D plane = readPlane(i);
            if(plane != null) 
                vectors.addElement(plane);            
        }
        textArea.append("\n");
        textArea.append("source vectors\n");
        for(int i = 0; i < vectors.size(); i++){
            Vector3D v = (Vector3D)vectors.elementAt(i);
            writeVector(v);            
            textArea.append("\n");
        }
        Vector3D vv[] = new Vector3D[vectors.size()];
        vectors.copyInto(vv);
        m_allPlanes = Utils.transformVectors(vv, polySymmetry);
        textArea.append(fmt("transformed vectors:%d \n",m_allPlanes.length));
        for(int i = 0; i < m_allPlanes.length; i++){
            textArea.append(m_allPlanes[i].toString());
            textArea.append("\n");
        }

        /*
        //textArea.append("transformed vectors\n");
        Matrix3D[] matr = Symmetry.getMatrices(polySymmetry);
        Hashtable ht = new Hashtable();
        for(int i = 0; i < vectors.size(); i++){
            Vector3D v = (Vector3D)vectors.elementAt(i);
            for(int k =0; k < matr.length; k++){
                Vector3D v1 = v.mul(matr[k]);
                //textArea.append(v1.toString());
                //textArea.append("\n");
                if(ht.get(v1) == null)
                    ht.put(v1,v1);
            }
        }
        
        textArea.append(fmt("unsorted vectors %d\n", ht.size()));
        int count = 0;
        m_allPlanes = new Vector3D[ht.size()];
        for(Enumeration e = ht.keys(); e.hasMoreElements();){
            Vector3D v = (Vector3D)e.nextElement();      
            textArea.append(v.toString());
            textArea.append("\n");
            m_allPlanes[count++] = v;
        }
        */
        /*
        textArea.append(fmt("count:%d\n", ht.size())); 
        textArea.append("dot   cross\n");         
        double dot[][] = new double[planes.length][2];
        for(int i = 0; i < planes.length; i++){
            dot[i][0] = planes[0].dot(planes[i]);
            dot[i][1] = planes[0].cross(planes[i]).length();
        }
        QSort.quickSort(dot,0,planes.length-1,new DotComparator());
        
        for(int i = 0; i < planes.length; i++){
            textArea.append(fmt("%17.14f %17.14f\n",dot[i][0], dot[i][1]));
        }
        */
        btnOK.setEnabled(true);
        
    }
        
    class DotComparator implements pvs.utils.Comparator {
        
        public int compare(Object o1, Object o2){
            double [] a1 = (double[] )o1;
            double [] a2 = (double[] )o2;
            if(a1[0] > a2[0])
                return 1;
            else if(a1[0] < a2[0])
                return -1;
            return 0;	      
        }
    }
    
    public double calculate(String s){
        
        double result = 0;
        try {
            Expr expr = parser.parse (s);
            Variable g = expr.getVariable ("g");
            g.setValue((Math.sqrt(5)+1)/2);
            
            Variable pi = expr.getVariable ("pi");
            pi.setValue(Math.PI);
            
            result = expr.value();
            
        } catch(Exception e){
            System.out.println("Exception during calculating " + s);
        }
        
        return result;
    }
    
    class OnGenerate implements java.awt.event.ActionListener{
        
        public void actionPerformed(ActionEvent e){
            
            textArea.setText("Generating vectors");
            generatePlanes();
        }    
    }
    
    class OnOK implements java.awt.event.ActionListener{
        
        public void actionPerformed(ActionEvent e){
            dialog.setVisible(false);
            dialog.dispose();
            result = true;
        }    
    }
    
    class OnCancel implements java.awt.event.ActionListener{
        
        public void actionPerformed(ActionEvent e){
            dialog.setVisible(false);
            dialog.dispose();
            result = false;
        }    
    }
    
    class CloseWindowListener extends WindowAdapter {
        
        public void  windowClosing(WindowEvent e){
            dialog.setVisible(false);
            dialog.dispose();
            result = false;      
        }
    }
    
    static private GridBagConstraints gbc = new GridBagConstraints();

    
    
    static void main(String args[]){
        Frame fr = new Frame();
        //new DlgPlanes().getPlanes(fr);
        System.exit(0);
    }
    
}
