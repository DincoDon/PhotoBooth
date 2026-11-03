/* Minimal Streamlit custom-component bridge (no npm needed).
   Implements just enough of the component protocol to receive `args`
   from Python and to set the frame height. */
(function (global) {
  'use strict';

  const listeners = [];
  const Streamlit = {
    args: null,
    post(type, data) {
      try {
        global.parent.postMessage(Object.assign({ isStreamlitMessage: true, type: type }, data || {}), '*');
      } catch (e) { /* standalone mode */ }
    },
    ready() { this.post('streamlit:componentReady', { apiVersion: 1 }); },
    setFrameHeight(h) { this.post('streamlit:setFrameHeight', { height: h }); },
    setValue(v) { this.post('streamlit:setComponentValue', { value: v, dataType: 'json' }); },
    onArgs(fn) { listeners.push(fn); }
  };

  global.addEventListener('message', function (ev) {
    const d = ev.data;
    if (!d || d.type !== 'streamlit:render') return;
    Streamlit.args = d.args || {};
    listeners.forEach(function (fn) { fn(Streamlit.args); });
  });

  global.Streamlit = Streamlit;
})(window);
