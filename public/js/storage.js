/* Preference Store: every read and write is wrapped so blocked or full storage never breaks the page. */
(function (S) {
  'use strict';

  var KEYS = {
    override: 'sypher.override',
    profile: 'sypher.profile',
    dashboardOpen: 'sypher.dashboardOpen',
    session: 'sypher.session',
    downgradeDismissed: 'sypher.downgradeDismissed'
  };
  var MODES = ['auto', 'high', 'medium', 'basic'];
  var failedWrite = false;

  function read(store, key) {
    try { return window[store].getItem(key); } catch { return null; }
  }

  function write(store, key, value) {
    try {
      if (value === null) window[store].removeItem(key);
      else window[store].setItem(key, value);
      return true;
    } catch {
      failedWrite = true;
      return false;
    }
  }

  S.storage = {
    KEYS: KEYS,

    getOverride: function () {
      var v = read('localStorage', KEYS.override);
      return MODES.indexOf(v) >= 0 ? v : 'auto';
    },
    setOverride: function (mode) { return write('localStorage', KEYS.override, mode); },

    getProfile: function (ttlHours) {
      var raw = read('localStorage', KEYS.profile);
      if (!raw) return null;
      try {
        var p = JSON.parse(raw);
        if (!p || typeof p.timestamp !== 'number') return null;
        if (Date.now() - p.timestamp > ttlHours * 3600 * 1000) return null;
        return p;
      } catch { return null; }
    },
    setProfile: function (profile) { return write('localStorage', KEYS.profile, JSON.stringify(profile)); },
    clearProfile: function () { return write('localStorage', KEYS.profile, null); },

    getDashboardOpen: function () { return read('localStorage', KEYS.dashboardOpen) === 'true'; },
    setDashboardOpen: function (open) { return write('localStorage', KEYS.dashboardOpen, String(!!open)); },

    hasSession: function () { return read('sessionStorage', KEYS.session) === '1'; },
    markSession: function () { return write('sessionStorage', KEYS.session, '1'); },

    isDowngradeDismissed: function () { return read('sessionStorage', KEYS.downgradeDismissed) === '1'; },
    dismissDowngrade: function () { return write('sessionStorage', KEYS.downgradeDismissed, '1'); },

    writeFailed: function () { return failedWrite; }
  };
})(window.Sypher);
