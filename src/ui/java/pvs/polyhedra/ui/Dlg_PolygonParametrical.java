package pvs.polyhedra.ui;

import java.awt.Button;
import java.awt.Color;
import java.awt.Font;
import java.awt.Frame;
import java.awt.GridBagConstraints;
import java.awt.GridBagLayout;
import java.awt.Label;
import java.awt.Panel;
import java.awt.TextArea;
import java.awt.TextField;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;

import pvs.Expression.Parser;
import pvs.polyhedra.PolygonParametrical;
import pvs.utils.ui.WindowUtils;


/**

 */
class Dlg_PolygonParametrical /*implements PolygonEditor*/ {

  Frame frame;

  //PVSObserver observer;
  //String polyName;

  PolygonParametrical polygon;

  public Dlg_PolygonParametrical(PolygonParametrical polygon){

    this.polygon = polygon; 
    
    //this.observer = observer;
    //this.polyName = polyName;

    makeUI();
  }
  
  public void show(){ // interface PolyEditor

    writeFileds();

    frame.show();
  }

  Button btnUpdate = new Button("Update");
  Button btnHelp = new Button("Help");
  TextField tfStart = new TextField(10);
  TextField tfEnd = new TextField(10);
  TextField tfPoints = new TextField(10);
  TextArea taExpression = new TextArea(24,80);

  void makeUI(){

    frame = new Frame("parametric polygon: " + polygon.getNodeID());

    GridBagLayout gbl = new GridBagLayout();
    frame.setLayout(gbl);
    frame.setBackground(Color.lightGray);
    taExpression.setFont(new Font("Courier",Font.PLAIN, 12));
    
    Panel panel1 = new Panel();
    panel1.setLayout(gbl);
    WindowUtils.constrain(panel1,new Label("Expresion"), 0,0,1,1, gbc.NONE, gbc.WEST,0.,0.);
    WindowUtils.constrain(panel1,taExpression,           0,1,1,1, gbc.BOTH, gbc.WEST,1.,1.);

    Panel panel2 = new Panel();
    panel2.setLayout(gbl);
    int c = 0;
    WindowUtils.constrain(panel2,new Label("Start:"),    c++,0,1,1, gbc.NONE, gbc.CENTER,0.,0.,2,2,2,2);
    WindowUtils.constrain(panel2,tfStart,                c++,0,1,1, gbc.HORIZONTAL, gbc.CENTER,1.,0.,5,2,2,2);
    WindowUtils.constrain(panel2,new Label("End:"),      c++,0,1,1, gbc.NONE, gbc.CENTER,1.,0.,2,2,2,2);
    WindowUtils.constrain(panel2,tfEnd,                  c++,0,1,1, gbc.NONE, gbc.CENTER,1.,0.,2,2,2,2);
    WindowUtils.constrain(panel2,new Label("Points:"),   c++,0,1,1, gbc.NONE, gbc.CENTER,1.,0.,2,2,2,2);
    WindowUtils.constrain(panel2,tfPoints,               c++,0,1,1, gbc.NONE, gbc.CENTER,1.,0.,2,2,2,2);
    WindowUtils.constrain(panel2,btnUpdate,              c++,0,1,1, gbc.NONE, gbc.CENTER,1.,0.,2,2,2,2);
    WindowUtils.constrain(panel2,btnHelp,                c++,0,1,1, gbc.NONE, gbc.CENTER,1.,0.,2,2,2,2);
    
    WindowUtils.constrain(frame,panel1, 0,0,1,1, gbc.BOTH, gbc.CENTER,1.,1.);
    WindowUtils.constrain(frame,panel2, 0,1,1,1, gbc.HORIZONTAL, gbc.CENTER,1.,0.);
    
    frame.pack();
    frame.addWindowListener(new PolygonDisplayWindowListener(false,frame));
    btnUpdate.addActionListener(new onUpdate());
    btnHelp.addActionListener(new OnHelp());
    

  }
  
  void writeFileds(){

    taExpression.setText(polygon.formula);
    tfStart.setText(String.valueOf(polygon.start));
    tfEnd.setText(String.valueOf(polygon.end));
    tfPoints.setText(String.valueOf(polygon.nPoints));
  }
  
  void readFields(){

    polygon.formula = taExpression.getText();
    polygon.nPoints = Integer.parseInt(tfPoints.getText());
    polygon.start = Double.valueOf(tfStart.getText()).doubleValue();
    polygon.end = Double.valueOf(tfEnd.getText()).doubleValue();

  }

  Parser parser;
    
  void update(){

    readFields();
    polygon.calculatePolygon();

  }

  class onUpdate implements ActionListener {

    public void actionPerformed(ActionEvent e){

      update();
      
    }
  }

  class OnHelp implements ActionListener {

    public void actionPerformed(ActionEvent e){

      //WindowOutputStream out = new WindowOutputStream();
      //PrintStream ps = new PrintStream(out);
      System.out.println(polygon.m_parser.getHelp());
      
    }
  }

  static private GridBagConstraints gbc = new GridBagConstraints();

}
