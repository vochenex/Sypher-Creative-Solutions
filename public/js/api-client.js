/* API Client: bounded timeouts (headers + body); callers always have a local fallback. */
(function (S) {
  'use strict';

  var status = 'unknown';
  var modeConfigCache = {};

  function timeoutMs() {
    return (S.config && S.config.timing && S.config.timing.apiTimeoutMs) || 1500;
  }

  function raceTimeout(promise, ms, ctrl) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        if (ctrl) {
          try { ctrl.abort(); } catch (e) { /* ignore */ }
        }
        reject(Object.assign(new Error('TIMEOUT'), { name: 'AbortError' }));
      }, ms);
      promise.then(function (value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      }, function (err) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  function request(method, path, body) {
    if (S.debug && S.debug.has('apiOffline')) {
      status = 'offline';
      return Promise.reject(new Error('NETWORK'));
    }
    if (typeof location !== 'undefined' && location.protocol === 'file:') {
      status = 'offline';
      return Promise.reject(new Error('NETWORK'));
    }
    if (typeof fetch !== 'function') {
      status = 'offline';
      return Promise.reject(new Error('NO_FETCH'));
    }

    var ms = timeoutMs();
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var started = Date.now();

    var fetchPromise = fetch('/api' + path, {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl ? ctrl.signal : undefined
    });

    return raceTimeout(fetchPromise, ms, ctrl).then(function (res) {
      var remaining = Math.max(100, ms - (Date.now() - started));
      return raceTimeout(res.json().catch(function () { return {}; }), remaining, ctrl).then(function (data) {
        if (!res.ok) {
          var err = new Error((data.error && data.error.code) || 'HTTP_' + res.status);
          err.status = res.status;
          err.field = data.error && data.error.field;
          err.serverMessage = data.error && data.error.message;
          throw err;
        }
        status = 'online';
        return data;
      });
    }).catch(function (e) {
      status = 'offline';
      if (e && e.message === 'NO_FETCH') throw e;
      throw new Error(e && e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK');
    });
  }

  S.api = {
    status: function () { return status; },

    postDeviceProfile: function (payload) { return request('POST', '/device-profile', payload); },

    getModeConfig: function (mode) {
      if (modeConfigCache[mode]) return Promise.resolve(modeConfigCache[mode]);
      return request('GET', '/mode-config?mode=' + encodeURIComponent(mode)).then(function (data) {
        modeConfigCache[mode] = data;
        return data;
      });
    },

    postInquiry: function (payload) { return request('POST', '/inquiries', payload); },

    postTestResult: function (entry) { return request('POST', '/test-results', entry); },

    getTestResults: function (query) { return request('GET', '/test-results' + (query || '')); }
  };
})(window.Sypher);
