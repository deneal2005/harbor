import { useState } from 'react';
import { Button, Card, Field, Page, inputCls } from '../components/ui.jsx';
import { updateSettings } from '../services/actions.js';
import { useStore } from '../store-context.js';

export default function Escalation() {
  const { t, state, run, notify } = useStore();
  const [ladder, setLadder] = useState(() => structuredClone(state.settings.ladder));
  const [templates, setTemplates] = useState(() => structuredClone(state.settings.templates));
  const [error, setError] = useState(null);
  const setStage = (i, k, v) => setLadder((l) => l.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  const setTpl = (key, lang, v) => setTemplates((x) => ({ ...x, [key]: { ...x[key], [lang]: v } }));
  const save = () => {
    const offsets = ladder.map((s) => Number(s.offset));
    if (offsets.some((o) => !Number.isInteger(o)) || offsets.some((o, i) => i && o <= offsets[i - 1])) return setError('Offsets must be whole numbers in increasing order.');
    setError(null);
    run(updateSettings, { ladder: ladder.map((s) => ({ ...s, offset: Number(s.offset) })), templates });
    notify(t('esc.saved'));
  };
  const tplEditor = (k) => (
    <div className="grid gap-2 md:grid-cols-2">
      {['en', 'hi'].map((lang) => (
        <Field key={lang} label={`${t('esc.template')} · ${lang === 'en' ? 'English' : 'हिंदी'}`}>{(p) => <textarea {...p} lang={lang} rows={4} className={inputCls} value={templates[k][lang]} onChange={(e) => setTpl(k, lang, e.target.value)} />}</Field>
      ))}
    </div>
  );

  return (
    <Page title={t('esc.title')} subtitle={t('esc.subtitle')} actions={<Button variant="primary" onClick={save}>{t('common.save')}</Button>}>
      <Card title={t('esc.pauseRules')}>
        <ul className="list-disc space-y-1 pl-5 text-sm">{[1, 2, 3, 4, 5].map((n) => <li key={n}>{t(`esc.pause${n}`)}</li>)}</ul>
        <p className="mt-2 text-sm text-muted">{t('esc.placeholders')}</p>
      </Card>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {ladder.map((s, i) => (
        <Card key={s.id} title={t(`stage.${s.id}`)}>
          <div className="mb-3 flex flex-wrap items-end gap-4">
            <Field label={t('esc.offset')} className="w-40">{(p) => <input {...p} inputMode="numeric" className={inputCls} value={s.offset} onChange={(e) => setStage(i, 'offset', e.target.value)} />}</Field>
            <label className="flex min-h-12 items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={s.enabled !== false} onChange={(e) => setStage(i, 'enabled', e.target.checked)} />{t('esc.enabled')}</label>
          </div>
          {tplEditor(s.template)}
        </Card>
      ))}
      <Card title={t('esc.extra')}>
        {['disputeResolved', 'promiseConfirm'].map((k) => <div key={k} className="mb-4"><h3 className="mb-2 font-medium">{t(`esc.tpl.${k}`)}</h3>{tplEditor(k)}</div>)}
      </Card>
      <div className="flex justify-end"><Button variant="primary" onClick={save}>{t('common.save')}</Button></div>
    </Page>
  );
}
