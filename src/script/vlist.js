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

let measurementNode = undefined;

/**
 * simple virtual list.  one direction (vertical) only.
 * 
 * FIXME: missing resize handler
 */
const VList = function( parent, data, template, update, options ){

  options = options || {};

  if( !measurementNode ){
    measurementNode = document.createElement( "div" );
    measurementNode.className = "vlist-measurement-node vlist-list-entry";
    document.body.appendChild( measurementNode );
  }

  measurementNode.innerHTML = template;
  if( data.length ) update( measurementNode, data[0] );
  let size = measurementNode.getBoundingClientRect();
  let bodySize = document.body.getBoundingClientRect();
  let targetCount = Math.round( 2 * bodySize.height / size.height );

  // dump old children.  FIXME: clean up listeners
  for( let i = 0; i< parent.childNodes.length; i++ ){
    parent.removeChild( parent.childNodes[i] );
  }

  //let nodes = new Array( Math.min( targetCount, data.length ));
  let nodes = new Array( targetCount );

  // add nodes
  for( let i = 0; i< nodes.length; i++ ){
    nodes[i] = document.createElement( "div" );
    nodes[i].className = "vlist-list-entry";
    nodes[i].innerHTML = template;
    parent.appendChild( nodes[i] );
  }

  let scrollLock = true;
  let scrollTop = 0;
  let firstNode = -1;
  let totalHeight = data.length * size.height;
  let nodeHeight = nodes.length * size.height;

  let updateAll = function(force){
    window.requestAnimationFrame(function() {

      // find first node
      let first = Math.floor( scrollTop / size.height );

      // allow consistent styling of odd/even rows (otherwise nth-child
      // even/odd rules will jump.  this causes a separate problem at the 
      // end of the list, though, because we might have more nodes than
      // data entries.

      // the obvious solution is to push back the start; BUT that's a problem
      // if the length of the list is odd, because we'll never display the 
      // last item.  

      // so we have to display/hide at least one node.  rather than having
      // special handling for the last node, we'll just display/hide in the 
      // regular loop.

      if( first % 2 ) first--;

      // update (if necessary)
      if( force || first !== firstNode ){

        for( let i = 0; i< nodes.length; i++ ){
          if( i + first < data.length ){
            update( nodes[i], data[i + first], i + first)
            nodes[i].style.display = "";
          }
          else {
            nodes[i].style.display = "none";
          }
        }
        firstNode = first;

        // adjust margins
        let mtop = firstNode * size.height;
        parent.style.marginTop = mtop + "px";
        parent.style.marginBottom = ( totalHeight - nodeHeight - mtop ) + "px";
      }
      
      // ok for next event
      scrollLock = false;

    });
  };

  let scrollFunction = function(e){
    e.stopPropagation();
    e.preventDefault();
    scrollTop = e.target.scrollTop;
    if( !scrollLock ){
      updateAll();
    }
    scrollLock = true;
  };

  let keyFunction = function(e){
    let delta = 0;
    switch(e.key){
    case "ArrowDown":
      delta = size.height;
      break;
    case "ArrowUp":
      delta = -size.height;
      break;
    case "PageDown":
      delta = parent.parentNode.offsetHeight;
      break;
    case "PageUp":
      delta = -parent.parentNode.offsetHeight;
      break;
    default:
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    parent.parentNode.scrollTop += delta;
  }

  window.addEventListener( "keydown", keyFunction );

  updateAll();
  if( options.firstIndex && options.firstIndex > 1 ){
    window.requestAnimationFrame(function(){
      parent.parentNode.scrollTop = size.height * ( options.firstIndex - 1 );
    })
  }

  parent.addEventListener( "scroll", scrollFunction );
  parent.parentNode.addEventListener( "scroll", scrollFunction );

  this.repaint = function(){ updateAll(true); }

  this.updateData = function(newdata, scrollTo){
    data = newdata;
    totalHeight = data.length * size.height;
    updateAll(true);
    if( typeof scrollTo !== "undefined" ){
      window.requestAnimationFrame(function(){
        parent.parentNode.scrollTop = size.height * ( scrollTo - 1 );
      });
    }
  };

  this.scrollTo = function(index){
    window.requestAnimationFrame(function(){
      parent.parentNode.scrollTop = size.height * ( index - 1 );
    })
  }

  this.cleanup = function(){
    parent.removeEventListener( "scroll", scrollFunction );
    parent.parentNode.removeEventListener( "scroll", scrollFunction );
    window.removeEventListener( "keydown", keyFunction );
  };

};

module.exports = VList;
