// Staff & permissions (1-9, 2-4, 2-5, 2-12): invite staff by role, then toggle
// each person's permissions. Each permission unlocks a page or action, and the
// server enforces it. Deactivating signs the person out of this facility.

import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { ROLE_LABEL, type Permission, type Role, type StaffMember } from '../api/types';
import { featureBlood } from '../config';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_CATALOG, STAFF_ROLES, toE164 } from '../domain';
import { useSession } from '../components/auth';
import { Icon } from '../components/Icon';
import { Banner, Crumbs, Empty, Loading, Modal, PageHead, Pill, Switch, fmtDate, useToast } from '../components/ui';
import { useAction, useResource } from '../components/useResource';

function PermissionToggles({
  value,
  onChange,
  lockSelfManage,
}: {
  value: Permission[];
  onChange: (v: Permission[]) => void;
  lockSelfManage?: boolean;
}) {
  const groups = [...new Set(PERMISSION_CATALOG.map((p) => p.group))];
  return (
    <>
      {groups.map((g) => (
        <div key={g}>
          <div className="modal__section-title">{g}</div>
          <div className="perm-list">
            {PERMISSION_CATALOG.filter((p) => p.group === g).map((p) => {
              const on = value.includes(p.key);
              const locked = lockSelfManage && p.key === 'staff.manage';
              return (
                <div className={`perm-item${on ? '' : ' off'}`} key={p.key}>
                  <div className="perm-item__text">
                    <span className="perm-item__label">
                      {p.label}
                      {p.key === 'blood.manage' && !featureBlood && (
                        <span className="pill pill-muted" style={{ marginLeft: 6 }}>
                          Not live yet
                        </span>
                      )}
                    </span>
                    <span className="perm-item__desc">{locked ? 'You cannot remove this from your own account.' : p.desc}</span>
                  </div>
                  <Switch
                    label={p.label}
                    checked={on}
                    disabled={locked}
                    onChange={(v) => onChange(v ? [...value, p.key] : value.filter((x) => x !== p.key))}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

function StatusPill({ status }: { status: StaffMember['status'] }) {
  if (status === 'active') return <Pill tone="success">Active</Pill>;
  if (status === 'suspended') return <Pill tone="warning">Suspended</Pill>;
  return <Pill tone="muted" icon="xCircle">Deactivated</Pill>;
}

export function StaffPage() {
  const session = useSession();
  const staff = useResource(() => api.staff.list());
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [inviting, setInviting] = useState(false);
  const action = useAction();
  const toast = useToast();

  const replace = (s: StaffMember) => staff.setData((list) => (list ?? []).map((x) => (x.id === s.id ? s : x)));

  async function setStatus(s: StaffMember, status: StaffMember['status']) {
    const res = await action.run(() => api.staff.setStatus(s.id, status));
    if (res) {
      replace(res);
      toast(status === 'active' ? `${s.name} reactivated` : `${s.name} deactivated and signed out`);
    }
  }

  return (
    <>
      <Crumbs items={[{ label: 'Facility' }, { label: 'Staff & Permissions' }]} />
      <PageHead
        title="Staff & Permissions"
        sub="Everyone who signs in to this facility. Each person has their own login, and their permissions decide which pages and actions they can use."
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setInviting(true)}>
            <Icon name="plus" size={14} /> Invite staff
          </button>
        }
      />
      {action.error && <Banner tone="danger">{action.error}</Banner>}
      <div className="web-panel">
        {staff.loading && !staff.data ? (
          <Loading />
        ) : staff.error ? (
          <Banner tone="danger" title="Could not load staff.">
            {staff.error}
          </Banner>
        ) : !staff.data?.length ? (
          <Empty>No staff yet. Invite your first colleague.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="web-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Permissions</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {staff.data.map((s) => {
                  const me = s.id === session.user.id;
                  return (
                    <tr key={s.id}>
                      <td>
                        <div className="bold">
                          {s.name}
                          {me && <span className="faint small"> (you)</span>}
                        </div>
                        <div className="tiny faint">
                          {s.email} · since {fmtDate(s.createdAt)}
                        </div>
                      </td>
                      <td>{ROLE_LABEL[s.role]}</td>
                      <td>
                        <span className="small">
                          {s.permissions.length} of {PERMISSION_CATALOG.length}
                        </span>
                      </td>
                      <td>
                        <StatusPill status={s.status} />
                      </td>
                      <td>
                        <div className="row">
                          <button className="btn btn-outline btn-sm" onClick={() => setEditing(s)} disabled={s.status !== 'active'}>
                            <Icon name="key" size={14} /> Permissions
                          </button>
                          {!me &&
                            (s.status === 'active' ? (
                              <button className="btn btn-ghost btn-sm" disabled={action.busy} onClick={() => void setStatus(s, 'deactivated')}>
                                Deactivate
                              </button>
                            ) : (
                              <button className="btn btn-ghost btn-sm" disabled={action.busy} onClick={() => void setStatus(s, 'active')}>
                                Reactivate
                              </button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <EditPermissions
          member={editing}
          isSelf={editing.id === session.user.id}
          onClose={() => setEditing(null)}
          onSaved={(s) => {
            replace(s);
            toast(`Permissions saved for ${s.name}`);
            setEditing(null);
          }}
        />
      )}
      {inviting && (
        <InviteStaff
          onClose={() => setInviting(false)}
          onInvited={(s) => {
            staff.setData((list) => [...(list ?? []), s]);
            toast(`Invitation sent to ${s.email}`, 'mail');
            setInviting(false);
          }}
        />
      )}
    </>
  );
}

function EditPermissions({
  member,
  isSelf,
  onClose,
  onSaved,
}: {
  member: StaffMember;
  isSelf: boolean;
  onClose: () => void;
  onSaved: (s: StaffMember) => void;
}) {
  const [perms, setPerms] = useState<Permission[]>(member.permissions);
  const action = useAction();
  const defaults = DEFAULT_ROLE_PERMISSIONS[member.role] ?? [];

  async function save() {
    const res = await action.run(() => api.staff.setPermissions(member.id, perms));
    if (res) onSaved(res);
  }

  return (
    <Modal
      large
      title={`Permissions: ${member.name}`}
      sub={`${ROLE_LABEL[member.role]} · ${member.email}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost btn-sm" onClick={() => setPerms(isSelf ? [...new Set([...defaults, 'staff.manage' as Permission])] : defaults)}>
            Reset to {ROLE_LABEL[member.role]} defaults
          </button>
          <button className="btn btn-outline btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => void save()} disabled={action.busy}>
            {action.busy ? 'Saving…' : 'Save permissions'}
          </button>
        </>
      }
    >
      <p className="small faint">Changes apply the next time they sign in or their session refreshes (within 15 minutes).</p>
      <PermissionToggles value={perms} onChange={setPerms} lockSelfManage={isSelf} />
      {action.error && <div className="mt-12"><Banner tone="danger">{action.error}</Banner></div>}
    </Modal>
  );
}

function InviteStaff({ onClose, onInvited }: { onClose: () => void; onInvited: (s: StaffMember) => void }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'nurse' as Role });
  const [perms, setPerms] = useState<Permission[]>(DEFAULT_ROLE_PERMISSIONS.nurse ?? []);
  const [touched, setTouched] = useState(false);
  const action = useAction();

  const errors = {
    name: form.name.trim() ? null : 'Enter their name.',
    email: /^\S+@\S+\.\S+$/.test(form.email.trim()) ? null : 'Enter a valid email address.',
    phone: toE164(form.phone) ? null : 'Enter a mobile number, e.g. 08012345678 or +2348012345678. Sign-in codes go to it.',
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (errors.name || errors.email || errors.phone) return;
    const res = await action.run(() => api.staff.invite({ ...form, permissions: perms }));
    if (res) onInvited(res);
  }

  return (
    <Modal
      large
      title="Invite staff"
      sub="They sign in with this email and a one-time code. Each login belongs to one person."
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" type="submit" form="invite-form" disabled={action.busy}>
            <Icon name="mail" size={14} /> {action.busy ? 'Sending…' : 'Send invitation'}
          </button>
        </>
      }
    >
      <form id="invite-form" onSubmit={submit} noValidate>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="inv-name">Name</label>
            <input id="inv-name" type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            {touched && errors.name && <div className="field-error">{errors.name}</div>}
          </div>
          <div className="field">
            <label htmlFor="inv-email">Email</label>
            <input id="inv-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            {touched && errors.email && <div className="field-error">{errors.email}</div>}
          </div>
          <div className="field">
            <label htmlFor="inv-phone">Mobile number</label>
            <input id="inv-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            {touched && errors.phone && <div className="field-error">{errors.phone}</div>}
          </div>
          <div className="field">
            <label htmlFor="inv-role">Role</label>
            <select
              id="inv-role"
              value={form.role}
              onChange={(e) => {
                const role = e.target.value as Role;
                setForm({ ...form, role });
                setPerms(DEFAULT_ROLE_PERMISSIONS[role] ?? []);
              }}
            >
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            <div className="hint">Sets the starting permissions below. You can change them now or later.</div>
          </div>
        </div>
        <PermissionToggles value={perms} onChange={setPerms} />
        {action.error && <div className="mt-12"><Banner tone="danger">{action.error}</Banner></div>}
      </form>
    </Modal>
  );
}
