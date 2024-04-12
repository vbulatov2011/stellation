package pvs.g3d;

import java.awt.Button;
import java.awt.Canvas;
import java.awt.Checkbox;
import java.awt.Choice;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.FileDialog;
import java.awt.Frame;
import java.awt.Graphics;
import java.awt.GridBagConstraints;
import java.awt.GridBagLayout;
import java.awt.Image;
import java.awt.Panel;
import java.awt.PopupMenu;
import java.awt.Toolkit;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.awt.event.ItemEvent;
import java.awt.event.ItemListener;
import java.awt.event.KeyAdapter;
import java.awt.event.KeyEvent;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.awt.event.MouseMotionAdapter;
import java.awt.event.MouseWheelEvent;
import java.awt.event.MouseWheelListener;
//import java.net.URL;
import java.awt.image.MemoryImageSource;
import java.awt.image.PixelGrabber;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.io.PrintStream;

import pvs.polyhedra.Vector3D;
import pvs.utils.BorderPanel;
import pvs.utils.DestroyableFrame;
import pvs.utils.EventCallback;
import pvs.utils.Fmt;
import pvs.utils.GraphicsPS;
import pvs.utils.PVSObserver;
import pvs.utils.Timeout;
import pvs.utils.TimeoutCallback;
import pvs.utils.WindowUtils;

/**
 *  Canvas3D: An canvas to display and interact with OFF object 
 */

public class Canvas3D extends Panel implements Runnable{

    static int preferedWidth = 400, preferedHeight = 400;

    PVSObserver observer;

    Model3D	m_model;
    boolean	painted = true;
    String	objname = null,
		message = null;
    double	m_xfac = 0.4;
    // scaleval = 0.1f;
    // m_xfac = 0.7f * 250 * scaleval;

    Matrix3D	m_curMatrix = new Matrix3D();

    int		m_mouseDownX, m_mouseDownY;

    boolean drawLines = true;
    boolean drawFaces = true;

    PopupMenu displayTypePopup;
    Choice chDisplayType;
    String displayTypeNames[] = {"Normal 3D", "Anaglyph (Red/Blue)", "Anaglyph (Blue/Red)", "Stereo (Parallel)", "Stereo (Crosseyed)"};
    int displayType = NORMAL;
    //double anaglyphAngleGrad = 1.5;
    double anaglyphAngleGrad = 2;
    static final int NORMAL=0,ANAGLYPH_RC = 1,ANAGLYPH_CR = 2, STEREO_PARALLEL=3, STEREO_CROSSED = 4;

    SCanvas m_canvas;  
  

    public static PrintStream Out = System.out;  
  
    /**
       constructor 

    */
    public Canvas3D(Model3D model){

    
        m_model = model;
        initUI();
        init();
        model.setCanvas(this);
    }

    public Canvas3D(){

        initUI();
        init();

    }

  
    public void setObserver(PVSObserver observer){
        this.observer = observer;
    }
  
    public void setModel(Model3D model){

        if(this.m_model != null)
            this.m_model.clearCanvas(this);

        m_model = model;
        init();
        m_canvas.repaint();

        m_model.setCanvas(this);

    }
    /*
      PopupMenu makeDisplayTypePopup(){

      PopupMenu menu = new PopupMenu();
      PopupMenuListener listener = new PopupMenuListener();
      for(int i=0; i < displayTypeNames.length; i++){
      MenuItem mi = new MenuItem(displayTypeNames[i]);
      mi.addActionListener(listener);
      menu.add(mi);
      }
      return menu;
      }
    */
    void initUI(){
    
        this.setBackground(Color.white);
        this.setLayout(new GridBagLayout());
    
        Panel buttonsPanel = new Panel();
        buttonsPanel.setLayout(new GridBagLayout());
        buttonsPanel.setBackground(Color.lightGray);

        Checkbox cbEdges= new Checkbox("Edges", drawLines);
        cbEdges.addItemListener(new EdgesListener());

        Checkbox cbFaces = new Checkbox("Faces", drawFaces);
        cbFaces.addItemListener(new FacesListener());

        //Checkbox cbAnaglyph = new Checkbox("Anaglyph", drawAnaglyph);
        //cbAnaglyph.addItemListener(new AnaglyphListener());

        Button btnReset = new Button("Reset");
        btnReset.addActionListener(new ResetListener());

        Button btnFit = new Button("Fit");
        btnFit.addActionListener(new FitListener());

        Button btnZoomIn = new Button("+");
        btnZoomIn.addMouseListener(new ZoomInListener());
        //btnZoomIn.addActionListener(new ZoomInListener());
        Button btnZoomOut = new Button("-");
        btnZoomOut.addMouseListener(new ZoomOutListener());

        chDisplayType = new Choice();
        for(int i =0; i< displayTypeNames.length; i++){
            chDisplayType.addItem(displayTypeNames[i]);
        }
        chDisplayType.select(displayType);
        chDisplayType.addItemListener(new DisplayTypeListener());
    
        int c= 0;
        WindowUtils.constrain(buttonsPanel,cbEdges,    c++,0,1,1, gbc.NONE, gbc.WEST,0.,0.);
        WindowUtils.constrain(buttonsPanel,cbFaces,    c++,0,1,1, gbc.NONE, gbc.WEST,0.,0.);
        WindowUtils.constrain(buttonsPanel,chDisplayType, c++,0,1,1, gbc.NONE, gbc.WEST,1.,0.,0,0,0,4);
        WindowUtils.constrain(buttonsPanel,btnReset,   c++,0,1,1, gbc.NONE, gbc.WEST,0.,0.);
        WindowUtils.constrain(buttonsPanel,btnFit,     c++,0,1,1, gbc.NONE, gbc.WEST,0.,0.);
        WindowUtils.constrain(buttonsPanel,btnZoomIn,  c++,0,1,1, gbc.NONE, gbc.WEST,0.,0.);
        WindowUtils.constrain(buttonsPanel,btnZoomOut, c++,0,1,1, gbc.NONE, gbc.WEST,0.,0.);

        m_canvas = new SCanvas();

        WindowUtils.constrain(this,buttonsPanel, 0,0,1,1, gbc.HORIZONTAL, gbc.WEST,1.,0.);
        WindowUtils.constrain(this,m_canvas, 0,1,1,1, gbc.BOTH, gbc.CENTER,1.,1.);    

        m_canvas.addMouseListener(new MouseListenerClass());
        m_canvas.addMouseWheelListener(new MyMouseWheelListener());
        m_canvas.addMouseMotionListener(new MouseMotionListenerClass());
        m_canvas.addKeyListener(new KeyListenerClass());

        //displayTypePopup = makeDisplayTypePopup();
        //this.add(displayTypePopup);

    }

    public Image getImage(){
        return m_backBuffer;
    }

    public Dimension getMinimumSize(){
        return new Dimension(preferedWidth/2, preferedHeight/2);
    }

    public Dimension getPreferredSize(){
        return new Dimension(preferedWidth, preferedHeight);
    }

    /**
       init 
    
    */
    void init(){
        // find bounding box so we can scale  the object to fit
        // in our window
        m_model.findBB();				
        double xw = m_model.xmax - m_model.xmin;		
        double yw = m_model.ymax - m_model.ymin;		
        double zw = m_model.zmax - m_model.zmin;		

        if (yw > xw) xw = yw;
        if (zw > xw) xw = zw;

        double f1 = 250 / xw;
        double f2 = 250 / xw;

        // m_xfac = 0.7f * (f1 < f2 ? f1 : f2) * scaleval;


    }

    double zoomSpeed = 1.02;

    public void zoom(double factor){
        m_xfac *= factor;
        m_canvas.repaint();
    }

    public void zoomIn(){
        m_xfac *= zoomSpeed;
        m_canvas.repaint();
    }

    public void zoomOut(){
        m_xfac /= zoomSpeed;
        m_canvas.repaint();
    }


    /**
       fit model on screen 
     */
    public void doFit(){

        eventCallback = null;
        m_curMatrix.unit();
        m_model.findBB();
        double size = (m_model.xmax - m_model.xmin);
        if(size != 0.) 
            m_xfac = 0.9/size;
        
        m_canvas.repaint();
    }

    long m_mouseDownTime = -1;
    double spinSpeed = 0;      
    Vec3 spinAxis = null;
    double spinSpeedCutoff = 0.001;

    /**
       canvas mouse listener 
    */
    class MouseListenerClass extends MouseAdapter implements EventCallback {
    
        public void mousePressed(MouseEvent e) {
      
            m_mouseDownX = e.getX();
            m_mouseDownY = e.getY();
            m_mouseDownTime = System.currentTimeMillis();

            if((e.getModifiers() & e.BUTTON1_MASK) != 0 &&
               (e.getModifiers() & (e.CTRL_MASK|e.SHIFT_MASK|e.ALT_MASK)) == 0){
                //System.out.println("mouse pressed");
                spinAxis = null;
                spinSpeed = 0;
                eventCallback = null;         
            }
            return;      
        } 
    
        public void mouseClicked (MouseEvent e) {

            // stop rotations 
            spinAxis = null;
            spinSpeed = 0;
            eventCallback = null; 
                        
            if(observer != null){
                if((e.getModifiers() & e.BUTTON1_MASK) != 0){ // && 
                    //(e.getModifiers() & (e.CTRL_MASK|e.SHIFT_MASK|e.ALT_MASK)) != 0){
	  
                    // do face pick_up 
                    if(m_model instanceof Stellation3D ){

                        int[] index = ((Stellation3D)m_model).findFaceAtPoint(e.getX(), e.getY());
	    
                        if(observer != null && index[0] != -1){
                            Vec3 center = m_model.face[index[0]].center;
	      
                            Vector3D normal = new Vector3D(); //m_model.normals[m_model.face[index].nindex];
                            if(m_model instanceof Stellation3D){
                                normal = ((Stellation3D)m_model).getFacePlane(index[0]);
                            }
                            Vector3D vertex = ((Stellation3D)m_model).getVertex(index[0], index[1]);
                            observer.update(Canvas3D.this, 
                                            new Object[]{new double[]{center.x,center.y,center.z},
                                                         new Integer(e.getModifiers()),
                                                         new double[]{normal.x,normal.y,normal.z},
                                                         new double[]{vertex.x,vertex.y,vertex.z},					   
                                            }
                                            );
                        }
                    }
                }
            } 
        }

        /**
      
         */
        public void mouseReleased(MouseEvent e){

            if(spinAxis != null && spinSpeed  > spinSpeedCutoff){
          
                //System.out.println("spinning!");
                long curTime = System.currentTimeMillis(); // this is rounded to 1/18 sec 
                if(curTime - m_mouseDownTime > 500)
                    return;
                eventCallback = this;	
                m_canvas.repaint();
                m_mouseDownTime = curTime;
                startFPS = m_mouseDownTime;
                countFPS = 0;
            } 
            //}
        }

        double averageDt = 0;

        public void processEventCallback(Object who, Object what){
      
            if(spinAxis == null)
                return;        
      
            long curTime = System.currentTimeMillis(); // this is rounded to 1/18 sec 
      
            long dt = curTime - m_mouseDownTime;
            //System.out.print(" " + dt);
            averageDt = 0.8*averageDt + 0.2*dt*0.001;
            Matrix3D rotation = new Matrix3D(spinAxis, spinSpeed * (averageDt));
      
            m_curMatrix.mul(rotation);      
            eventCallback = this; 
            m_mouseDownTime = curTime; 
      
            m_canvas.repaint();
      
        }
    }

    class MouseMotionListenerClass extends MouseMotionAdapter{


        /**
           mouseDrag
       
        */
        public void mouseDragged(MouseEvent e) {
      
            long curTime = System.currentTimeMillis(); // this is rounded to 1/18 sec
            
            //System.out.println("mouseDragged: " + e);
            int x = e.getX();
            int y = e.getY();
            
            double dx = (x - m_mouseDownX);
            double dy = (y - m_mouseDownY);
            double angle = 3*Math.sqrt(dx*dx + dy*dy)/getSize().width;
            spinAxis = new Vec3(dy,-dx, 0);
            spinAxis.normalize();
            Matrix3D rotation = new Matrix3D(spinAxis,angle);
            m_curMatrix.mul(rotation);
            
            m_mouseDragged = true;
            m_canvas.repaint();
            
            double dt = (curTime-m_mouseDownTime)*0.001;
            if(dt != 0){
                // make averaging 
                spinSpeed = 0.2*angle/dt + 0.8*spinSpeed * Math.exp(-dt*10);
                //spinSpeed = 0;
                //printf("speenSpeed: %7.5f\n",spinSpeed);
            }
            
            m_mouseDownX = x; 
            m_mouseDownY = y;
            m_mouseDownTime = curTime;
            
        }
    }


    Image		m_backBuffer; // double buffering stuff
    Graphics	m_backG;
    int Height = -1, Width = -1;

    /** 
        paint 

        transform and paint the object to the graphics context 
    */  
    public void paintCanvas(Graphics g) {

        switch(displayType){
        case NORMAL: 
            drawNormalImage(g);
            break;
        case ANAGLYPH_CR:
            drawAnaglyph(g,anaglyphAngleGrad);
            break;
        case ANAGLYPH_RC:
            drawAnaglyph(g,-anaglyphAngleGrad);
            break;
        case STEREO_PARALLEL:
            drawStereo(g,anaglyphAngleGrad);
            break;
        case STEREO_CROSSED:
            drawStereo(g,-anaglyphAngleGrad);
            break;
        }
        m_mouseDragged = false;
        if(eventCallback != null){
            // if user is holding down a mouse button
            // this will repeat repeated action 
            EventCallback ec = eventCallback;
            eventCallback = null;
            try {
                Thread.currentThread().sleep(10);
            } catch(Exception e){}
            ec.processEventCallback(null,null);
        }
    }

    boolean drawFPS = false;
    long startFPS = 0;
    long countFPS = 0;
    void drawFPS(Graphics g){
        countFPS ++;
        long time = System.currentTimeMillis() - startFPS;
        if(time == 0)
            return;
        double fps = 0.1*(int)(10*countFPS / (0.001*time));
        g.drawString(Fmt.fmt(fps,6,3), 0, Height - 30);
    }

    void drawNormalImage(Graphics g){

        if(m_backBuffer == null || getSize().width != Width || getSize().height != Height ){
            Width = getSize().width; Height = getSize().height;
            m_backBuffer = createImage(Width, Height);
            m_backG = m_backBuffer.getGraphics();			// create image to do
            // double buffering
        }

        if (m_model != null) {

            paint(m_backG, getSize().width, getSize().height);
            if(drawFPS)
                drawFPS(m_backG);
	
            g.drawImage(m_backBuffer, 0, 0, this);
	
        } else if (message != null) {
            g.drawString("no data", 3, 20);
        }

    }


    double oldStereoWidth = -1, oldStereoHeight = -1;

    void drawStereo(Graphics g, double angle){

        Dimension dim = m_canvas.getSize();

        if(oldStereoWidth != dim.width || oldStereoHeight != dim.height){
            oldStereoWidth = dim.width;
            oldStereoHeight = dim.height;
            imgLeft = createImage(dim.width/2, dim.height);
            imgRight = createImage(dim.width/2, dim.height); 
            m_backBuffer  = createImage(dim.width, dim.height); 
            graphLeft = imgLeft.getGraphics();
            graphRight = imgRight.getGraphics();
            m_backG = m_backBuffer.getGraphics();
        }

    
        drawAnaglyph(graphRight, dim.width/2, dim.height, angle);
        drawAnaglyph(graphLeft, dim.width/2, dim.height, -angle);

        m_backG.drawImage(imgLeft, 0, 0, this);
        m_backG.drawImage(imgRight, dim.width/2, 0, this);
        g.drawImage(m_backBuffer, 0, 0, this);
    
    }


    Image imgLeft, imgRight; 
    Graphics graphLeft, graphRight;
    int bufferLeft[];
    int bufferRight[];
    MemoryImageSource imgProducer;
    Image combImage;
    //PaintImageObserver paintImageObserver = new PaintImageObserver();

    /**
       void drawAnaglyph(Graphics g)
    */
    void drawAnaglyph(Graphics g, double angle){

        Dimension dim = m_canvas.getSize();

        if(imgLeft == null || imgRight == null || 
           imgLeft.getWidth(this) != dim.width || imgLeft.getHeight(this) != dim.height){

            imgLeft = createImage(dim.width, dim.height);
            imgRight = createImage(dim.width, dim.height); 
            graphLeft = imgLeft.getGraphics();
            graphRight = imgRight.getGraphics();
            bufferLeft = new int[dim.width *dim.height];
            bufferRight = new int[dim.width *dim.height];
            imgProducer = new MemoryImageSource(dim.width,dim.height,bufferLeft,0,dim.width);
            imgProducer.setAnimated(true);
            imgProducer.setFullBufferUpdates(true);
            combImage = Toolkit.getDefaultToolkit().createImage(imgProducer);
        }

        makeAnaglyph(angle);    

        imgProducer.newPixels();

        g.drawImage(combImage, 0, 0, this);
    
    }

    void makeAnaglyph(double angle){
    
        Dimension dim = getSize();
        try {

            drawAnaglyph(graphRight, dim.width, dim.height, angle);

            PixelGrabber pgR = 
                new PixelGrabber(imgRight, 0, 0, dim.width, dim.height, bufferRight, 0, dim.width);

            pgR.grabPixels();

            drawAnaglyph(graphLeft, dim.width, dim.height, -angle);
      
            PixelGrabber pgL = 
                new PixelGrabber(imgLeft, 0, 0, dim.width, dim.height, bufferLeft, 0, dim.width);
            pgL.grabPixels();
        } catch (Exception e){
            e.printStackTrace(System.out);
        }
        for(int i =0; i < bufferLeft.length; i++){
      
            //int pixelL = bufferLeft[i];
            //int pixelR = bufferRight[i];
            //int redL =   ((pixelL >> 16) & 0xFF);
            //int greenL = ((pixelL >> 8 ) & 0xFF);
            //int blueL =  ((pixelL      ) & 0xFF); 
            //int redR =   ((pixelR >> 16) & 0xFF);
            //int greenR = ((pixelR >> 8 ) & 0xFF);
            //int blueR =  ((pixelR      ) & 0xFF); 
            //int levelL = (4*redL + 3*greenL + blueL)>>3;
            //int levelR = (4*redR + 3*greenR + blueR)>>3;
            //int res = (levelL + levelR)>>1;
            //bufferLeft[i] = 0xFF000000 | ( levelR << 16)  | levelL;
            int blue = (bufferLeft[i]& 0xFF);
            bufferLeft[i] = 0xFF000000 | ( (bufferRight[i]& 0xFF) << 16)  | (blue << 8) | (blue);
      
        }
    }

    EventCallback eventCallback = null;
    boolean m_mouseDragged = false;

    /**
       paint 
    
       suitable for printing
    */
    public void paint(Graphics graphics, int width, int height){
    
        m_model.mat.unit_flipped();
        /*
          obj.mat.translate(-(obj.xmin + obj.xmax) / 2,
          -(obj.ymin + obj.ymax) / 2,
          -(obj.zmin + obj.zmax));
        */
        m_model.mat.mul(m_curMatrix);    

        int mindiameter = width;
        if(height < width)
            mindiameter = height;

        double scale = ( m_xfac * mindiameter );

        m_model.mat.scale(scale, scale, scale);
        m_model.mat.translate(width / 2, height / 2, 0);
        m_model.transformed = false;
    
        graphics.setColor(getBackground());
        graphics.fillRect(0,0,width,height);
        m_model.paint(graphics);
    }

    public void drawAnaglyph(Graphics graphics, int width, int height, double angle){
    
        m_model.mat.unit_flipped();
        //obj.mat.unit();
        /*
          obj.mat.translate(-(obj.xmin + obj.xmax) / 2,
          -(obj.ymin + obj.ymax) / 2,
          -(obj.zmin + obj.zmax));
        */
        m_model.mat.mul(m_curMatrix);    
        // push object under the surface
        m_model.mat.translate(0,0,Math.abs((m_model.zmax-m_model.zmin)/2));
        // rotate for left/right eye
        m_model.mat.yrot(angle);
        int mindiameter = width;
        if(height < width)
            mindiameter = height;

        double scale = ( m_xfac * mindiameter);

        m_model.mat.scale(scale, scale, scale);
        m_model.mat.translate(width / 2, height / 2, 0);
        m_model.transformed = false;
    
        graphics.setColor(Color.gray);
        //bgc.setColor(getBackground());
        graphics.fillRect(0,0,width,height);
        m_model.paint(graphics);
    }

    /**
       loadObject

    */
    public static Model3D loadObject(String objname) {

        try {
            if(objname.toLowerCase().endsWith(".off")){
                // System.out.print("reading: "+objname);System.out.flush();
                Model3D obj = new Model3D ( new FileInputStream(objname));
                return obj;
            } else if(objname.toLowerCase().endsWith(".stl")){
                Model3D obj = STL.readModel( objname); 
                return obj;
            }
            return null;
        } catch(Exception e) {
            e.printStackTrace(System.out);
        }
        // System.out.println(" ready");System.out.flush();
        return null;
    }


    /**
       keyUp

    */
    class KeyListenerClass extends KeyAdapter {

        public void keyTyped(KeyEvent e){
      
            switch(e.getKeyChar()){
            case 'P':
            case 'p':
                doPrint();
                break;
            case 'e':
            case 'E':
            case 'l':
            case 'L':
                drawLines = !drawLines;
                repaint();
                break;
            case 'f':
            case 'F':
                drawFaces = !drawFaces;
                repaint();
                break;

            }
      
            return ;
        }
    }

    Thread thread;
    FileDialog fileDialog; 
    String psName = "stellation.ps";
  
    public void run(){

        try {

            //File file = new File("out.ps");
            //FileOutputStream f = new FileOutputStream(file);      
            OutputStream f = null;
            try{
                if(fileDialog == null){
                    fileDialog = new FileDialog(WindowUtils.getFrame(this), psName, FileDialog.SAVE);
                }
                fileDialog.show();
                if(fileDialog.getFile() == null)
                    return;
                psName = fileDialog.getFile();
                String psDir = fileDialog.getDirectory();
	
                String fileName = psDir + psName;
                File file = new File(fileName);
                f = new FileOutputStream(file);
                Out.println("printing 3D model to file " + fileName);
            } catch(Exception e){
                f = System.out;
                System.out.println("---------start of PS");
                Out.println("printing 3D model to java console");
            }
            //PrintStream f = System.out;
            GraphicsPS ps = new GraphicsPS(f, getGraphics());
            // paint our canvas
            this.paint(ps, ps.getWidth(), ps.getHeight());
            ps.flush(); // important - adds showpage to end of file      
            if(f != System.out){
                f.close();
            } else {
                System.out.println("---------end of PS");
            }
        } catch (Exception e){
            e.printStackTrace(System.out);
        }
    }

    void doPrint(){

        //if(thread != null && thread.isAlive()){
        //  thread.stop();
        //}
        thread = new Thread(this);
        thread.setPriority(Thread.MIN_PRIORITY); 
        thread.start();  
    }    


    class SCanvas extends Canvas {

        /**
           update 
       
        */
        public void update(Graphics g) {
      
            //if (m_backBuffer == null)
            //g.clearRect(0, 0, getSize().width, getSize().height);      
            paint(g);      
        }

        public void paint(Graphics g){
            paintCanvas(g);
        }

        public Dimension getPreferredSize(){
            return new Dimension(300,300);
        }
    }

    public boolean imageUpdate(Image img,
                               int infoflags,
                               int x,
                               int y,
                               int width,
                               int height){
        return true;
    }

    class EdgesListener implements ItemListener {

        public void itemStateChanged(ItemEvent e){

            if(e.getStateChange() == ItemEvent.SELECTED){
                drawLines = true;
            } else {
                drawLines = false; 
            }
            m_canvas.repaint();
        }
    }

    class FacesListener implements ItemListener {

        public void itemStateChanged(ItemEvent e){

            if(e.getStateChange() == ItemEvent.SELECTED){
                drawFaces = true;
            } else {
                drawFaces = false;	
            }
            m_canvas.repaint();
        }
    }
    /*
      class AnaglyphListener implements ItemListener {

      public void itemStateChanged(ItemEvent e){

      if(e.getStateChange() == ItemEvent.SELECTED){
      drawAnaglyph = true;
      } else {
      drawAnaglyph = false;	
      }
      m_canvas.repaint();
      }
      }
    */
    class ZoomOutListener extends MouseAdapter  implements EventCallback, TimeoutCallback {

        boolean mouseDown = false;
        Timeout timeout;

        public void mousePressed(MouseEvent e){
            mouseDown = true;
            zoomOut();
            // make delay before autorepeat 
            timeout = new Timeout(300, this, null);

        }

        public void mouseReleased(MouseEvent e){

            mouseDown = false;
            eventCallback = null;
            timeout.stop();

        }

        public void timeoutCallback(Object userData){

            if(mouseDown){

                eventCallback = this;       
                zoomOut();
            }
        }

        public void processEventCallback(Object who, Object what){
            if(mouseDown){
                eventCallback = this;       
                zoomOut();
            }
        }

    }

    class ZoomInListener extends MouseAdapter implements EventCallback, TimeoutCallback{

        boolean mouseDown = false;
        Timeout timeout;

        public void mousePressed(MouseEvent e){

            mouseDown = true;
            zoomIn();
            // make delay before autorepeat 
            timeout = new Timeout(300, this, null);

        }

        public void mouseReleased(MouseEvent e){

            mouseDown = false;
            eventCallback = null;
            timeout.stop();
        }

        public void processEventCallback(Object who, Object what){
            if(mouseDown){
                eventCallback = this;       
                zoomIn();
            }
        }

        public void timeoutCallback(Object userData){

            if(mouseDown){

                eventCallback = this;       
                zoomIn();
            }
        }


    }

    class DisplayTypeListener implements ItemListener{

        public void  itemStateChanged(ItemEvent e){
            int ind = chDisplayType.getSelectedIndex();
            displayType = ind;
            //Canvas3D.this.validate();
            m_canvas.repaint();
        }
        /*
          public void actionPerformed(ActionEvent e){

          Dimension dim = btnDisplayType.getSize();
          displayTypePopup.show(btnDisplayType,0,dim.height);
          }
        */

    }

    class ResetListener implements ActionListener{
        public void actionPerformed(ActionEvent e){
            eventCallback = null;
            m_curMatrix.unit();
            m_canvas.repaint();
        }    
    }

    class FitListener implements ActionListener{

        public void actionPerformed(ActionEvent e){
            doFit();
        }    
    }

  
    class PopupMenuListener implements ActionListener{

        public void actionPerformed(ActionEvent e){
            /*
              String str = e.getActionCommand();
              for(int i =0; i < displayTypeNames.length; i++){
              if(str.equals(displayTypeNames[i])){
              btnDisplayType.setLabel(str);
              displayType = i;
              Canvas3D.this.validate();
              m_canvas.repaint();
              }
              }
            */
        }
    }

    class MyMouseWheelListener implements MouseWheelListener {

        public void mouseWheelMoved(MouseWheelEvent e) {
            double factor = Math.exp(-e.getWheelRotation() * 0.1);
            zoom(factor);
        }
    }

    static private GridBagConstraints gbc = new GridBagConstraints();

    static Model3D getTestModel (){
        return new Model3D();//vert,faces,edges,poly.colors,poly.icolor);
    }
    /*
      static public void main(String [] args){

      Model3D model = getTestModel();
    
      Frame frame3D = new Frame("3D view");
      frame3D.addWindowListener(frameClosingListener);
      frame3D.setBackground(Color.white);
      canvas3D = new Canvas3D(model);
      canvas3D.Out = Out;
      frame3D.add("Center",canvas3D);
      //frame3D.validate();
      //frame3D.pack();
      frame3D.setBounds(screen.width - screen.height/2,
      0,screen.height/2,screen.height/2);
      frame3D.validate();
      frame3D.show();
      } 
    */ 

    /**
       main 

    */
    public static void main(String[] args){

      
        Frame frame = new DestroyableFrame("polyhedra viewer");
        Panel panel = new Panel(); panel.setBackground(Color.lightGray);
    
        GridBagLayout layout = new GridBagLayout();
        frame.setLayout(layout);
        panel.setLayout(layout);
        int nrows = (int)Math.sqrt(args.length);
        int ncolumns = (nrows != 0)?((args.length+nrows-1)/nrows):1;
        int n = 0;

        main_loop:

        for(int i=0;i < nrows;i++){
            for(int j=0;j < ncolumns;j++){
                if(n>= args.length)
                    break main_loop;
                BorderPanel bp = new BorderPanel();bp.setLayout(layout); 
                bp.setBackground(Color.lightGray);
                WindowUtils.constrain(bp,new Canvas3D(loadObject(args[n])),
                                      0,0,1,1, GridBagConstraints.BOTH,
                                      GridBagConstraints.CENTER,1.,1.);
                WindowUtils.constrain(panel,bp,
                                      j,i,1,1, GridBagConstraints.BOTH,
                                      GridBagConstraints.CENTER,1.,1.);
                n++;
            }
        }

        preferedWidth = 600/ncolumns;
        preferedHeight = preferedWidth;

        WindowUtils.constrain(frame,panel,0,0,1,1, GridBagConstraints.BOTH,
                              GridBagConstraints.CENTER,1.,1.);    
        frame.pack();
        frame.show();
    }

}

