/* Preference Store: every read and write is wrapped so blocked or full storage never breaks the page. */
(function (S) {
  'use strict';

  var KEYS = {
    override: 'sypher.override',
    profile: 'sypher.profile',
    dashboardOpen: 'sypher.dashboardOpen',
    session: 'sypher.session',
    downgradeDismissed: 'sypher.downgradeDismissed',
    /** Session-only opt-in to play motion even when OS reduce-motion is on. */
    motionAllow: 'sypher.motionAllow'
  };
  var MODES = ['auto', 'high', 'medium', 'basic'];
  var CLASSES = ['HIGH', 'MEDIUM', 'BASIC'];
  var failedWrite = false;

  function read(store, key) {
    try {
      if (!window[store]) return null;
      return window[store].getItem(key);
    } catch (e) {
      return null;
    }
  }

  function write(store, key, value) {
    try {
      if (!window[store]) {
        failedWrite = true;
        return false;
      }
      if (value === null) window[store].removeItem(key);
      else window[store].setItem(key, value);
      return true;
    } catch (e) {
      failedWrite = true;
      return false;
    }
  }

  function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  /** Reject corrupted, incomplete, or unsupported cached profiles. */
  function validateProfile(p) {
    if (!isPlainObject(p)) return null;
    if (typeof p.timestamp !== 'number' || !Number.isFinite(p.timestamp) || p.timestamp > Date.now() + 60000) return null;
    if (CLASSES.indexOf(p['class']) < 0) return null;
    if (!(typeof p.score === 'number' || p.score === null)) return null;
    if (p.breakdown != null && !isPlainObject(p.breakdown)) return null;
    if (p.signals != null && !isPlainObject(p.signals)) return null;
    if (p.configVersion != null && typeof p.configVersion !== 'string') return null;
    var expectedVersion = S.config && S.config.configVersion;
    if (expectedVersion && p.configVersion && p.configVersion !== expectedVersion) return null;
    return p;
  }

  S.storage = {
    KEYS: KEYS,
    MODES: MODES,

    getOverride: function () {
      var v = read('localStorage', KEYS.override);
      return MODES.indexOf(v) >= 0 ? v : 'auto';
    },
    setOverride: function (mode) {
      if (MODES.indexOf(mode) < 0) return false;
      return write('localStorage', KEYS.override, mode);
    },

    getProfile: function (ttlHours) {
      var raw = read('localStorage', KEYS.profile);
      if (!raw) return null;
      try {
        var p = validateProfile(JSON.parse(raw));
        if (!p) {
          write('localStorage', KEYS.profile, null);
          return null;
        }
        // A zero TTL keeps the chosen experience across browser sessions until an explicit re-scan.
        var ttl = typeof ttlHours === 'number' ? ttlHours : 0;
        if (ttl > 0 && Date.now() - p.timestamp > ttl * 3600 * 1000) {
          write('localStorage', KEYS.profile, null);
          return null;
        }
        return p;
      } catch (e) {
        write('localStorage', KEYS.profile, null);
        return null;
      }
    },
    setProfile: function (profile) {
      var safe = validateProfile(profile);
      if (!safe) return false;
      if (S.config && S.config.configVersion && !safe.configVersion) {
        safe = Object.assign({}, safe, { configVersion: S.config.configVersion });
      }
      return write('localStorage', KEYS.profile, JSON.stringify(safe));
    },
    clearProfile: function () { return write('localStorage', KEYS.profile, null); },

    getDashboardOpen: function () { return read('localStorage', KEYS.dashboardOpen) === 'true'; },
    setDashboardOpen: function (open) { return write('localStorage', KEYS.dashboardOpen, String(!!open)); },

    hasSession: function () { return read('sessionStorage', KEYS.session) === '1'; },
    markSession: function () { return write('sessionStorage', KEYS.session, '1'); },

    isDowngradeDismissed: function () { return read('sessionStorage', KEYS.downgradeDismissed) === '1'; },
    dismissDowngrade: function () { return write('sessionStorage', KEYS.downgradeDismissed, '1'); },

    isMotionAllowed: function () { return read('sessionStorage', KEYS.motionAllow) === '1'; },
    allowMotion: function () { return write('sessionStorage', KEYS.motionAllow, '1'); },
    clearMotionAllow: function () { return write('sessionStorage', KEYS.motionAllow, null); },

    writeFailed: function () { return failedWrite; },

    /* Exposed for unit tests */
    _validateProfile: validateProfile
  };
})(window.Sypher);
