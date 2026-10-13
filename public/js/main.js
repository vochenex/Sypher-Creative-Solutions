/* Entry point: starts the engine once all deferred modules are parsed. */
(function (S) {
  'use strict';

  document.addEventListener('adaptive:ready', function () { S.ui.dashboard.restore(); }, { once: true });
  S.controller.init();
})(window.Sypher);
