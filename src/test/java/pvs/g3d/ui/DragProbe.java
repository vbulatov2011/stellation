package pvs.g3d.ui;    // same package: reach m_canvas / m_curMatrix directly

import java.awt.*;
import java.awt.event.MouseEvent;
import java.lang.reflect.Field;
import pvs.g3d.Matrix3D;
import pvs.g3d.Model3D;

/**
 * Regression test for "the solid disappears while you drag it".
 *
 * macOS reports the pointer in whole logical points, so on a 2x display a slow
 * drag routinely produces a mouseDragged event at the same coordinates as the
 * one before it. Canvas3D built its rotation axis as (dy,-dx,0) and normalized
 * it; with dx == dy == 0 that is a zero-length vector, Vec3.normalize divided
 * by zero, and the resulting NaN spread through Matrix3D into the accumulated
 * view matrix -- permanently, since every later drag multiplies into it.
 *
 * The failure looks like a disappearance rather than a crash because
 * Matrix3D.transform writes into an int[], and (int)NaN is 0 in Java: every
 * vertex lands on the same pixel. Before the fix this probe printed
 *     transformed unit points -> [0,0,0 | 0,0,0 | 0,0,0]
 *
 * Drives the real listener with synthetic events rather than the mouse, so the
 * zero-delta case is exercised deterministically instead of by timing luck.
 *
 * Run:
 *   javac -d /tmp/c $(find src/main/java src/ui/java src/test/java -name '*.java')
 *   java -cp /tmp/c:resources pvs.g3d.ui.DragProbe
 */
public class DragProbe {

  static boolean nan(Matrix3D m) throws Exception {
    double s = 0;
    for (String f : new String[]{"xx","xy","xz","yx","yy","yz","zx","zy","zz"}) {
      Field fl = Matrix3D.class.getDeclaredField(f); fl.setAccessible(true);
      s += fl.getDouble(m);
    }
    return Double.isNaN(s);
  }

  public static void main(String[] a) throws Exception {
    System.setProperty("java.awt.headless", "false");
    // the real icosahedron, straight off the classpath, as the app loads it
    Model3D model = new Model3D(DragProbe.class.getResourceAsStream("/images/off/u27.off"));
    Canvas3D c3d = new Canvas3D(model);
    Frame f = new Frame("probe");
    f.add(c3d); f.setSize(600, 600); f.setVisible(true);
    Thread.sleep(800);

    Field cf = Canvas3D.class.getDeclaredField("m_canvas"); cf.setAccessible(true);
    Component canvas = (Component) cf.get(c3d);
    Field mf = Canvas3D.class.getDeclaredField("m_curMatrix"); mf.setAccessible(true);
    Matrix3D cur = (Matrix3D) mf.get(c3d);

    // the exact sequence from the bug report: the 4th drag repeats the 3rd
    int[][] path = {{100,100},{104,103},{109,105},{113,108},{113,108},{120,112},{126,117}};
    long t = System.currentTimeMillis();
    canvas.dispatchEvent(new MouseEvent(canvas, MouseEvent.MOUSE_PRESSED, t, MouseEvent.BUTTON1_MASK,
        path[0][0], path[0][1], 1, false, MouseEvent.BUTTON1));
    for (int i = 1; i < path.length; i++) {
      canvas.dispatchEvent(new MouseEvent(canvas, MouseEvent.MOUSE_DRAGGED, t + i*16,
          MouseEvent.BUTTON1_MASK, path[i][0], path[i][1], 0, false));
      boolean bad = nan(cur);
      System.out.printf("  drag -> (%3d,%3d)%s   matrix NaN = %s%n",
          path[i][0], path[i][1],
          (i>1 && path[i][0]==path[i-1][0] && path[i][1]==path[i-1][1]) ? "  <-- ZERO DELTA" : "            ",
          bad);
      if (bad) { System.out.println("\nFAIL: view matrix destroyed"); System.exit(1); }
    }
    System.out.println("\nPASS: matrix finite through the zero-delta event and after it");
    System.exit(0);
  }
}
