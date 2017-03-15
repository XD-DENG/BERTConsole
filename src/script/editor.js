
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
 */
class Editor {

  constructor(){

    this.editor = null;
    this.nodes = null;
    this.closedTabs = [];

    /**
     * the dirty flag is a local flag used to prevent unnecessary 
     * lookups any time the content changes.  once set, it stays 
     * set (and shortcuts behavior) until it's explicitly un-set.  
     */
    this.dirty = false;

    /**
     * alternate version IDs are used to track changes and support 
     * undo, so we can undo back to clean state.
     */
    this.baseAVID = 0;

    this.fileSettings = Model.createLocalStorageProxy({
      recentFiles: []
    }, "file-settings", "file-settings-update" );
    window.model = this.fileSettings;

    /*
    PubSub.subscribe( "file-settings-update", function( channel, data ){
      console.info( "MU", data );
    })
    */

  }

  /**
   * handle local options, that we can deal with directly.  these are also 
   * removed from the object so they don't get passed through.
   * 
   * @param {object} options 
   */
  handleLocalOptions(options){

    let handle = function(key, func){
      if( typeof options[key] === "undefined" ) return;
      if( func ) func.call( this, options[key] );
      delete options[key];
    }.bind(this);

    // this one we just drop
    handle( "hide" );

    // the local layout function will check if editor exists 
    handle( "statusBar", function(val){
      let footer = this.nodes['editor-footer'];
      if( val ) footer.classList.remove( "hide" );
      else footer.classList.add( "hide" );
      this.layout();
    });

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

    theme = "monaco-editor " + (theme || "vs"); // default

    // FIXME: currently these two nodes don't have classes attached 
    // to them, so we can just set.  but if we start adding classes 
    // we'll have to do some work.

    this.nodes['editor-header'].className = theme;
    this.nodes['editor-footer'].className = theme;

  }


  /**
   * initialize the editor component and UI.  
   */
  init(container, options){

    options = options || {};

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

    this.nodes = Utils.parseHTML( editorHTML, container );

    let instance = this;

    PubSub.subscribe( "editor-cursor-position-change", function(channel, data){
      instance.nodes['editor-info-position'].textContent = 
        Utils.templateString( Messages.LINE_COL, data.lineNumber, data.column );
    });

    PubSub.subscribe( "status-message", function( channel, data ){
      instance.nodes['editor-status-message'].textContent = data;
    });

    instance.nodes['editor-header'].addEventListener( "click", function(e){
      let node = e.target;
      let close = false;
      while( node && node.className ){
        if( node.className.match( /tab-icon/ )) close = true;
        if( node.className.match( /editor-tab/ )){
          if( close ) instance.closeTab(node);
          else instance.selectTab(node);
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

    PubSub.subscribe( "menu-click", function( channel, data ){
      if( data ) switch( data.id ){

      case "file-save-as":
        instance.save(instance.getActiveTab(), true);
        break;

      case "file-save":
        instance.save(instance.getActiveTab());
        break;

      case "file-open":
        instance.open();
        break;

      case "file-revert":
        instance.revert(instance.getActiveTab());
        break;

      case "file-close":
        instance.closeTab(instance.getActiveTab());
        break;

      case "file-new":
        instance.addTab({ value: "" });
        break;
      }
    });

    this.handleLocalOptions( options );
    this._updateEditorTheme( options.theme );

    return new Promise( function( resolve, reject ){

      amdRequire(['vs/editor/editor.main'], function() {

        options.contextmenu = false; // always

        // it looks like there's a model created here, but then discarded when 
        // we install our first model.  not 100% sure of this behavior but seems 
        // to be ok to just ignore it.

        instance.editor = monaco.editor.create(instance.nodes['editor-body'], options );

        // window.editor = instance.editor;

        instance.editor.addAction({

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

        instance.editor.addAction({

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
         */
        instance.editor.onContextMenu( function( e ){

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

          let cm = instance.editor.getContribution( "editor.contrib.contextmenu" );
          let ma = cm._getMenuActions();

  //        window.cm = cm;
  //        window.ma = ma;

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

        let linkDetector = instance.editor.getContribution("editor.linkDetector" )
        linkDetector.openerService.open = function( resource, options ){ 
          require('electron').shell.openExternal(resource.toString());
        };

        instance.editor.onDidChangeCursorPosition( function(e){
          PubSub.publish( "editor-cursor-position-change", e.position );
          if( instance.dirty && ( e.reason === monaco.editor.CursorChangeReason.Undo || e.reason === monaco.editor.CursorChangeReason.Redo )){
            let model = instance.editor.getModel();
            if( model.getAlternativeVersionId() === instance.baseAVID ){
              let active = instance.getActiveTab();
              active.opts.dirty = false;
              instance.dirty = false;
              active.classList.remove("dirty");
            }
          }
        });

        instance.editor.onDidChangeModelContent( function(e){
          if( instance.dirty ) return;
          instance.dirty = true;
          let active = instance.getActiveTab();
          if( !active.opts ) active.opts = {};
          active.opts.dirty = true;
          active.classList.add( "dirty" );
        });

        /**
         * this only happens when you change the extension on a save.  switching 
         * models to a model with a different language does _not_ trigger this event.
         */
        instance.editor.onDidChangeModelLanguage( function(e){
          instance.nodes['editor-info-language'].textContent = // `Language: ${languageAliases[e.newLanguage]}`;
            Utils.templateString( Messages.LANGUAGE, languageAliases[e.newLanguage] );

        });

        /**
         * focus event: we want to indicate which panel has focus
         */
        instance.editor.onDidFocusEditor( function(e){
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
          let placeholder = instance.nodes['placeholder-tab'];
          placeholder.parentNode.removeChild( placeholder );
          delete instance.nodes['placeholder-tab'];
        }

        if( instance.fileSettings.openFiles && instance.fileSettings.openFiles.length ){
          let files = instance.fileSettings.openFiles.slice(0);
          let loadNext = function(){
            return new Promise( function( resolve, reject ){
              let file = files.shift();
              instance.load( file, true, true ).then( function(){
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
            instance.selectTab(instance.fileSettings.activeTab || 0);
          })
        }
        else {
          console.info( "no open files; opening blank document");
          instance.addTab({ value: "" }, true);
          removePlaceholder();
        }

        resolve();

      });

    });

  }

  layout(){

    if( !this.editor ) return;

    let node = this.nodes['editor-body'];
    if( node.clientWidth > 0 && node.clientHeight > 0 )
      this.editor.layout({ width: node.clientWidth, height: node.clientHeight});
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
  checkIndexTab(tab){
    if( typeof tab === "number" ){
      let tabs = this.nodes['editor-header'].querySelectorAll( ".editor-tab" );
      return tab >= 0 && tabs.length > tab ? tabs[tab] : tabs[0];
    }
    else if( typeof tab === "string" ){
      let tabs = this.nodes['editor-header'].querySelectorAll( ".editor-tab" );
      for( let i = 0; i< tabs.length; i++ ){
        if( tabs[i].opts && tabs[i].opts.file === tab ) return tabs[i];
      }    
      return tabs[0];
    }
    else if( typeof tab.delta !== "undefined" ){
      let index = 0;
      let tabs = this.nodes['editor-header'].querySelectorAll( ".editor-tab" );
      for( ; index< tabs.length; index++ ) if( tabs[index].classList.contains( "active" )) break;
      index = (index + Number( tab.delta ) + tabs.length) % tabs.length;
      return tabs[index];
    }
    return tab;
  }

  /**
   * convenience method, get the active tab (as reference)
   */
  getActiveTab(){
    return this.nodes['editor-header'].querySelector( ".editor-tab.active" );
  }

  uncloseTab(tab){
    if( !this.closedTabs.length ){
      console.warn( "Unclose tab: nothing on stack" );
      return;
    }
    this.open(this.closedTabs.shift());
  }

  /**
   * 
   * @param {*} tab reference or index
   */
  closeTab(tab){

    tab = this.checkIndexTab(tab);

    // FIXME: unsaved changes?
    if( tab.opts.dirty ){
      console.warn( "Closing tab with unsaved changes" );
    }

    // for unclosing. FIXME: cap?
    if( tab.opts.file ) this.closedTabs.unshift( tab.opts.file );

    let active = this.getActiveTab();
    if( active === tab ){

      // if this is the active tab, select the _next_ tab, if there's no next 
      // tab select the _previous_ tab, if this is the only tab add a new empty tab.

      let next = tab.nextSibling;
      while( next && (!next.className || !next.className.match( /editor-tab/ ))) next = next.nextSibling;
      if( !next ){
        next = tab.previousSibling;
        while( next && (!next.className || !next.className.match( /editor-tab/ ))) next = next.previousSibling;
      }

      if( next ) this.selectTab(next);
      else this.addTab({ value: "" });

    }

    // remove 
    tab.parentNode.removeChild(tab);

    // clean up resources
    if( tab.opts.model ) tab.opts.model.dispose();

    // update
    this.updateOpenFiles();

  }

  /**
   * 
   * @param {*} tab reference or index
   */
  selectTab(tab){

    tab = this.checkIndexTab(tab);

    let active = this.getActiveTab();
    if( active ){

      // click active tab? do nothing
      if( active === tab ) return;

      // save state
      if( active.opts ) active.opts.state = this.editor.saveViewState();

      active.classList.remove( "active" );
    }

    tab.classList.add( "active" );
    this.editor.setModel(tab.opts.model);
    if( tab.opts.state ) this.editor.restoreViewState(tab.opts.state);

    this.dirty = !!tab.opts.dirty;
    this.baseAVID = tab.opts.baseAVID || 1;

    let lang = tab.opts.model.getLanguageIdentifier().language;
    this.nodes['editor-info-language'].textContent = //`Language: ${languageAliases[lang]}`;
      Utils.templateString( Messages.LANGUAGE, languageAliases[lang] );

    PubSub.publish( "editor-cursor-position-change", this.editor.getPosition());

    this.editor.focus();
    if( tab.opts.file ) this.fileSettings.activeTab = tab.opts.file;

  }

  /**
   * API method to focus editor
   */
  focus(){
    this.editor.focus();
  }

  /**
   * 
   * @param {*} opts 
   * @param {*} toll 
   * @param {*} model 
   */
  addTab(opts, toll, model){

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
    tab.opts = opts;
    this.nodes['editor-header'].appendChild(tab);

    if( !toll ){
      this.selectTab(tab);
      this.updateOpenFiles();
    }

  }

  updateOpenFiles(){
    let tabs = this.nodes['editor-header'].querySelectorAll( ".editor-tab" );
    let files = Array.prototype.map.call( tabs, function( tab ){
      if( tab.opts && tab.opts.file ){
        return tab.opts.file;
      }
    });
    this.fileSettings.openFiles = files.filter( function( f ){ return f; });
  }

  updateRecentFiles(file){

    /*
    // if this already exists in the list, remove it
    let tmp = fileSettings.recentFiles.filter( function( check ){
      return ( file !== check );
    })
    */

    // actually, different behavior.  if it's in the list, do nothing.

    let tmp = this.fileSettings.recentFiles.some(function( check ){ return check === file; });
    if( tmp ) return;

    // otherwise add at the top (limit to X)

    tmp = this.fileSettings.recentFiles.slice(0, 9);
    tmp.unshift( file );
    this.fileSettings.recentFiles = tmp;

    PubSub.publish( "update-menu" ); // trigger a menu update

  }

  /**
   * API method: update options (pass through).  there may also be some local options 
   * we handle directly (and do not pass through).
   * 
   * @param {string} theme 
   */
  updateOptions(opts){
    this.handleLocalOptions(opts);
    this.editor.updateOptions(opts);
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
    if( this.fileSettings.recentFiles ) return this.fileSettings.recentFiles.slice(0);
    return [];
  }

  /**
   * 
   * @param {*} tab 
   * @param {boolean} saveAs treat this as a "save as", even if there's already a filename
   */
  save( tab, saveAs ){

    tab = this.checkIndexTab(tab);
    let active = this.getActiveTab();
    let file = tab.opts.file;

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

    // TODO: stop any watchers
    // ignoreChanges = editor.path;

    fs.writeFile( file, contents, { encoding: "utf8" }, function(err){

      if( err ){
        PubSub.publish( "file-write-error", { err: err, file: editor.path });
        return;
      }

      tab.opts.dirty = false;
      tab.opts.baseAVID = tab.opts.model.getAlternativeVersionId();
      tab.classList.remove( "dirty" );

      // if the filename has changed, we need to update the tab, both
      // data and UI, and potentially change the language as well.

      if( saveAs ){

        tab.opts.file = file;
        let label = tab.querySelector( ".label" );
        label.setAttribute( "title", file );
        label.textContent = path.basename(file);

        let ext = (path.extname(file) || "").toLowerCase();
        let lang = languageExtensions[ext] || "plaintext";
        if( lang !== tab.opts.model.getModeId()){
          monaco.editor.setModelLanguage( tab.opts.model, lang )
        }

        instance.updateRecentFiles(file);
        instance.updateOpenFiles();

      }

      if( tab === active ){
        instance.dirty = false;
        instance.baseAVID = tab.opts.baseAVID;
      }

      // TODO: reset watchers
      // ignoreChanges = null;
    })
    
  }

  /**
   * 
   * @param {*} tab 
   */  
  revert(tab){

    tab = this.checkIndexTab(tab);
    if( !tab.opts.file ){
      console.warn( "Can't revert this tab (not linked to file)" );
      return;
    }

    let instance = this;
    let active = this.getActiveTab();

    return new Promise( function( resolve, reject ){
      fs.readFile( tab.opts.file, { encoding: 'utf8' }, function( err, contents ){
        if( err ){
          console.error( err );
          PubSub.publish( "error", { 
            error: `Error reading file: ${tab.opts.file}`,
            'original-error': err, 
            file: file 
          });
        }
        else {
          tab.opts.model.setValue(contents);
          
          tab.opts.dirty = false;
          tab.opts.baseAVID = tab.opts.model.getAlternativeVersionId();
          tab.classList.remove( "dirty" );          

          if( tab === active ){
            instance.dirty = false;
            instance.baseAVID = tab.opts.baseAVID;
          }

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
  load( file, add, toll ){

    if( !toll ) this.updateRecentFiles( file );
    let instance = this;

    return new Promise( function( resolve, reject ){
      fs.readFile( file, { encoding: 'utf8' }, function( err, contents ){
        if( err ){
          console.error( err );
          PubSub.publish( "error", { 
            error: `Error reading file: ${file}`,
            'original-error': err, 
            file: file 
          });

          // remove from recent files? ... 
          // depends on the error, probably (permissions or locked: no, 
          // not found: yes)

        }
        else {
          instance.addTab({ file: file, value: contents }, toll);
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
   * @param {string} file 
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

    let tabs = this.nodes['editor-header'].querySelectorAll( ".editor-tab" );
    for( let i = 0; i< tabs.length; i++ ){
      if( tabs[i].opts && tabs[i].opts.file === file ){
        this.selectTab( tabs[i] );
        return;
      }
    }

    // ok, load 

    this.load( file, true );
  };

}

module.exports = new Editor();

