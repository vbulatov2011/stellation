
# Stellation "Applet"

This project is being ported from Java to Javascript, to run in the web.
The original Java code ran as an applet, but of course that is now impossible.
See the updated README section below the original one.

## Original README

This is source code of the stellation applet. 
The applet and the source web site is: 
http://www.physics.orst.edu/~bulatov/polyhedra/stellation_applet/

The source code is indented for people, who wish to modify or extend the applet 
functionality. It is not needed to run the applet. 

To build the applet, you need to have java JDK installed on your system. 

makeall.bat on Windows system will compile everything and create 
executable stellation.jar file. 

Several people's work was used in the applet code. 
In particular, 
Fmt package by Jef Poskanzer, 
Math expression parser by Darius Bacon, 
Jama matrix package by Jama team, 
Paul Prants helped to extended incomplete Symmetry class. 

I apologize if I've forgot somebody. 

Vladimir Bulatov

## Updated README

To build and run this project, you need a Java 11 JDK installed.

Open a shell in this folder, and run
```bash
./build.bash
```
That runs the [JSweet transpiler](https://www.jsweet.org/) over the
Java source code (except for the UI code), converting it to Javascript.

Once that is done, simply launch a web server in this directory, and visit
`index.html`.  The simplest way to do this is to use Visual Studio Code's "live server".

At the moment, you won't see anything on the page!  All of the output is in the console.
