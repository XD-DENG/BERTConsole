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

/**
 * overlay dialog, like bootstrap's modal.
 */

"use strict";

const { Utils } = require( "./util2.js" );
const PubSub = require( "pubsub-js" );

let backgroundCover = undefined;
let dialogBase = undefined;
let clickHandler = undefined;

const Dialog = function(html, Messages){

  if( !backgroundCover ){
    backgroundCover = document.createElement( "div" );
    backgroundCover.className = "dialog-background-cover";
    document.body.appendChild( backgroundCover );
  }

  if( !dialogBase ){
    dialogBase = document.createElement( "div" );
    dialogBase.className = "dialog-base";
    document.body.appendChild( dialogBase );
    dialogBase.addEventListener( "click", function(e){
      e.stopPropagation();
      e.preventDefault();
      if( clickHandler ) clickHandler(e);
    })
  }

  this.nodes = Utils.parseHTML( html, dialogBase, Messages || {} );

  this.hide = function(){
    PubSub.publish( "enable-menu-bar", true );
    backgroundCover.style.display = "none";
    dialogBase.style.display = "none";
  };

  this.fixSize = function(){
    let x = dialogBase.querySelector( ".dialog-dialog" );
    let size = x.getBoundingClientRect();
    x.style.width = size.width + "px";
    x.style.height = size.height + "px";
  };

  this.show = function( clickFunction, options ){

    PubSub.publish( "enable-menu-bar", false );

    let instance = this;
    options = options || {};

    backgroundCover.style.display = "block";
    dialogBase.style.display = "flex";

    return new Promise( function( resolve, reject ){

      if( options.fixSize ){
        instance.fixSize();
      }

      let close = function(rslt){
        clickHandler = null;
        window.removeEventListener( "keydown", keyHandler );
        instance.hide();
        return resolve(rslt);
      };

      let keyHandler = function(e){
        let rslt = undefined;
        switch(e.code){
        case "Escape":
          rslt = "Cancel";
          break;
        case "Enter":
          rslt = "OK";
          break;
        default:
          return;
        }
        e.stopPropagation();
        e.preventDefault();
        close(rslt);
      };
      window.addEventListener( "keydown", keyHandler );

      clickHandler = function(e){
        let dialogResult = null;
        if( e.target.tagName === "BUTTON" ){
          if( e.target.classList.contains( "dialog-button-ok" )) dialogResult = "OK";
          else if( e.target.classList.contains( "dialog-button-cancel" )) dialogResult = "Cancel";
          else if( e.target.hasAttribute( "data-dialog-result" )) dialogResult = 
            e.target.getAttribute( "data-dialog-result" );
        }
        if( !dialogResult && clickFunction ){
          dialogResult = clickFunction.call(this, e);
        }
          
        if( dialogResult ) close(dialogResult);

      };
    });
  };

};

module.exports = Dialog;

