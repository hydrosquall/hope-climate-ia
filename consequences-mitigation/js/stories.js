'use strict';

var Stories = (function() {

  function Stories(options, stories) {
    var defaults = {};
    this.opt = $.extend({}, defaults, options);
    this.init(stories);
  }

  Stories.prototype.init = function(stories){
    this.$document = $(document);
    this.$el = $(this.opt.el);
    this.stories = stories;
    this.storyCount = stories.length;
    this.currentStoryIndex = -1;

    this.loadUI();
    this.onRotate(0);
  };

  Stories.prototype.loadUI = function(){
    var stories = this.stories;
    var $container = $("<div />");

    _.each(stories, function(story, i){
      var html = '';
      html += '<div id="'+story.id+'" class="story-wrapper">';
        html += '<div class="loading"><div class="loading-bar"></div></div>';
        html += '<div class="story">';
          html += '<div class="video-container"></div>';
        html += '</div>';
        html += '<div class="progress"><div class="progress-bar"></div></div>';
      html += '</div>';
      var $story = $(html);
      stories[i].$el = $story;
      stories[i].$loadProgress = $story.find(".loading-bar").first();
      stories[i].index = i;
      $container.append($story);
    });

    this.$el.append($container);
  };

  Stories.prototype.onRotate = function(value){
    var stories = this.stories;
    var count = this.storyCount;
    var segment = 1.0 / count;

    var adjustedValue = value + segment/2;
    if (adjustedValue >= 1.0) adjustedValue -= 1.0;

    var findex = adjustedValue * count;
    var index = parseInt(Math.floor(findex));
    var story = stories[index];
    var changed = (!this.story || this.story.index !== index);

    if (changed) {
      if (this.story) {
        this.story.$el.removeClass('active playing');
      }
      this.story = story;
      story.$el.addClass('active');
      this.$document.trigger("sound.play.sprite", ["tick"]);

      this.playing = false;
      this.loadStart = new Date().getTime();
      this.loadEnd = this.loadStart + this.opt.loadingTime;
      this.loading = true;
    }

    // var multiplier = 0.25;
    // var progress = value*count;
    // var half = count / 2.0;
    // _.each(stories, function(story, i){
    //   var distance = Math.abs(i - progress);
    //   if (distance > half) distance = count - distance;
    //   var scale = (1.0 - (distance/half)) * multiplier + 1.0;
    //   story.$el.css('transform', 'scale3d('+scale+','+scale+','+scale+')');
    //   story.$el.find('.story').text(distance.toFixed(3))
    // });

  };

  Stories.prototype.playStory = function(story){
    story.$el.addClass('playing');

  };

  Stories.prototype.render = function(){
    if (this.loading) {
      var now = new Date().getTime();
      var progress = UTIL.norm(now, this.loadStart, this.loadEnd);
      if (progress >=1) {
        progress = 1;
        this.loading = false;
        this.playing = true;
        this.playStory(this.story);
      }
      this.story.$loadProgress.css('width', ((1.0-progress)*100)+'%');
    }

  };

  return Stories;

})();