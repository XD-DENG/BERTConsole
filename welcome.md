
Welcome to the BERT console! The console includes an R command shell
and a basic editor for editing your function or script files.

A couple of key things to know:

 * BERT loads functions from files in `Documents/BERT/functions`
   (we call this the startup folder). When you install, there's
   one file in there: `functions.R`. To add new functions to Excel,
   either edit that file or add a new file to the startup folder.
   
 * Any time you add a new file or change a file in the startup 
   folder, BERT will reload it automatically. 

 * The R shell is "live" and connected to Excel -- see the docs on 
   Talking to Excel from R, and the Excel Scripting (COM) Interface.

This editor is built on [monaco][1], and the R shell is built with
[CodeMirror][2].  Underneath all that is [electron][3].  This is a 
complicated stack but the end result should be very easy to use, 
configurable and extensible.  

You don't have to use our editor -- use any editor you like. You
can hide this editor in the *View* menu, and just use the command
shell.

Have suggestions, feedback, questions, comments?  Let us know!  

Cheers,

 -- The BERT team

[1]: https://microsoft.github.io/monaco-editor/
[2]: https://codemirror.net/
[3]: https://electron.atom.io/

