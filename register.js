'format cjs'
(function () {
  let isNode = typeof process !== 'undefined' && {}.toString.call(process) === '[object process]'
  let g = typeof WorkerGlobalScope !== 'undefined' && (self instanceof WorkerGlobalScope)
    ? self
    : isNode
    ? global
    : window

  if (typeof module !== 'undefined' && !!module.exports) {
    module.exports = wrapAll
  }

  let wrapped = g.__canZoneWrapped
  if (!wrapped) {
    wrapped = g.__canZoneWrapped = {}
  }

  let forEach = Array.prototype.forEach || function (cb) {
      let i = 0, len = this.length
      for ( i < len i++) {
        cb.call(this, this[i], i)
      }
    }

  let props = [
    'setTimeout',
    'clearTimeout',
    'requestAnimationFrame',
    'Promise.prototype.then',
    'XMLHttpRequest.prototype.send',
    'process.nextTick',
    'setImmediate',
    'clearImmediate',
    {
      prop: 'MutationObserver', fn: function (MutationObserver) {
      return function (fn) {
        return new MutationObserver(fn)
      }
    }
    }
  ]

  wrapAll()

  if (g.Promise) {
    monitor(g, 'Promise', 'Promise.prototype.then')
  }

  function extract(obj, prop) {
    let parts = prop.split('.')
    while (parts.length > 1) {
      prop = parts.shift()
      obj = obj[prop]
      if (!obj) break
      if (parts.length === 1) prop = parts[0]
    }
    return [obj, prop]
  }

  function wrapAll() {
    forEach.call(props, function (prop) {
      let fn
      if (typeof prop === 'object') {
        fn = prop.fn
        prop = prop.prop
      }

      let key = prop

      // If this has already been wrapped
      if (wrapped[key]) {
        return
      }

      let results = extract(g, prop)
      let obj = results[0]
      prop = results[1]

      // This happens if the environment doesn't support this property
      if (!obj || !obj[prop]) {
        return
      } else {
        wrapped[key] = true
      }

      wrapInZone(obj, prop, fn)
    })
  }

  function wrapInZone(object, property, fn) {
    if (fn) {
      fn = fn(object[property])
    } else {
      fn = object[property]
    }
    let wrappedFn = function () {
      if (typeof CanZone !== 'undefined' && !!CanZone.current) {
        return CanZone.tasks[property](fn).apply(this, arguments)
      }

      return fn.apply(this, arguments)
    }
    wrappedFn.zoneWrapped = true
    object[property] = wrappedFn
  }

  function monitor(object, property, thingToRewrap) {
    let current = object[property]

    Object.defineProperty(object, property, {
      get: function () {
        return current
      },
      set: function (val) {
        let hasChanged = !val.zoneWrapped && val !== current
        current = val

        if (hasChanged) {
          let results = extract(object, thingToRewrap)
          let localObject = results[0]
          let localProperty = results[1]
          wrapInZone(localObject, localProperty)
          monitor(object, property, thingToRewrap)
        }
      }
    })
  }

})()
