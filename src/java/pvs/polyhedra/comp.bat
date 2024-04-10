cd ..\..\..\..\
rem 
call ant -emacs build
rem 
call ant -emacs runMain -Dclass=pvs.polyhedra.stellation.StellationMain
rem call ant -emacs compile
