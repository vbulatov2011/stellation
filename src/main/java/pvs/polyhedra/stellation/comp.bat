@echo on
cd ..\..\..\..\..\
rem call ant -emacs build
rem 
call ant -emacs runMain -Dclass=pvs.polyhedra.stellation.awt.StellationMain
rem call ant -emacs runMain -Dclass=pvs.polyhedra.stellation.Tests
