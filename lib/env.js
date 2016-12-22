let isNode = typeof process !== "undefined" 
  && {}.toString.call(process) === "[object process]"

if (typeof System !== "undefined" && System._nodeRequire) {
  nodeRequire = System._nodeRequire
} else {
  if (typeof require === "function") {
    nodeRequire = require
  } else {
    nodeRequire = function () {
    }
  }
}

let g = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope
  ? self
  : isNode
    ? global
    : window

exports.isNode = isNode
exports.isNW = false
exports.global = g
