// Login page script; external because the server CSP blocks inline scripts.
document.documentElement.classList.add('js-intro');

document.addEventListener('DOMContentLoaded', function() {
  'use strict';

  var urlParams = new URLSearchParams(window.location.search);
  var instantLogin = urlParams.get('state') === 'login';
  var mark = document.getElementById('brandMark');
  var unit = document.querySelector('.brand-unit');
  var htmlEl = document.documentElement;
  var reducedMotion = false;
  try { reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  var morphed = false;
  var morphTimer = null;

  // Skips everything and shows the settled sign-in page
  function skipIntro() {
    if (morphed) return;
    morphed = true;
    if (morphTimer) { clearTimeout(morphTimer); }
    htmlEl.classList.remove('js-intro');
    document.body.classList.remove('intro');
    document.body.classList.add('ready');
    if (unit) {
      unit.style.transition = 'none';
      unit.style.transform = '';
    }
    mark.classList.add('loaded');
  }

  // Phase 2: the unit glides from page center back into its brand-column slot
  function morphHome() {
    if (morphed) return;
    morphed = true;
    unit.style.transition = 'transform 0.35s cubic-bezier(0.22, 0.9, 0.24, 1)';
    unit.style.transform = 'none';
    document.body.classList.remove('intro');
    setTimeout(function() {
      unit.style.transition = '';
      mark.classList.add('loaded');
      document.body.classList.add('ready');
    }, 380);
  }

  if (instantLogin || reducedMotion) {
    skipIntro();
  } else if (mark && unit) {
    try {
      // Phase 1: pose mark + name at the center of the viewport — one frame, logo and name only
      var r = unit.getBoundingClientRect();
      if (r.width > 0) {
        var dx = window.innerWidth / 2 - (r.left + r.width / 2);
        var dy = window.innerHeight / 2 - (r.top + r.height / 2);
        unit.style.transition = 'none';
        unit.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) scale(1.12)';
        void unit.offsetWidth; // flush the pose before the reveal
        htmlEl.classList.remove('js-intro');
        document.body.classList.add('intro');
        morphTimer = setTimeout(morphHome, 600);
      } else {
        skipIntro();
      }
    } catch (err) {
      skipIntro();
    }
  } else {
    skipIntro();
  }

  // Any keypress skips the intro, like the previous loader
  window.addEventListener('keydown', skipIntro);

  // Toggle Password Visibility
  var pwdInput = document.getElementById('password');
  var toggleBtn = document.getElementById('togglePwd');
  var eyeIcon = document.getElementById('eyeIcon');

  var eyeOpen = '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>';
  var eyeSlash = '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/>';

  if (toggleBtn && pwdInput) {
    toggleBtn.addEventListener('click', function() {
      var isPassword = pwdInput.type === 'password';
      pwdInput.type = isPassword ? 'text' : 'password';
      eyeIcon.innerHTML = isPassword ? eyeSlash : eyeOpen;
      toggleBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
    });
  }

  // Caps Lock notice on the password field
  var capsHint = document.getElementById('capsHint');

  if (pwdInput && capsHint) {
    var updateCaps = function(e) {
      if (e && typeof e.getModifierState === 'function') {
        capsHint.hidden = !e.getModifierState('CapsLock');
      }
    };
    ['keydown', 'keyup'].forEach(function(evt) {
      pwdInput.addEventListener(evt, updateCaps);
    });
    pwdInput.addEventListener('blur', function() {
      capsHint.hidden = true;
    });
  }

  // Submit feedback: cargo lifts off the mark while signing in
  var form = document.getElementById('loginForm');
  var submitBtn = document.getElementById('submitBtn');

  if (form && submitBtn && mark) {
    form.addEventListener('submit', function(e) {
      // Preview placeholder: keep the page alive so the state is visible.
      // For real wiring, remove this line and let the form post to /login.
      e.preventDefault();
      if (submitBtn.classList.contains('busy') || submitBtn.classList.contains('done')) return;
      submitBtn.classList.add('busy');
      submitBtn.innerHTML = '<span>Signing in…</span>';
      mark.classList.add('loading');
      setTimeout(function() {
        mark.classList.remove('loading');
        submitBtn.classList.remove('busy');
        submitBtn.classList.add('done');
        submitBtn.innerHTML = '<svg class="done-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg><span>Welcome back</span>';
      }, 2400);
      setTimeout(function() { window.location.href = './'; }, 3200);
    });
  }
});
