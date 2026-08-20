import { useAuth } from '../../context/AuthContext';
import { useFetch } from '../../hooks/useApi';
import { formatQuantity, formatDateTime } from '../../utils/format';
import { Alert, Spinner, PageHeader, Badge, EmptyState } from '../../components/Ui';

/** Read-only view of the cashier's own branch stock levels. */
export default function InventoryViewer() {
  const { user } = useAuth();
  const { data, loading, error, refetch } = useFetch(`/inventory/${user.branch_id}`);

  if (loading) return <Spinner label="Loading inventory…" />;

  const inventory = data?.inventory ?? [];
  const lowCount = inventory.filter((i) => i.is_low).length;

  return (
    <div>
      <PageHeader title="Current Inventory" subtitle="Stock levels at your branch.">
        <button type="button" onClick={refetch} className="btn-secondary">Refresh</button>
      </PageHeader>

      {error && <Alert>{error}</Alert>}
      {lowCount > 0 && (
        <Alert type="warning">
          {lowCount} item{lowCount === 1 ? ' is' : 's are'} at or below the low-stock threshold.
        </Alert>
      )}

      <div className="card overflow-x-auto">
        {inventory.length === 0 ? (
          <EmptyState>No inventory records for your branch.</EmptyState>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Ingredient</th>
                <th>Category</th>
                <th className="text-right">Quantity</th>
                <th>Status</th>
                <th>Last counted</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((item) => (
                <tr key={item.id}>
                  <td className="font-medium">{item.ingredient_name}</td>
                  <td className="text-ink-600">{item.category}</td>
                  <td className="text-right font-mono tabular-nums">
                    {formatQuantity(item.quantity)} {item.unit}
                  </td>
                  <td>
                    {item.is_low ? <Badge tone="red">Low stock</Badge> : <Badge tone="green">OK</Badge>}
                  </td>
                  <td className="text-ink-600">{formatDateTime(item.last_counted_at)}</td>
                  <td className="text-ink-600">{item.last_counted_by_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
