package pvs.polyhedra.stellation.ui;

import java.io.File;

import javax.swing.filechooser.FileFilter;


public class StelFilter extends FileFilter {

    String validExt = ".stel";

    public boolean accept(File f) {

        if (f.isDirectory())
            return true;

        String extension = null;

        String s = f.getName();

        int i = s.lastIndexOf('.');

        if (i >= 0)
            extension = s.substring(i);

        if (extension != null) {
            return validExt.equalsIgnoreCase(extension);
        }

        return false;
    }

    /**
     * The description of this filter
     */
    public String getDescription() {
        return "Stellation Files";
    }
}
