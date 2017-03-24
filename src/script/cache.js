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

/**
 * cache arbitrary data for arbitrary periods of time (or per-session).
 * intended for the CRAN mirror and pacakge lists. 
 */

let KEY_BASE = "_cache_";

let Cache = function( sessionid ){

  if( !sessionid ) sessionid = process.pid;

  this.get = function( key ){
    let val = localStorage.getItem( `${KEY_BASE}.${key}`);
    if( !val ) return null;
    try {
      val = JSON.parse(val);
    }
    catch( e ){
      console.error(e);
      return null;
    }

    if( val.expire ){
      let now = Math.round( new Date().getTime() / 1000 );
      if( now > val.expire ){
        console.info( "[cache] expired", now, val.expire );
        return null;
      }
    }
    else {
      if( val.session !== sessionid ){
        console.info( "[cache] from old session", val.session, sessionid );
        return null;
      }
    }

    // ok
    return val.data;
  };

  /**
   * set key => data.  cache for expire SECONDS, or 0 = session.
   */
  this.set = function( key, data, expire ){
    expire = expire || 0;
    if( expire ) expire = Math.round( new Date().getTime() / 1000 ) + expire;
    console.info( "[cache] set; expire =", expire );

    let wrapper = {
      data: data,
      expire: expire,
      session: sessionid 
    };
    localStorage.setItem( `${KEY_BASE}.${key}`, JSON.stringify(wrapper));
  };

};

module.exports = new Cache();

