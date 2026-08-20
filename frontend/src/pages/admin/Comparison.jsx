import { useState } from 'react';
import { useFetch } from '../../hooks/useApi';
import { formatCurrency, formatQuantity, toDateInput } from '../../utils/format';
import { Alert, Spinner, PageHeader, EmptyState, Badge } from '../../components/Ui';

/**
 * Branch A vs Branch B over a chosen date range: revenue, volume, top items
 * per branch, and current inventory health.
 */
export default function Comparison() {
  const [range, setRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    return { start_date: toDateInput(start), end_date: toDateInput(end) };
  });

  const { data, loading, error } = useFetch('/reports/comparison', { params: range });
  const { data: invData } = useFetch('/reports/inventory');
  const branches = data?.comparison ?? [];

  const maxRevenue = Math.max(...branches.map((b) => b.total_revenue), 1);

  return (
    <div>
      <PageHeader title="Branch Comparison" subtitle="Side-by-side performance for the selected period." />

      <div className="card mb-6 flex flex-wrap items-end gap-4">
        <div>
          <label className="label" htmlFor="start">From</label>
          <input
            id="start"
            type="date"
            className="input"
            value={range.start_date}
            onChange={(e) => setRange({ ...range, start_date: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="end">To</label>
          <input
            id="end"
            type="date"
            className="input"
            value={range.end_date}
            onChange={(e) => setRange({ ...range, end_date: e.target.value })}
          />
        </div>
      </div>

      {error && <Alert>{error}</Alert>}
      {loading ? (
        <Spinner label="Building comparison…" />
      ) : (
        <>
          {/* Revenue bars give an at-a-glance sense of the gap between branches. */}
          <div className="card mb-6">
            <h2 className="mb-4 font-mono text-base font-bold text-ink-900">Revenue by branch</h2>
            {branches.length === 0 ? (
              <EmptyState>No data for this period.</EmptyState>
            ) : (
              <ul className="space-y-4">
                {branches.map((b) => (
                  <li key={b.branch_id}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium text-ink-800">{b.branch_name}</span>
                      <span className="font-bold text-ink-900">{formatCurrency(b.total_revenue)}</span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-ink-100">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${(b.total_revenue / maxRevenue) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card mb-6 overflow-x-auto">
            <h2 className="mb-4 font-mono text-base font-bold text-ink-900">Metrics</h2>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Metric</th>
                  {branches.map((b) => (
                    <th key={b.branch_id} className="text-right">{b.branch_name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['Revenue', (b) => formatCurrency(b.total_revenue)],
                  ['Transactions', (b) => b.transaction_count],
                  ['Items sold', (b) => b.items_sold],
                  ['Average sale', (b) => formatCurrency(b.average_sale)],
                  ['Inventory health', (b) => `${b.inventory_health_percent}%`],
                ].map(([label, render]) => (
                  <tr key={label}>
                    <td className="font-medium">{label}</td>
                    {branches.map((b) => (
                      <td key={b.branch_id} className="text-right font-mono tabular-nums">{render(b)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {branches.map((branch) => (
              <BranchTopItems key={branch.branch_id} branch={branch} range={range} />
            ))}
          </div>

          <h2 className="mb-3 mt-6 font-mono text-base font-bold text-ink-900">Low stock right now</h2>
          <div className="card overflow-x-auto">
            <LowStockTable inventory={invData?.inventory ?? []} />
          </div>
        </>
      )}
    </div>
  );
}

/** Top 5 products for one branch over the selected range. */
function BranchTopItems({ branch, range }) {
  const { data, loading } = useFetch('/reports/top-items', {
    params: { ...range, branch_id: branch.branch_id, limit: 5 },
  });
  const items = data?.top_items ?? [];

  return (
    <div className="card">
      <h3 className="mb-3 font-mono text-sm font-bold text-ink-900">Top items · {branch.branch_name}</h3>
      {loading ? (
        <Spinner label="Loading…" />
      ) : items.length === 0 ? (
        <EmptyState>No sales in this period.</EmptyState>
      ) : (
        <ol className="space-y-2">
          {items.map((item, index) => (
            <li key={item.product_id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">
                <span className="mr-2 text-ink-400">{index + 1}.</span>
                {item.name}
              </span>
              <span className="whitespace-nowrap text-ink-600">
                {item.total_quantity_sold} sold · {formatCurrency(item.total_revenue)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function LowStockTable({ inventory }) {
  const low = inventory.filter((i) => i.is_low);
  if (low.length === 0) return <EmptyState>All ingredients are above their thresholds at both branches.</EmptyState>;

  return (
    <table className="table-base">
      <thead>
        <tr>
          <th>Branch</th>
          <th>Ingredient</th>
          <th className="text-right">Quantity</th>
          <th className="text-right">Threshold</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {low.map((item) => (
          <tr key={`${item.branch_id}-${item.ingredient_id}`}>
            <td>{item.branch_name}</td>
            <td className="font-medium">{item.ingredient_name}</td>
            <td className="text-right font-mono tabular-nums">{formatQuantity(item.quantity)} {item.unit}</td>
            <td className="text-right font-mono tabular-nums text-ink-500">{formatQuantity(item.low_stock_threshold)} {item.unit}</td>
            <td><Badge tone="red">Low</Badge></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
