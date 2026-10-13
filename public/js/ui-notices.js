/* Notices and Toasts: renders adaptive:notice events. Max two visible; the rest queue. */
(function (S) {
  'use strict';

  var region = document.getElementById('toast-region');
  var MAX_VISIBLE = 2;
  var queue = [];
  var visible = [];

  function remove(t) {
    clearTimeout(t.timer);
    if (t.node.parentNode) t.node.parentNode.removeChild(t.node);
    visible = visible.filter(function (v) { return v !== t; });
    pump();
  }

  function arm(t, ms) {
    clearTimeout(t.timer);
    t.left = ms;
    t.start = Date.now();
    t.timer = setTimeout(function () {
      var dismissAction = (t.detail.actions || []).filter(function (a) { return a.isDismiss; })[0];
      if (dismissAction) dismissAction.run();
      remove(t);
    }, ms);
  }

  function render(detail) {
    var node = document.createElement('div');
    node.className = 'toast toast--' + (detail.tone || 'info');
    node.setAttribute('role', detail.type === 'slow-device-warning' ? 'alert' : 'status');

    var row = document.createElement('div');
    row.className = 'toast__row';
    var msg = document.createElement('p');
    msg.className = 'toast__msg';
    msg.textContent = detail.message;
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast__close';
    close.setAttribute('aria-label', 'Dismiss notification');
    close.innerHTML = '&times;';
    row.appendChild(msg);
    row.appendChild(close);
    node.appendChild(row);

    var t = { node: node, detail: detail, timer: null };

    if (detail.actions && detail.actions.length) {
      var acts = document.createElement('div');
      acts.className = 'toast__actions';
      detail.actions.forEach(function (a, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn--sm ' + (i === 0 ? 'btn--primary' : 'btn--ghost');
        b.textContent = a.label;
        b.addEventListener('click', function () { a.run(); remove(t); });
        acts.appendChild(b);
      });
      node.appendChild(acts);
    }

    close.addEventListener('click', function () {
      var dismissAction = (detail.actions || []).filter(function (a) { return a.isDismiss; })[0];
      if (dismissAction) dismissAction.run();
      remove(t);
    });

    var ms = detail.timeoutMs || (detail.persistent ? 0 : S.config.timing.toastMs);
    if (ms) {
      node.addEventListener('mouseenter', function () { clearTimeout(t.timer); t.left -= Date.now() - t.start; });
      node.addEventListener('mouseleave', function () { arm(t, Math.max(1500, t.left)); });
      node.addEventListener('focusin', function () { clearTimeout(t.timer); t.left -= Date.now() - t.start; });
      node.addEventListener('focusout', function (e) { if (!node.contains(e.relatedTarget)) arm(t, Math.max(1500, t.left)); });
    }
    t.ms = ms;
    return t;
  }

  function pump() {
    while (visible.length < MAX_VISIBLE && queue.length) {
      var t = queue.shift();
      region.appendChild(t.node);
      visible.push(t);
      if (t.ms) arm(t, t.ms);
    }
  }

  document.addEventListener('adaptive:notice', function (e) {
    var d = e.detail;
    // Replace an older toast of the same type instead of stacking duplicates.
    visible.concat(queue).forEach(function (t) {
      if (t.detail.type === d.type) {
        queue = queue.filter(function (q) { return q !== t; });
        if (visible.indexOf(t) >= 0) remove(t);
      }
    });
    queue.push(render(d));
    pump();
  });
})(window.Sypher);
