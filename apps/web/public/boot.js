/* Branded boot screen: a short mascot loading video (muted, inline). External file because the CSP
   forbids inline scripts. Hidden by main.tsx (window.__bootReady) once React has mounted AND the
   video has played for BOOT_MIN_MS, so the animation is seen instead of flashing past on a fast
   connection. Repeat visits in the same tab, reduced-motion users and automated browsers skip the
   minimum and leave as soon as the app is ready. */
(function () {
  var el = document.getElementById('boot');
  if (!el) return;
  var video = document.getElementById('boot-video');
  var BOOT_MIN_MS = 4000;
  var seen = false;
  try {
    seen = sessionStorage.getItem('boot-seen') === '1';
    sessionStorage.setItem('boot-seen', '1');
  } catch (e) {}
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fast = seen || reduce || navigator.webdriver;
  var minDone = fast;
  var ready = false;
  var hidden = false;
  function hide() {
    if (hidden || !minDone || !ready) return;
    hidden = true;
    el.classList.add('boot-out');
    setTimeout(function () {
      if (video) video.pause();
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 600);
  }
  window.__bootReady = function () {
    ready = true;
    hide();
  };
  if (!fast) {
    if (video) {
      var p = video.play();
      // Autoplay refused: the poster (first frame) stays up, which is fine.
      if (p && p.catch) p.catch(function () {});
    }
    setTimeout(function () {
      minDone = true;
      hide();
    }, BOOT_MIN_MS);
  }
  // Never trap the user behind the splash if something goes wrong.
  setTimeout(function () {
    minDone = true;
    ready = true;
    hide();
  }, 8000);
})();
