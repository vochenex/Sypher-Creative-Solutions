/* API Client: 1.5 s timeout on every call; callers always have a local fallback. */
(function (S) {
  'use strict';

  var status = 'unknown';
  var modeConfigCache = {};

  function request(method, path, body) {
    if (S.debug.has('apiOffline') || location.protocol === 'file:') {
      status = 'offline';
      return Promise.reject(new Error('NETWORK'));
    }
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, S.config.timing.apiTimeoutMs);
    return fetch('/api' + path, {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      clearTimeout(timer);
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error((data.error && data.error.code) || 'HTTP_' + res.status);
          err.status = res.status;
          throw err;
        }
        status = 'online';
        return data;
      });
    }, function (e) {
      clearTimeout(timer);
      status = 'offline';
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

    postTestResult: function (entry) { return request('POST', '/test-results', entry); },

    getTestResults: function (query) { return request('GET', '/test-results' + (query || '')); }
  };
})(window.Sypher);
