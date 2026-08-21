import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useFetch } from '../../hooks/useApi';
import { formatCurrency, formatTime } from '../../utils/format';
import { paymentMethodLabel } from '../../constants/paymentMethods';
import { Alert, Spinner, PageHeader, StatCard, Badge, EmptyState, Pagination } from '../../components/Ui';

/**
 * Today's transactions for the cashier's branch. Deliberately has no date
 * picker - cashiers only ever see the current day (the endpoint itself is
 * scoped to the current date, so this isn't just a UI restriction).
 *
 * The headline figures come from the server, which aggregates them over the
 * whole day. They therefore stay correct while the list below shows one page
 * at a time - a busy branch's shift is far more than one screen of sales.
 */
export default function TodaySales() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const { data, loading, error, refetch } = useFetch(`/sales/today/${user.branch_id}`, {
    params: { page, limit: 25 },
  });

  const sales = data?.sales ?? [];
  const summary = data?.summary ?? { count: 0, total_revenue: 0, items_sold: 0 };
  const byMethod = summary.by_payment_method ?? {};

  return (
    <div>
      <PageHeader title="Today's Sales" subtitle="Transactions recorded at your branch today.">
        <button type="button" onClick={refetch} className="btn-secondary">Refresh</button>
      </PageHeader>

      {error && <Alert>{error}</Alert>}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Transactions" value={summary.count} />
        <StatCard label="Items sold" value={summary.items_sold ?? 0} />
        <StatCard label="Revenue" value={formatCurrency(summary.total_revenue)} accent="green" />
      </div>

      {/* Split of the day's takings, for counting the drawer against QR receipts. */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Cash"
          value={formatCurrency(byMethod.cash?.total ?? 0)}
          sublabel={`${byMethod.cash?.count ?? 0} transaction(s)`}
        />
        <StatCard
          label="QRPH"
          value={formatCurrency(byMethod.qrph?.total ?? 0)}
          sublabel={`${byMethod.qrph?.count ?? 0} transaction(s)`}
        />
      </div>

      <div className="card">
        {loading ? (
          <Spinner label="Loading today's sales…" />
        ) : sales.length === 0 ? (
          <EmptyState>No sales recorded yet today.</EmptyState>
        ) : (
          <ul className="divide-y divide-dashed divide-ink-200">
            {sales.map((sale) => (
              <li key={sale.id} className="py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-mono text-sm font-bold text-ink-900">
                      #{String(sale.id).padStart(4, '0')}
                      <span className="font-sans text-sm font-normal text-ink-500">
                        {formatTime(sale.created_at)} · {sale.cashier_name}
                      </span>
                      <Badge tone="blue">{paymentMethodLabel(sale.payment_method)}</Badge>
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

      <Pagination page={data?.page} onChange={setPage} label="transactions" />
    </div>
  );
}
