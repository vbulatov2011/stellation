@echo on
rem call ant -emacs clean
rem call ant -emacs build
rem 
call ant -emacs runMain -Dclass=pvs.polyhedra.stellation.StellationMain
