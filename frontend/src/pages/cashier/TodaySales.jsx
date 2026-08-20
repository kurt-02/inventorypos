import { useAuth } from '../../context/AuthContext';
import { useFetch } from '../../hooks/useApi';
import { formatCurrency, formatTime } from '../../utils/format';
import { Alert, Spinner, PageHeader, StatCard, EmptyState } from '../../components/Ui';

/**
 * Today's transactions for the cashier's branch. Deliberately has no date
 * picker - cashiers only ever see the current day (the endpoint itself is
 * scoped to CURDATE(), so this isn't just a UI restriction).
 */
export default function TodaySales() {
  const { user } = useAuth();
  const { data, loading, error, refetch } = useFetch(`/sales/today/${user.branch_id}`);

  if (loading) return <Spinner label="Loading today's sales…" />;

  const sales = data?.sales ?? [];
  const summary = data?.summary ?? { count: 0, total_revenue: 0 };
  const itemsSold = sales.reduce(
    (sum, sale) => sum + (sale.items ?? []).reduce((s, i) => s + i.quantity, 0),
    0
  );

  return (
    <div>
      <PageHeader title="Today's Sales" subtitle="Transactions recorded at your branch today.">
        <button type="button" onClick={refetch} className="btn-secondary">Refresh</button>
      </PageHeader>

      {error && <Alert>{error}</Alert>}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Transactions" value={summary.count} />
        <StatCard label="Items sold" value={itemsSold} />
        <StatCard label="Revenue" value={formatCurrency(summary.total_revenue)} accent="green" />
      </div>

      <div className="card">
        {sales.length === 0 ? (
          <EmptyState>No sales recorded yet today.</EmptyState>
        ) : (
          <ul className="divide-y divide-dashed divide-ink-200">
            {sales.map((sale) => (
              <li key={sale.id} className="py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold text-ink-900">
                      #{String(sale.id).padStart(4, '0')}
                      <span className="ml-2 font-sans text-sm font-normal text-ink-500">
                        {formatTime(sale.created_at)} · {sale.cashier_name}
                      </span>
                    </p>
                    <ul className="mt-1 text-sm text-ink-600">
                      {(sale.items ?? []).map((item, idx) => (
                        <li key={`${sale.id}-${item.product_id}-${idx}`}>
                          {item.quantity} × {item.name} @ <span className="font-mono tabular-nums">{formatCurrency(item.price_at_sale)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <span className="whitespace-nowrap font-mono text-base font-bold tabular-nums text-ink-900">
                    {formatCurrency(sale.total_amount)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
