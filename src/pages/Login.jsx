// The signed-out face of Harbor: the opening screen from the brand previews as a
// real, working gate. First run offers creating the device key (local-first: the
// password digest never leaves the browser); later visits ask for it. The opening
// choreography skips for ?state=login, reduced motion, low-end devices, hidden tabs
// and one key press — every visitor reaches the settled page within moments.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { ArrowRight, Check, Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useStore } from '../store-context.js';
import { motionEnabled } from '../utils/device.js';
import { HarborMark } from '../components/HarborMark.jsx';
import { Button, Dialog } from '../components/ui.jsx';
import {
  MIN_PASSWORD_LENGTH, createCredential, credentialEmail,
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

  // Sign-in is the front door; a first visit is one click away via "Create a new business account".
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState(() => credentialEmail() ?? '');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [formErr, setFormErr] = useState(null); // { msg, field?, to? } — `to` offers the other mode as the fix
  const [notice, setNotice] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [stage, setStage] = useState(() => (playOpen ? 'intro' : 'settled'));
  const unitRef = useRef(null);
  const emailRef = useRef(null);
  const pwdRef = useRef(null);
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

  // Put the cursor on the field the error is about, once the fields are enabled again.
  useEffect(() => {
    if (formErr?.field) (formErr.field === 'email' ? emailRef : pwdRef).current?.focus();
  }, [formErr]);

  /* ------------------------------- the gate ------------------------------- */
  const submit = async (e) => {
    e.preventDefault();
    if (busy || done) return;
    setFormErr(null);
    const clean = normalizeEmail(email);
    if (!isEmail(clean)) return setFormErr({ msg: t('login.err.email'), field: 'email' });
    const pass = String(password);
    if (!pass) return setFormErr({ msg: t('login.err.noPwd'), field: 'pwd' });
    if (mode === 'setup' && weakPassword(pass)) return setFormErr({ msg: t('login.err.weak', { min: MIN_PASSWORD_LENGTH }), field: 'pwd' });

    setBusy(true);
    const started = Date.now();
    try {
      if (mode === 'setup') {
        const r = await createCredential({ email: clean, password: pass });
        if (!r.ok) {
          setBusy(false);
          return setFormErr(r.error === 'email' ? { msg: t('login.err.email'), field: 'email' }
            : r.error === 'exists' ? { msg: t('login.err.exists'), to: 'signin' }
            : r.error === 'storage' ? { msg: t('app.storageFail') }
            : { msg: t('login.err.weak', { min: MIN_PASSWORD_LENGTH }), field: 'pwd' });
        }
        startSession(r.email);
      } else {
        const r = await signIn(clean, pass);
        if (!r.ok) {
          setBusy(false);
          if (r.error === 'noCredential') return setFormErr({ msg: t('login.err.noAccount'), to: 'setup' });
          setPassword('');
          return setFormErr({ msg: t('login.err.badLogin'), field: 'pwd' });
        }
      }
      // Hold the busy pose just long enough for the rows to pulse once.
      await new Promise((res) => later(res, Math.max(0, BUSY_MIN_MS - (Date.now() - started))));
      setBusy(false);
      setDone(true);
      later(() => navigate(fromTarget(loc.state?.from), { replace: true }), DONE_MS);
    } catch {
      setBusy(false);
      setFormErr({ msg: t('app.storageFail') });
    }
  };

  // Flip between signing in and creating an account; the typed email carries over.
  const switchMode = (to) => {
    setMode(to);
    setFormErr(null);
    setNotice(false);
    setPassword('');
    (isEmail(normalizeEmail(email)) ? pwdRef : emailRef).current?.focus();
  };

  // The honest "forgot" for a device-held password: remove the key, data stays,
  // and the form switches to creating a fresh key.
  const removeKey = () => {
    removeCredential();
    setForgotOpen(false);
    switchMode('setup');
    setNotice(true);
  };

  // Unlocked on arrival? straight to the workspaces the visitor asked for.
  if (signedIn && !busy && !done) {
    return <Navigate replace to={fromTarget(loc.state?.from)} />;
  }

  const setup = mode === 'setup';
  const pwdOk = !weakPassword(String(password));
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
            {/* keyed on mode so the heading re-animates when the visitor switches */}
            <div key={mode} className="lg-swap">
              <h2 className="lg-cardTitle lg-rv">{setup ? t('login.setupTitle') : t('login.title')}</h2>
              <p className="lg-cardDesc lg-rv">{setup ? t('login.setupDesc') : t('login.desc')}</p>
            </div>

            <form className="lg-form" noValidate onSubmit={submit} aria-busy={busy}>
              <div className="lg-field lg-rv lg-ig1">
                <label className="lg-label" htmlFor="lg-email">{setup ? t('login.workEmail') : t('login.email')}</label>
                <div className="lg-ig">
                  <span className="lg-ii" aria-hidden="true"><Mail size={19} /></span>
                  <input id="lg-email" ref={emailRef} className="lg-if" type="email" inputMode="email" value={email}
                    onChange={(e) => { setEmail(e.target.value); if (formErr) setFormErr(null); }}
                    placeholder={t('login.emailPh')} autoComplete="email" autoCapitalize="none" spellCheck={false}
                    autoFocus={!email} disabled={busy || done}
                    aria-invalid={formErr?.field === 'email' || undefined} aria-describedby={formErr ? 'lg-err' : undefined} />
                </div>
              </div>

              <div className="lg-field lg-rv lg-ig2">
                <div className="lg-labelRow">
                  <label className="lg-label" htmlFor="lg-pwd">{setup ? t('login.newPwd') : t('login.pwd')}</label>
                  {!setup && (
                    <button type="button" className="lg-link lg-linkSm" onClick={() => setForgotOpen(true)}>{t('login.forgot')}</button>
                  )}
                </div>
                <div className="lg-ig">
                  <span className="lg-ii" aria-hidden="true"><Lock size={19} /></span>
                  <input id="lg-pwd" ref={pwdRef} className="lg-if" type={show ? 'text' : 'password'} value={password}
                    onChange={(e) => { setPassword(e.target.value); if (formErr) setFormErr(null); }}
                    onKeyDown={capsCheck} onKeyUp={capsCheck} onBlur={() => setCapsOn(false)}
                    placeholder={setup ? t('login.pwdHint', { min: MIN_PASSWORD_LENGTH }) : t('login.pwdPh')}
                    autoComplete={setup ? 'new-password' : 'current-password'}
                    autoFocus={!!email} disabled={busy || done}
                    aria-invalid={formErr?.field === 'pwd' || undefined}
                    aria-describedby={[setup && 'lg-hint', formErr && 'lg-err'].filter(Boolean).join(' ') || undefined} />
                  <button type="button" className="lg-eye" aria-label={show ? t('login.hidePwd') : t('login.showPwd')}
                    aria-pressed={show} onClick={() => setShow((v) => !v)}>
                    {show ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </div>
                {capsOn && <span className="lg-caps">{t('login.capsLock')}</span>}
                {setup && (
                  <p id="lg-hint" className={`lg-hint${pwdOk ? ' ok' : ''}`}>
                    <Check size={14} aria-hidden="true" />{t('login.pwdHint', { min: MIN_PASSWORD_LENGTH })}
                  </p>
                )}
              </div>

              {formErr && (
                <p id="lg-err" className="lg-formErr" role="alert">
                  <span>{formErr.msg}</span>
                  {formErr.to && (
                    <button type="button" className="lg-link" onClick={() => switchMode(formErr.to)}>
                      {formErr.to === 'setup' ? t('login.toSetup') : t('login.toSignin')}
                    </button>
                  )}
                </p>
              )}
              {notice && <p className="lg-note" role="status">{t('login.removedNote')}</p>}

              <button type="submit" disabled={busy || done} className={`lg-btn lg-rv${busy ? ' busy' : ''}${done ? ' done' : ''}`}>
                {done ? <Check size={16} className="lg-check" aria-hidden="true" />
                  : busy ? <span className="lg-spin" aria-hidden="true" /> : null}
                <span>{done ? (setup ? t('login.created') : t('login.done'))
                  : busy ? (setup ? t('login.creating') : t('login.signingIn'))
                  : (setup ? t('login.create') : t('login.signin'))}</span>
                {!busy && !done && <ArrowRight size={17} className="lg-arrow" aria-hidden="true" />}
              </button>
            </form>

            <p className="lg-switch lg-rv">
              <span>{setup ? t('login.haveAccount') : t('login.newHere')}</span>{' '}
              <button type="button" className="lg-link" disabled={busy || done} onClick={() => switchMode(setup ? 'signin' : 'setup')}>
                {setup ? t('login.toSignin') : t('login.toSetup')}
              </button>
            </p>
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
