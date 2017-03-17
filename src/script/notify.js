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

const { Utils } = require( "./util2.js" );

const DEFAULT_TIMEOUT = 3; // seconds

let panel;

const createPanel = function(){

  panel = document.createElement( "div" );
  panel.className = "notifier-panel";
  document.body.appendChild( panel );
 
};

module.exports.notify = function( opts ){

  opts = opts || {};

  if( !panel ) createPanel();

  let node = document.createElement( "div" );
  node.className = "notifier-message " + opts.className || "";

  Utils.parseHTML( `<div class='notifier-icon'></div>
    <div class='notifier-title'>${opts.title || ""}</div>
    <div class='notifier-body'>${opts.body || ""}</div>
    <div class='footer'>${opts.footer || ""}</div>`, node );

  // default to top of stack, optionally on bottom

  if( opts.bottom ) panel.appendChild( node );
  else panel.insertBefore( node, panel.firstChild );

  return new Promise( function( resolve, reject ){

    let timer = null;
    let clicked = false;
    let clickEvent = null;
    let expiring = false;

    let click = function(e){
      e.stopPropagation();
      e.preventDefault();
      clickEvent = e;
      if( timer ) clearTimeout( timer );
      clicked = true;
      if( !expiring ){
        node.removeEventListener( "transitionend", expire );
        node.removeEventListener( "transitionend", cleanup );
        node.addEventListener( "transitionend", cleanup );
        setTimeout( function(){ node.style.opacity = 0; }, 1 );
      }
    };

    let expire = function(){
      node.removeEventListener( "transitionend", expire );
      node.addEventListener( "transitionend", cleanup );
      if( opts.timeout !== Infinity ){
        let ms = ( opts.timeout || DEFAULT_TIMEOUT ) * 1000;
        timer = setTimeout( function(){ expiring = true; node.style.opacity = 0; }, ms );
      }
    };

    let cleanup = function(){
      node.removeEventListener( "click", click );
      node.removeEventListener( "transitionend", cleanup );
      node.removeEventListener( "transitionend", expire ); // JIC
      node.parentNode.removeChild( node );
      resolve( { reason: clicked ? "click" : "timeout", event: clickEvent });
    };

    node.addEventListener( "click", click );
    node.addEventListener( "transitionend", expire );

    requestAnimationFrame(function(){ node.style.opacity=1; });

  });

};

