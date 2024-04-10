package pvs.polyhedra;

import java.awt.event.*;
import java.awt.*;
import java.awt.geom.*;
import java.util.*;
import java.awt.*;
import java.awt.event.*;
import java.io.*;


import pvs.polyhedra.Vector3D;
import pvs.utils.*;
import pvs.Expression.*;
import pvs.polyhedra.stellation.DlgPrint;


class Dlg_PolygonArray  implements PolygonEditor {

  Frame frame;

  //PVSObserver observer;
  //String polyName;
  PolygonArray polygon;

  public Dlg_PolygonArray(PolygonArray polygon){

    this.polygon = polygon;
    makeUI();
  }
  
  public void show(){

    frame.show();
  }

  Button btnUpdate = new Button("Update");
  TextArea taArray = new TextArea(24,80);
  TextArea taAngles = new TextArea(3,80);
  TextField tfThickness = new TextField(20);

  void makeUI(){

    frame = new Frame("array: " + polygon.getNodeID());

    GridBagLayout gbl = new GridBagLayout();
    frame.setLayout(gbl);
    frame.setBackground(Color.lightGray);
    taArray.setFont(new Font("Courier",Font.PLAIN, 12));
    
    Panel panel1 = new Panel();
    panel1.setLayout(gbl);
    int c = 0;
    WindowUtils.constrain(panel1,new Label("Array"), 0,c++,1,1, gbc.NONE, gbc.WEST,0.,0.);
    WindowUtils.constrain(panel1,taArray,           0,c++,1,1, gbc.BOTH, gbc.WEST,1.,1.);

    WindowUtils.constrain(panel1,new Label("Thickness"), 0,c++,1,1, gbc.NONE, gbc.WEST,0.,0.);
    WindowUtils.constrain(panel1,tfThickness,                0,c++,1,1, gbc.BOTH, gbc.WEST,1.,1.);

    WindowUtils.constrain(panel1,new Label("Angles"), 0,c++,1,1, gbc.NONE, gbc.WEST,0.,0.);
    WindowUtils.constrain(panel1,taAngles,            0,c++,1,1, gbc.BOTH, gbc.WEST,1.,1.);

    Panel panel2 = new Panel();
    panel2.setLayout(gbl);
    c = 0;
    WindowUtils.constrain(panel2,btnUpdate,              c++,0,1,1, gbc.NONE, gbc.CENTER,1.,0.,2,2,2,2);
    
    WindowUtils.constrain(frame,panel1, 0,0,1,1, gbc.BOTH, gbc.CENTER,1.,1.);
    WindowUtils.constrain(frame,panel2, 0,1,1,1, gbc.HORIZONTAL, gbc.CENTER,1.,0.);
    
    initFields();

    frame.pack();
    frame.addWindowListener(new PolygonDisplayWindowListener(false,frame));
    btnUpdate.addActionListener(new onUpdate());
    

  }
    
  void initFields(){

    StringBuffer sb = new StringBuffer();

    Vector3D[] vert = polygon.getVertices(0);

    for(int i = 0; i < vert.length; i++){
      sb.append(" " + vert[i].x);
      sb.append(", " + vert[i].y);
      sb.append(", " + vert[i].z);
      if(i < vert.length-1){
        sb.append(", \n");
      } else {
        sb.append("\n");
      }


    }
    taArray.setText(sb.toString());
    
    tfThickness.setText(String.valueOf(polygon.getThickness()));
    
    sb = new StringBuffer();
    double[] angles = polygon.getAngles();
    for(int i = 0; i < angles.length; i++){
      sb.append(" " + angles[i]);
    }
    taAngles.setText(sb.toString());

  }

  void readFields(){
    

  }

  void update(){

    polygon.setPoints(taArray.getText());
    polygon.setAngles(taAngles.getText());
    polygon.setThickness(tfThickness.getText());
    polygon.calculatePolygon();
    
  }



  class onUpdate implements ActionListener {

    public void actionPerformed(ActionEvent e){

      update();
      
    }
  }

  static private GridBagConstraints gbc = new GridBagConstraints();

}
