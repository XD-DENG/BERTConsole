
"use strict";

const fs = require( "fs" );

class Utils {

  static clone( obj ){
    return JSON.parse(JSON.stringify(obj)); // yuck
  }

  /**
   * set a deep value by reference.  optionally create the hierarchy.
   * note that creating will only create objects, not arrays.
   * 
   * @param {object} obj 
   * @param {string} ref 
   * @param {*} val 
   * @param {boolean} create 
   */
  static dereference_set( obj, ref, val, create ){
    let keys = ref.split( /\./ );
    while( keys.length > 1 ){
      let key = keys.shift();
      if( !obj[key] && create ) obj[key] = {}; // otherwise will throw
      obj = obj[key];
    }
    obj[keys[0]] = val;
  }

  static dereference_get( obj, ref ){
    let keys = ref.split( /\./ );
    while( keys.length ){
      obj = obj[keys.shift()];
      if( !obj ) return obj;
    }
    return obj;
  }

  /**
   * given a block of html, add it to the target node
   * (just set innerHTML), then return a map of all 
   * nodes that have ids.
   * 
   * Optionally use the messages parameter to update 
   * attributes for title and placeholder (...)
   */
  static parseHTML( content, target, messages ){

    let search = function( node, map ){
      let children = node.children;
      for( let i = 0; i< children.length; i++ ){
        if( children[i].id ) map[children[i].id] = children[i];
        if( messages ){
          ["title", "placeholder"].forEach( function( attr ){
            let matchattr = `data-${attr}-message`;
            if( children[i].hasAttribute( matchattr )){
              let msg = children[i].getAttribute( matchattr );
              children[i].setAttribute( attr, messages[msg] );
            }
          });
          if( children[i].hasAttribute( "data-textcontent-message" )){
              let msg = children[i].getAttribute( "data-textcontent-message" );
              children[i].textContent = messages[msg] ;
          }
        }
        search( children[i], map );
      }
    };

    let nodes = {};
    target.innerHTML = content;
    search( target, nodes );
    return nodes;

  }

  /**
   * ensure that a stylesheet is attached to the document.
   * loads by reference (i.e. link rel) instead of inlining.
   */
  static ensureCSS(file, attrs, root){

    root = root || document.head;
    if( typeof root === "string" ) root = document.querySelector( root );
    if( !root ) throw( "invalid root node" );

    let elements = root.querySelectorAll( "link[rel=stylesheet]" );
    let marker = null;

    for( let i = 0; i< elements.length; i++ ){
      let href = elements[i].getAttribute( "href" );
      if( href === file ) return;
      let attr = elements[i].getAttribute( "data-position" );
      if( attr && attr === "last" ) marker = elements[i];
    }

    let link = document.createElement( "link" );
    link.setAttribute( "rel", "stylesheet" );
    if( attrs ){
      Object.keys( attrs ).forEach( function( a ){
        link.setAttribute( a, attrs[a] );
      });
    }

    link.setAttribute( "href", file );
    root.insertBefore( link, marker );

  }

  static templateString( template ){
    template = template || "";
    let len = arguments.length - 1;
    for( let i = len; i > 0; i-- ){
      template = template.replace( new RegExp( "\\$" + i, "g" ), arguments[i] );
    }  
    return template;
  }

  static readFile( file, encoding ){
    if( typeof encoding === "undefined" ) encoding = "utf8";
    return new Promise( function( resolve, reject ){
      fs.readFile( file, encoding, function( err, data ){
        if( err ) return reject(err);
        return resolve(data);
      })
    });
  }

  /**
   * when R gives us a data frame, it's organized by column.  
   * restructure as rows, optionally named.
   */
  static restructureDataFrame( obj, named ){

    let cols = obj.$names.length;
    let rows = obj.$data[obj.$names[0]].length;
    let arr = new Array(rows);

    if( named ){
      for( let i = 0; i< rows; i++ ){
        arr[i] = {};
        for( let j = 0; j< cols; j++ ){
          let name = obj.$names[j];
          arr[i][name] = obj.$data[name][i];
        }
      }
    }
    else {
      for( let i = 0; i< rows; i++ ){
        arr[i] = [];
        for( let j = 0; j< cols; j++ ){
          let name = obj.$names[j];
          arr[i][j] = obj.$data[name][i];
        }
      }
    }
    return arr;
  }

}

module.exports = { Utils };

