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

const ProgressBarManager = function(){

  let pbmap = {}; 
  let shell;

  this.init = function(shell_instance){
    shell = shell_instance;
  };

  this.update = function( obj ){

    // have we seen this before?
    if( typeof pbmap[obj.key] === "undefined" ){
      
      pbmap[obj.key] = obj;

      // insert node
      let div = document.createElement( "div" );
      div.className = "shell-progress-bar";

      let wtype = typeof obj.width;
      if( wtype === "number" ) div.style.width = obj.width + "em";
      else if( wtype === "string" ) div.style.width = obj.width;

      let val = ( typeof obj.value === "undefined" ) ? obj.initial : obj.value;
      let pct = Math.max( 0, Math.min( Math.round( 100 * ( val - obj.min ) / ( obj.max - obj.min )), 100 ));

      let label = pct + "%";
      if( typeof obj.label === "function" ) label = obj.label(pct);

      div.innerHTML = `
        <div class='shell-progress-bar-fill' style='width:${pct}%'></div>
        <div class='shell-progress-bar-label'>${label}</div>
      `;
      shell.insert_node( div, true );
      pbmap[obj.key].__node = div;

    }
    else if( obj.closed ){
      // remove reference, but (for now) leave the node
      delete pbmap[obj.key];
    }
    else {
      Object.keys( obj ).forEach( function( key ){
        pbmap[obj.key][key] = obj[key];
        let pct = Math.max( 0, Math.min( Math.round( 100 * ( obj.value - obj.min ) / ( obj.max - obj.min )), 100 ));
        let label = pct + "%";
        if( typeof obj.label === "function" ) label = obj.label(pct);
        else if( typeof obj.label === "string" ) label = obj.label;

        pbmap[obj.key].__node.querySelector( ".shell-progress-bar-fill" ).style.width = `${pct}%`;
        pbmap[obj.key].__node.querySelector( ".shell-progress-bar-label" ).textContent = label;
      })
    }

  }

};

module.exports = new ProgressBarManager();
