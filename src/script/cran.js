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

const fs = require( "fs" );
const path = require( "path" );
const https = require( "https" );

const PubSub = require( "pubsub-js" );

const Cache = require( "./cache.js" );
const HTMLDialog = require( "./dialog.js" );
const Messages = require( "../data/messages.js" ).Main;
const { Utils } = require( "./util2.js" );
const VList = require( "./vlist.js" );

// 4 hours for dev, 0 (session) for production
// const CRAN_CACHE_TIME = 0 ; // session 
const CRAN_CACHE_TIME = 60 * 60 * 4; 

let sessionCache = {};

const getTemplate = function(f){
  return new Promise( function( resolve, reject ){
    if( sessionCache[f] ) return resolve(sessionCache[f]);
    Utils.readFile(f).then( function(data){
      sessionCache[f] = data;
      resolve(data);
    }).catch(function(err){
      reject(err);
    })
  })
}

////

/**
 * get the latest commit hash for the particular file (used to get for master).
 * however: is there a way to limit to just the most recent commit?
 *  
 * @param {*} force 
 */
const getLatestCommit = function(settings, force){
  return new Promise( function( resolve, reject ){

    var options = {
      host: 'api.github.com',
      path: '/repos/sdllc/BERTConsole/commits?path=util/packages.json',
      headers: { 
        'user-agent': 'https://github.com/sdllc/BERTConsole'
      }
    };

    if( !force && settings.cran && settings.cran['commit-etag'] ) options.headers['If-None-Match'] = settings.cran['commit-etag'];

    let callback = function(response) {
      let str = '';
      response.on('data', function (chunk) { str += chunk; });
      response.on('end', function () {
        let data;
        try {
          data = str.length ? JSON.parse(str) : {};
          if( response.statusCode === 200 ){
            console.info( 200 );
            if( !settings.cran ) settings.cran = {};
            settings.cran['commit-etag'] = response.headers.etag;
            if( data.length && data[0].sha ){
              settings.cran['commit-hash'] = data[0].sha;
              console.info( "Have hash: " + data[0].sha );
            }
          } 
          else console.info( "SC", response.statusCode );
          resolve(true);
        }
        catch(e){ 
          console.error(e);
          resolve(false); // NOT reject
        }
      });
    };

    https.request(options, callback).end();
  });
};

/**
 * fetch the package description list via CDN using the commit hash
 */
const getPackageDescriptions = function(settings){

  return new Promise( function( resolve, reject ){

    // once per session, check commit hash.  use etag.

    let p;
    if( !global['check-commit-hash'] ){
      global['check-commit-hash'] = true;
      p = getLatestCommit(settings);
    }
    else p = Promise.resolve();

    p.then( function(){

      // after checking commit, see if we have this description 
      // file in local storage.  if so, return it.  we cache the 
      // descriptions and hash separately, to promote overwriting.
      
      if( !settings.cran || !settings.cran['commit-hash'] ) return resolve(false);
      let hash = settings.cran['commit-hash'];
      let hashKey = "commit-hash";
      let storageKey = "package-descriptions";

      let data = localStorage.getItem(hashKey);
      if( data && data === hash ){

        console.info( "hash match" );

        // the way this works, even if the file is empty, we don't 
        // re-fetch the same hash code.  that's to minimize traffic.
        // you can manually flush the file (or wait for next commit).
        // if there's no file, then we do try again.

        data = localStorage.getItem(storageKey);
        if( data ){

          console.info( "have data" );
          
          let obj = {};
          try { 
            obj = JSON.parse( data ); 
          }
          catch( e ){ console.error(e); }
          return resolve( obj );
        }

      };

      console.info( "fetching descriptions file" );

      // not in local storage; fetch 

      localStorage.setItem(hashKey, hash);
      var options = {
        host: 'cdn.rawgit.com',
        path: `/sdllc/BERTConsole/${settings.cran['commit-hash']}/util/packages.json`,
        headers: { 
          'user-agent': 'https://github.com/sdllc/BERTConsole'
        }
      };

      let callback = function(response) {
        let str = '';
        response.on('data', function (chunk) { str += chunk; });
        response.on('end', function () {
          let obj;
          try { obj = str.length ? JSON.parse(str) : {}; }
          catch(e){ 
            console.error(e);
          }
          localStorage.setItem(storageKey, JSON.stringify(obj));
          resolve(obj);
        });
      };
      https.request(options, callback).end();

      //

    });

  });

}

////


/**
 * if we have a good CRAN repo, start the package chooser.
 * note we're caching packages according to the repo, but we don't 
 * want to hold a lot of these unecessarily. 
 * 
 * FIXME: session storage
 */
const showPackageChooserInternal = function(R, settings, cran){

  getTemplate( path.join( __dirname, "..", "data/package-chooser.template.html" )).then( function(template){

    let vlist;
    let currentFilter = "";
    let chooser = new HTMLDialog(template, Messages);
    let cacheKey = "package-list-" + cran;
    let data = Cache.get( cacheKey );
    let filtered;
    let selected_count = 0;
    let descriptions = {};

    let filterOnDescriptions = false;

    chooser.nodes['checkbox-filter-package-name-only'].checked = true;

    // start with "please wait"
    chooser.nodes['package-chooser-wait'].style.display = "block";
    chooser.nodes['package-chooser-list'].style.display = "none";
    chooser.nodes['dialog-footer-status-message'].textContent = "";

    // data filter function 
    let filterData = function(){
      if( !currentFilter || currentFilter.trim() === "" ){
        filtered = data;
      }
      else {
        let rex = new RegExp(currentFilter, "i");
        filtered = [];
        if( filterOnDescriptions ){
          for( let i = 0; i< data.length; i++ ){
            if( data[i].compositeText.match( rex )){
              filtered.push( data[i] );
            }
          }
        }
        else {
          for( let i = 0; i< data.length; i++ ){
            if( data[i][0].match( rex )){
              filtered.push( data[i] );
            }
          }
        }
      }
    };

    // update the filter, update or potentially create the list 
    let updateFilter = function(force){
      let f = (chooser.nodes['package-chooser-filter'].value || "").trim();
      if( !vlist || ( currentFilter !== f ) || force ){
        currentFilter = f;
        filterData();
        if(!vlist) vlist = new VList( chooser.nodes['package-chooser-list'], filtered, nodetemplate, update );
        else vlist.updateData( filtered );
      }
    };
    chooser.nodes['package-chooser-filter'].addEventListener( "input", updateFilter );

    // element click 
    let click = function(e){

      let n = e.target;
      while( n && n.parentNode && n.className !== "vlist-list-entry" ){

        if( n.classList.contains("dialog-header-form-child")){
          n = n.querySelector( "input[type=checkbox]" );
          if( n ){
            n.checked = !n.checked;
            filterOnDescriptions = !n.checked;
            updateFilter(true);
          }
          return null;
        }

        n = n.parentNode;
      }
      if( n.className !== "vlist-list-entry" ) return null;
      let data = n.data;
      if( data.installed ) return; // can't toggle

      data.selected = !data.selected;
      vlist.repaint();

      if( data.selected ) selected_count++;
      else selected_count--;

      if( selected_count === 0 )
        chooser.nodes['dialog-footer-status-message'].textContent = "";
      else if( selected_count === 1 )
        chooser.nodes['dialog-footer-status-message'].textContent = `1 ${Messages.PACKAGE_SELECTED_SINGLE}`;
      else
        chooser.nodes['dialog-footer-status-message'].textContent = `${selected_count} ${Messages.PACKAGE_SELECTED_PLURAL}`;


      // console.info( "index", n.index, "data", n.data );
    };

    // vlist update function 
    let update = function( node, data, index ){

      node.data = data;
      node.index = index;

      let name = node.querySelector( '.package-chooser-name' );
      if( data.installed ){
        name.parentNode.classList.add( "disabled" );
      }
      else name.parentNode.classList.remove( "disabled" );

      if( data.installed || data.selected ){
        name.parentNode.classList.add("chooser-checkbox-checked");
      }
      else {
        name.parentNode.classList.remove("chooser-checkbox-checked");
      }

      name.innerText = data[0];

      let description = node.querySelector( '.package-chooser-description' );
      description.innerText = data.description || "";

      //let version = node.querySelector( '.package-chooser-version' );
      //version.innerText = data[1];

    };

    // base template (FIXME: move to html file) 
    let nodetemplate = `
      <div class='package-chooser-entry'>
        <div class='chooser-checkbox'>
          <label class='package-chooser-name'></label>
        </div>
        <div class='package-chooser-description'></div>
      </div>
    `;

    chooser.show(click, {fixSize: true}).then( function( result ){
       console.info( "Close dialog", result );
      chooser.nodes['package-chooser-filter'].removeEventListener( "input", updateFilter );
      vlist.cleanup();

      if( result === "OK" ){
        let list = [];
        for( let i = 0; i< data.length; i++ ){
          if( data[i].selected ){
            list.push( `"${data[i][0]}"` );
          }
        }
        if( list.length ){
          let cmd = `install.packages(c(${list.join(",")}))`;
          PubSub.publish( "execute-block", cmd );
        }
      }

    }).catch( function( err ){
      console.error(err);
    });

    // get list of installed packages.  don't cache this.
    R.internal(["exec", "installed.packages()"]).then( function( rslt ){

      let installed = [];
      if( rslt.type === "response" ){
        let rows = rslt.response.$data.value.$nrows;
        installed = rslt.response.$data.value.$data.slice(0, rows);
      }

      // next get list of available packages (unless we have cache)
      let p = data ? Promise.resolve(data) : R.internal([ "exec", "available.packages()[,1:2]" ], "package-chooser");
      let obj;

      p.then( function( rslt ){

        obj = rslt;
        return getPackageDescriptions(settings);

      }).then( function( rslt ){

        if( rslt && rslt.packages ) descriptions = rslt.packages;

        if( obj.type === "response" ){

          // this is a matrix, column-major.
          let mat = obj.response.$data.value;
          data = new Array(mat.$nrows);

          for( let i = 0; i< mat.$nrows; i++ ){
            data[i] = new Array( mat.$ncols );
          }

          let index = 0;
          for( let j = 0; j< mat.$ncols; j++ ){
            for( let i = 0; i< mat.$nrows; i++, index++ ){
              data[i][j] = mat.$data[index];
            }
          }

          Cache.set( cacheKey, data, CRAN_CACHE_TIME );

        }
        else if( obj.type === "error" ){
          console.error(obj);

          // ...
        }

        // map installed flag... Q: are these in lexical sort order?
        // A: they're definitely not, so we have to do this the hard way.
        // A2: or sort, then do it?  is that actually cheaper? [probably]

        let scmp = function(a, b){ return a < b ? -1 : ( a > b ? 1 : 0 ); };
        let names = new Array( data.length );
        for( let i = 0; i< names.length; i++ ){
          names[i] = [ data[i][0], i ];
          data[i].index = i;
          data[i].description = descriptions[data[i][0]] || "";
          data[i].compositeText = `${data[i][0]} (${Messages.INSTALLED}) ${data[i].description}`;
        };

        names.sort(function(a, b){ return scmp(a[0], b[0]); });
        installed.sort(scmp);

        for( let i = 0, j = 0; i< names.length && j< installed.length; ){
          let c = scmp( names[i][0], installed[j] );
          if( c === 0 ){
            data[names[i][1]].installed = true;
            data[names[i][1]][0] += ` (${Messages.INSTALLED})`; // FIXME: messages
            i++, j++;
          }
          else if( c < 0 ) i++;
          else j++;
        };

        chooser.nodes['package-chooser-wait'].style.display = "none";
        chooser.nodes['package-chooser-list'].style.display = "block";
      
        updateFilter(); // will implicitly create the list

      });
    });
  }).catch( function( err ){
    console.error(err);
  });
};

/**
 * show the package chooser, but ensure we have a good cran repo
 * first.  if the repo looks ok, go right to the package chooser.
 * otherwise open the mirror chooser.  if the mirror chooser resolves
 * to a URL, then continue; otherwise we're done.
 * 
 * FIXME: add a message to the console on cancel?
 */
module.exports.showPackageChooser = function(R, settings){

  R.internal([ "exec", "getOption('repos')['CRAN']" ]).then( function( repo ){
    if( repo.type === "response" && repo.response.$data.value.CRAN ){
      let cran = repo.response.$data.value.CRAN;
      if( !cran.match( /^http/i )){

        // see note where this is set
        cran = settings.cran ? settings.cran.mirror : null;
        if( cran ){
          let cmd = `local({r <- getOption("repos"); r["CRAN"] <- "${cran}"; options(repos=r)})`;
          R.internal(['exec', cmd ]).then( function(){
            return Promise.resolve(cran);
          }).catch( function(e){
            return Promise.reject(e);
          });
        }
      }
      if(cran && cran.match( /^http/i )) return Promise.resolve( cran );
    } 
    return module.exports.showMirrorChooser();
  }).then( function(cran){
    if( cran && cran.match( /^http/ )){
      showPackageChooserInternal(R, settings, cran);
    }
  });

};

module.exports.showMirrorChooser = function(R, settings){

  // this function returns a promise so we can chain 
  // calls with the package chooser (assuming you click OK).
  // if you don't need it you can just discard.

  return new Promise( function( resolve, reject ){

    getTemplate( path.join( __dirname, "..", "data/mirror-chooser.template.html" )).then( function(template){

      let vlist, cran = undefined;
      let update, nodetemplate;
      let show_http = //(settings.cran && settings.cran.show_http_mirrors);
        ( settings.cran && settings.cran.mirror && settings.cran.mirror.match( /http\:/ ));

      let df = Cache.get( "mirror-list" );

      let chooser = new HTMLDialog(template, Messages);
      chooser.nodes['mirror-chooser-wait'].style.display = "block";
      chooser.nodes['mirror-chooser-list'].style.display = "none";

      chooser.nodes['checkbox-hide-http'].checked = !show_http;

      // update the filter, update or potentially create the list 
      let updateFilter = function(http){

        if( vlist && http === show_http ) return;

        let filtered = http ? df : df.filter( function( entry ){
          return entry.URL.match( /^https/i );
        });

        // for whatever reason when storing the URL R adds a trailing 
        // slash -- are we sure that's universal?

        let firstIndex = 0;
        
        if( cran ){
          let cranslash = cran + "/";
          for( let i = 0; i< filtered.length; i++ ){
            filtered[i].selected = ( filtered[i].URL === cran ) || ( filtered[i].URL === cranslash );
            if( filtered[i].selected ) firstIndex = i;
          }
        }
          
        if( !vlist ){
          vlist = new VList( chooser.nodes['mirror-chooser-list'], filtered, nodetemplate, update, { firstIndex: firstIndex });
        }
        else {
          vlist.updateData( filtered, firstIndex );
        }

      };

      let click = function(e){
        let n = e.target;

        while( n && n.parentNode && n.className !== "vlist-list-entry" ){
          if( n.className === 'dialog-checkbox' ){
            let cb = n.querySelector( "input[type=checkbox]" );
            cb.checked = !cb.checked; 
            updateFilter( !cb.checked );
            return;
          }
          n = n.parentNode;
        }
        if( n.className !== "vlist-list-entry" ){
          return null;
        }
        let d = n.data;
        if( !d.selected ){
          for( let i = 0; i< df.length; i++ ){
            df[i].selected = ( df[i] === d );
            if( df[i].selected ) cran = df[i].URL;
          }
          vlist.repaint();
        }
      };

      // FIXME: don't allow OK without a selection

      chooser.show( click, { fixSize: true }).then( function( result ){
        vlist.cleanup();
        if( result === "OK" ){

          // for whatever reason, setting this as a string was breaking 
          // settings (without an obvious error).  we need to figure out what
          // that was, but for now encoding is a workaround.

          // Settings.cran.mirror = btoa(cran);
          if( !settings.cran ) settings.cran = {};
          settings.cran.mirror = cran;

          let cmd = `local({r <- getOption("repos"); r["CRAN"] <- "${cran}"; options(repos=r)})`;
          R.internal(['exec', cmd ]).then( function(){
            resolve(cran);
          }).catch( function(e){
            reject(e);
          });
        }
        else resolve(false);
      });

      R.internal([ "exec", "getOption('repos')['CRAN']" ]).then( function( repo ){
        if( repo.type === "response" && repo.response.$data.value.CRAN ){
          cran = repo.response.$data.value.CRAN;
          if( cran === "@CRAN@" && settings.cran && settings.cran.mirror ) cran = settings.cran.mirror;
        }
        return df ? Promise.resolve(df) : R.internal([ "exec", "getCRANmirrors()" ], "mirror-chooser");
      }).then(function (obj) {

        if( obj.type === "response" ){
          df = Utils.restructureDataFrame( obj.response.$data.value, true );
          Cache.set( "mirror-list", df, CRAN_CACHE_TIME );
        }
        else if( obj.type === "error" ){
          console.error( obj );

          // ...
        }

        chooser.nodes['mirror-chooser-wait'].style.display = "none";
        chooser.nodes['mirror-chooser-list'].style.display = "block";

        update = function( node, data, index ){
          node.querySelector( '.mirror-chooser-name' ).innerText = data.Name;
          node.querySelector( '.mirror-chooser-host' ).innerText = data.Host;

          let s = node.querySelector( '.chooser-radio' );
          if( data.selected ) s.classList.add( "chooser-radio-checked" );
          else s.classList.remove( "chooser-radio-checked" );

          node.data = data;
        };

        nodetemplate = `
          <div class='mirror-chooser-entry'>
            <div class='chooser-radio'>
              <div class='chooser-label'>
                <div class='mirror-chooser-name'></div> 
                <div class='mirror-chooser-host'></div> 
              </div>
            </div>
          </div>
        `;

        updateFilter(show_http);
      });
    });
  });

};

