// Weekly duty roster (2-11). Gates actions only — sending and accepting referrals —
// never sign-in or viewing. Each "on" day becomes one entry per gated permission the
// person holds, 00:00 to 24:00 Lagos time (server DutyRoster.entries).

import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { ROLE_LABEL, type RosterEntry, type StaffMember } from '../api/types';
import { addDays, lagosDayLabel, lagosWeekStart, ROSTER_GATED } from '../domain';
import { Icon } from '../components/Icon';
import { Banner, Crumbs, Empty, Loading, PageHead, Pill, fmtDateTime, useToast } from '../components/ui';
import { useAction, useResource } from '../components/useResource';

const DAYS = 7;
/** Live mode: the server stores the current week only, so other weeks are not offered. */
const CURRENT_WEEK_ONLY = api.limits?.rosterCurrentWeekOnly ?? false;
type Grid = Record<string, boolean[]>; // userId -> on duty per day

function gridFromEntries(staff: StaffMember[], entries: RosterEntry[] | null, week: Date): Grid {
  const grid: Grid = {};
  for (const s of staff) {
    grid[s.id] = Array.from({ length: DAYS }, (_, i) => {
      // No roster for the week: everyone counts as on duty, so start from all on.
      if (!entries) return true;
      const t = addDays(week, i).getTime() + 60_000;
      return entries.some((e) => e.userId === s.id && new Date(e.onDutyFrom).getTime() <= t && t < new Date(e.onDutyTo).getTime());
    });
  }
  return grid;
}

function entriesFromGrid(staff: StaffMember[], grid: Grid, week: Date): RosterEntry[] {
  return staff.flatMap((s) =>
    (grid[s.id] ?? []).flatMap((on, i) =>
      on
        ? s.permissions
            .filter((p) => ROSTER_GATED.includes(p))
            .map((permission) => ({
              userId: s.id,
              permission,
              onDutyFrom: addDays(week, i).toISOString(),
              onDutyTo: addDays(week, i + 1).toISOString(),
            }))
        : [],
    ),
  );
}

export function DutyRosterPage() {
  const [week, setWeek] = useState(() => lagosWeekStart(new Date()));
  const weekIso = week.toISOString();
  const staff = useResource(() => api.roster.staff(), []);
  const roster = useResource(() => api.roster.get(weekIso), [weekIso]);
  const [grid, setGrid] = useState<Grid>({});
  const action = useAction();
  const toast = useToast();

  // Only people who hold an action the roster gates appear here.
  const rosterable = useMemo(
    () => (staff.data ?? []).filter((s) => s.status === 'active' && s.permissions.some((p) => ROSTER_GATED.includes(p))),
    [staff.data],
  );

  useEffect(() => {
    if (staff.data && !roster.loading) setGrid(gridFromEntries(rosterable, roster.data?.entries ?? null, week));
  }, [staff.data, roster.data, roster.loading, rosterable, week]);

  const days = Array.from({ length: DAYS }, (_, i) => addDays(week, i));
  const thisWeek = lagosWeekStart(new Date()).getTime() === week.getTime();
  const onToday = thisWeek ? rosterable.filter((s) => grid[s.id]?.[Math.floor((Date.now() - week.getTime()) / 86_400_000)]).length : null;

  const toggle = (id: string, day: number) =>
    setGrid((g) => ({ ...g, [id]: (g[id] ?? []).map((v, i) => (i === day ? !v : v)) }));
  const setDay = (day: number, on: boolean) =>
    setGrid((g) => Object.fromEntries(Object.entries(g).map(([id, row]) => [id, row.map((v, i) => (i === day ? on : v))])));

  async function save() {
    const res = await action.run(() => api.roster.save(weekIso, entriesFromGrid(rosterable, grid, week)));
    if (res) {
      roster.setData(res);
      toast('Duty roster saved');
    }
  }

  return (
    <>
      <Crumbs items={[{ label: 'Facility' }, { label: 'Duty Roster' }]} />
      <PageHead
        title="Duty Roster"
        sub={
          <>
            Who is on duty each day. The roster gates <strong>actions</strong> only: sending and accepting referrals.
            Being off duty never blocks signing in or viewing the dashboards.
          </>
        }
      />

      {!roster.loading && !roster.data && (
        <Banner tone="info" title="No roster set for this week.">
          Until one is saved, everyone is treated as on duty. Saving gates this week's actions to the people marked on.
        </Banner>
      )}

      <div className="web-panel">
        <div className="web-panel__head">
          <div>
            <div className="row">
              {!CURRENT_WEEK_ONLY && (
                <button className="btn btn-ghost btn-sm" aria-label="Previous week" onClick={() => setWeek(addDays(week, -7))}>
                  <Icon name="back" size={16} />
                </button>
              )}
              <h2 style={{ margin: 0 }}>Week of {lagosDayLabel(week)}</h2>
              {!CURRENT_WEEK_ONLY && (
                <button className="btn btn-ghost btn-sm" aria-label="Next week" onClick={() => setWeek(addDays(week, 7))}>
                  <Icon name="chevronRight" size={16} />
                </button>
              )}
              {!thisWeek && (
                <button className="btn btn-ghost btn-sm" onClick={() => setWeek(lagosWeekStart(new Date()))}>
                  This week
                </button>
              )}
            </div>
            <div className="web-panel__sub" style={{ marginBottom: 0 }}>
              {roster.data ? `Saved by ${roster.data.setBy ?? '—'} · ${fmtDateTime(roster.data.updatedAt)}` : 'Not saved yet'}
              {onToday !== null && (
                <>
                  {' · '}
                  <Pill tone="success" icon="users">
                    {onToday} on duty today
                  </Pill>
                </>
              )}
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => void save()} disabled={action.busy || !rosterable.length}>
            <Icon name="check" size={14} /> {action.busy ? 'Saving…' : 'Save roster'}
          </button>
        </div>

        {action.error && <Banner tone="danger">{action.error}</Banner>}

        {staff.loading || roster.loading ? (
          <Loading />
        ) : staff.error || roster.error ? (
          <Banner tone="danger" title="Could not load the roster.">
            {staff.error ?? roster.error}
          </Banner>
        ) : !rosterable.length ? (
          <Empty>No active staff can send or accept referrals yet. Grant those permissions on Staff &amp; Permissions first.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="web-table roster-grid">
              <thead>
                <tr>
                  <th>Staff</th>
                  {days.map((d, i) => (
                    <th key={i}>
                      <div>{lagosDayLabel(d)}</div>
                      <div className="row" style={{ justifyContent: 'center', gap: 2 }}>
                        <button className="btn btn-ghost btn-sm" style={{ minHeight: 0, padding: '2px 4px', fontSize: 11 }} onClick={() => setDay(i, true)}>
                          All
                        </button>
                        <button className="btn btn-ghost btn-sm" style={{ minHeight: 0, padding: '2px 4px', fontSize: 11 }} onClick={() => setDay(i, false)}>
                          None
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rosterable.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="bold">{s.name}</div>
                      <div className="tiny faint">
                        {ROLE_LABEL[s.role]} · {s.permissions.filter((p) => ROSTER_GATED.includes(p)).map((p) => (p === 'referral.send' ? 'sends' : 'accepts')).join(', ')}
                      </div>
                    </td>
                    {days.map((d, i) => {
                      const on = !!grid[s.id]?.[i];
                      return (
                        <td key={i}>
                          <button
                            type="button"
                            className="day-toggle"
                            aria-pressed={on}
                            aria-label={`${s.name}, ${lagosDayLabel(d)}: ${on ? 'on duty' : 'off duty'}`}
                            title={on ? 'On duty' : 'Off duty'}
                            onClick={() => toggle(s.id, i)}
                          >
                            <Icon name={on ? 'check' : 'x'} />
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint">Tick = on duty for that whole day (Lagos time). Shift times within a day come later.</p>
      </div>
    </>
  );
}
