
BERT Shell 3
============

New console for [BERT][1], replacing the old one.  

This is not a complete rewrite, but it's not a branch.  Some core parts were
rewritten and then we bolted on some code from the old one.  It would have been
impractical to branch because some of the lowest-level stuff was changed (in 
particular, settings management).

The new editor is built on [monaco][2], and this was the driving factor in the
rewrite.  We could not get indenting to work satisfactorily in Codemirror and
this was driving me crazy.  CM is still there, though, in the shell, so it's
still a dependency. Material icons were dropped ~~in favor of just using unicode
characters~~.  It turns out unicode characters render differently on different 
versions of Windows (!) so we need to go back to icons.  We're using a custom 
set to keep it small.

Build drops webpack entirely, as there's no real reason to use it, and this 
simplifies file layout.

As regards the larger BERT application, this should be a drop-in replacement,
although it will lose any old settings (because the layout of settings has
changed a bit).

[1]: https://github.com/sdllc/Basic-Excel-R-Toolkit
[2]: https://github.com/Microsoft/monaco-editor
