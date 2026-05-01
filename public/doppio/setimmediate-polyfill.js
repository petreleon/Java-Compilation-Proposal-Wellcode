(function(global) {
  if (typeof global.setImmediate === 'undefined') {
    global.setImmediate = function(fn) {
      var args = Array.prototype.slice.call(arguments, 1);
      return setTimeout(function() { fn.apply(null, args); }, 0);
    };
    global.clearImmediate = function(id) { clearTimeout(id); };
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this);
