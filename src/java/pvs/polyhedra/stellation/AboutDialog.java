package pvs.polyhedra.stellation;
//
// Copyright (C) 1997 by Vladimir Bulatov <V.Bulatov@dots.physics.orst.edu>.  
//        All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions
// are met:
// 1. Redistributions of source code must retain the above copyright
//    notice, this list of conditions and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above copyright
//    notice, this list of conditions and the following disclaimer in the
//    documentation and/or other materials provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE AUTHOR AND CONTRIBUTORS ``AS IS'' AND
// ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
// ARE DISCLAIMED.  IN NO EVENT SHALL THE AUTHOR OR CONTRIBUTORS BE LIABLE
// FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
// DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS
// OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
// HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
// LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY
// OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
// SUCH DAMAGE.

import java.awt.Button;
import java.awt.Dialog;
import java.awt.Font;
import java.awt.Frame;
import java.awt.GridBagConstraints;
import java.awt.GridBagLayout;
import java.awt.Panel;
import java.awt.TextArea;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;

import pvs.utils.WindowUtils;

class AboutDialog extends Dialog implements ActionListener{

  static String text = 
 "                     Stellations-v.1.0\n"+
 "          (polyhedra stellation creator)\n"+
 "\n"+
 "Copyright (C) 1997 by Vladimir Bulatov <bulatov@dots.physics.orst.edu>\n"+
 "           All rights reserved.\n"+
 "\n"+
 "Redistribution and use in source and binary forms, with or without\n"+
 "modification, are permitted provided that the following conditions\n"+
 "are met:\n"+
 "1. Redistributions of source code must retain the above copyright\n"+
 "   notice, this list of conditions and the following disclaimer.\n"+
 "2. Redistributions in binary form must reproduce the above copyright\n"+
 "   notice, this list of conditions and the following disclaimer in the\n"+
 "   documentation and/or other materials provided with the distribution.\n"+
 "\n"+
 "THIS SOFTWARE IS PROVIDED BY THE AUTHOR AND CONTRIBUTORS ``AS IS'' AND\n"+
 "ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE\n"+
 "IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE\n"+
 "ARE DISCLAIMED.  IN NO EVENT SHALL THE AUTHOR OR CONTRIBUTORS BE LIABLE\n"+
 "FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL\n"+
 "DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS\n"+
 "OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)\n"+
 "HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT\n"+
 "LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY\n"+
 "OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF\n"+
 "SUCH DAMAGE.\n";


  Button buttonAggree = new Button("OK");
  Button buttonDisaggree = new Button("not OK");
  
  GridBagLayout layout = new GridBagLayout();

  AboutDialog(Frame frame,String title,boolean modal){

    super(frame,title,modal);

    this.setLayout(layout);

    TextArea textArea = new TextArea(text);
    Font font = new Font("Courier",Font.PLAIN,14);
    textArea.setFont(font);

    textArea.setEditable(false);
    buttonAggree.addActionListener(this);
    buttonDisaggree.addActionListener(this);

    Panel panel = new Panel();panel.setLayout(layout);

    WindowUtils.constrain(panel,textArea,0,0,2,1, GridBagConstraints.BOTH, 
                          GridBagConstraints.CENTER,1.,1.);
    WindowUtils.constrain(panel,buttonAggree,0,1,1,1, GridBagConstraints.NONE, 
                          GridBagConstraints.CENTER,1.,0.);
    WindowUtils.constrain(panel,buttonDisaggree,1,1,1,1,
			  GridBagConstraints.NONE, 
                          GridBagConstraints.CENTER,1.,0.);
    this.setLayout(layout);
    WindowUtils.constrain(this,panel,0,0,1,1, GridBagConstraints.BOTH, 
                          GridBagConstraints.CENTER,1.,1.);
  } 
  
  public void actionPerformed(ActionEvent e){

    if(e.getSource() == buttonDisaggree){
      System.exit(0);
    } else {
      this.dispose();
    }
    return;      
  }
}
