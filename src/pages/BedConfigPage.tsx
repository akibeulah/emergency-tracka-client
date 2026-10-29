// Bed configuration (3-2): per-category max spaces and the "Limited" threshold,
// validated 0 <= threshold < max. Day-to-day free counts are set from the bedspace
// dashboard in the mobile app; this page sets what those counts are measured against.

import { useEffect, useState } from 'react';
import { api } from '../api';
import { BED_CATEGORY_LABEL, type BedConfig, type BedConfigInput } from '../api/types';
import { bedRowError } from '../domain';
import { Icon } from '../components/Icon';
import { Banner, Crumbs, Loading, PageHead, Pill, fmtDateTime, useToast } from '../components/ui';
import { useAction, useResource } from '../components/useResource';

/** Inputs hold text so a half-typed number is not coerced to 0. */
type Draft = Record<string, { max: string; thr: string }>;

const toInt = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : NaN);

function Preview({ max, thr }: { max: number; thr: number }) {
  if (!Number.isFinite(max) || !Number.isFinite(thr)) return <span className="faint small">—</span>;
  if (max === 0) return <span className="faint small">Not offered</span>;
  return (
    <span className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
      <Pill tone="danger" icon="xCircle">0 free: Full</Pill>
      {thr > 0 && <Pill tone="warning" icon="alert">{thr === 1 ? '1' : `1–${thr}`} free: Limited</Pill>}
      <Pill tone="success" icon="checkCircle">
        {thr + 1 === max ? max : `${thr + 1}–${max}`} free: Available
      </Pill>
    </span>
  );
}

export function BedConfigPage() {
  const beds = useResource(() => api.beds.config());
  const [draft, setDraft] = useState<Draft>({});
  const action = useAction();
  const toast = useToast();

  useEffect(() => {
    if (beds.data) setDraft(Object.fromEntries(beds.data.map((b) => [b.category, { max: String(b.maxSpaces), thr: String(b.limitedThreshold) }])));
  }, [beds.data]);

  const rows = beds.data ?? [];
  const inputs: (BedConfigInput & { occupied: number; error: string | null; saved: BedConfig })[] = rows.map((b) => {
    const d = draft[b.category] ?? { max: String(b.maxSpaces), thr: String(b.limitedThreshold) };
    const input = { category: b.category, maxSpaces: toInt(d.max), limitedThreshold: toInt(d.thr) };
    return { ...input, occupied: b.occupied, error: bedRowError(input, b.occupied), saved: b };
  });
  const dirty = inputs.some((r) => r.maxSpaces !== r.saved.maxSpaces || r.limitedThreshold !== r.saved.limitedThreshold);
  const valid = inputs.every((r) => !r.error);

  async function save() {
    const res = await action.run(() =>
      api.beds.saveConfig(inputs.map(({ category, maxSpaces, limitedThreshold }) => ({ category, maxSpaces, limitedThreshold }))),
    );
    if (res) {
      beds.setData(res);
      toast('Bed configuration saved');
    }
  }

  const edit = (cat: string, field: 'max' | 'thr', value: string) =>
    setDraft((d) => ({ ...d, [cat]: { ...d[cat], [field]: value } }));

  return (
    <>
      <Crumbs items={[{ label: 'Facility' }, { label: 'Bed Configuration' }]} />
      <PageHead
        title="Bed Configuration"
        sub={
          <>
            Set the maximum spaces and the <strong>Limited</strong> threshold for each bed category. Senders see a
            category as <strong>Full</strong> with no beds free, <strong>Limited</strong> with 1 up to the threshold free,
            and <strong>Available</strong> above it.
          </>
        }
      />

      <div className="web-panel">
        <div className="web-panel__head">
          <div>
            <h2>Bed categories</h2>
            <div className="web-panel__sub" style={{ marginBottom: 0 }}>
              Free counts change day to day on the bedspace dashboard. The threshold is a whole number from 0 up to one
              less than the maximum. Set max spaces to 0 for a category you do not offer.
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => void save()} disabled={!dirty || !valid || action.busy}>
            <Icon name="check" size={14} /> {action.busy ? 'Saving…' : 'Save configuration'}
          </button>
        </div>

        {action.error && <Banner tone="danger">{action.error}</Banner>}

        {beds.loading && !beds.data ? (
          <Loading />
        ) : beds.error ? (
          <Banner tone="danger" title="Could not load bed categories.">
            {beds.error}
          </Banner>
        ) : (
          <div className="table-wrap">
            <table className="web-table bedcfg-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Max spaces</th>
                  <th>“Limited” threshold</th>
                  <th>Occupied now</th>
                  <th>How senders will see it</th>
                </tr>
              </thead>
              <tbody>
                {inputs.map((r) => {
                  const d = draft[r.category] ?? { max: '', thr: '' };
                  const errId = `err-${r.category}`;
                  return (
                    <tr key={r.category}>
                      <td className="bold">{BED_CATEGORY_LABEL[r.category]}</td>
                      <td>
                        <input
                          className={`bedcfg-input${r.error && (Number.isNaN(r.maxSpaces) || r.maxSpaces < r.occupied) ? ' invalid' : ''}`}
                          type="number"
                          min={0}
                          step={1}
                          inputMode="numeric"
                          aria-label={`${BED_CATEGORY_LABEL[r.category]} max spaces`}
                          aria-describedby={r.error ? errId : undefined}
                          value={d.max}
                          onChange={(e) => edit(r.category, 'max', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className={`bedcfg-input${r.error ? ' invalid' : ''}`}
                          type="number"
                          min={0}
                          step={1}
                          inputMode="numeric"
                          aria-label={`${BED_CATEGORY_LABEL[r.category]} limited threshold`}
                          aria-invalid={!!r.error}
                          aria-describedby={r.error ? errId : undefined}
                          value={d.thr}
                          onChange={(e) => edit(r.category, 'thr', e.target.value)}
                        />
                        <div className="bedcfg-err" id={errId} role={r.error ? 'alert' : undefined}>
                          {r.error ?? ''}
                        </div>
                      </td>
                      <td>
                        {r.occupied}
                        <div className="tiny faint">as of {fmtDateTime(r.saved.updatedAt)}</div>
                      </td>
                      <td>
                        <Preview max={r.maxSpaces} thr={r.limitedThreshold} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
