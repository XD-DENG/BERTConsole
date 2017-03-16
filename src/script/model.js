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
 * observed proxy.  it will broadcast changes via pubsub-js 
 * using the passed event name or a default.  we add 
 * a method to stop (and resume) broadcasting in the event 
 * we know there are going to be a lot of changes.
 * 
 * actually, FIXME? something like requestAnimationFrame or 
 * even a setTimeout could maybe efficiently batch updates.
 * 
 * although regarding batching, do you consolidate all the 
 * updates? if we're checking the path, then we still need 
 * it. perhaps make path optionally an array.
 */

"use strict";

const fs = require( "fs" );
const PubSub = require( "pubsub-js" );
const chokidar = require( "chokidar" );
const diff = require('deep-diff').diff;

const { Utils } = require( "./util2.js" );

const DEFAULT_EVENT = "model-update";

class Model {

  /**
   * create an observed proxy.  will broadcast events (or call event func)
   * 
   * @param {object} o root object (observed)
   * @param {string} event the message name for pubsub, or a callback function on 
   * property change
   */
  static createProxy(o, event) {

    /** default event */
    event = event || DEFAULT_EVENT;

    /** private flag */
    let broadcast = true;
      
    if( !Object.getOwnPropertyDescriptor( o, "__base__" )){
      Object.defineProperty( o, "__base__", { enumerable: false, configurable: true });
      Object.defineProperty( o, "__broadcast__", { enumerable: false, configurable: true });
    }

    /** tail method */
    function buildProxy(prefix, o) {

      return new Proxy(o, {
        set: function(target, property, value) {
          if( property === "__broadcast__" ){
            broadcast = value;
            return true;
          }
          if( property === "__base__" ){
            return false; // error
          }
          if( target[property] !== value ){
            target[property] = value;
            if( null == value ) delete target[property]; // == matches (null, undefined)
            if( broadcast ){
              if( typeof event === "function" ) event(prefix + property, value);
              else PubSub.publish( event, [prefix + property, value]);
            }
          }
          return true;
        },
        get: function(target, property) {
          if( property === "__base__" ){
            return target;
          }
          if( property === "__broadcast__" ){
            return broadcast;
          }
          let out = target[property];
          if( typeof out === "function" ) return out;
          if (out instanceof Object && (typeof property === "string" )) {
            return buildProxy(prefix + property + '.', out);
          }
          return out;
        },
      });
    }

    /**
     * do whatever's in the function silently.  supports 
     * async functions if they return a promise.
     */
    Object.defineProperty( o, "__silent__", {
      value: function( f ){
        broadcast = false;
        let rslt = f.call(this);
        if( rslt instanceof Promise ){
          return new Promise( function( resolve, reject ){
            rslt.then( function(a){
              broadcast = true;
              // NOTE: could use apply with arguments, 
              // but there's only one argument allowed
              resolve(a); 
            }).catch( function(e){
              // FIXME: should enable broadcast here? 
              reject(e);
            });
          });
        }
        else broadcast = true;
      }
    });

    // create base proxy
    let p = buildProxy('', o);

    return p;

  }

  /**
   * internal structure for proxy with backing store 
   * 
   * @param {*} o 
   * @param {*} event 
   * @param {*} save 
   * @param {*} restore 
   */
  static createBackedProxy(o, event, save, restore) {

    event = event || DEFAULT_EVENT;
    Object.defineProperty( o, "__event__", { enumerable: false, configurable: false, value: event });

    let timerID = undefined;

    // create a proxy.  this one doesn't broadcast, it calls directly
    let model = Model.createProxy(o, function( prop, val ){

      // lightly batch saves for super fast changes (also ensure async)
      // FIXME: handle window closing

      if( !timerID ){
        timerID = setTimeout( function(){
          save(model.__base__);
          timerID = null;
        }, 100 );
      }

      // broadcast event
      if( typeof event === "function" ) event(prop, val);
      else PubSub.publish(event, [prop, val]);
    });

    // restore.  there's a simplifying assumption here that any top-level
    // object in the stored data should override anything in the template.
    // this is somewhat questionable.  in some cases it might be a good idea
    // to impose required defaults post-restore.

    model.__broadcast__ = false;
    let data = restore();
    if( data ){
      Object.keys(data).forEach( function( key ){
        model[key] = data[key];
      });
    }
    model.__broadcast__ = true;

    return model;

  }

  /**
   * create an observed proxy backed by local storage.  on create, it will be 
   * populated if there's anything stored with the given key.  any changes will 
   * be written (async).
   * 
   * @param {object} o root object (observed)
   * @param {string} key local storage key
   * @param {*} event message name for pubsub or event callback function
   * @param {boolean} pretty pretty-print json file output
   */
  static createLocalStorageProxy(o, key, event) {

    let save = function(data){
      let json = JSON.stringify(data);
      localStorage.setItem( key, json );
    };

    let restore = function(){
      try { 
        let item = localStorage.getItem( key );
        if( item ) return JSON.parse(item);
      }
      catch(e){ console.error(e); }
      return {};
    };

    return Model.createBackedProxy(o, event, save, restore);
    
  }

  /**
   * for a file-backed model, reload the file.  we want to avoid looping 
   * (we load, fire change events, it gets saved, we load...) so we handle 
   * this in a couple of stages: (1) we load the new file. (2) we set changes
   * without broadcasting. (3) we broadcast change events for the deltas.
   * 
   * @param {*} obj 
   * @param {*} file 
   */
  static reloadFileStorageProxy(obj, file){
    return new Promise( function( resolve, reject ){

      if( obj.__saving__ ){ return resolve(); }

      console.info( "revert from saved" );

      fs.readFile( file, "utf8", function( err, data ){
        if( err ) return reject( err );
        try {

          // clone existing
          let orig = JSON.parse( JSON.stringify( obj.__base__ ));

          // get new and set
          data = JSON.parse( data );
          obj.__broadcast__ = false;
          Object.keys(obj).forEach( function(key){
            delete obj[key];
          });
          Object.keys(data).forEach( function(key){
            obj[key] = data[key];
          });
          obj.__broadcast__ = false;

          // now fire events for changes
          let event = obj.__event__;
          let delta = diff( orig, data );

          if( delta ){
            delta.forEach( function( change ){
              let prop = change.path.join( "." );
              if( change.kind === 'A' ) prop = prop + "." + change.index;
              let val = Utils.dereference_get( obj, prop );
              if( typeof event === "function" ) event(prop, val);
              else PubSub.publish(event, [prop, val]);
            });
          }
          resolve();
        }
        catch( e ){
          reject(e);
        }
      });
    })
  };

  /**
   * create an observed proxy backed by a file.
   * 
   * @param {object} o root object 
   * @param {string} file 
   * @param {*} event name for pubsub or event callback function
   */
  static createFileStorageProxy(o, file, event, opts){

    opts = opts || {};
    Object.defineProperty( o, "__saving__", { enumerable: false, configurable: true, writable: true, value: false });

    let saveTimer = null;

    let save = function(data){

      let actualSave = function(){
        o.__saving__ = true;
        let json = JSON.stringify(data, undefined, opts.pretty ? 2 : undefined);
        console.info( "Actual save", json );
        fs.writeFile(file, json, function(err){
          if( err ) console.error( err );
          setTimeout( function(){
            o.__saving__ = false;
          }, 100);
        });
      }

      let checkSave = function(){
        if( !o.__saving__ ){
          actualSave();
        }
        else if( !saveTimer ){
          saveTimer = setTimeout(function(){
            saveTimer = null;
            checkSave();
          }, 100);
        }
      }

      checkSave();

    };  

    // FIXME: let's work out a way to support async here

    let restore = function(){
      try {
        let data = fs.readFileSync( file, "utf8" );
        if( data ) return JSON.parse(data);
      }
      catch(e){ console.error(e); }
      return {};
    }

    // TODO: watch source file

    return Model.createBackedProxy(o, event, save, restore);

  }

}

module.exports = { Model };