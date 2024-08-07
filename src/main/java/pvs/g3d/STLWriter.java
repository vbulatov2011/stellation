/*****************************************************************************
 *                        Shapeways, Inc Copyright (c) 2012
 *                               Java Source
 *
 * This source is licensed under the GNU LGPL v2.1
 * Please read http://www.gnu.org/copyleft/lgpl.html for more information
 *
 * This software comes with the standard NO WARRANTY disclaimer for any
 * purpose. Use it at your own risk. If there's a problem you get to fix it.
 *
 ****************************************************************************/

package pvs.g3d;

import java.io.BufferedOutputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.io.RandomAccessFile;

import pvs.polyhedra.Vector3D;

/**
   class to write collection of triangles to STL file 

   triangles are written via addTri() method of TriangleCollector interface 

   input units used are meters

   it is important to call close(). 
   It writes total triangle count to the file header. 

   @author Vladimir Bulatov
 */
public class STLWriter {

    static byte buffer[] = new byte[4];
    static final int STL_HEADER_LENGTH = 80;

    static final double SCALE = 1000; // to convert to MM standard for STL 

    static final byte STLHeader[] = new byte[STL_HEADER_LENGTH];    
    private boolean triCountWritten = false;

    Vector3D defaultNormal = new Vector3D(0.,0.,0.);
    OutputStream m_output; 
    int m_triCount = 0;
    FileOutputStream m_fileStream;
    String m_path; // file path to write to 

    boolean isOpened = false; // if output file is opened
    boolean osPassedIn = false;  // don't close streams passed in

    static void writeInt4(OutputStream out, int value) throws IOException{
        
        out.write(value & 0xFF);
        out.write((value >> 8) & 0xFF);
        out.write((value >> 16) & 0xFF);
        out.write((value >> 24) & 0xFF);
        
    }
    
    static byte buffer2[] = new byte[2];
    static void writeInt2(OutputStream out, int value) throws IOException{
        //Output.out.println(" " + value);
        buffer2[0] = (byte)(value & 0xFF);
        buffer2[1] = (byte)((value >> 8) & 0xFF);
        out.write(buffer2);
        
    }

    static byte[] getBytes(int value){
        return new byte[]{
            (byte)(value & 0xFF),
            (byte)((value >> 8) & 0xFF),
            (byte)((value >> 16) & 0xFF),
            (byte)((value >> 24) & 0xFF)
        };
    }
    
    static void writeFloat(OutputStream out, float fvalue) throws IOException{
        
        int value = Float.floatToRawIntBits(fvalue);
        writeInt4(out, value);
        
    }

    static void writeFloat(OutputStream out, double dvalue) throws IOException{
        
        int value = Float.floatToRawIntBits((float)dvalue);
        writeInt4(out, value);
        
    }
    
    static void writeVector(OutputStream out, Vector3D v) throws IOException{

        writeFloat(out, v.x*SCALE);
        writeFloat(out, v.y*SCALE);
        writeFloat(out, v.z*SCALE);

    }

    /**

       constructor to write to specified file
       
     */
    public STLWriter(String filePath, int triangleCount) throws IOException {
        

        m_path = filePath;
        m_fileStream = new FileOutputStream(m_path);
        isOpened = true;
        
        m_output = new BufferedOutputStream(m_fileStream);

        m_output.write(STLHeader);

        writeInt4(m_output, triangleCount);
        triCountWritten = true;
    }

    /**

     constructor to write to specified file

     */
    public STLWriter(OutputStream os, int triangleCount) throws IOException {


        isOpened = true;
        m_output = os;
        osPassedIn = true;

        m_output.write(STLHeader);

        writeInt4(m_output, triangleCount);
        triCountWritten = true;
    }

    public STLWriter(String filePath) throws IOException {


        m_path = filePath;
        m_fileStream = new FileOutputStream(m_path);
        isOpened = true;

        m_output = new BufferedOutputStream(m_fileStream);

        m_output.write(STLHeader);
        triCountWritten = false;

        writeInt4(m_output, 0);
    }

    public void finalize(){
        try {
            if(isOpened){
                close();
            }
        } catch(Exception e){
            e.printStackTrace();
        }
    }


    /**
       does the writing of triangle count and closing the stream 
     */
    public void close() throws IOException{

        isOpened = false;
        if (m_output != null) m_output.flush();
        if (m_fileStream != null) m_fileStream.flush();
        if (!osPassedIn && m_output != null) m_output.close();
        if (m_fileStream != null) m_fileStream.close();

        if (!triCountWritten) {
            // write tricount after STL header
            RandomAccessFile raf = new RandomAccessFile(m_path, "rw");
            raf.seek(STL_HEADER_LENGTH);
            raf.write(getBytes(m_triCount));
            raf.close();
        }
    }

    /**
       method of interface TriangleCollector
     */
    public boolean addTri(Vector3D v0, Vector3D v1, Vector3D v2 ){

        try {
            m_triCount++;

            writeVector(m_output, defaultNormal);
            writeVector(m_output, v0);
            writeVector(m_output, v1);
            writeVector(m_output, v2);

            writeInt2(m_output, 0); // attribute byte count 0
            return true;

        } catch(IOException e){
            e.printStackTrace();
            throw new IllegalArgumentException("IOError: " + e.getMessage());
        }
    }
} // class STLWriter
 
