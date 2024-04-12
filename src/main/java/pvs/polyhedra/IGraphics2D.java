package pvs.polyhedra;

import java.awt.Color;

public interface IGraphics2D
{
    void setColor(Color ctrl);

    void drawLine(double x, double y, double x2, double y2);

    void fillControlSquare(double x, double y, int i);
}
