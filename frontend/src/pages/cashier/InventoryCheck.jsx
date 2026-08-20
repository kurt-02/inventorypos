import { useState, useEffect } from 'react';
import api, { errorMessage } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { useFetch } from '../../hooks/useApi';
import { formatQuantity } from '../../utils/format';
import { Alert, Spinner, PageHeader, EmptyState } from '../../components/Ui';

/**
 * End-of-shift count. The cashier types the physical count for each
 * ingredient; only rows that differ from the system quantity are sent, and
 * the backend logs each difference as a 'shift_count' adjustment.
 */
export default function InventoryCheck() {
  const { user } = useAuth();
  const { data, loading, error, refetch } = useFetch(`/inventory/${user.branch_id}`);
  const [counts, setCounts] = useState({}); // ingredient_id -> string input value
  const [feedback, setFeedback] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Pre-fill the inputs with the current system quantities so the cashier only
  // edits what actually differs.
  useEffect(() => {
    if (data?.inventory) {
      setCounts(
        Object.fromEntries(data.inventory.map((i) => [i.ingredient_id, String(i.quantity)]))
      );
    }
  }, [data]);

  if (loading) return <Spinner label="Loading inventory…" />;

  const inventory = data?.inventory ?? [];

  const changedRows = inventory.filter((item) => {
    const entered = counts[item.ingredient_id];
    return entered !== '' && entered != null && Number(entered) !== Number(item.quantity);
  });

  const submit = async (e) => {
    e.preventDefault();
    setFeedback(null);

    const payload = changedRows.map((item) => ({
      ingredient_id: item.ingredient_id,
      counted_quantity: Number(counts[item.ingredient_id]),
    }));

    if (payload.length === 0) {
      setFeedback({ type: 'info', text: 'No changes to submit — counts match the system.' });
      return;
    }
    if (payload.some((p) => Number.isNaN(p.counted_quantity) || p.counted_quantity < 0)) {
      setFeedback({ type: 'error', text: 'Counts must be non-negative numbers.' });
      return;
    }

    setSubmitting(true);
    try {
      await api.put('/inventory/check', { branch_id: user.branch_id, counts: payload });
      setFeedback({ type: 'success', text: `Submitted ${payload.length} updated count(s).` });
      refetch();
    } catch (err) {
      setFeedback({ type: 'error', text: errorMessage(err, 'Could not submit counts.') });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="End-of-Shift Count"
        subtitle="Enter the physical count for each item, then submit. Only changed rows are recorded."
      />

      {error && <Alert>{error}</Alert>}
      {feedback && (
        <Alert type={feedback.type} onDismiss={() => setFeedback(null)}>{feedback.text}</Alert>
      )}

      <form onSubmit={submit}>
        <div className="card overflow-x-auto">
          {inventory.length === 0 ? (
            <EmptyState>No inventory records for your branch.</EmptyState>
          ) : (
            <table className="table-base">
              <thead>
                <tr>
                  <th>Ingredient</th>
                  <th className="text-right">System qty</th>
                  <th className="text-right">Counted qty</th>
                  <th className="text-right">Difference</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((item) => {
                  const entered = counts[item.ingredient_id] ?? '';
                  const diff = entered === '' ? 0 : Number(entered) - Number(item.quantity);
                  return (
                    <tr key={item.id}>
                      <td className="font-medium">
                        {item.ingredient_name}
                        <span className="ml-1 text-xs text-ink-500">({item.unit})</span>
                      </td>
                      <td className="text-right font-mono tabular-nums text-ink-600">
                        {formatQuantity(item.quantity)}
                      </td>
                      <td className="text-right">
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          className="input w-32 text-right font-mono tabular-nums"
                          value={entered}
                          onChange={(e) =>
                            setCounts({ ...counts, [item.ingredient_id]: e.target.value })
                          }
                          aria-label={`Counted quantity for ${item.ingredient_name}`}
                        />
                      </td>
                      <td
                        className={`text-right font-mono tabular-nums font-medium ${
                          diff === 0 ? 'text-ink-400' : diff > 0 ? 'text-success-500' : 'text-danger-500'
                        }`}
                      >
                        {diff === 0 ? '—' : `${diff > 0 ? '+' : ''}${formatQuantity(diff)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-ink-600">
            {changedRows.length} row{changedRows.length === 1 ? '' : 's'} changed
          </p>
          <button type="submit" className="btn-primary" disabled={submitting || inventory.length === 0}>
            {submitting ? 'Submitting…' : 'Submit Count'}
          </button>
        </div>
      </form>
    </div>
  );
}
