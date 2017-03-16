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

const chokidar = require( "chokidar" );
const PubSub = require( "pubsub-js" );

/**
 * watcher simplifies file watching behavior somewhat.  call `watch` to 
 * watch a file, `unwatch` to unwatch.  change events only.  we reference 
 * count watches so watch/unwatch call counts have to match to stop watching.
 * 
 * file change events are broadcast via pubsub.
 */
class Watcher {

  constructor(event){
    this._event = event || "file-change-event";
    this._watcher = null;
    this._map = {};
  }

  /**
   * change the broadcast event
   * 
   * @param {string} event 
   */
  setEvent(event){
    this._event = event;
  }

  /**
   * watch a file and, on change, fire event.  
   * 
   * @param {*} file 
   * @param {*} callback 
   * @returns token 
   */
  watch(file){

    // lazy init
    if( !this._watcher ){
      this._watcher = new chokidar.FSWatcher();
      this._watcher.on( "change", function(changed){
        PubSub.publish( this._event, changed );
      }.bind(this));
    }

    if( this._map[file] ) this._map[file]++;
    else {
      this._watcher.add(file);
      this._map[file] = 1;
    }

  }

  /**
   * stop watching file
   * 
   * @param {string} file 
   */
  unwatch(file){
    if( !this._map[file] ) console.warn( "not watching file", file );
    else {
      this._map[file]--;
      if( this._map[file] == 0 ){
        this._watcher.unwatch(file);
      }
    }
  }


}

// singleton
module.exports = new Watcher();

