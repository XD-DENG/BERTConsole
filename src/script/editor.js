/**
 * Copyright (c) 2016-2017 Structured Data, LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to 
 * deal in the Software without restriction, including without limitation the 
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or 
 * sell copies of the Software, and to permit persons to whom the Software is 
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in 
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */

"use strict";

// node modules

const fs = require('fs');
const path = require('path');
const PubSub = require( "pubsub-js" );

// electron

const { remote } = require('electron');
const {Menu, MenuItem, dialog} = remote;

// local

const { Utils } = require( "./util2.js" );
const { Model } = require( "./model.js" );
const Watcher = require( "./watcher.js" );

const Messages = require( "../data/messages.js" ).Editor;

//-----------------------------------------------------------------------------
//
// configuration for monaco (see monaco electron sample)
//
//-----------------------------------------------------------------------------

const uriFromPath = function(_path) {
  var pathName = path.resolve(_path).replace(/\\/g, '/');
  if (pathName.length > 0 && pathName.charAt(0) !== '/') {
    pathName = '/' + pathName;
  }
  return encodeURI('file://' + pathName);
}

amdRequire.config({
  baseUrl: uriFromPath(path.join(__dirname, '../../node_modules/monaco-editor/min'))
});

// workaround monaco-css not understanding the environment
self.module = undefined;

// workaround monaco-typescript not understanding the environment
self.process.browser = true;

let languageExtensions = {};
let languageAliases = {};

/**
 * this is a class, but it's intended to be a singleton; the 
 * module export is (the only) instance of this class.
 * 
 * FIXME: what's the point of that? why limit?
 * 
 * A: for one thing, the html is managed with IDs that will break if 
 * there are multiple instances.  that could be scoped, but it's not at the 
 * moment.  alternatively you could switch to classes (or prefix IDs).
 * 
 * A: for another thing, we are handling messages that don't specify 
 * an editor ID.  that means parallel behavior in multiple editors. 
 * FIXME: add editor ID.
 */
class Editor {

  constructor(){

    // reference to the editor object (monaco)
    this._editor = null;

    // layout nodes as a named map
    this._nodes = null;

    // reference to the active tab
    this._activeTab = null;

    // list of closed tabs (files) for unclosing.  FIXME: cache content?
    this._closedTabs = [];

    // options passed to created models
    this._modelOptions = {};

    // flag to prevent save/reload loop
    this._saving = undefined;

    // file settings backed by local storage (open files, recent files)
    this._fileSettings = Model.createLocalStorageProxy({
      recentFiles: []
    }, "file-settings", "file-settings-update" );
    
    // default files on first open
    if( !this._fileSettings.once ){
      this._fileSettings.__broadcast__ = false;
      this._fileSettings.openFiles = [
        path.join( process.env.BERT_SHELL_HOME, "welcome.md" ),
        path.join( process.env.BERT_FUNCTIONS_DIRECTORY, "functions.R" ),
        path.join( process.env.BERT_FUNCTIONS_DIRECTORY, "../examples/excel-scripting.R" )
      ];
      this._fileSettings.once = true;
      this._fileSettings.__broadcast__ = true;
    }

    // window.model = this._fileSettings;

  }

  /**
   * handle local options, that we can deal with directly.  these are also 
   * removed from the object so they don't get passed through.
   * 
   * @param {object} options 
   */
  _handleLocalOptions(options){

    let handle = function(key, func){
      if( typeof options[key] === "undefined" ) return;
      if( func ) func.call( this, options[key] );
      delete options[key];
    }.bind(this);

    // this one we just drop
    handle( "hide" );

    // the local layout function will check if editor exists 
    handle( "statusBar", function(val){
      let footer = this._nodes['editor-footer'];
      if( val ) footer.classList.remove( "hide" );
      else footer.classList.add( "hide" );
      this.layout();
    });

    // model options 
    let updateModels = false;
    let modelOptions = {};
    [ "insertSpaces", "tabSize", "trimAutoWhitespace" ].forEach( function( key ){
      if( typeof options[key] !== "undefined" ){
        modelOptions[key] = options[key];
        this._modelOptions[key] = options[key];
        updateModels = true;
        delete options[key];
      }
    }, this);

    // if we've initialized, update existing models
    if( self.monaco ){
      monaco.editor.getModels().forEach( function( model ){
        model.updateOptions( this._modelOptions );
      }, this)
    }

  }

  /**
   * we're hijacking the monaco theme to decorate the rest of the editor 
   * (tabs and status bar).  possibly the notifications as well?
   * this gets called if the option is set (runtime) as well as ALWAYS 
   * at startup to set default.
   * 
   * @param {*} theme 
   */
  _updateEditorTheme( theme ){

    // theme = "monaco-editor " + (theme || "vs"); // default
    theme = theme || "vs"; // default

    this.getAvailableThemes().forEach( function(cls){
      this._nodes['editor-header'].classList.remove(cls);
      this._nodes['editor-footer'].classList.remove(cls);
    }, this);

    // could just put this in markup
    this._nodes['editor-header'].classList.add("monaco-editor");
    this._nodes['editor-footer'].classList.add("monaco-editor");

    this._nodes['editor-header'].classList.add(theme);
    this._nodes['editor-footer'].classList.add(theme);

  }

  /**
   * API method: initialize the editor component and UI.  
   * 
   * @param {object} container
   * @param {object} options
   */
  init(container, options){

    options = options || {};
    let instance = this;

    function handleDragover(e) {
      e.stopPropagation();
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }

    function handleDrop(e){
      e.stopPropagation();
      e.preventDefault();
      let files = e.dataTransfer.files;
      if( files && files.length ){
        instance.open( files[0].path );
      }
    }

    container.addEventListener('dragenter', handleDragover, false);
    container.addEventListener('dragover', handleDragover, false);
    container.addEventListener('drop', handleDrop, false);

    let editorHTML = `
      <div id='editor-container'>
        <div id='editor-header'>
          <div class='editor-tab' id='placeholder-tab'>
            <div class='label'></div><div class='tab-icon'></div>
          </div>
        </div>
        <div class='editor-flex-patch'>
          <div id='editor-body'></div>
        </div>
        <div id='editor-footer'>
          <div id='editor-status-message'>Ready</div>
          <div id='editor-info-position'>&nbsp;</div>
          <div id='editor-info-language'>&nbsp;</div>
        </div>
      </div>
    `;

    this._nodes = Utils.parseHTML( editorHTML, container );


    PubSub.subscribe( "editor-cursor-position-change", function(channel, data){
      instance._nodes['editor-info-position'].textContent = 
        Utils.templateString( Messages.LINE_COL, data.lineNumber, data.column );
    });

    PubSub.subscribe( "status-message", function( channel, data ){
      instance._nodes['editor-status-message'].textContent = data;
    });

    instance._nodes['editor-header'].addEventListener( "click", function(e){
      let node = e.target;
      let close = false;
      while( node && node.className ){
        if( node.className.match( /tab-icon/ )) close = true;
        if( node.className.match( /editor-tab/ )){
          if( close ) instance._closeTab(node);
          else instance._selectTab(node);
          return;
        }
        node = node.parentNode;
      }
    });

    // FIXME: the next 3 can move

    PubSub.subscribe( "splitter-drag", function(){
      instance.layout();
    });

    window.addEventListener( "resize", function(){
      instance.layout();
    });

    PubSub.subscribe( "file-change-event", function( channel, file ){
      let tabs = instance._nodes['editor-header'].querySelectorAll( ".editor-tab" );
      tabs.forEach( function( tab ){

        if( tab.opts.file === file ){
          if( instance._saving === file ){
            instance._saving = undefined;
          }
          else if( !tab.opts.dirty ){
            console.info( file, "changed on disk, reloading" );
            instance._revert(tab);
          }
          else {
            // FIXME
            console.info( file, "changed, NOT reloading because unsaved changes" );
            tab.opts.preventSave = true;
          }
        }
      });
    });

    PubSub.subscribe( "menu-click", function( channel, data ){
      if( data ) switch( data.id ){

      case "file-save-as":
        instance._save(instance._activeTab, true);
        break;

      case "file-save":
        instance._save(instance._activeTab);
        break;

      case "file-open":
        instance.open();
        break;

      case "file-revert":
        instance._revert(instance._activeTab);
        break;

      case "file-close":
        instance._closeTab(instance._activeTab);
        break;

      case "file-new":
        instance._addTab({ value: "" });
        break;
      }
    });

    this._handleLocalOptions( options );
    this._updateEditorTheme( options.theme );

    return new Promise( function( resolve, reject ){

      amdRequire(['vs/editor/editor.main'], function() {

        options.contextmenu = false; // always

        // it looks like there's a model created here, but then discarded when 
        // we install our first model.  not 100% sure of this behavior but seems 
        // to be ok to just ignore it.

        instance._editor = monaco.editor.create(instance._nodes['editor-body'], options );

        // window.editor = instance.editor;

        instance._editor.addAction({

          id: 'exec-selected-code',
          label: Messages.CONTEXT_EXECUTE_SELECTED_CODE,
          keybindings: [ monaco.KeyCode.F9 ], // [monaco.KeyMod.CtrlCmd | monaco.KeyCode.F10],
          keybindingContext: null, // ??
          contextMenuGroupId: '80_exec',
          contextMenuOrder: 1,

          // FOR REFERENCE: found this key in editor.main.js (presumably generated from 
          // source ts somewhere) @ line 44874, see block above it for more keys.  other 
          // things discovered: precondition is evaluated in some fashion.  == and != work 
          // for equivalence/inequivalence.  do not use !==.  escape strings.  use && to 
          // combine terms.

          precondition: "editorLangId=='r'",

          run: function(ed) {
            let val = ed.getModel().getValueInRange(ed.getSelection());
            if( val.trim().length ){

              // this may have double-terminated lines (windows style).
              // convert that before executing.

              let lines = val.split( /\n/ );
              val = lines.map( function( line ){ return line.trim(); }).join( "\n" );
              PubSub.publish( "execute-block", val );
            }
            return null;
          }

        });

        instance._editor.addAction({

          id: 'exec-entire-buffer',
          label: Messages.CONTEXT_EXECUTE_BUFFEER,
          keybindings: [ monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.F9 ], // [monaco.KeyMod.CtrlCmd | monaco.KeyCode.F10],
          keybindingContext: null, // ??
          contextMenuGroupId: '80_exec',
          contextMenuOrder: 2,

          precondition: "editorLangId=='r'", // see above

          run: function(ed) {
            let val = ed.getModel().getValue();
            if( val.trim().length ){

              // this may have double-terminated lines (windows style).
              // convert that before executing.

              let lines = val.split( /\n/ );
              val = lines.map( function( line ){ return line.trim(); }).join( "\n" );
              PubSub.publish( "execute-block", val );
            }
            return null;
          }

        });

        /**
         * show context menu.  we're not using monaco's built-in context menu 
         * because we want it to be consistent across the editor and the shell.
         * 
         * FIXME: instead of disabling the monaco context menu, trapping the 
         * event, and showing this menu, can we override the existing service 
         * function that shows the menu?  similar to the way we're overriding 
         * the link open method.  
         */
        instance._editor.onContextMenu( function( e ){

          // see editor.main.js @ 72119.  TODO: where do the key accelerators come from?

          // ok, answered.  to get the keybinding (encoded as int), use 
          // keybinding = cm._keybindingFor( action )
          // 
          // you can decode to monaco's representation (shown in the menus) with 
          // cm._keybindingService.getLabelFor( keybinding )
          //
          // so we should be able to translate to electron keybindings.  actually 
          // we may be able to just pass the translated binding in to electron (but 
          // will that only work for EN-US?)

          let cm = instance._editor.getContribution( "editor.contrib.contextmenu" );
          let ma = cm._getMenuActions();
          let menu = new Menu();

          ma.forEach( function( action ){
            if( action.id === "vs.actions.separator" ){
              menu.append(new MenuItem({type: "separator"}));
            }
            else {

              // don't call getlabelfor if there's no keybinding, it will throw
              let kb = cm._keybindingFor( action );
              let accel = kb ? cm._keybindingService.getLabelFor(kb) : null;

              menu.append(new MenuItem({
                label: action.label,
                enabled: action.enabled,
                accelerator: accel,
                click: function(){
                  action.run();
                }
              }));
            }
          });

          menu.popup(remote.getCurrentWindow());

        });

        //
        // override default link handling, we want to open in a browser.
        // FIXME: are there some schemes we want to handle differently?
        // 

        let linkDetector = instance._editor.getContribution("editor.linkDetector" )
        linkDetector.openerService.open = function( resource, options ){ 
          require('electron').shell.openExternal(resource.toString());
        };

        instance._editor.onDidChangeCursorPosition( function(e){
          PubSub.publish( "editor-cursor-position-change", e.position );
          if( instance._activeTab && instance._activeTab.opts.dirty && 
              ( e.reason === monaco.editor.CursorChangeReason.Undo || e.reason === monaco.editor.CursorChangeReason.Redo )){
            let model = instance._editor.getModel();
            if( model.getAlternativeVersionId() === instance._activeTab.opts.baseAVID ){
              instance._activeTab.opts.dirty = false;
              instance._activeTab.classList.remove("dirty");
            }
          }
        });

        instance._editor.onDidChangeModelContent( function(e){
          if( instance._activeTab.opts.dirty ) return;
          instance._activeTab.opts.dirty = true;
          instance._activeTab.classList.add( "dirty" );
        });

        /**
         * this only happens when you change the extension on a save.  switching 
         * models to a model with a different language does _not_ trigger this event.
         */
        instance._editor.onDidChangeModelLanguage( function(e){
          instance._nodes['editor-info-language'].textContent = 
            Utils.templateString( Messages.LANGUAGE, languageAliases[e.newLanguage] );

        });

        /**
         * focus event: we want to indicate which panel has focus
         */
        instance._editor.onDidFocusEditor( function(e){
          PubSub.publish( "focus-event", "editor" );
        });

        /**
         * map extensions -> languages, cache aliases.  add some 
         * extensions monaco (monarch?) doesn't include.
         */
        monaco.languages.getLanguages().forEach( function( lang ){
          lang.extensions.forEach( function( ext ){
            languageExtensions[ext.toLowerCase()] = lang.id;
          })
          languageAliases[lang.id] = lang.aliases[0];
        });
        languageExtensions['.rscript'] = 'r';
        languageExtensions['.rsrc'] = 'r';

        // if we are loading open files, that's async; if not, we can just 
        // create a blank buffer and continue.  note the placeholder is there 
        // to make it lay out properly before we've added any tabs.  the 
        // alternative is to add at least one tab, then call layout().  that 
        // flashes a bit, though.

        let removePlaceholder = function(){
          let placeholder = instance._nodes['placeholder-tab'];
          placeholder.parentNode.removeChild( placeholder );
          delete instance._nodes['placeholder-tab'];
        }

        if( instance._fileSettings.openFiles && instance._fileSettings.openFiles.length ){
          let files = instance._fileSettings.openFiles.slice(0);
          let loadNext = function(){
            return new Promise( function( resolve, reject ){
              let file = files.shift();
              instance._load( file, true, true ).then( function(){
                if( files.length ){
                  loadNext().then( function(){
                    resolve();
                  })
                }
                else resolve();
              })
            });
          }
          loadNext().then( function(){
            removePlaceholder();
            instance._selectTab(instance._fileSettings.activeTab || 0);
            instance._updateOpenFiles(); // this cleans up any files that couldn't be opened
          })
        }
        else {
          console.info( "no open files; opening blank document");
          instance._addTab({ value: "" }, true);
          removePlaceholder();
        }

        resolve();

      });

    });

  }

  /**
   * API method: update editor UI layout.  call this on resize.
   */
  layout(){

    if( !this._editor ) return;

    let node = this._nodes['editor-body'];
    if( node.clientWidth > 0 && node.clientHeight > 0 )
      this._editor.layout({ width: node.clientWidth, height: node.clientHeight});
  } 

  /**
   * if the passed parameter is an index (a number) then look it 
   * up and return the tab reference.  if the passed parameter is a 
   * string, that's a file path; check and return any matching tab.
   * 
   * UPDATE: also support passing {delta: integer} where it will step 
   * + or - the given number of tabs.  that's going to be called by 
   * a keyboard command (ctrl+pageup/pagedown)
   * 
   * returns the default tab (0) if not found.  that should ensure 
   * it does something.
   * 
   * @param {*} tab 
   */
  _checkIndexTab(tab){
    if( typeof tab === "number" ){
      let tabs = this._nodes['editor-header'].querySelectorAll( ".editor-tab" );
      return tab >= 0 && tabs.length > tab ? tabs[tab] : tabs[0];
    }
    else if( typeof tab === "string" ){
      let tabs = this._nodes['editor-header'].querySelectorAll( ".editor-tab" );
      for( let i = 0; i< tabs.length; i++ ){
        if( tabs[i].opts && tabs[i].opts.file === tab ) return tabs[i];
      }    
      return tabs[0];
    }
    else if( typeof tab.delta !== "undefined" ){
      let index = 0;
      let tabs = this._nodes['editor-header'].querySelectorAll( ".editor-tab" );
      for( ; index< tabs.length; index++ ) if( tabs[index].classList.contains( "active" )) break;
      index = (index + Number( tab.delta ) + tabs.length) % tabs.length;
      return tabs[index];
    }
    return tab;
  }

  /**
   * API method: unclose the last-closed tab.  FIXME: restore state?
   */
  uncloseTab(){
    if( !this._closedTabs.length ){
      console.warn( "Unclose tab: nothing on stack" );
      return;
    }
    this.open(this._closedTabs.shift());
  }

  /**
   * 
   * @param {*} tab reference or index
   */
  _closeTab(tab){

    tab = this._checkIndexTab(tab);

    // FIXME: unsaved changes?
    if( tab.opts.dirty ){
      console.warn( "Closing tab with unsaved changes" );
    }

    // for unclosing. FIXME: cap?
    if( tab.opts.file ){
      this._closedTabs.unshift( tab.opts.file );
      Watcher.unwatch( tab.opts.file );
    }

    if( this._activeTab === tab ){

      // if this is the active tab, select the _next_ tab, if there's no next 
      // tab select the _previous_ tab, if this is the only tab add a new empty tab.

      let next = tab.nextSibling;
      while( next && (!next.className || !next.className.match( /editor-tab/ ))) next = next.nextSibling;
      if( !next ){
        next = tab.previousSibling;
        while( next && (!next.className || !next.className.match( /editor-tab/ ))) next = next.previousSibling;
      }

      if( next ) this._selectTab(next);
      else this._addTab({ value: "" });

    }

    // remove 
    tab.parentNode.removeChild(tab);

    // clean up resources
    if( tab.opts.model ) tab.opts.model.dispose();

    // update
    this._updateOpenFiles();

  }

  /**
   * API method for switching tabs; this one expects a delta.  I wanted 
   * (at least conceptually) to limit access to the selectTab function.
   */
  switchTab( delta ){
    this._selectTab({ delta: delta });
  }

  /**
   * 
   * @param {*} tab reference or index
   */
  _selectTab(tab){

    tab = this._checkIndexTab(tab);

    // click active tab? do nothing
    if( this._activeTab === tab ) return;

    // save state
    if( this._activeTab ){
      this._activeTab.opts.state = this._editor.saveViewState();
      this._activeTab.classList.remove( "active" );
    }

    tab.classList.add( "active" );
    this._editor.setModel(tab.opts.model);
    if( tab.opts.state ) this._editor.restoreViewState(tab.opts.state);

    this._activeTab = tab;
    tab.opts.baseAVID = tab.opts.baseAVID;

    let lang = tab.opts.model.getLanguageIdentifier().language;
    this._nodes['editor-info-language'].textContent = 
      Utils.templateString( Messages.LANGUAGE, languageAliases[lang] );

    PubSub.publish( "editor-cursor-position-change", this._editor.getPosition());

    this._editor.focus();
    if( tab.opts.file ) this._fileSettings.activeTab = tab.opts.file;

  }

  /**
   * API method to focus editor
   */
  focus(){
    this._editor.focus();
  }

  /**
   * 
   * @param {*} opts 
   * @param {*} toll 
   * @param {*} model 
   */
  _addTab(opts, toll, model){

    if( model ) console.warn( "passed 3d options" );

    // UPDATE: there's never a tab without an opts and there's 
    // always an opts.baseAVID (defaults to 1).  I don't want 
    // everyone to test on these values.

    opts = opts || {};

    let ext = (path.extname(opts.file || "") || "").toLowerCase();
    let lang = languageExtensions[ext] || "plaintext";

    // create a tab

    let tab = document.createElement("div");
    tab.className = "editor-tab";

    let label = document.createElement("div");
    label.className = "label";
    label.textContent = path.basename(opts.file || "Untitled");
    label.setAttribute( "title", opts.file || "Untitled" );
    tab.appendChild( label );

    let icon = document.createElement("div");
    icon.className = "tab-icon";
    icon.setAttribute( "title", "Close" );
    tab.appendChild( icon );

    // create a model

    opts.model = model || monaco.editor.createModel(opts.value, lang);  
    opts.baseAVID = opts.model.getAlternativeVersionId();

    opts.model.updateOptions( this._modelOptions );

    tab.opts = opts;
    this._nodes['editor-header'].appendChild(tab);

    if( !toll ){
      this._selectTab(tab);
      this._updateOpenFiles();
    }

  }

  _updateOpenFiles(){
    let tabs = this._nodes['editor-header'].querySelectorAll( ".editor-tab" );
    let files = Array.prototype.map.call( tabs, function( tab ){
      if( tab.opts && tab.opts.file ){
        return tab.opts.file;
      }
    });
    this._fileSettings.openFiles = files.filter( function( f ){ return f; });
  }

  _updateRecentFiles(file){

    /*
    // if this already exists in the list, remove it
    let tmp = fileSettings.recentFiles.filter( function( check ){
      return ( file !== check );
    })
    */

    // actually, different behavior.  if it's in the list, do nothing.

    let tmp = this._fileSettings.recentFiles.some(function( check ){ return check === file; });
    if( tmp ) return;

    // otherwise add at the top (limit to X)

    tmp = this._fileSettings.recentFiles.slice(0, 9);
    tmp.unshift( file );
    this._fileSettings.recentFiles = tmp;

    PubSub.publish( "update-menu" ); // trigger a menu update

  }

  /**
   * API method: update options (pass through).  there may also be some local options 
   * we handle directly (and do not pass through).
   * 
   * @param {string} theme 
   */
  updateOptions(opts){
    this._handleLocalOptions(opts);
    this._editor.updateOptions(opts);
    if( typeof opts.theme !== "undefined" ) this._updateEditorTheme( opts.theme );
  }

  /**
   * API method: get available themes.  at the moment we are using built-in themes only.
   */
  getAvailableThemes(){
    return [
      "vs", "vs-dark", "hc-black"
    ];
  }

  /**
   * API method: get recent files.  for menu.
   */
  getRecentFiles(){
    if( this._fileSettings.recentFiles ) return this._fileSettings.recentFiles.slice(0);
    return [];
  }

  /**
   * 
   * @param {*} tab 
   * @param {boolean} saveAs treat this as a "save as", even if there's already a filename
   */
  _save( tab, saveAs ){

    tab = this._checkIndexTab(tab);
    let file = tab.opts.file;

    if( !saveAs && tab.opts.preventSave ){
      dialog.showMessageBox({
        title: Messages.FILE_CHANGED_WARNING.TITLE,
        message: Messages.FILE_CHANGED_WARNING.MESSAGE,
        detail: Messages.FILE_CHANGED_WARNING.DETAIL
      });
      saveAs = true;
    }

    if( saveAs || !file ){

      saveAs = true; 
      let filters = [];
      let modeId = tab.opts.model.getModeId();
      if( modeId === "r" ){
        filters.push({name: Messages.R_FILES_PATTERN, extensions: ['r', 'rsrc', 'rscript']});
      }
      else {
        if( languageAliases[modeId] ){
          let extensions = Object.keys(languageExtensions).filter( function( ext ){
            return languageExtensions[ext] === modeId;
          }).map( function( ext ){
            return ext.substring(1);
          })
          filters.push({ name: languageAliases[modeId], extensions: extensions });
        }
      }

      filters.push({name: Messages.ALL_FILES_PATTERN, extensions: ['*']});

      let rslt = dialog.showSaveDialog({
        defaultPath: file || "", // Settings.openPath,
        filters: filters,
        properties: ['openFile', 'NO_multiSelections']});
      if( !rslt ) return false;
      file = rslt;
    }

    let contents = tab.opts.model.getValue();
    let instance = this;

    this._saving = file;

    fs.writeFile( file, contents, { encoding: "utf8" }, function(err){

      if( err ){
        console.error( err );
        PubSub.publish( "error", { 
          className: "error",
          title: Messages.FILE_WRITE_ERROR,
          body: file,
          'original-error': err, 
          file: file 
        });

        instance._saving = undefined;
        return;
      }

      tab.opts.preventSave = false;
      tab.opts.dirty = false;
      tab.opts.baseAVID = tab.opts.model.getAlternativeVersionId();
      tab.classList.remove( "dirty" );

      // if the filename has changed, we need to update the tab, both
      // data and UI, and potentially change the language as well.

      if( saveAs ){

        if( tab.opts.file ) Watcher.unwatch( tab.opts.file );
        tab.opts.file = file;
        Watcher.watch( tab.opts.file );

        let label = tab.querySelector( ".label" );
        label.setAttribute( "title", file );
        label.textContent = path.basename(file);

        let ext = (path.extname(file) || "").toLowerCase();
        let lang = languageExtensions[ext] || "plaintext";
        if( lang !== tab.opts.model.getModeId()){
          monaco.editor.setModelLanguage( tab.opts.model, lang )
        }

        instance._updateRecentFiles(file);
        instance._updateOpenFiles();

      }

      // don't do this here.  wait for the event notification.
      // instance._saving = undefined;

    })
    
  }

  /**
   * 
   * @param {*} tab 
   */  
  _revert(tab){

    tab = this._checkIndexTab(tab);
    if( !tab.opts.file ){
      console.warn( "Can't _revert this tab (not linked to file)" );
      return;
    }

    let vs = ( this._activeTab === tab ) ? this._editor.saveViewState() : null;
    let instance = this;

    return new Promise( function( resolve, reject ){
      fs.readFile( tab.opts.file, { encoding: 'utf8' }, function( err, contents ){
        if( err ){
          console.error( err );
          PubSub.publish( "error", {
            title: Messages.FILE_READ_ERROR, 
            className: "error",
            body: tab.opts.file,  
            'original-error': err, 
            file: file 
          });
        }
        else {
          tab.opts.model.setValue(contents);
          
          tab.opts.dirty = false;
          tab.opts.baseAVID = tab.opts.model.getAlternativeVersionId();
          tab.classList.remove( "dirty" );          

          if(vs) instance._editor.restoreViewState(vs);

        }
        resolve();
      });
    });
  }

  /**
   * 
   * @param {*} file 
   * @param {*} add 
   * @param {*} toll 
   */
  _load( file, add, toll ){

    if( !toll ) this._updateRecentFiles( file );
    let instance = this;

    return new Promise( function( resolve, reject ){
      fs.readFile( file, { encoding: 'utf8' }, function( err, contents ){
        if( err ){
          console.error( err );
          PubSub.publish( "error", {
            title: Messages.FILE_READ_ERROR,
            className: "error",
            body: file,  
            'original-error': err, 
            file: file 
          });

          // remove from recent files? ... 
          // depends on the error, probably (permissions or locked: no, 
          // not found: yes)

        }
        else {
          Watcher.watch( file );
          instance._addTab({ file: file, value: contents }, toll);
          /*
          watchFile( file );
          addEditor({ path: file, value: contents, node: opts.node }, toll);
          if( add ){
            // settings doesn't handle arrays
            let arr = FileSettings.openFiles || [];
            arr.push( file );
            FileSettings.openFiles = arr;
          }
          */
          
        }
        resolve();
      });
    }).catch(function(e){
      console.error( "E2", e );
    });
  };

  /**
   * 
   * @param {string=} file 
   */
  open( file ){

    // open dialog

    if( !file ){    
      let rslt = dialog.showOpenDialog({
        defaultPath: "", // Settings.openPath,
        filters: [
          {name: Messages.R_FILES_PATTERN, extensions: ['r', 'rsrc', 'rscript']},
          {name: Messages.ALL_FILES_PATTERN, extensions: ['*']}
        ],
        properties: ['openFile', 'NO_multiSelections']});
      
      if( !rslt ) return;
      file = rslt[0];
    }

    // if the file is already open, don't open it again. switch to the buffer.

    let tabs = this._nodes['editor-header'].querySelectorAll( ".editor-tab" );
    for( let i = 0; i< tabs.length; i++ ){
      if( tabs[i].opts && tabs[i].opts.file === file ){
        this._selectTab( tabs[i] );
        return;
      }
    }

    // ok, _load 

    this._load( file, true );
  };

}

module.exports = new Editor();

