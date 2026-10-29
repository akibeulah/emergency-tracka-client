// "Claim your facility" (1-2): search the registry → select → claimant details and
// documents → submitted. A platform admin reviews every claim (admin-client) and two
// must approve before a Facility Code is issued.

import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { FACILITY_TYPE_LABEL, type ClaimDocKey, type MyClaim, type RegistryHit } from '../api/types';
import { useSession } from '../components/auth';
import { Icon } from '../components/Icon';
import { Banner, Crumbs, Empty, Loading, PageHead, Pill, fmtDate } from '../components/ui';
import { useAction, useDebounced, useResource } from '../components/useResource';

const DOCS: { key: ClaimDocKey; label: string; required: boolean; hint?: string }[] = [
  { key: 'licence', label: 'Healthcare facility licence', required: true },
  { key: 'staff_id', label: 'Your staff ID', required: true },
  { key: 'cac', label: 'CAC certificate', required: false, hint: 'Not needed for public hospitals.' },
  { key: 'capacity', label: 'Capacity attestation', required: false },
];

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = ['application/pdf', 'image/jpeg', 'image/png'];
const ROLES = ['Facility Administrator', 'Medical Director', 'Matron', 'A&E Doctor'];

const STEPS = ['Find your facility', 'Details and documents', 'Submitted'];

/** Live mode: why documents are not uploaded yet (null when they are). */
const DOCS_GAP = api.limits?.claimDocuments ?? null;

const placeLine = (h: RegistryHit) => [h.area, h.lga && `${h.lga} LGA`].filter(Boolean).join(', ');

export function ClaimFacilityPage() {
  const [selected, setSelected] = useState<RegistryHit | null>(null);
  const [done, setDone] = useState<MyClaim | null>(null);
  const mine = useResource(() => api.registry.myClaims(), [done]);
  const step = done ? 2 : selected ? 1 : 0;

  return (
    <div className="claim-page">
      <Crumbs items={[{ label: 'Onboarding' }, { label: 'Claim a facility' }]} />
      <PageHead
        title="Claim your facility"
        sub="Find your facility in the public registry and send your documents. A platform administrator reviews every claim before a Facility Code is issued and access is granted."
      />

      <ol className="claim-steps" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className={`claim-step${i === step ? ' active' : ''}${i < step ? ' done' : ''}`} aria-current={i === step ? 'step' : undefined}>
            <span className="claim-step__num">{i < step ? <Icon name="check" size={12} /> : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {done ? (
        <Submitted
          claim={done}
          onAnother={() => {
            setDone(null);
            setSelected(null);
          }}
        />
      ) : selected ? (
        <ClaimForm hit={selected} onBack={() => setSelected(null)} onDone={setDone} />
      ) : (
        <RegistrySearch onSelect={setSelected} />
      )}

      {mine.data && mine.data.length > 0 && !done && (
        <div className="web-panel">
          <h2>Your claims</h2>
          <div className="web-panel__sub">Claims sent from this email.</div>
          {mine.data.map((c) => (
            <div className="kv" key={c.reference}>
              <span className="kv__label">
                <strong>{c.facilityName}</strong>
                <div className="tiny faint mono">
                  {c.reference} · {fmtDate(c.submittedAt)}
                </div>
                {c.reason && <div className="tiny">{c.reason}</div>}
              </span>
              <span className="kv__value">
                {c.status === 'approved' ? (
                  <Pill tone="success">Approved</Pill>
                ) : c.status === 'rejected' ? (
                  <Pill tone="danger">Not approved</Pill>
                ) : (
                  <Pill tone="warning">Under review</Pill>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RegistrySearch({ onSelect }: { onSelect: (h: RegistryHit) => void }) {
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim());
  const results = useResource(() => (query.length >= 3 ? api.registry.search(query) : Promise.resolve(null)), [query]);

  return (
    <div className="web-panel">
      <h2>Find your facility</h2>
      <div className="web-panel__sub">Search the public list of registered healthcare facilities in Lagos.</div>
      <div className="toolbar">
        <div className="toolbar__search">
          <Icon name="search" />
          <input
            type="text"
            placeholder="Search by facility name, area or LGA"
            aria-label="Search the registry"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </div>
      </div>
      {query.length < 3 ? (
        <Empty>Start typing your facility's name to search the registry.</Empty>
      ) : results.loading ? (
        <Loading label="Searching…" />
      ) : results.error ? (
        <Banner tone="danger">{results.error}</Banner>
      ) : !results.data?.length ? (
        <Empty>
          No facility matches that search. Check the spelling, or contact the onboarding team if your facility is not
          listed.
        </Empty>
      ) : (
        <div className="registry-list">
          {results.data.map((h) => (
            <div className="registry-card" key={h.id}>
              <div>
                <div className="registry-card__name">{h.name}</div>
                <div className="registry-card__meta">
                  {[FACILITY_TYPE_LABEL[h.type], placeLine(h), h.address].filter(Boolean).join(' · ')}
                </div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => onSelect(h)}>
                Claim this facility
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ClaimForm({ hit, onBack, onDone }: { hit: RegistryHit; onBack: () => void; onDone: (c: MyClaim) => void }) {
  const session = useSession();
  const [form, setForm] = useState({
    contactName: session.user.name,
    contactRole: ROLES[0],
    contactEmail: session.user.email,
    contactPhone: '',
    legalName: hit.name,
    licenceNumber: '',
  });
  const [files, setFiles] = useState<Partial<Record<ClaimDocKey, File>>>({});
  const [fileErrors, setFileErrors] = useState<Partial<Record<ClaimDocKey, string>>>({});
  const [touched, setTouched] = useState(false);
  const action = useAction();

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const missing: string[] = [];
  if (!form.contactName.trim()) missing.push('your name');
  if (!/^\S+@\S+\.\S+$/.test(form.contactEmail.trim())) missing.push('a valid work email');
  if (form.contactPhone.replace(/\D/g, '').length < 7) missing.push('a phone number');
  if (!form.legalName.trim()) missing.push('the legal name');
  if (!form.licenceNumber.trim()) missing.push('the licence number');
  if (!DOCS_GAP) for (const d of DOCS) if (d.required && !files[d.key]) missing.push(d.label.toLowerCase());

  function pick(key: ClaimDocKey, file: File | undefined) {
    if (!file) return;
    if (!ACCEPT.includes(file.type)) {
      setFileErrors((e) => ({ ...e, [key]: 'Use a PDF, JPG or PNG file.' }));
      return;
    }
    if (file.size > MAX_BYTES) {
      setFileErrors((e) => ({ ...e, [key]: 'Files must be 10 MB or smaller.' }));
      return;
    }
    setFileErrors((e) => ({ ...e, [key]: undefined }));
    setFiles((f) => ({ ...f, [key]: file }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (missing.length) return;
    const res = await action.run(() =>
      api.registry.submitClaim({
        facilityId: hit.id,
        ...form,
        location: null,
        documents: Object.entries(files).map(([key, file]) => ({ key: key as ClaimDocKey, file: file! })),
      }),
    );
    if (res) onDone(res);
  }

  return (
    <form className="web-panel" onSubmit={submit} noValidate>
      <div className="web-panel__head">
        <div>
          <h2>{hit.name}</h2>
          <div className="web-panel__sub" style={{ marginBottom: 0 }}>
            {[FACILITY_TYPE_LABEL[hit.type], placeLine(hit), hit.address].filter(Boolean).join(' · ')}
          </div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          Change facility
        </button>
      </div>

      <div className="modal__section-title">Who is claiming</div>
      <div className="field-grid">
        <div className="field">
          <label htmlFor="cl-name">Your name</label>
          <input id="cl-name" type="text" value={form.contactName} onChange={set('contactName')} />
        </div>
        <div className="field">
          <label htmlFor="cl-role">Your role at the facility</label>
          <select id="cl-role" value={form.contactRole} onChange={set('contactRole')}>
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cl-email">Work email</label>
          <input id="cl-email" type="email" value={form.contactEmail} onChange={set('contactEmail')} />
          <div className="hint">If approved, this email becomes the facility's first administrator.</div>
        </div>
        <div className="field">
          <label htmlFor="cl-phone">Phone</label>
          <input id="cl-phone" type="tel" value={form.contactPhone} onChange={set('contactPhone')} />
        </div>
      </div>

      <div className="modal__section-title">Registration</div>
      <div className="field-grid">
        <div className="field">
          <label htmlFor="cl-legal">Legal name</label>
          <input id="cl-legal" type="text" value={form.legalName} onChange={set('legalName')} />
        </div>
        <div className="field">
          <label htmlFor="cl-licence">Healthcare licence number</label>
          <input id="cl-licence" type="text" value={form.licenceNumber} onChange={set('licenceNumber')} />
        </div>
      </div>

      <div className="modal__section-title">Supporting documents</div>
      {DOCS_GAP ? (
        <Banner tone="info" title="Documents are not uploaded here yet.">
          {DOCS_GAP}
        </Banner>
      ) : (
        <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
          PDF, JPG or PNG, up to 10 MB each. Items marked * are required.
        </p>
      )}
      {!DOCS_GAP && DOCS.map((d) => {
        const f = files[d.key];
        return (
          <div className="upload-row" key={d.key}>
            <div className="upload-row__info">
              <span className="upload-row__name">
                {d.label}
                {d.required && <span style={{ color: 'var(--danger)' }}> *</span>}
              </span>
              <span className="upload-row__hint">
                {fileErrors[d.key] ? (
                  <span className="field-error">{fileErrors[d.key]}</span>
                ) : f ? (
                  <>
                    <Icon name="check" size={12} /> {f.name}
                  </>
                ) : (
                  d.hint ?? 'Not attached yet'
                )}
              </span>
            </div>
            <label className="btn btn-outline btn-sm upload-btn">
              {f ? 'Replace' : 'Upload'}
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                aria-label={`Upload ${d.label}`}
                onChange={(e) => pick(d.key, e.target.files?.[0])}
              />
            </label>
          </div>
        );
      })}

      <div className="claim-note mt-12">
        Your claim goes to the Emergency Tracka onboarding team. We never confirm whether a facility is already on the
        platform, so starting a claim is always safe.
      </div>

      {touched && missing.length > 0 && (
        <div className="mt-12">
          <Banner tone="warning" title="Still needed">
            {missing.join(', ')}.
          </Banner>
        </div>
      )}
      {action.error && <Banner tone="danger">{action.error}</Banner>}

      <div className="form-actions">
        <button type="button" className="btn btn-outline btn-sm" onClick={onBack}>
          Back
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={action.busy}>
          {action.busy ? 'Submitting…' : 'Submit claim'}
        </button>
      </div>
    </form>
  );
}

function Submitted({ claim, onAnother }: { claim: MyClaim; onAnother: () => void }) {
  return (
    <div className="web-panel">
      <Banner tone="success" title="Claim submitted.">
        A platform administrator will review it. If the details check out, we will email you your Facility Code and
        you can sign in with it.
      </Banner>
      <div className="kv mt-12">
        <span className="kv__label">Reference</span>
        <span className="kv__value mono">{claim.reference}</span>
      </div>
      <div className="kv">
        <span className="kv__label">Facility</span>
        <span className="kv__value">{claim.facilityName}</span>
      </div>
      <div className="kv">
        <span className="kv__label">Status</span>
        <span className="kv__value">
          <Pill tone="warning">Under review</Pill>
        </span>
      </div>
      <div className="form-actions">
        <button className="btn btn-outline btn-sm" onClick={onAnother}>
          Claim another facility
        </button>
      </div>
    </div>
  );
}
