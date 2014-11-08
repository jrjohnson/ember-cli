'use strict';

var assert = require('assert');

var MockUI = require('../../helpers/mock-ui');
var MockAnalytics = require('../../helpers/mock-analytics');
var MockWatcher  = require('../../helpers/mock-watcher');
var Watcher = require('../../../lib/models/watcher');
var EOL = require('os').EOL;
var chalk = require('chalk');
var BuildError = require('../../helpers/build-error');
var Promise = require('../../../lib/ext/promise');

describe('Watcher', function() {
  var ui;
  var subject;
  var builder;
  var analytics;
  var watcher;

  beforeEach(function() {
    ui        = new MockUI();
    analytics = new MockAnalytics();
    watcher   = new MockWatcher();

    subject = new Watcher({
      ui: ui,
      analytics: analytics,
      builder: builder,
      watcher: watcher
    });

    return subject;
  });

  describe('watcher strategy selection', function() {
    it('selects the events-based watcher by default', function () {
      subject.options = null;
      assert.ok(!subject.polling());
    });

    it('selects the events-based watcher when given events watcher option', function () {
      subject.options = { watcher: 'events' };
      assert.ok(!subject.polling());
    });

    it('selects the polling watcher when given polling watcher option', function () {
      subject.options = { watcher: 'polling' };
      assert.ok(subject.polling());
    });
  });

  describe('buildOptions', function() {
    it('with polling enabled', function() {
      subject.polling = function() { return true; };
      subject.verbose = true;

      return subject.buildOptions().then(function(options) {
        assert.deepEqual(options, {
          polling:  true,
          verbose:  true,
          watchman: false
        });
      });
    });


    it('with polling disabled, watchman false', function() {
      subject.polling = function() { return false; };
      subject.verbose = true;

      subject.exec = function() { return Promise.reject(); };

      return subject.buildOptions().then(function(options) {
        assert.deepEqual(options, {
          polling:  false,
          verbose:  true,
          watchman: false
        });
      });
    });

    it('with polling disabled, watchman true', function() {
      subject.polling = function() { return false; };
      subject.verbose = true;

      subject.exec = function() { return Promise.resolve(); };

      return subject.buildOptions().then(function(options) {
        assert.deepEqual(options, {
          polling:  false,
          verbose:  true,
          watchman: true
        });
      });
    });

   it('with polling disabled, watchman false, verbose false', function() {
      subject.polling = function() { return false; };
      subject.verbose = false;

      subject.exec = function() { return Promise.resolve(); };
      return subject.buildOptions().then(function(options) {
        assert.deepEqual(options, {
          polling:  false,
          verbose:  false,
          watchman: true
        });
      });
    });
  });

  describe('watcher:change', function() {
    beforeEach(function() {
      watcher.emit('change', {
        totalTime: 12344000000
      });
    });

    it('tracks events', function() {
      assert.deepEqual(analytics.tracks, [{
        name: 'ember rebuild',
        message: 'broccoli rebuild time: 12344ms'
      }]);
    });

    it('tracks timings', function() {
      assert.deepEqual(analytics.trackTimings, [{
        category: 'rebuild',
        variable: 'rebuild time',
        label:    'broccoli rebuild time',
        value:    12344
      }]);
    });

    it('logs that the build was successful', function() {
      assert.equal(ui.output, EOL + chalk.green('Build successful - 12344ms.') + EOL);
    });
  });

  describe('watcher:error', function() {
    it('tracks errors', function() {
      watcher.emit('error', {
        message: 'foo',
        stack: new Error().stack
      });

      assert.deepEqual(analytics.trackErrors, [{
        description: 'foo'
      }]);
    });

    it('emits without error.file', function() {
      subject.didError(new BuildError({
        file: 'someFile',
        message: 'buildFailed'
      }));

      var outs = ui.output.split(EOL);

      assert.equal(outs[0], chalk.red('File: someFile'));
      assert.equal(outs[1], chalk.red('buildFailed'));
    });

    it('emits with error.file with error.line without err.col', function() {
      subject.didError(new BuildError({
        file: 'someFile',
        line: 24,
        message: 'buildFailed'
      }));

      var outs = ui.output.split(EOL);

      assert.equal(outs[0], chalk.red('File: someFile (24)'));
      assert.equal(outs[1], chalk.red('buildFailed'));
    });

    it('emits with error.file without error.line with err.col', function() {
      subject.didError(new BuildError({
        file: 'someFile',
        col: 80,
        message: 'buildFailed'
      }));
      var outs = ui.output.split(EOL);

      assert.equal(outs[0], chalk.red('File: someFile'));
      assert.equal(outs[1], chalk.red('buildFailed'));
    });

    it('emits with error.file with error.line with err.col', function() {
      subject.didError(new BuildError({
        file: 'someFile',
        line: 24,
        col: 80,
        message: 'buildFailed'
      }));

      var outs = ui.output.split(EOL);

      assert.equal(outs[0], chalk.red('File: someFile (24:80)'));
      assert.equal(outs[1], chalk.red('buildFailed'));
    });
  });

  describe('watcher:change afterError', function() {
    beforeEach(function() {
      watcher.emit('error', {
        message: 'foo',
        stack: new Error().stack
      });

      watcher.emit('change', {
        totalTime: 12344000000
      });
    });

    it('log that the build was green', function() {
      assert(/Build successful./.test(ui.output), 'has successful build output');
    });

    it('keep tracking analytics', function() {
      assert.deepEqual(analytics.tracks, [{
        name: 'ember rebuild',
        message: 'broccoli rebuild time: 12344ms'
      }]);
    });
  });
});
