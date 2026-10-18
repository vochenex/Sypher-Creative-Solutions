/* Copy deck (Section 10 of the workflow document). */
(function (S) {
  'use strict';

  function title(mode) { return mode.charAt(0).toUpperCase() + mode.slice(1).toLowerCase(); }

  S.copy = {
    title: title,
    analyzing: 'Analyzing Device Performance\u2026',
    analyzeHelp: 'This takes about 2 seconds.',
    steps: {
      signals: 'Checking your device',
      webgl: 'Checking graphics support',
      benchmark: 'Running a quick smoothness test',
      scoring: 'Choosing the best display mode',
      done: 'Done'
    },
    resultTitle: function (cls) { return 'Device Performance Level: ' + cls; },
    resultBody: {
      HIGH: 'Full visual effects enabled.',
      MEDIUM: 'Some visual effects have been optimized for smoother performance.',
      BASIC: 'Visual effects have been reduced to improve performance.'
    },
    resultEstimated: 'Result estimated from limited information.',
    resultFallback: 'We couldn\u2019t analyze your device reliably, so Basic mode is being used as a safe baseline.',
    resultManual: function (mode) { return 'You\u2019re using ' + title(mode) + ' mode (your choice).'; },
    resultVerified: 'Your device passed the smoothness test, so full effects are on.',

    whyHigh: { cpu: 'Strong processor', fps: 'a smooth frame rate', memory: 'plenty of memory', webgl: 'full graphics support', screen: 'a comfortable screen resolution' },
    whyLow: { cpu: 'Fewer processor threads', memory: 'Limited memory', fps: 'A lower frame rate in the quick test', webgl: 'Limited graphics support', screen: 'A very high-resolution screen' },
    whyCap: {
      touchCap: 'Touch device on a smaller screen without strong frame evidence',
      saveData: 'Data Saver is on',
      slowNetwork: 'A slow network connection',
      lowBattery: 'Battery is low and not charging',
      insufficientData: 'Not enough independent evidence for richer effects',
      estimatedHighGuard: 'Frame observation didn\u2019t finish, so High was withheld',
      lowCoverage: 'Evidence coverage was too low for High',
      noHardwareHint: 'No CPU/memory hint was available for a High recommendation'
    },
    modeHelp: {
      auto: 'Recommended for this visit based on available device signals.',
      high: 'Rich visuals when evidence supports them.',
      medium: 'Balanced visuals with lighter effects.',
      basic: 'Lightweight presentation for speed and simplicity.'
    },

    chip: function (mode, source) { return title(mode) + ' \u00b7 ' + (source === 'manual' ? 'Manual' : 'Auto'); },
    diff: function (cls, mode) { return 'Detected: ' + cls + ', Using: ' + mode.toUpperCase() + ' (manual)'; },

    toast: {
      changed: function (mode) { return 'Display mode changed to ' + title(mode) + '.'; },
      auto: function (mode) { return 'Display mode set to Auto (' + title(mode) + ' for this device).'; },
      slow: 'High mode is on. If the site feels slow, switch to Basic.',
      rmHigh: 'Your device\u2019s reduce-motion setting is on, so animations stay off. High mode still improves image and media quality.',
      estimated: 'We used a quick estimate to choose your display mode.',
      fallback: 'We couldn\u2019t analyze your device reliably, so Basic mode is being used.',
      downgrade: function (lighter) { return 'Things look a bit slow. Switch to ' + title(lighter) + ' for smoother scrolling?'; },
      storage: 'Your browser isn\u2019t saving settings, so your display mode will reset when you leave this page.',
      testSaved: 'Test result saved.',
      testFailed: 'Couldn\u2019t save the test result. Your site experience isn\u2019t affected.'
    },

    warnTitle: 'This may slow down your device.',
    warnBody: 'Your device was detected as BASIC. High mode loads animations and effects that may cause slow scrolling, heat, or battery drain.',
    notAvailable: 'Not available',
    notMeasured: 'Not measured (estimated result)',
    notSupported: 'Not supported'
  };
})(window.Sypher);
