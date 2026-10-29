// Blood inventory (10-3, 10-4). G2: built but switched off for v1. Only routed
// when VITE_FEATURE_BLOOD=true; the server answers 404 until FEATURE_BLOOD is on.
// No blood prices anywhere (ethics review open, G9).

import { useState } from 'react';
import { api } from '../api';
import { BLOOD_COMPONENT_LABEL, type BloodComponent, type BloodStock } from '../api/types';
import { Icon } from '../components/Icon';
import { Banner, Crumbs, Loading, PageHead, Pill, fmtDateTime, useToast } from '../components/ui';
import { useAction, useResource } from '../components/useResource';

const COMPONENTS: BloodComponent[] = ['whole', 'prbc', 'ffp', 'platelets'];

function StockCell({ row, onSave, busy }: { row: BloodStock; onSave: (units: number, min: number) => void; busy: boolean }) {
  const [units, setUnits] = useState(String(row.units));
  const [min, setMin] = useState(String(row.minTarget));
  const below = row.units < row.minTarget;
  const changed = units !== String(row.units) || min !== String(row.minTarget);
  const valid = /^\d+$/.test(units) && /^\d+$/.test(min);
  const label = `${row.group}${row.rh === 'pos' ? '+' : '−'} ${BLOOD_COMPONENT_LABEL[row.component]}`;

  return (
    <td>
      <div className="row" style={{ gap: 4 }}>
        <input
          className="bedcfg-input"
          style={{ width: 58 }}
          type="number"
          min={0}
          aria-label={`${label} units`}
          value={units}
          onChange={(e) => setUnits(e.target.value)}
        />
        <span className="tiny faint">/ min</span>
        <input
          className="bedcfg-input"
          style={{ width: 52 }}
          type="number"
          min={0}
          aria-label={`${label} minimum`}
          value={min}
          onChange={(e) => setMin(e.target.value)}
        />
      </div>
      <div className="row mt-4" style={{ gap: 4 }}>
        {below ? (
          <Pill tone="danger" icon="alert">Below minimum</Pill>
        ) : (
          <Pill tone="muted" icon="check">At or above</Pill>
        )}
        {changed && (
          <button className="btn btn-outline btn-sm" style={{ minHeight: 0, padding: '3px 8px' }} disabled={!valid || busy} onClick={() => onSave(Number(units), Number(min))}>
            Save
          </button>
        )}
      </div>
    </td>
  );
}

export function BloodInventoryPage() {
  const stock = useResource(() => api.blood.stock());
  const action = useAction();
  const toast = useToast();

  const groups = [...new Set((stock.data ?? []).map((s) => `${s.group}|${s.rh}`))];
  const find = (key: string, c: BloodComponent) => stock.data?.find((s) => `${s.group}|${s.rh}` === key && s.component === c);
  const lastUpdate = (stock.data ?? []).map((s) => s.updatedAt).sort().at(-1);

  async function save(row: BloodStock, units: number, minTarget: number) {
    const res = await action.run(() => api.blood.update(row.id, { units, minTarget }));
    if (res) {
      stock.setData((list) => (list ?? []).map((x) => (x.id === res.id ? res : x)));
      toast('Stock updated');
    }
  }

  return (
    <>
      <Crumbs items={[{ label: 'Facility' }, { label: 'Blood Inventory' }]} />
      <PageHead
        title="Blood Inventory"
        sub="Units in stock by group and component, against your minimum target. Groups below minimum show as Limited to senders."
      />
      <Banner tone="warning" title="Not live in v1.">
        Blood is switched off for the pilot. Nothing here is shown to senders until the feature is turned on.
      </Banner>
      {action.error && <Banner tone="danger">{action.error}</Banner>}
      <div className="web-panel">
        {stock.loading && !stock.data ? (
          <Loading />
        ) : stock.error ? (
          <Banner tone="danger">{stock.error}</Banner>
        ) : (
          <>
            <div className="web-panel__sub">
              <Icon name="clock" size={13} /> Last updated {fmtDateTime(lastUpdate)}
            </div>
            <div className="table-wrap">
              <table className="web-table">
                <thead>
                  <tr>
                    <th>Group</th>
                    {COMPONENTS.map((c) => (
                      <th key={c}>{BLOOD_COMPONENT_LABEL[c]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((key) => {
                    const [g, rh] = key.split('|');
                    return (
                      <tr key={key}>
                        <td className="bold">
                          {g}
                          {rh === 'pos' ? '+' : '−'}
                        </td>
                        {COMPONENTS.map((c) => {
                          const row = find(key, c);
                          return row ? (
                            <StockCell key={`${row.id}-${row.updatedAt}`} row={row} busy={action.busy} onSave={(u, m) => void save(row, u, m)} />
                          ) : (
                            <td key={c}>—</td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
