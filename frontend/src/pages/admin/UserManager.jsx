import { useState } from 'react';
import api, { errorMessage } from '../../utils/api';
import { useFetch } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { Alert, Spinner, PageHeader, Modal, Badge, EmptyState } from '../../components/Ui';

const EMPTY_FORM = { username: '', password: '', full_name: '', role: 'cashier', branch_id: '', is_active: 1 };

/** Add, edit, reassign and deactivate cashier accounts. */
export default function UserManager() {
  const { user: currentUser } = useAuth();
  const { data, loading, error, refetch } = useFetch('/users');
  const { data: branchData } = useFetch('/branches');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [feedback, setFeedback] = useState(null);
  const [saving, setSaving] = useState(false);

  const users = data?.users ?? [];
  const branches = branchData?.branches ?? [];

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setModal({ mode: 'create' });
  };

  const openEdit = (user) => {
    setForm({
      username: user.username,
      password: '', // blank means "leave the existing password alone"
      full_name: user.full_name,
      role: user.role,
      branch_id: user.branch_id ? String(user.branch_id) : '',
      is_active: user.is_active,
    });
    setModal({ mode: 'edit', user });
  };

  const save = async (e) => {
    e.preventDefault();
    if (form.role === 'cashier' && !form.branch_id) {
      setFeedback({ type: 'error', text: 'Cashiers must be assigned to a branch.' });
      return;
    }
    setSaving(true);
    try {
      if (modal.mode === 'create') {
        await api.post('/users', {
          username: form.username.trim(),
          password: form.password,
          full_name: form.full_name.trim(),
          role: form.role,
          branch_id: form.role === 'cashier' ? Number(form.branch_id) : null,
        });
        setFeedback({ type: 'success', text: `Created "${form.username}".` });
      } else {
        const payload = {
          full_name: form.full_name.trim(),
          role: form.role,
          branch_id: form.role === 'cashier' ? Number(form.branch_id) : null,
          is_active: Number(form.is_active),
        };
        if (form.password) payload.password = form.password;
        await api.put(`/users/${modal.user.id}`, payload);
        setFeedback({ type: 'success', text: `Updated "${modal.user.username}".` });
      }
      setModal(null);
      refetch();
    } catch (err) {
      setFeedback({ type: 'error', text: errorMessage(err, 'Could not save the user.') });
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (user) => {
    if (!window.confirm(`Deactivate "${user.username}"? They will no longer be able to log in.`)) return;
    try {
      await api.delete(`/users/${user.id}`);
      setFeedback({ type: 'success', text: `Deactivated "${user.username}".` });
      refetch();
    } catch (err) {
      setFeedback({ type: 'error', text: errorMessage(err, 'Could not deactivate the user.') });
    }
  };

  const reactivate = async (user) => {
    try {
      await api.put(`/users/${user.id}`, { is_active: 1 });
      setFeedback({ type: 'success', text: `Reactivated "${user.username}".` });
      refetch();
    } catch (err) {
      setFeedback({ type: 'error', text: errorMessage(err, 'Could not reactivate the user.') });
    }
  };

  if (loading) return <Spinner label="Loading users…" />;

  return (
    <div>
      <PageHeader title="Users" subtitle="Manage cashier accounts and branch assignments.">
        <button type="button" onClick={openCreate} className="btn-primary">+ New user</button>
      </PageHeader>

      {error && <Alert>{error}</Alert>}
      {feedback && <Alert type={feedback.type} onDismiss={() => setFeedback(null)}>{feedback.text}</Alert>}

      <div className="card overflow-x-auto">
        {users.length === 0 ? (
          <EmptyState>No users yet.</EmptyState>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Username</th>
                <th>Full name</th>
                <th>Role</th>
                <th>Branch</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="font-medium">
                    {user.username}
                    {user.id === currentUser.id && <span className="ml-2 text-xs text-ink-500">(you)</span>}
                  </td>
                  <td>{user.full_name}</td>
                  <td>
                    <Badge tone={user.role === 'admin' ? 'blue' : 'neutral'}>{user.role}</Badge>
                  </td>
                  <td className="text-ink-600">{user.branch_name || '— all branches —'}</td>
                  <td>{user.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Inactive</Badge>}</td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => openEdit(user)} className="btn-secondary px-3 py-1">Edit</button>
                      {user.id !== currentUser.id && (
                        user.is_active ? (
                          <button type="button" onClick={() => deactivate(user)} className="btn-danger px-3 py-1">Deactivate</button>
                        ) : (
                          <button type="button" onClick={() => reactivate(user)} className="btn-secondary px-3 py-1">Reactivate</button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <Modal
          title={modal.mode === 'create' ? 'New user' : `Edit ${modal.user.username}`}
          onClose={() => setModal(null)}
          footer={
            <>
              <button type="button" onClick={() => setModal(null)} className="btn-secondary">Cancel</button>
              <button type="submit" form="user-form" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <form id="user-form" onSubmit={save} className="space-y-4">
            <div>
              <label className="label" htmlFor="u-username">Username</label>
              <input id="u-username" className="input" value={form.username} disabled={modal.mode === 'edit'}
                minLength={3} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
              {modal.mode === 'edit' && (
                <p className="mt-1 text-xs text-ink-500">Usernames cannot be changed after creation.</p>
              )}
            </div>
            <div>
              <label className="label" htmlFor="u-fullname">Full name</label>
              <input id="u-fullname" className="input" value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
            </div>
            <div>
              <label className="label" htmlFor="u-password">
                {modal.mode === 'create' ? 'Password' : 'New password'}
              </label>
              <input id="u-password" type="password" className="input" value={form.password} minLength={6}
                autoComplete="new-password"
                required={modal.mode === 'create'}
                onChange={(e) => setForm({ ...form, password: e.target.value })} />
              {modal.mode === 'edit' && (
                <p className="mt-1 text-xs text-ink-500">Leave blank to keep the current password.</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="u-role">Role</label>
                <select id="u-role" className="input" value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="cashier">Cashier</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="u-branch">Branch</label>
                <select id="u-branch" className="input" value={form.branch_id} disabled={form.role === 'admin'}
                  onChange={(e) => setForm({ ...form, branch_id: e.target.value })}>
                  <option value="">{form.role === 'admin' ? 'All branches' : 'Select a branch…'}</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
            {modal.mode === 'edit' && (
              <div>
                <label className="label" htmlFor="u-status">Status</label>
                <select id="u-status" className="input" value={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: Number(e.target.value) })}>
                  <option value={1}>Active</option>
                  <option value={0}>Inactive</option>
                </select>
              </div>
            )}
          </form>
        </Modal>
      )}
    </div>
  );
}
