// Care packages (Epic 6). Drafted by anyone with pricing.manage; approved by an
// account with facility.manage. Pricing is live in v1: senders and relatives see the
// approved package before a referral is sent, and the price locks at accept (6-5).
// An approved package is never edited in place — it is revised as a new version.

import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { hasPermission, type CarePackage, type PackageInput } from '../api/types';
import { useSession } from '../components/auth';
import { Icon } from '../components/Icon';
import { Banner, Crumbs, Empty, Loading, Modal, PageHead, Pill, fmtDate, fmtNaira, useToast } from '../components/ui';
import { useAction, useResource } from '../components/useResource';

export function CarePackagesPage() {
  const session = useSession();
  const canApprove = hasPermission(session, 'facility.manage');
  const list = useResource(() => api.pricing.list());
  const [editing, setEditing] = useState<CarePackage | 'new' | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const action = useAction();
  const toast = useToast();

  const all = list.data ?? [];
  const approved = all.filter((p) => p.status === 'approved');
  const drafts = all.filter((p) => p.status === 'draft');
  const archived = all.filter((p) => p.status === 'archived');
  const byId = (id: string | null) => all.find((p) => p.id === id);

  async function act(fn: () => Promise<unknown>, message: string) {
    const ok = await action.run(fn);
    if (ok !== undefined) {
      toast(message);
      await list.reload();
    }
  }

  const card = (p: CarePackage) => {
    const replaces = byId(p.revisionOf);
    return (
      <div className="pkg-card" key={p.id}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="bold">{p.name}</div>
            <div className="tiny faint">
              Version {p.version}
              {p.status === 'approved' && p.approvedAt && ` · approved ${fmtDate(p.approvedAt)} by ${p.approvedBy}`}
              {p.status !== 'approved' && ` · updated ${fmtDate(p.updatedAt)}`}
            </div>
          </div>
          {p.status === 'approved' ? (
            <Pill tone="success" icon="checkCircle">Live</Pill>
          ) : p.status === 'draft' ? (
            <Pill tone="warning" icon="edit">Draft</Pill>
          ) : (
            <Pill tone="muted" icon="file">Archived</Pill>
          )}
        </div>
        <div className="pkg-card__price">{fmtNaira(p.price)}</div>
        {replaces && p.status === 'draft' && (
          <div className="tiny">
            Replaces version {replaces.version} at {fmtNaira(replaces.price)} once approved.
          </div>
        )}
        <div>
          <div className="tiny bold">Included</div>
          <div className="pkg-card__inc">{p.inclusions}</div>
        </div>
        {p.exclusions && (
          <div>
            <div className="tiny bold">Not included</div>
            <div className="pkg-card__inc">{p.exclusions}</div>
          </div>
        )}
        <div className="row mt-4" style={{ flexWrap: 'wrap' }}>
          {p.status === 'draft' && (
            <>
              <button className="btn btn-outline btn-sm" onClick={() => setEditing(p)} disabled={action.busy}>
                <Icon name="edit" size={14} /> Edit
              </button>
              {canApprove && (
                <button
                  className="btn btn-success btn-sm"
                  disabled={action.busy}
                  onClick={() => void act(() => api.pricing.approve(p.id), `${p.name} approved and live`)}
                >
                  <Icon name="check" size={14} /> Approve
                </button>
              )}
              <button
                className="btn btn-ghost btn-sm"
                disabled={action.busy}
                onClick={() => void act(() => api.pricing.removeDraft(p.id).then(() => true), 'Draft deleted')}
              >
                <Icon name="trash" size={14} /> Delete
              </button>
            </>
          )}
          {p.status === 'approved' && (
            <>
              <button
                className="btn btn-outline btn-sm"
                disabled={action.busy || all.some((x) => x.revisionOf === p.id && x.status === 'draft')}
                title={all.some((x) => x.revisionOf === p.id && x.status === 'draft') ? 'A revision is already in draft' : undefined}
                onClick={() => void act(() => api.pricing.revise(p.id), 'Revision drafted. Edit it, then approve.')}
              >
                <Icon name="edit" size={14} /> Revise
              </button>
              {canApprove && (
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={action.busy}
                  onClick={() => void act(() => api.pricing.archive(p.id), `${p.name} withdrawn`)}
                >
                  Withdraw
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <Crumbs items={[{ label: 'Facility' }, { label: 'Care Packages' }]} />
      <PageHead
        title="Care Packages"
        sub="Named emergency care packages and their prices, in plain words. Senders and the patient's family see the live package before a referral is sent; the price locks when you accept."
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>
            <Icon name="plus" size={14} /> New package
          </button>
        }
      />

      <Banner tone="info" title="Prices are live in v1.">
        A draft is not shown to anyone until {canApprove ? 'you approve it' : 'a facility administrator approves it'}.
        Emergency Tracka reviews prices for anomalies (more than twice the median of similar facilities). Stabilisation
        is never held back for payment.
      </Banner>

      {action.error && <Banner tone="danger">{action.error}</Banner>}

      {list.loading && !list.data ? (
        <Loading />
      ) : list.error ? (
        <Banner tone="danger" title="Could not load packages.">
          {list.error}
        </Banner>
      ) : (
        <>
          <section className="web-panel">
            <h2>Drafts</h2>
            <div className="web-panel__sub">
              {canApprove ? 'Check each draft and approve it to make it live.' : 'Waiting for a facility administrator to approve.'}
            </div>
            {drafts.length ? <div className="pkg-grid">{drafts.map(card)}</div> : <Empty>No drafts.</Empty>}
          </section>

          <section className="web-panel">
            <h2>Live packages</h2>
            <div className="web-panel__sub">What senders and families see now.</div>
            {approved.length ? (
              <div className="pkg-grid">{approved.map(card)}</div>
            ) : (
              <Empty>No live packages yet. Senders will see “No package listed” for this facility.</Empty>
            )}
          </section>

          {archived.length > 0 && (
            <section className="web-panel">
              <div className="web-panel__head">
                <h2>Archived ({archived.length})</h2>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived}>
                  {showArchived ? 'Hide' : 'Show'}
                </button>
              </div>
              {showArchived && <div className="pkg-grid">{archived.map(card)}</div>}
            </section>
          )}
        </>
      )}

      {editing && (
        <PackageForm
          pkg={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(p, created) => {
            setEditing(null);
            toast(created ? `${p.name} saved as a draft` : 'Draft updated');
            void list.reload();
          }}
        />
      )}
    </>
  );
}

function PackageForm({
  pkg,
  onClose,
  onSaved,
}: {
  pkg: CarePackage | null;
  onClose: () => void;
  onSaved: (p: CarePackage, created: boolean) => void;
}) {
  const [form, setForm] = useState({
    name: pkg?.name ?? '',
    inclusions: pkg?.inclusions ?? '',
    exclusions: pkg?.exclusions ?? '',
    naira: pkg ? String(pkg.price / 100) : '',
  });
  const [touched, setTouched] = useState(false);
  const action = useAction();

  const naira = Number(form.naira.replace(/,/g, ''));
  const errors = {
    name: form.name.trim().length >= 3 ? null : 'Give the package a name.',
    inclusions: form.inclusions.trim() ? null : "Say what's included.",
    price: Number.isFinite(naira) && naira > 0 && Math.round(naira * 100) === naira * 100 ? null : 'Enter a price in naira, above 0.',
  };
  const valid = !errors.name && !errors.inclusions && !errors.price;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    const input: PackageInput = {
      name: form.name.trim(),
      inclusions: form.inclusions.trim(),
      exclusions: form.exclusions.trim(),
      price: Math.round(naira * 100),
    };
    const res = await action.run(() => (pkg ? api.pricing.update(pkg.id, input) : api.pricing.create(input)));
    if (res) onSaved(res, !pkg);
  }

  return (
    <Modal
      title={pkg ? `Edit draft: ${pkg.name}` : 'New care package'}
      sub="Saved as a draft. Nobody outside your facility sees it until it is approved."
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" type="submit" form="pkg-form" disabled={action.busy}>
            {action.busy ? 'Saving…' : 'Save draft'}
          </button>
        </>
      }
    >
      <form id="pkg-form" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="pk-name">Package name</label>
          <input
            id="pk-name"
            type="text"
            placeholder="e.g. Emergency stabilisation (first 24 hours)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            autoFocus
          />
          {touched && errors.name && <div className="field-error">{errors.name}</div>}
        </div>
        <div className="field">
          <label htmlFor="pk-price">Price (₦)</label>
          <input
            id="pk-price"
            type="text"
            inputMode="decimal"
            placeholder="150000"
            value={form.naira}
            onChange={(e) => setForm({ ...form, naira: e.target.value })}
          />
          {touched && errors.price ? (
            <div className="field-error">{errors.price}</div>
          ) : (
            Number.isFinite(naira) && naira > 0 && <div className="hint">Shown as {fmtNaira(Math.round(naira * 100))}</div>
          )}
        </div>
        <div className="field">
          <label htmlFor="pk-inc">What's included</label>
          <textarea
            id="pk-inc"
            rows={4}
            placeholder={'One item per line, in plain words.\ne.g. Oxygen and IV fluids'}
            value={form.inclusions}
            onChange={(e) => setForm({ ...form, inclusions: e.target.value })}
          />
          {touched && errors.inclusions && <div className="field-error">{errors.inclusions}</div>}
        </div>
        <div className="field">
          <label htmlFor="pk-exc">
            What's not included <span className="faint">(recommended)</span>
          </label>
          <textarea
            id="pk-exc"
            rows={3}
            placeholder="e.g. Blood products, surgery"
            value={form.exclusions}
            onChange={(e) => setForm({ ...form, exclusions: e.target.value })}
          />
          <div className="hint">Families approve any extras separately, item by item.</div>
        </div>
        {action.error && <Banner tone="danger">{action.error}</Banner>}
      </form>
    </Modal>
  );
}
