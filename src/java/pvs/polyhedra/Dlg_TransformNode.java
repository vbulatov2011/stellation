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

/**
 *   class Dlg_TranformNode
 *   
 */
class Dlg_TransformNode  implements PolygonEditor{

  Frame frame;
  TransformNode transform;

  //java.awt.List childrenList = new java.awt.List(10);
  TextArea taChildren = new TextArea(20,20);
  TextField tfScale = new TextField(20);
  TextField tfRotation = new TextField(20);
  TextField tfTranslation = new TextField(20);
  TextField tfMirror = new TextField(20);
  Button btnUpdate = new Button("Update");

  public Dlg_TransformNode(TransformNode transform){

    this.transform = transform;
    makeUI();
  }
  
  public void show(){

    frame.show();
  }

  void makeUI(){

    frame = new Frame("node: " + transform.getNodeID());

    GridBagLayout gbl = new GridBagLayout();
    frame.setLayout(gbl);
    frame.setBackground(Color.lightGray);


    Panel panel1 = new Panel();     panel1.setLayout(gbl);
    int c = 0;
    WindowUtils.constrain(panel1,new Label("mirror"),      0,c,1,1, gbc.NONE, gbc.EAST,0.,0.);    
    WindowUtils.constrain(panel1,tfMirror, 1,c,1,1, gbc.BOTH, gbc.CENTER,1.,1.);
    c++;
    WindowUtils.constrain(panel1,new Label("scale"),      0,c,1,1, gbc.NONE, gbc.EAST,0.,0.);    
    WindowUtils.constrain(panel1,tfScale, 1,c,1,1, gbc.BOTH, gbc.CENTER,1.,1.);
    c++;
    WindowUtils.constrain(panel1,new Label("rotation"),   0,c,1,1, gbc.NONE, gbc.EAST,0.,0.);
    WindowUtils.constrain(panel1,tfRotation, 1,c,1,1, gbc.BOTH, gbc.CENTER,1.,1.);
    c++;
    WindowUtils.constrain(panel1,new Label("tranlation"), 0,c,1,1, gbc.NONE, gbc.EAST,0.,0.);
    WindowUtils.constrain(panel1,tfTranslation, 1,c,1,1, gbc.BOTH, gbc.CENTER,1.,1.);

    Panel panel2 = new Panel();     panel2.setLayout(gbl);
    WindowUtils.constrain(panel2,taChildren,                   0,0,1,1, gbc.BOTH, gbc.WEST,1.,1.);

    Panel panel3 = new Panel();    panel3.setLayout(gbl);

    WindowUtils.constrain(panel3,btnUpdate,      0,0,1,1, gbc.NONE, gbc.CENTER,1.,1.);    
    
    WindowUtils.constrain(frame,panel1, 0,0,1,1, gbc.HORIZONTAL, gbc.CENTER,1.,0.);
    WindowUtils.constrain(frame,panel2, 0,1,1,1, gbc.BOTH, gbc.CENTER,1.,1.);
    WindowUtils.constrain(frame,panel3, 0,2,1,1, gbc.NONE, gbc.CENTER,1.,0.);
    
    initFields();

    btnUpdate.addActionListener(new onUpdate());
    frame.pack();
    frame.addWindowListener(new PolygonDisplayWindowListener(false,frame));
    
  }
      
  void initFields(){

    tfTranslation.setText(transform.translation);
    tfRotation.setText(transform.rotation);
    tfScale.setText(transform.scale);
    tfMirror.setText(transform.mirror);

    taChildren.setText(transform.getChildrenText());
    System.out.println(transform.getChildrenText());
    
  }

  void readFields(){
    
  }

  class onUpdate implements ActionListener {

    public void actionPerformed(ActionEvent e){

      transform.setMirror(tfMirror.getText());
      transform.setTranslation(tfTranslation.getText());
      transform.setRotation(tfRotation.getText());
      transform.setScale(tfScale.getText());

      // TO-DO children should be done via scene editing 
      transform.setChildren(taChildren.getText());

      transform.update(Dlg_TransformNode.this, null);
    }
  }

  static private GridBagConstraints gbc = new GridBagConstraints();

}
