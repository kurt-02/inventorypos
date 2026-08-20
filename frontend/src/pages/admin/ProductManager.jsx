import { useState } from 'react';
import api, { errorMessage } from '../../utils/api';
import { useFetch } from '../../hooks/useApi';
import { formatCurrency } from '../../utils/format';
import { Alert, Spinner, PageHeader, Modal, Badge, EmptyState } from '../../components/Ui';

const EMPTY_FORM = { name: '', price: '', category: '', is_active: 1 };

/** CRUD for the product catalog. Deleting deactivates (soft delete) so past
 * sales keep their product reference. */
export default function ProductManager() {
  // include_inactive so admins can see and re-activate deactivated products.
  const { data, loading, error, refetch } = useFetch('/products', {
    params: { include_inactive: 'true' },
  });
  const [modal, setModal] = useState(null); // null | { mode: 'create'|'edit', product }
  const [form, setForm] = useState(EMPTY_FORM);
  const [feedback, setFeedback] = useState(null);
  const [saving, setSaving] = useState(false);

  const products = data?.products ?? [];

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setModal({ mode: 'create' });
  };

  const openEdit = (product) => {
    setForm({
      name: product.name,
      price: String(product.price),
      category: product.category,
      is_active: product.is_active,
    });
    setModal({ mode: 'edit', product });
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || form.price === '' || Number(form.price) < 0) {
      setFeedback({ type: 'error', text: 'Name and a non-negative price are required.' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        price: Number(form.price),
        category: form.category.trim() || 'General',
        is_active: Number(form.is_active),
      };
      if (modal.mode === 'create') {
        await api.post('/products', payload);
        setFeedback({ type: 'success', text: `Created "${payload.name}".` });
      } else {
        await api.put(`/products/${modal.product.id}`, payload);
        setFeedback({ type: 'success', text: `Updated "${payload.name}".` });
      }
      setModal(null);
      refetch();
    } catch (err) {
      setFeedback({ type: 'error', text: errorMessage(err, 'Could not save the product.') });
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (product) => {
    if (!window.confirm(`Deactivate "${product.name}"? It will no longer appear on the POS.`)) return;
    try {
      await api.delete(`/products/${product.id}`);
      setFeedback({ type: 'success', text: `Deactivated "${product.name}".` });
      refetch();
    } catch (err) {
      setFeedback({ type: 'error', text: errorMessage(err, 'Could not deactivate the product.') });
    }
  };

  const reactivate = async (product) => {
    try {
      await api.put(`/products/${product.id}`, { is_active: 1 });
      setFeedback({ type: 'success', text: `Reactivated "${product.name}".` });
      refetch();
    } catch (err) {
      setFeedback({ type: 'error', text: errorMessage(err, 'Could not reactivate the product.') });
    }
  };

  if (loading) return <Spinner label="Loading products…" />;

  return (
    <div>
      <PageHeader title="Products" subtitle="Manage the menu shown on the POS.">
        <button type="button" onClick={openCreate} className="btn-primary">+ New product</button>
      </PageHeader>

      {error && <Alert>{error}</Alert>}
      {feedback && <Alert type={feedback.type} onDismiss={() => setFeedback(null)}>{feedback.text}</Alert>}

      <div className="card overflow-x-auto">
        {products.length === 0 ? (
          <EmptyState>No products yet.</EmptyState>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th className="text-right">Price</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td className="font-medium">{product.name}</td>
                  <td className="text-ink-600">{product.category}</td>
                  <td className="text-right font-mono tabular-nums">{formatCurrency(product.price)}</td>
                  <td>
                    {product.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Inactive</Badge>}
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => openEdit(product)} className="btn-secondary px-3 py-1">Edit</button>
                      {product.is_active ? (
                        <button type="button" onClick={() => deactivate(product)} className="btn-danger px-3 py-1">Deactivate</button>
                      ) : (
                        <button type="button" onClick={() => reactivate(product)} className="btn-secondary px-3 py-1">Reactivate</button>
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
          title={modal.mode === 'create' ? 'New product' : `Edit ${modal.product.name}`}
          onClose={() => setModal(null)}
          footer={
            <>
              <button type="button" onClick={() => setModal(null)} className="btn-secondary">Cancel</button>
              <button type="submit" form="product-form" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <form id="product-form" onSubmit={save} className="space-y-4">
            <div>
              <label className="label" htmlFor="p-name">Name</label>
              <input id="p-name" className="input" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="label" htmlFor="p-price">Price</label>
              <input id="p-price" type="number" step="0.01" min="0" className="input" value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })} required />
            </div>
            <div>
              <label className="label" htmlFor="p-category">Category</label>
              <input id="p-category" className="input" value={form.category} placeholder="e.g. Coffee"
                onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="p-active">Status</label>
              <select id="p-active" className="input" value={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: Number(e.target.value) })}>
                <option value={1}>Active</option>
                <option value={0}>Inactive</option>
              </select>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
