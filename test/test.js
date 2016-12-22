var assert = require("assert");
var Zone = require("../lib/zone");
var env = require("../lib/env");

var isNode = env.isNode;

if (!isNode) {
  require("steal-mocha");
}
var isBrowser = !isNode;
var supportsMutationObservers = isBrowser && typeof MutationObserver === "function";

describe("new Zone", function () {
  it("Provides hooks to before and after tasks run", function (done) {
    var count = 0;
    var zone = new Zone({
      beforeTask: function () {
        count++;
      },
      afterTask: function () {
        count++;
      }
    });

    zone.run(function () {
    }).then(function () {
      assert.equal(count, 2, "beforeTask and afterTask were run");
    }).then(done);
  });

  it("Can provide a function to define the hooks", function (done) {
    var zone = new Zone(function (data) {
      return {
        beforeTask: function () {
          data.foo = "bar";
        },
        afterTask: function () {
          data.baz = "qux";
        }
      };
    });

    zone.run(function () {
    }).then(function (data) {
      assert.equal(data.foo, "bar", "beforeTask data was added");
      assert.equal(data.baz, "qux", "afterTask data was added");
    }).then(done);
  });

  it("Can pass in plugins that provide the same API", function (done) {
    var count = 0;

    var barZone = function () {
      return {
        globals: {
          foo: "bar"
        },
        afterTask: function () {
          count++;
        }
      };
    };

    var fooZone = {
      beforeTask: function () {
        count++;
      },
      plugins: [barZone]
    };

    var zone = new Zone({
      beforeTask: function () {
        count++;
      },
      plugins: [fooZone]
    });

    zone.run(function () {
      // This makes sure the globals defined in barZone are set up
      if (typeof foo === "string" && foo === "bar") {
        count++;
      }
    }).then(function () {
      assert.equal(count, 4, "Deeply nested plugins works");
    }).then(done);
  });

  if (isNode) {
    it("Allows you to put common globals directly on spec object",
      function (done) {
        var myDoc = {foo: "bar"};
        new Zone({
          document: myDoc
        }).run(function () {
          assert.equal(document, myDoc, "Correct document");
        }).then(function () {
          done();
        }, done);
      });
  }

  it("Allows you to define globals with dot operator", function (done) {
    new Zone({
      globals: {
        "foo.bar": "baz"
      }
    }).run(function () {
      assert.equal(foo.bar, "baz", "global was set");
    }).then(function (data) {
      done();
    }, done);
  });

  it("Handles plugins that are used more than once", function (done) {
    var counter = function (data) {
      data.count = 0;

      return {
        beforeTask: function () {
          data.count++;
        }
      };
    };

    var other = function () {
      return {
        plugins: [counter]
      };
    };

    var one = new Zone({
      plugins: [counter, other]
    });

    var two = new Zone({
      plugins: [other, counter]
    });

    var both = Promise.all([
      one.run(function () {
      }),
      two.run(function () {
      })
    ]);

    both.then(function (result) {
      assert.equal(result[0].count, 1, "Counter ran once");
      assert.equal(result[1].count, 1, "Counter ran once");
    }).then(done, done);
  });

  it("Calls an `ended` hook when the zone ends", function (done) {
    new Zone(function (data) {
      return {
        ended: function () {
          data.foo = "bar";
        }
      };
    }).run(function () {
    }).then(function (data) {
      assert.equal(data.foo, "bar", "data was added in the end");
    }).then(done, done);
  });

  it("Zone hooks are called once per async task", function (done) {
    var times = 0;
    new Zone({
      beforeTask: function () {
        times++;
      }
    }).run(function () {
      var fn = Zone.current.wrap(function () {
      });
      fn();
    }).then(function () {
      assert.equal(times, 1, "Hook called once");
    }).then(done, done);
  });

  it("Correctly unwraps globals", function (done) {
    var g = env.global;
    g.FOO = "bar";

    var a = function () {
      var old;
      return {
        beforeTask: function () {
          old = g.FOO;
          g.FOO = "a";
        },
        afterTask: function () {
          g.FOO = old;
        }
      };
    };

    var b = function () {
      var old;
      return {
        beforeTask: function () {
          old = g.FOO;
          g.FOO = "b";
        },
        afterTask: function () {
          g.FOO = old;
        }
      };
    };

    new Zone({
      plugins: [a, b]
    }).run(function () {
    }).then(function () {
      assert.equal(g.FOO, "bar", "Global was restored");
      delete g.FOO;
      done();
    });
  });
});

describe("Reusing zones", function () {
  it("setTimeout ids are tracked", function (done) {
    var zone = new Zone();
    var numberOfIds = function () {
      return Object.keys(zone.ids).length;
    };
    var fn = function () {
      setTimeout(function () {
      });
    };

    zone.run(fn).then(function () {
      zone.run(function () {
        fn();
        assert.equal(numberOfIds(), 1, "An id was added to the list");
      }).then(function () {
        done();
      }, done);
    });
  });
});

describe("setTimeout", function () {
  it("basics works", function (done) {
    var results = [];
    new Zone().run(function () {
      setTimeout(function () {
        var data = Zone.current.data;
        if (!data.timeout) data.timeout = [];
        data.timeout.push("1-a");
      }, 29);

      setTimeout(function () {
        var data = Zone.current.data;
        if (!data.timeout) data.timeout = [];
        data.timeout.push("1-b");
      }, 13);
    }).then(function (data) {
      assert.equal(data.timeout.length, 2, "Got 2 results");
    }).then(done, function (err) {
      done(err);
    });
  });

  it("Passes extra parameters to callback", function (done) {
    var zone = new Zone();
    zone.run(function () {
      setTimeout(function (str1, str2) {
        zone.data.foo = str1 + "-" + str2;
      }, 10, "can", "zone");
    }).then(function (data) {
      assert.equal(data.foo, "can-zone", "Extra parameters are passed");
    }).then(done, done);
  });

  it("Can be in nested Zones", function (done) {
    var zoneOne = new Zone();
    zoneOne.run(function () {
      var outerZone = Zone.current;
      assert.equal(outerZone, zoneOne, "Zone.current is correct");
      setTimeout(function () {
        outerZone.data.first = true;
      });

      var zoneTwo = new Zone();
      zoneTwo.run(function () {
        var innerZone = Zone.current;
        assert.equal(innerZone, zoneTwo, "Zone.current is correct");

        setTimeout(function () {
          outerZone.data.second = true;
        });
      });
    }).then(function (data) {
      assert(data.first, "First setTimeout completed");
      assert(data.second, "Second setTimeout completed");
      done();
    });
  });

  it("Doesn't add ids when being run after the Zone has completed", function (done) {
    var zone = new Zone();
    var numberOfIds = function () {
      return Object.keys(zone.ids).length;
    };
    var fn = function () {
      setTimeout(function () {
      });
    };
    zone.run(fn).then(function () {
      assert.equal(numberOfIds(), 0, "There are no ids saved");
      var task = new Zone.Task(zone, fn);
      task.run();
      assert.equal(numberOfIds(), 0, "There are no ids saved");
      done();
    });
  });

  describe("clearTimeout", function () {
    it("decrements the wait count", function (done) {
      new Zone().run(function () {
        setTimeout(function () {
          var id = setTimeout(function () {
            thisWillThrow();
          }, 20000);

          setTimeout(function () {
            clearTimeout(id);
            checkRequestIds();
          }, 3);
        }, 1);
      }).then(function () {
        assert.ok(true, "It finished");
      }).then(done);

      function checkRequestIds() {
        var zone = Zone.current;
        var count = 0;
        for (var p in zone.ids) {
          count++;
        }

        assert.equal(count, 0, "There are no ids outstanding");
      }
    });

    it("doesn't throw when passing an invalid timeoutId", function (done) {
      new Zone().run(function () {
        setTimeout(function () {
          assert.doesNotThrow(function () {
            clearTimeout();
          }, "calling clearTimeout with no id works");
        });
      }).then(function () {
        assert.ok(true, "it finished");
      }).then(done);
    });
  });
});

describe("setTimeout and XHR", function () {

  if (isBrowser) {
    it("all results returned", function (done) {
      this.timeout(10000);

      var results = [];
      new Zone().run(function () {
        setTimeout(function () {
          results.push("1-a");
        }, 29);

        setTimeout(function () {
          results.push("1-b");
        }, 13);

        var xhr = new XMLHttpRequest();
        xhr.open("GET", "http://chat.donejs.com/api/messages");
        xhr.onload = function () {
          results.push("1-c");
        };
        xhr.send();
      }).then(function () {

        assert.equal(results.length, 3, "Got 3 results");

      }).then(done);
    });
  }

  it("Rejects when an error occurs in a setTimeout callback", function (done) {
    var waits = 0;

    new Zone().run(function () {
      setTimeout(function () {
        throw new Error("ha ha");
      }, 20);
    }).then(null, function (error) {
      var errors = error.errors;
      assert.equal(errors.length, 1, "There was one error");
      assert.equal(errors[0].message, "ha ha", "Same error object");
    }).then(done);
  });
});

if (isBrowser) {
  describe("XHR", function () {
    describe("onload", function () {
      it("Is only called once", function (done) {
        var timesLoaded = 0;
        new Zone().run(function () {
          var xhr = new XMLHttpRequest();
          xhr.open("GET", "http://chat.donejs.com/api/messages");
          xhr.onload = function () {
            timesLoaded++;
            if (timesLoaded === 1) {
              // Wait to see if it is called again.
              setTimeout(function () {
                assert.equal(timesLoaded, 1, "Only loaded once");
              }, 100);
            }
          };
          xhr.send();
        })
          .then(function () {
            var zone = Zone.current;
            assert(!zone, "there is no current Zone");
          })
          .then(done);
      });
    });

    it("can run a Promise within the callback", function (done) {
      var zone = new Zone();
      zone.run(function () {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", "http://chat.donejs.com/api/messages");
        xhr.onload = function () {
          Promise.resolve().then(function () {
            Zone.current.data.worked = true;
          });
        };
        xhr.send();
      }).then(function (data) {
        assert.equal(data.worked, true, "got to the then");
      }).then(done, done);
    });
  });
}

describe("nested setTimeouts", function () {
  beforeEach(function (done) {
    var results = this.results = [];

    new Zone().run(function () {
      setTimeout(function () {
        results.push("2-a");

        setTimeout(function () {
          results.push("2-d");
        }, 100);

      }, 5);

      setTimeout(function () {
        results.push("2-b");
      }, 77);

      setTimeout(function () {
        results.push("2-c");
      });
    }).then(function () {
      done();
    });
  })


  it("all timeouts completed", function () {
    var results = this.results;
    assert.equal(results.length, 4, "There are 4 results");

    assert.equal(results[0], "2-c");
    assert.equal(results[1], "2-a");
    assert.equal(results[2], "2-b");
    assert.equal(results[3], "2-d");
  });

});

if (isBrowser) {
  describe("requestAnimationFrame", function () {
    it("setTimeout with requestAnimationFrame", function (done) {
      var results = [];

      new Zone().run(function () {
        setTimeout(function () {
          results.push("3-a");

          requestAnimationFrame(function () {
            results.push("3-d");

            requestAnimationFrame(function () {
              results.push("3-e");
            });
          });
        }, 81);

        setTimeout(function () {
          results.push("3-b");
        }, 32);

        requestAnimationFrame(function () {
          results.push("3-c");
        });
      }).then(function () {
        assert.equal(results.length, 5, "All 5 results completed");
      }).then(done);
    });

  });
} else {
  describe("requestAnimationFrame", function () {
    it("isn't defined", function (done) {
      new Zone().run(function () {
        var data = Zone.current.data;
        data.rAF = typeof requestAnimationFrame;
        setTimeout(function () {
        });
      }).then(function (data) {
        assert.equal(data.rAF, "undefined", "there is no rAF in node");
        done();
      }, done);
    });
  });
}

describe("Promises", function () {

  it("A lot of resolving and rejecting", function (done) {
    var results = [];

    new Zone().run(function () {
      Promise.resolve().then(function () {
        results.push("4-a");

        setTimeout(function () {
          results.push("4-b");

          var p = new Promise(function (resolve) {
            results.push("4-c");

            Promise.resolve().then(function () {
              results.push("4-d");

              resolve();
            });
          });

          var pp = p.then(function () {
            results.push("4-e");

            return new Promise(function (resolve, reject) {
              reject(new Error("Sorry"));
            });
          });

          pp.then(null, function () {
            results.push("4-f");
          });
        });
      });
    }).then(function () {

      assert.equal(results.length, 6, "All 6 promises completed");

    }).then(done);
  });


  it("Throwing in a Promise chain is returned", function (done) {
    var caught;
    new Zone().run(function () {
      Promise.resolve().then(function () {
        throw new Error("oh no");
      }).then(null, function (err) {
        caught = err;
      });
    }).then(function () {
      assert(true, "Even though a Promise rejected we still get a " +
        "resolved wait promise");
      assert(!!caught, "Called the Promise errback");
      assert.equal(caught.message, "oh no", "Correct error object");
    }).then(done);
  });

  it("Returns a value when only providing a error callback", function (done) {
    new Zone().run(function () {
      Promise.resolve("hello").then(null, function () {

      }).then(function (value) {
        Zone.current.data.response = value;
      });
    }).then(function (data) {
      assert.equal(data.response, "hello", "got the value");
    }).then(done);
  });

  it("Throwing a string works", function (done) {
    new Zone().run(function () {

      Promise.reject("uh oh").then().then(null, function (err) {
        Zone.current.data.reason = err.message;
      });

    }).then(function (data) {
      assert.equal(data.reason, "uh oh", "got the reason for the rejection");
      done();
    });
  });
});

describe("Zone.waitFor", function () {
  it("caughtErrors=false will not try and catch errors", function (done) {
    new Zone().run(function () {
      Promise.resolve().then(function () {
        var caught = Zone.waitFor(function () {
          throw new Error("ahh!");
        });
        caught();
      }).then(function () {
        var notCaught = Zone.waitFor(function () {
          throw new Error("oh no");
        }, false);

        notCaught();
      }).then(null, function () {
      });
    }).then(function () {
      assert(false, "Wait resolved when it should not have");
    }, function (error) {
      var errors = error.errors;
      assert.equal(errors.length, 1, "There was 1 error");
      assert(!Zone.current, "There is no current Zone");
    }).then(done, done);
  });

  it("do not need to pass in a function for it to work", function (done) {
    new Zone().run(function () {
      var d = Zone.waitFor();

      setTimeout(function () {
        d();
      });
    })
      .then(function () {
        done();
      }, done);
  });
});

describe("Zone.error", function () {
  it("calling canWait.error adds an error to the current request", function (done) {
    new Zone().run(function () {
      setTimeout(function () {
        Zone.error(new Error("hey there"));
      }, 200);
    }).then(null, function (error) {
      var errors = error.errors;
      assert.equal(errors.length, 1, "there was one error");
      assert.equal(errors[0].message, "hey there", "has the correct message");
    }).then(done, done);
  });
});

describe("outside of request lifecycle", function () {
  it("there is no Zone.current", function () {
    assert.equal(Zone.current, undefined,
      "since we are not within a request there is no " +
      "Zone.current");
  });

  it("calling Zone.waitFor returns back the function passed", function () {
    var fn = function () {
    };
    assert.equal(Zone.waitFor(fn), fn, "Same function");
  });

  it("calling Zone.error returns back the error", function () {
    var error = new Error("oh no");
    assert.equal(Zone.error(error).message, "oh no", "Same error");
  });
});

describe("Nested zones", function () {
  it("Zone.current points to the correct zone.", function (done) {
    var outer = new Zone();

    outer.run(function () {
      var inner = new Zone();
      inner.run(function () {
        setTimeout(function () {
          Zone.current.data.hello = "world";
        }, 20);
      }).then(function (data) {
        Zone.current.data.hello = data.hello;
      });
    }).then(function (data) {
      assert.equal(data.hello, "world", "correct data");
    }).then(done, done);
  });
});

if (supportsMutationObservers) {
  describe("MutationObserver", function () {
    it("Runs within the correct zone", function (done) {
      var zone = new Zone();

      zone.run(function () {

        var p = new Promise(function (resolve) {

          var mo = new MutationObserver(function () {
            zone.data.inTheZone = Zone.current === zone;
            resolve();
          });
          var el = document.createElement("div");
          mo.observe(el, {childList: true});
          el.textContent = "foobar";

        });

        p.then(function () {
        });

      }).then(function (data) {
        assert(data.inTheZone, "MutationObserver run within the zone");
        done();
      });
    });

    it("Clearing timeouts works within a MutationObserver callback",
      function (done) {
        new Zone().run(function () {
          var zone = Zone.current;

          var timeoutId = setTimeout(function () {
            zone.data.worked = false;
          }, 10);

          var mo = new MutationObserver(function () {
            clearTimeout(timeoutId);
            zone.data.worked = Zone.current === zone;
          });
          var el = document.createElement("div");
          mo.observe(el, {childList: true});
          el.textContent = "foobar";

        }).then(function (data) {
          assert(data.worked, "Timeout was cleared in the zone");
          done();
        });
      });
  });
}

if (isNode) {
  describe("process.nextTick", function () {
    it("works", function (done) {
      new Zone().run(function () {
        process.nextTick(function () {
          Zone.current.data.hello = "world";
        });
      }).then(function (data) {
        assert.equal(data.hello, "world", "Got the data");
      })
        .then(done, done);
    });
  });

  describe("setImmediate", function () {
    it("works", function (done) {
      new Zone().run(function () {
        debugger;
        setImmediate(function () {
          Zone.current.data.hello = "world";
        });
      }).then(function (data) {
        assert.equal(data.hello, "world", "Got the data");
      })
        .then(done, done);
    });
  });

  describe("clearImmediate", function () {
    it("decrements the wait count", function (done) {
      new Zone().run(function () {
        setImmediate(function () {
          var id = setImmediate(function () {
            thisWillThrow();
          });

          clearImmediate(id);
          checkRequestIds();
        });
      }).then(function () {
        assert.ok(true, "It finished");
      }).then(done);

      function checkRequestIds() {
        var zone = Zone.current;
        var count = 0;
        for (var p in zone.ids) {
          count++;
        }

        assert.equal(count, 0, "There are no ids outstanding");
      }
    });

  });
}

describe("Zone.ignore", function () {
  it("allows you to ignore function calls", function (done) {
    function io() {
      setTimeout(function () {

      }, 20);
    }

    new Zone().run(function () {
      setTimeout(function () {
        var fn = Zone.ignore(io);

        var zone = Zone.current;
        assert.equal(zone.waits, 1, "Waiting on the currect task");
        fn();
        assert.equal(zone.waits, 1, "No new waits were added");

        setTimeout(function () {
          Zone.current.data.a = "b";
        }, 30);
      });
    }).then(function (data) {
      assert.equal(data.a, "b", "calls after the ignored function " +
        "are handled");
    }).then(done);
  });

  it("works outside of a request context", function () {
    var fn = Zone.ignore(function () {
      return "hello";
    });

    assert.equal(fn(), "hello", "the wrapper works");
  });
});

// Require other tests
require("./xhr");
require("./timeout_test");
require("./debug_test");
