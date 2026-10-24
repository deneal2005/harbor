// The signed-out face of Harbor: the opening screen from the brand previews as a
// real, working gate. First run offers creating the device key (local-first: the
// password digest never leaves the browser); later visits ask for it. The opening
// choreography skips for ?state=login, reduced motion, low-end devices, hidden tabs
// and one key press — every visitor reaches the settled page within moments.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Check, Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useStore } from '../store-context.js';
import { motionEnabled } from '../utils/device.js';
import { HarborMark } from '../components/HarborMark.jsx';
import { Button, Dialog } from '../components/ui.jsx';
import {
  MIN_PASSWORD_LENGTH, createCredential, credentialEmail, credentialExists,
  getSessionSnapshot, isEmail, normalizeEmail, removeCredential,
  signIn, startSession, subscribeSession, weakPassword,
} from '../services/session.js';
import './login.css';

const MORPH_MS = 2200;   // centre pose holds while the mark draws itself
const HOME_MS = 720;     // glide home completes; then stage settled
const BUSY_MIN_MS = 650; // keep the busy state long enough to be seen
const DONE_MS = 850;     // the done check shows before leaving for the app

export default function Login() {
  const { t, state } = useStore();
  const navigate = useNavigate();
  const loc = useLocation();
  const signedIn = useSyncExternalStore(subscribeSession, getSessionSnapshot).signedIn;

  // Decided once at mount: nothing re-poses the opening after it has started.
  const [playOpen] = useState(() => {
    const urlSkip = new URLSearchParams(window.location.search).get('state') === 'login';
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    return !urlSkip && !reduced && !document.hidden && motionEnabled(state?.settings?.motion);
  });

  const [mode, setMode] = useState(() => (credentialExists() ? 'signin' : 'setup'));
  const [email, setEmail] = useState(() => credentialEmail() ?? '');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [formErr, setFormErr] = useState(null);
  const [notice, setNotice] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [stage, setStage] = useState(() => (playOpen ? 'intro' : 'settled'));
  const unitRef = useRef(null);
  const timers = useRef(new Set());

  const later = (fn, ms) => {
    const id = setTimeout(fn, ms);
    timers.current.add(id);
    return id;
  };
  useEffect(() => () => { for (const id of timers.current) clearTimeout(id); }, []);

  /* -------- the opening: pose at centre pre-paint, then glide home --------
     The stage starts as 'intro' (or 'settled' on a skip) from the first render,
     so no setState is needed here: only the pre-paint DOM pose below, which the
     browser has never painted when it runs. */
  useLayoutEffect(() => {
    if (!playOpen) return;
    const unit = unitRef.current;
    // Pre-paint pose: the mark + wordmark stand at page centre, one frame, nothing else.
    const r = unit?.getBoundingClientRect();
    if (unit && r && r.width > 0) {
      const dx = window.innerWidth / 2 - (r.left + r.width / 2);
      const dy = window.innerHeight / 2 - (r.top + r.height / 2);
      unit.style.transition = 'none';
      unit.style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) scale(1.12)`;
    }
  }, [playOpen]);

  useLayoutEffect(() => {
    const unit = unitRef.current;
    if (!unit) return;
    if (stage === 'home') {
      unit.style.transition = 'transform 0.65s cubic-bezier(0.22, 0.9, 0.24, 1)';
      unit.style.transform = 'none';
    } else if (stage === 'settled') {
      unit.style.transition = '';
      unit.style.transform = '';
    }
  }, [stage]);

  useEffect(() => {
    if (!playOpen) return;
    // Two clocks: the centre pose holds while the mark draws; then it glides home
    // and settles. A key press or a hidden tab skips straight to settled.
    later(() => setStage((s) => (s === 'intro' ? 'home' : s)), MORPH_MS);
    later(() => setStage((s) => (s === 'home' ? 'settled' : s)), MORPH_MS + HOME_MS);
    const skip = () => setStage((s) => (s === 'settled' ? s : 'settled'));
    const onKey = (e) => {
      const el = e.target;
      const typing = el && (el.closest?.('input, textarea, select') || el.isContentEditable);
      if (typing && e.key !== 'Escape') return;
      skip();
    };
    const onHidden = () => document.hidden && skip();
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [playOpen]);

  /* ------------------------------- the gate ------------------------------- */
  const submit = async (e) => {
    e.preventDefault();
    if (busy || done) return;
    setFormErr(null);
    const clean = normalizeEmail(email);
    if (!isEmail(clean)) return setFormErr(t('login.err.email'));
    const pass = String(password);
    if (mode === 'setup' && weakPassword(pass)) return setFormErr(t('login.err.weak', { min: MIN_PASSWORD_LENGTH }));

    setBusy(true);
    const started = Date.now();
    try {
      if (mode === 'setup') {
        const r = await createCredential({ email: clean, password: pass });
        if (!r.ok) {
          setFormErr(r.error === 'email' ? t('login.err.email')
            : r.error === 'exists' ? t('login.err.badLogin')
            : r.error === 'storage' ? t('app.storageFail')
            : t('login.err.weak', { min: MIN_PASSWORD_LENGTH }));
          setBusy(false);
          return;
        }
        startSession(r.email);
      } else {
        const r = await signIn(clean, pass);
        if (!r.ok) {
          setFormErr(r.error === 'noCredential' ? t('login.err.badLogin') : t('login.err.badLogin'));
          setBusy(false);
          return;
        }
      }
      // Hold the busy pose just long enough for the rows to pulse once.
      await new Promise((res) => later(res, Math.max(0, BUSY_MIN_MS - (Date.now() - started))));
      setBusy(false);
      setDone(true);
      later(() => navigate(fromTarget(loc.state?.from), { replace: true }), DONE_MS);
    } catch {
      setBusy(false);
      setFormErr(t('app.storageFail'));
    }
  };

  // The honest "forgot" for a device-held password: remove the key, data stays,
  // and the form switches to creating a fresh key.
  const removeKey = () => {
    removeCredential();
    setForgotOpen(false);
    setNotice(true);
    setMode('setup');
    setPassword('');
  };

  // Unlocked on arrival? straight to the workspaces the visitor asked for.
  if (signedIn && !busy && !done) {
    return <Navigate replace to={fromTarget(loc.state?.from)} />;
  }

  const radar = ['H', 'A', 'R', 'B', 'O', 'R'];
  const capsCheck = (e) => { if (typeof e.getModifierState === 'function') setCapsOn(e.getModifierState('CapsLock')); };

  return (
    <div className="lg-page" data-stage={stage}>
      <div className="lg-backdrop" aria-hidden="true" />
      <main className="lg-shell">
        <div className="lg-brand">
          <div className="lg-unit" ref={unitRef}>
            <div className="lg-icon">
              <HarborMark decorative dock={playOpen} busy={busy} />
            </div>
            <h1 className="lg-title" aria-label={t('login.wordmark')}>
              <span className="lg-w" aria-hidden="true">
                {radar.map((ch, i) => <span key={i} className="lg-l"><i style={{ '--i': i }}>{ch}</i></span>)}
              </span>
            </h1>
          </div>
          <p className="lg-sub lg-rv">{t('login.sub')}</p>
          <div className="lg-bar lg-rv" aria-hidden="true" />
          <h2 className="lg-heading lg-rv">{t('login.tagline1')} <span className="lg-nowrap">{t('login.tagline2')}</span></h2>
          <p className="lg-body lg-rv">{t('login.pitch')}</p>
        </div>

        <div className="lg-cardcol">
          <div className="lg-card">
            <h2 className="lg-cardTitle lg-rv">{mode === 'setup' ? t('login.setupTitle') : t('login.title')}</h2>
            <p className="lg-cardDesc lg-rv">{mode === 'setup' ? t('login.setupDesc') : t('login.desc')}</p>

            <form className="lg-form" noValidate onSubmit={submit}>
              <label className="lg-vh" htmlFor="lg-email">{t('login.email')}</label>
              <div className="lg-ig lg-rv lg-ig1">
                <span className="lg-ii" aria-hidden="true"><Mail size={19} /></span>
                <input id="lg-email" className="lg-if" type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder={t('login.emailPh')}
                  autoComplete="email" autoFocus={mode !== 'signin'} />
              </div>

              <label className="lg-vh" htmlFor="lg-pwd">{t('login.pwd')}</label>
              <div className="lg-ig lg-rv lg-ig2">
                <span className="lg-ii" aria-hidden="true"><Lock size={19} /></span>
                <input id="lg-pwd" className="lg-if" type={show ? 'text' : 'password'} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={capsCheck} onKeyUp={capsCheck} onBlur={() => setCapsOn(false)}
                  placeholder={t('login.pwd')} autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
                  autoFocus={mode === 'signin'} />
                <button type="button" className="lg-eye" aria-label={show ? t('login.hidePwd') : t('login.showPwd')}
                  aria-pressed={show} onClick={() => setShow((v) => !v)}>
                  {show ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
                {capsOn && <span className="lg-caps">{t('login.capsLock')}</span>}
              </div>

              {mode === 'setup' && <p className="lg-hint">{t('login.pwdHint', { min: MIN_PASSWORD_LENGTH })}</p>}
              {formErr && <p className="lg-formErr" role="alert">{formErr}</p>}
              {notice && <p className="lg-note" role="status">{t('login.removedNote')}</p>}

              <button type="submit" className={`lg-btn lg-rv${busy ? ' busy' : ''}${done ? ' done' : ''}`}>
                {done && <Check size={16} className="lg-check" aria-hidden="true" />}
                <span>{done ? t('login.done')
                  : busy ? (mode === 'setup' ? t('login.creating') : t('login.signingIn'))
                  : (mode === 'setup' ? t('login.create') : t('login.signin'))}</span>
              </button>
            </form>

            {mode === 'signin' && (
              <div className="lg-foot lg-rv">
                <button type="button" className="lg-soft" onClick={() => setForgotOpen(true)}>{t('login.forgot')}</button>
              </div>
            )}
          </div>

          <div className="lg-trustWrap lg-rv">
            <p className="lg-trust"><ShieldCheck aria-hidden="true" /><span>{t('login.trust')}</span></p>
          </div>
        </div>
      </main>

      <Dialog open={forgotOpen} onClose={() => setForgotOpen(false)} title={t('login.forgotTitle')}
        footer={<Button variant="danger" onClick={removeKey}>{t('login.removeKey')}</Button>}>
        <p>{t('login.forgotBody')}</p>
      </Dialog>
    </div>
  );
}

// Only ever follow same-app targets under the signed-in shell.
function fromTarget(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('/login') ? value : '/';
}
