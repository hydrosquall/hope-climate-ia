'use strict';

var Controls = (function() {
  function Controls(options) {
    var defaults = {
      "gamepad": {
        "axes": [], // go to /config/gamepad.html to configure these
        "smoothingWindow": 5
      }
    };
    // override nested defaults
    _.each(defaults, function(value, key){
      var optionsValue = options[key];
      if (optionsValue !== undefined) {
        options[key] = _.extend({}, value, optionsValue);
      }
    });
    this.opt = _.extend({}, defaults, options);
    this.init();
  }

  function weightedMean(values, weights) {

    var result = _.map(values, function(value, i){
      var weight = weights[i];
      var sum = value * weight;
      return [sum, weight];
    });

    result = _.reduce(result, function(p, c){
      return [p[0] + c[0], p[1] + c[1]];
    }, [0, 0]);

    return result[0] / result[1];
  }

  function linspace(a, b, n) {
    if(n<2) { return n===1? [a] : []; }
    var i, ret = Array(n);
    n--;
    for(i=n;i>=0;i--) { ret[i] = (i*b+(n-i)*a)/n; }
    return ret;
  }

  function norm(value, a, b){
    return (1.0 * value - a) / (b - a);
  }

  Controls.prototype.init = function(){
    this.$window = $(window);
    this.$document = $(document);

    this.channel = new Channel(this.opt.channel, {"role": "publisher"});
  };

  Controls.prototype.initGamepad = function(){
    this.smoothingWindow = this.opt.gamepad.smoothingWindow
    this.gamepadSmoothing = this.smoothingWindow > 0;

    if (this.gamepadSmoothing) {
      var weights = _.map(linspace(-1, 0, this.opt.gamepad.smoothingWindow), function(v){ return Math.exp(v); });
      var sum = _.reduce(weights, function(memo, v){ return memo + v; }, 0);
      weights = _.map(weights, function(v){ return v / sum; })
      this.gamepadWeights = weights;
    }

    // parse axes
    this.axesConfig = _.map(this.opt.gamepad.axes, function(a){
      return {
        "min": parseFloat(a.min),
        "max": parseFloat(a.max),
        "window": []
      }
    });
    if (!this.axesConfig.length) {
      this.axesConfig = _.times(8, function(i){
        return {
          "min": -1,
          "max": 1,
          "window": []
        }
      });
    }
  };

  Controls.prototype.getGamepadIndex = function(){
    var gamepads = navigator.getGamepads();
    if (!gamepads || !gamepads.length) return false;

    var gamepadIndex = false;
    var count = 5;

    for(var i=0; i<count; i++) {
      if (gamepads[i]) {
        gamepadIndex = i;
        break;
      }
    }

    return gamepadIndex;
  };

  Controls.prototype.load = function(){
    this.deferred = $.Deferred();

    var _this = this;
    var keyboardMappings = this.opt.keyboardMappings;
    var gamepadMappings = this.opt.gamepadMappings;
    var uiMappings = this.opt.uiMappings;
    var scrollMappings = this.opt.scrollMappings;
    var touchMappings = this.opt.touchMappings;
    var pointerlockMappings = this.opt.pointerlockMappings;

    if (keyboardMappings) {
      this.loadKeyboardListeners(keyboardMappings);
    }

    if (uiMappings) {
      this.loadUIListeners(uiMappings);
    }

    if (scrollMappings) {
      this.loadScrollListeners(scrollMappings);
    }

    if (pointerlockMappings) {
      this.loadPointerlockListeners(pointerlockMappings);
    }

    if (touchMappings) {
      this.loadTouchListeners(touchMappings);
    }

    if (gamepadMappings) {
      this.initGamepad();
      this.loadGamepad(gamepadMappings);

    // don't need to wait for anything if we're not using gamepad controllers
    } else {
      setTimeout(function(){
        console.log("Controls loaded.");
        _this.deferred.resolve();
      }, 10);
    }

    return this.deferred.promise();
  };

  Controls.prototype.loadGamepad = function(gamepadMappings){
    var _this = this;
    var getGamepadIndex = this.getGamepadIndex();

    if (getGamepadIndex !== false) {
      console.log("Gamepad found");
      this.getGamepadIndex = getGamepadIndex;
      var gamepadState = {};
      _.each(_.keys(gamepadMappings), function(key){
        gamepadState[key] = -1;
      });

      this.gamepadState = gamepadState;
      this.gamepadMappings = gamepadMappings;
      this.deferred.resolve();
      this.pollGamepad();

    // no gamepad found, keep listening...
    } else {
      requestAnimationFrame(function(){ _this.loadGamepad(gamepadMappings); });
    }

  };

  Controls.prototype.loadKeyboardListeners = function(mappings){
    var keys = _.keys(mappings);
    var channel = this.channel;
    var state = _.mapObject(mappings, function(val, key) { return false; });

    var onKeyDown = function(e){
      var key = String.fromCharCode(e.which);
      if (_.indexOf(keys, key) >= 0 && !state[key]) {
        state[key] = true;
        channel.post("controls.button.down", mappings[key]);
      }
    };
    var onKeyUp = function(e){
      var key = String.fromCharCode(e.which);
      if (_.indexOf(keys, key) >= 0) {
        state[key] = false;
        channel.post("controls.button.up", mappings[key]);
      }
    };

    var $window = this.$window;
    $window.keypress(onKeyDown);
    $window.keyup(onKeyUp);
  };

  Controls.prototype.loadPointerlockListeners = function(mappings){
    var channel = this.channel;
    var el = $(this.opt.el)[0];

    function updatePosition(e){
      _.each(mappings, function(props, orientation){
        var delta = e.movementY;
        if (orientation==="horizontal") delta = event.movementX;
        if (Math.abs(delta) > 0) {
          delta *= props.multiplier;
          channel.post("controls."+props.name, delta);
        }
      });
    };

    // document.addEventListener("mousemove", updatePosition, false);

    // Initiate pointer lock
    document.addEventListener('pointerlockchange', function(){
      if (document.pointerLockElement === el) {
        console.log('The pointer lock status is now locked');
        document.addEventListener("mousemove", updatePosition, false);
      } else {
        console.log('The pointer lock status is now unlocked');
      }
    }, false);

    el.onclick = function() {
      console.log('Requesting pointer lock...');
      el.requestPointerLock();
    };
  };

  Controls.prototype.loadTouchListeners = function(mappings){
    var $container = $('<div id="ui" class="ui"></div>');
    var channel = this.channel;

    _.each(mappings, function(opt, key){
      var $listener = $('<div id="'+opt.el+'" class="ui-touch-region '+key+'"></div>');
      $container.append($listener);
      var listener = $listener[0];
      var region = new ZingTouch.Region(listener);

      var onChange = function(e){
        var d = e.detail;
        if (d.distanceFromLast) {
          var angle = d.angle;
          var angleDelta = d.distanceFromLast;
          // 90 degrees = starting position = straight up
          angle = 360 - (angle - 90);
          if (angle >= 360) angle -= 360;
          $listener.css('transform', "rotate3d(0, 0, 1, "+angle+"deg)")
          channel.post("controls.rotate", angleDelta);
        }
      };

      region.bind(listener, key, onChange);
    });

    $('body').append($container);
  };

  Controls.prototype.loadScrollListeners = function(mappings) {
    var channel = this.channel;

    this.$window.on('mousewheel', function(event) {
      // console.log(event.deltaX, event.deltaY, event.deltaFactor);
      _.each(mappings, function(props, orientation){
        var delta = event.deltaY;
        if (orientation==="horizontal") delta = event.deltaX;
        if (Math.abs(delta) > 0) {
          delta *= props.multiplier;
          channel.post("controls."+props.name, -delta);
        }
      });
    });
  };

  Controls.prototype.loadUIListeners = function(mappings) {
    var $container = $('<div id="ui" class="ui"></div>');
    var channel = this.channel;

    _.each(mappings, function(opt, key){
      var $slider = $('<div id="'+opt.el+'"></div>');
      $slider.slider(opt.options);
      $slider.on("slide", function(e, ui){
        channel.post("controls.axes.change", {"key": key, "value": ui.value});
      });
      $container.append($slider);
    });

    $('body').append($container);
  };

  Controls.prototype.pollGamepad = function(){
    var _this = this;

    var gamepad = navigator.getGamepads()[this.getGamepadIndex];
    if (!gamepad) {
      this.loadGamepad(this.gamepadMappings);
      return false;
    }

    var prevState = this.gamepadState;
    var axes = gamepad.axes;
    var gamepadMappings = this.gamepadMappings;
    var channel = this.channel;
    var axesConfig = this.axesConfig;
    var gamepadSmoothing = this.gamepadSmoothing;
    var smoothingWindow = this.smoothingWindow;
    var gamepadWeights = this.gamepadWeights;

    $.each(gamepadMappings, function(key, index){
      var state = norm(axes[index], axesConfig[index].min, axesConfig[index].max); // convert from [-1,1] to [0,1]
      state = +state.toFixed(2);
      state = Math.min(state, 1);
      state = Math.max(state, 0);

      if (gamepadSmoothing) {
        // add value to the axis' window
        axesConfig[index].window.push(state);
        if (axesConfig[index].window.length > smoothingWindow) {
          axesConfig[index].window = axesConfig[index].window.slice(1);
        }
        // calculate weighted average if window has enough values
        var axesWindow = axesConfig[index].window;
        if (axesWindow.length === smoothingWindow) {
          state = weightedMean(axesWindow, gamepadWeights);
        }
      }

      var prev = prevState[key];
      // state has changed, execute callback
      if (prev != state) {
        // console.log("State change", key, state)
        // don't trigger if delta is too big
        var delta = Math.abs(prev-state);
        if (delta < 0.25 || prev < 0) {
          channel.post("controls.axes.change", {"key": key, "value": state});
          _this.gamepadState[key] = state;
        }
      }
    });

    requestAnimationFrame(function(){ _this.pollGamepad(); });
  };

  return Controls;

})();
