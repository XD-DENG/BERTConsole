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

class Utils {

  static clone( obj ){
    return JSON.parse(JSON.stringify(obj)); // yuck
  }

  /**
   * encode version as an integer.  we're transitioning from major.minor to 
   * major.minor.patch which makes this a little more complicated. if there's
   * no patch version, consider that a zero.  this is encoded as 
   * 
   * 1000 * 1000 * major + 1000 * minor + patch
   * 
   * that implies you should not have > 1000 minor or patch versions.  probably
   * a safe assumption.
   * 
   * returns a >= b
   */
  static encode_version( v ){
    let parts = (v||"").split(".");
    return Number(parts[0] || 0) * 1000 * 1000 +
      Number(parts[1] || 0) * 1000 +
      Number(parts[2] || 0);
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
   * enforce order in our linked stylesheets.  both we and monaco 
   * insert style elements, somewhat at random.  this will enforce 
   * that ours come last, and in the correct order.
   */
  static layoutCSS(){

    let nodelist = document.querySelectorAll( "link[data-position]" );
    let nodes = Array.prototype.map.call( nodelist, function(node){ 
      node.parentElement.removeChild(node);
      return node; 
    });

    nodes.sort( function( a, b ){
      return Number(a.getAttribute("data-position")) - Number(b.getAttribute("data-position"));
    })

    nodes.forEach( function( node ){
      document.head.appendChild(node);
    })

  }

  /**
   * ensure that a stylesheet is attached to the document.
   * loads by reference (i.e. link rel) instead of inlining.
   * 
   * 
   */
  static ensureCSS(file, attrs, force){

    let elementlist = document.head.querySelectorAll( "link[rel=stylesheet]" );
    let elements = Array.prototype.map.call( elementlist, function(elt){ return elt; });

    for( let i = 0; i< elements.length; i++ ){
      let href = elements[i].getAttribute( "href" );
      if( href === file ){
        if( force ) elements[i].parentNode.removeChild( elements[i] );
        else return;
      }
    }

    let link = document.createElement( "link" );
    link.setAttribute( "rel", "stylesheet" );
    if( attrs ){
      Object.keys( attrs ).forEach( function( a ){
        link.setAttribute( a, attrs[a] );
      });
    }

    link.setAttribute( "href", file );
    // root.insertBefore( link, marker );
    document.head.appendChild( link );

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

