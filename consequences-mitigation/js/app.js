'use strict';

var AppMitigation = (function() {

  function AppMitigation(config, content, data) {
    var defaults = {};
    this.opt = _.extend({}, defaults, config);
    this.content = content;
    this.data = data;

    this.init();
  }

  AppMitigation.prototype.init = function(){
    var _this = this;

    this.storyCount = this.content.stories.length;
    this.currentStoryIndex = 0;
    this.angleThreshold = this.opt.angleThreshold;
    this.angleInBetween = this.opt.angleInBetween;
    this.angleDelta = 0;
    this.$document = $(document);

    this.onReady();
    this.loadListeners();
    this.loadControls();
    this.loadSounds();
  };

  AppMitigation.prototype.loadControls = function(){
    var _this = this;

    var controls = new Controls(this.opt.controls);

    return controls.load();
  };

  AppMitigation.prototype.loadListeners = function(){
    var _this = this;
    var $window = $(window);
    var throttleMs = this.opt.throttleMs;

    var onRotate = _.throttle(function(value) {
      _this.onRotate(value);
    }, throttleMs);

    var channel = new Channel(this.opt.controls.channel, {"role": "subscriber"});
    channel.addCallback("controls.rotate.vertical", onRotate);
    channel.listen();

    $window.on('resize', function(){
      _this.onResize();
    });

  };

  AppMitigation.prototype.loadSounds = function(){
    var _this = this;

    var sound = new Sound(this.opt.sound);

    return sound.load();
  };

  AppMitigation.prototype.onReady = function(){
    var d = this.data;

    var opt = _.extend({}, this.opt.stories);

    // Initialize slideshow
    this.stories = new Stories(opt, this.content.stories);

    // Init globe
    opt = _.extend({}, this.opt.map, this.content);
    this.map = new Map(opt);

    // Init sleep mode utilitys
    opt = _.extend({}, this.opt.sleep);
    this.sleep = new Sleep(opt);

    this.render();
  };

  AppMitigation.prototype.onResize = function(){
  };

  AppMitigation.prototype.onRotate = function(delta){
    var wasSleeping = this.sleep.isSleeping;

    this.sleep.wakeUp();
    if (this.delaying) return false;

    var count = this.storyCount;
    var angleThreshold = this.angleThreshold;
    var angleInBetween = this.angleInBetween;
    var index = 0;
    var changed = false;

    // check to see if we reached the threshold for going to the next story
    var angleDelta = this.angleDelta + delta;
    var angleProgress1 = Math.abs(angleDelta) / angleThreshold;
    var angleProgress2 = Math.abs(angleDelta) / (angleThreshold+angleInBetween);
    var inBetween = angleProgress1 >= 1 && angleProgress2 < 1;
    var changed = angleProgress2 >= 1;
    if (changed && angleDelta < 0) index = this.currentStoryIndex - 1;
    else if (changed) index = this.currentStoryIndex + 1;
    if (index < 0) index = count - 1;
    if (index >= count) index = 0;
    this.angleDelta = angleDelta;

    // transition
    this.transition();

    // first load
    if (this.currentStoryIndex < 0) {
      index = 0;
      changed = true;
    }

    // don't reset if we're in-between videos
    if (inBetween && !changed) {
      this.resetting = false;
      this.resetCountingDown = false;

    // start the countdown to reset
    } else {
      this.resetting = false;
      this.resetCountingDown = true;
      this.resetStart = new Date().getTime() + this.opt.resetAfterMs;
      this.resetEnd = this.resetStart + this.opt.resetTransitionMs;
      this.resetAngleStart = this.angleDelta;
    }

    if (changed) {
      // console.log('changed')
      // delay controls for a beat
      this.delaying = true;
      this.delayEnd = new Date().getTime() + this.opt.delayMs;
      this.resetCountingDown = false;

      this.stories.onChange(index);
      this.map.onChange(index);
      this.currentStoryIndex = index;
      this.$document.trigger("sound.play.sprite", ["tick"]);
      this.angleDelta = 0;

    // if was sleeping or was in-between, play current story
  } else if (wasSleeping || this.inBetween && !inBetween) {
      // console.log('restart')
      this.stories.onChange();
      this.map.onChange();

    // if went in-between, stop last story
    } else if (inBetween && !this.inBetween) {
      // console.log('stop')
      this.stories.pausePreviousStory();
      this.map.pausePreviousStory();
    }

    this.inBetween = inBetween;
  };

  AppMitigation.prototype.render = function() {
    var _this = this;
    var now = new Date().getTime();

    // check if we need to reset
    if (this.resetCountingDown && now > this.resetStart) {
      this.resetting = true;
      this.resetCountingDown = false;
    }

    // check delay
    if (this.delaying && now > this.delayEnd) {
      this.delaying = false;
    }

    if (this.resetting) {
      this.renderReset(now);
    }

    this.stories.render();

    requestAnimationFrame(function(){ _this.render(); });
  };

  AppMitigation.prototype.renderReset = function(now){
    var progress = UTIL.norm(now, this.resetStart, this.resetEnd);
    if (progress >= 1) {
      progress = 1;
      this.resetting = false;
    }

    this.angleDelta = this.resetAngleStart * (1-progress);
    this.transition();
  };

  AppMitigation.prototype.transition = function(){
    var count = this.storyCount;
    var angleDelta = this.angleDelta;
    var angleProgress = Math.abs(angleDelta) / (this.angleThreshold+this.angleInBetween);
    var easedProgress = UTIL.easeInOutSin(angleProgress);
    var toIndex = this.currentStoryIndex + 1;
    if (angleDelta < 0) toIndex = this.currentStoryIndex - 1;
    if (toIndex < 0) toIndex = count - 1;
    if (toIndex >= count) toIndex = 0;
    this.stories.transition(this.currentStoryIndex, toIndex, easedProgress);
  };

  return AppMitigation;

})();
