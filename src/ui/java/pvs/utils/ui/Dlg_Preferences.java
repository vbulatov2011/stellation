/**
 * 
 *
 */

package pvs.utils.ui;

//import javax.swing.*;
import java.awt.Button;
import java.awt.Component;
import java.awt.Container;
import java.awt.Dialog;
import java.awt.Dimension;
import java.awt.Frame;
import java.awt.GridBagConstraints;
import java.awt.GridBagLayout;
import java.awt.GridLayout;
import java.awt.Label;
import java.awt.Panel;
import java.awt.TextField;
import java.awt.Toolkit;
//import javax.swing.event.*;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.StreamTokenizer;
import java.util.Vector;

import pvs.utils.Parameter;

//import sap.speechui.*;
//import sap.util.*;


public class Dlg_Preferences 
{

  public static void readPreferences(String filePath, Parameter[] param){

    try {
      
      BufferedReader in = new BufferedReader(new FileReader(filePath)); 
      
      StreamTokenizer st = new StreamTokenizer(in);
      st.parseNumbers();
      st.whitespaceChars((int)'=',(int)'=');
      st.slashSlashComments(true);
      st.slashStarComments(true);
      st.eolIsSignificant(false);
      st.quoteChar('\"'); 
      st.wordChars('_','_'); 
      st.ordinaryChar('.'); 
      
      Vector parameters = new Vector();

      while(st.nextToken() != st.TT_EOF){	
	switch(st.ttype){
	case '\"':	
	case StreamTokenizer.TT_WORD:	
	  parameters.addElement(st.sval);
	  //st.nextToken();  // parameters should be always in pairs
	  //parameters.addElement(st.sval);
	  break;
	case StreamTokenizer.TT_EOL:
	  break;
	case StreamTokenizer.TT_NUMBER:
	  if( st.nval == (int)st.nval)
	    parameters.addElement(String.valueOf((int)st.nval));
	  else 
	    parameters.addElement(String.valueOf(st.nval));
	  break;
	default: // should not happens 
	  System.out.println("line: " + st.lineno());
	  System.out.println("wrong character in parameters: " + (char)st.ttype + "(" + st.ttype + ")");
	  return;	
	}
      }                
      for(int i = 0; i < parameters.size()/2; i++){

	String name = (String)parameters.elementAt(i*2);
	String value = (String)parameters.elementAt(i*2+1);
	for(int k = 0; k < param.length; k++){
	  if(param[k].getName().equalsIgnoreCase(name)){
	    param[k].setValue(value);
	    break;
	  }
	}
      }
    } catch (Exception e){
      
    }
  }

  public static void savePreferences(String filePath, Parameter[] param){
    
    try {
      BufferedWriter out = new BufferedWriter(new FileWriter(filePath)); 
      for(int i=0; i < param.length; i++){
	out.write(param[i].getName());
	out.write(" = ");
	out.write(param[i].getValue());
	out.newLine();
      }
      out.close();
    } catch (Exception e){
      
    }

  }

  private void savePreferences(){

    savePreferences(filePath, param);

  }

  String filePath;
  
  Parameter param[];  
  Component[] paramField;
  
  boolean result = false;
  Dialog dialog;

  public void makeDialog(Frame frame, Parameter [] param, String title, String filePath){
    
    dialog = new Dialog(frame, title);

    this.filePath = filePath; 
    this.param = param;
    
    //dialog.setTitle(title);
    //JRootPane rpane = getRootPane();
    Container cont = dialog;//.getContentPane();
    GridBagLayout gbl = new GridBagLayout();
    cont.setLayout(gbl);
    
    Panel ppan = new Panel();
    ppan.setLayout(gbl);

    paramField = new Component[param.length];

    for(int i=0; i < param.length; i++){
      
      WindowUtils.constrain(ppan,new Label(param[i].getName()), 0,i,1,1,gbc.NONE,gbc.CENTER, 0.,1.,3,3,3,0);
      paramField[i] = new TextField(param[i].getValue());
      WindowUtils.constrain(ppan,paramField[i], 1,i,1,1,gbc.BOTH,gbc.CENTER, 1.,1.);
    }

    Panel bpan = new Panel();
    bpan.setLayout(new GridLayout(1,2));

    Button btnCancel = new Button("Cancel");
    //btnCancel.setMnemonic('C');
    ActionListener onCancel = new OnCancel();
    btnCancel.addActionListener(onCancel);
    /*
    btnCancel.registerKeyboardAction(onCancel, null, 
				     KeyStroke.getKeyStroke(KeyEvent.VK_ESCAPE,0), 
				     JComponent.WHEN_IN_FOCUSED_WINDOW);
    */
    Button  btnOK = new Button("OK");
    btnOK.addActionListener(new OnOK());
    //btnOK.setMnemonic('O');
    //btnOK.setDefaultCapable(true);
    //rpane.setDefaultButton(btnOK);

    bpan.add(btnCancel);
    bpan.add(btnOK);
  
    WindowUtils.constrain(cont, ppan, 0,0,1,1,gbc.HORIZONTAL,gbc.CENTER,1.,0.);
    WindowUtils.constrain(cont, bpan, 0,1,1,1,gbc.HORIZONTAL,gbc.CENTER,0.,0.);

    dialog.pack();
    Dimension dimd = dialog.getPreferredSize();
    Dimension dims = Toolkit.getDefaultToolkit().getScreenSize();
    dialog.setLocation((dims.width-dimd.width)/2,(dims.height-dimd.height)/2);

  }

  public boolean edit(){

    dialog.setModal(true);
    dialog.show();    
    return result;

  }
 
  class OnOK implements ActionListener {

    public void actionPerformed(ActionEvent e){
      
      for(int i=0; i < param.length; i++){
	param[i].setValue(((TextField)paramField[i]).getText());
      }
      
      dialog.setVisible(false);
      savePreferences();
      result = true;
    }
  }
  
  class OnCancel implements ActionListener {

    public void actionPerformed(ActionEvent e){

      dialog.setVisible(false);
      result = false;
    }
  }

  static private GridBagConstraints gbc = new GridBagConstraints();

  public static void main(String[] args){
    
  }
    
}
