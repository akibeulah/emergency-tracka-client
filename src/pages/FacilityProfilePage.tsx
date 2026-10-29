// Facility profile (1-6): departments, oxygen source and reserve, specialist roster,
// blood-bank designation, duty phone. New capabilities show to senders as
// "Declared" until verified on site or by successful handovers (1-11).

import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { FACILITY_TYPE_LABEL, type FacilityProfile } from '../api/types';
import { featureBlood } from '../config';
import { Icon } from '../components/Icon';
import { Banner, Crumbs, Loading, PageHead, fmtDateTime, useToast } from '../components/ui';
import { useAction, useResource } from '../components/useResource';

const DEPARTMENTS = [
  'Emergency (A&E)',
  'Intensive care',
  'High dependency',
  'Surgery',
  'Obstetrics',
  'Paediatrics',
  'Neonatal care',
  'Orthopaedics',
  'Neurosurgery',
  'Cardiology',
  'Dialysis',
  'Burns',
];

const SPECIALISTS = [
  'General surgeon',
  'Obstetrician',
  'Anaesthetist',
  'Paediatrician',
  'Neurosurgeon',
  'Orthopaedic surgeon',
  'Cardiologist',
  'Nephrologist',
  'Physician',
];

const OXYGEN_SOURCES = ['Piped', 'Cylinders', 'Concentrators', 'None'];

/** Live mode: fields the server does not store yet, shown read-only. */
const READ_ONLY = new Set(api.limits?.profileReadOnly ?? []);
const NOT_SAVED_HINT = 'Not editable here yet: the server does not save this field.';
const BLOOD_DESIGNATIONS = ['None', 'Hospital blood bank', 'Blood bank centre'];

function Chips({ options, value, onChange, label }: { options: string[]; value: string[]; onChange: (v: string[]) => void; label: string }) {
  return (
    <div className="chip-group" role="group" aria-label={label}>
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            type="button"
            key={o}
            className={`chip${on ? ' active' : ''}`}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
          >
            {on && <Icon name="check" size={13} />} {o}
          </button>
        );
      })}
    </div>
  );
}

export function FacilityProfilePage() {
  const res = useResource(() => api.facility.get());
  const [form, setForm] = useState<FacilityProfile | null>(null);
  const [reserve, setReserve] = useState('');
  const action = useAction();
  const toast = useToast();

  useEffect(() => {
    if (res.data) {
      setForm(res.data);
      setReserve(res.data.profile.oxygen.reserveHrs?.toString() ?? '');
    }
  }, [res.data]);

  if (res.loading && !res.data) return <Loading />;
  if (res.error) return <Banner tone="danger" title="Could not load the profile.">{res.error}</Banner>;
  if (!form) return null;

  const p = form.profile;
  const setProfile = (patch: Partial<FacilityProfile['profile']>) => setForm({ ...form, profile: { ...p, ...patch } });
  const reserveNum = reserve.trim() === '' ? null : Number(reserve);
  const reserveError = reserveNum !== null && (!Number.isFinite(reserveNum) || reserveNum < 0) ? 'Enter hours as a number, 0 or more.' : null;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (reserveError || !form) return;
    const saved = await action.run(() =>
      api.facility.update({
        address: form.address,
        dutyPhone: form.dutyPhone?.trim() || null,
        location: form.location,
        profile: { ...form.profile, oxygen: { ...form.profile.oxygen, reserveHrs: reserveNum } },
      }),
    );
    if (saved) {
      res.setData(saved);
      toast('Profile saved');
    }
  }

  return (
    <>
      <Crumbs items={[{ label: 'Facility' }, { label: 'Facility Profile' }]} />
      <PageHead
        title="Facility Profile"
        sub="What your facility can do. Senders use this to decide where to refer. A capability you add shows as Declared until it is confirmed on site or by successful handovers."
      />

      <form onSubmit={save} noValidate>
        <div className="web-panel">
          <div className="web-panel__head">
            <div>
              <h2>{form.name}</h2>
              <div className="web-panel__sub" style={{ marginBottom: 0 }}>
                {FACILITY_TYPE_LABEL[form.type]} · {form.lga} LGA · last updated {fmtDateTime(form.updatedAt)}
              </div>
            </div>
            <span className="badge-code on-light">
              <Icon name="verified" size={13} /> {form.displayCode}
            </span>
          </div>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="pf-address">Address</label>
              <input
                id="pf-address"
                type="text"
                value={form.address}
                readOnly={READ_ONLY.has('address')}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
              {READ_ONLY.has('address') && <div className="hint">{NOT_SAVED_HINT}</div>}
            </div>
            <div className="field">
              <label htmlFor="pf-duty">Emergency duty phone</label>
              <input
                id="pf-duty"
                type="tel"
                value={form.dutyPhone ?? ''}
                onChange={(e) => setForm({ ...form, dutyPhone: e.target.value })}
              />
              <div className="hint">Senders tap to call this when a referral stalls. International format, e.g. +2348012345678.</div>
            </div>
          </div>
        </div>

        <div className="web-panel">
          <h2>Departments</h2>
          <div className="web-panel__sub">Departments that can receive an emergency patient.</div>
          <Chips label="Departments" options={DEPARTMENTS} value={p.departments} onChange={(departments) => setProfile({ departments })} />
        </div>

        <div className="web-panel">
          <h2>Oxygen</h2>
          <div className="web-panel__sub">The usual source and how long the reserve lasts if supply stops. Live oxygen status is set on the dashboard.</div>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="pf-o2">Source</label>
              <select
                id="pf-o2"
                value={p.oxygen.source ?? 'None'}
                onChange={(e) => setProfile({ oxygen: { ...p.oxygen, source: e.target.value === 'None' ? null : e.target.value } })}
              >
                {OXYGEN_SOURCES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="pf-reserve">Reserve (hours)</label>
              <input
                id="pf-reserve"
                type="number"
                min={0}
                inputMode="decimal"
                value={reserve}
                readOnly={READ_ONLY.has('oxygenReserve')}
                aria-invalid={!!reserveError}
                onChange={(e) => setReserve(e.target.value)}
              />
              {READ_ONLY.has('oxygenReserve') && <div className="hint">{NOT_SAVED_HINT}</div>}
              {reserveError && <div className="field-error">{reserveError}</div>}
            </div>
          </div>
        </div>

        <div className="web-panel">
          <h2>Specialists</h2>
          <div className="web-panel__sub">Specialties on your roster. Day-to-day availability (on site, on call) is set on the dashboard.</div>
          <Chips label="Specialists" options={SPECIALISTS} value={p.specialists} onChange={(specialists) => setProfile({ specialists })} />
        </div>

        {featureBlood && (
          <div className="web-panel">
            <h2>Blood bank</h2>
            <div className="field" style={{ maxWidth: 360 }}>
              <label htmlFor="pf-blood">Designation</label>
              <select
                id="pf-blood"
                value={p.bloodDesignation ?? 'None'}
                disabled={READ_ONLY.has('bloodDesignation')}
                onChange={(e) => setProfile({ bloodDesignation: e.target.value === 'None' ? null : e.target.value })}
              >
                {BLOOD_DESIGNATIONS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {action.error && <Banner tone="danger">{action.error}</Banner>}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary btn-sm" disabled={action.busy || !!reserveError}>
            <Icon name="check" size={14} /> {action.busy ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>
    </>
  );
}
