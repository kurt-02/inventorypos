import { useFetch } from '../../hooks/useApi';
import { formatCurrency, toDateInput } from '../../utils/format';
import { Alert, Spinner, PageHeader, StatCard, Badge, EmptyState } from '../../components/Ui';

/** Admin landing page: today's key numbers for both branches side by side. */
export default function Overview() {
  const today = toDateInput(new Date());
  const { data, loading, error, refetch } = useFetch('/reports/comparison', {
    params: { start_date: today, end_date: today },
  });
  const { data: topData } = useFetch('/reports/top-items', {
    params: { start_date: today, end_date: today, limit: 5 },
  });

  if (loading) return <Spinner label="Loading overview…" />;

  const branches = data?.comparison ?? [];
  const totalRevenue = branches.reduce((s, b) => s + b.total_revenue, 0);
  const totalItems = branches.reduce((s, b) => s + b.items_sold, 0);
  const totalTransactions = branches.reduce((s, b) => s + b.transaction_count, 0);
  const topItems = topData?.top_items ?? [];

  return (
    <div>
      <PageHeader title="Overview" subtitle="Today's performance across both branches.">
        <button type="button" onClick={refetch} className="btn-secondary">Refresh</button>
      </PageHeader>

      {error && <Alert>{error}</Alert>}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Revenue today" value={formatCurrency(totalRevenue)} accent="green" sublabel="Both branches" />
        <StatCard label="Transactions today" value={totalTransactions} sublabel="Both branches" />
        <StatCard label="Items sold today" value={totalItems} sublabel="Both branches" />
      </div>

      <h2 className="mb-3 font-mono text-base font-bold text-ink-900">By branch</h2>
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        {branches.map((branch) => (
          <div key={branch.branch_id} className="card">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-mono text-sm font-bold text-ink-900">{branch.branch_name}</h3>
              <Badge tone={branch.inventory_health_percent >= 80 ? 'green' : branch.inventory_health_percent >= 50 ? 'amber' : 'red'}>
                Inventory {branch.inventory_health_percent}%
              </Badge>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-ink-500">Revenue</dt>
                <dd className="text-lg font-bold text-ink-900">{formatCurrency(branch.total_revenue)}</dd>
              </div>
              <div>
                <dt className="text-ink-500">Transactions</dt>
                <dd className="text-lg font-bold text-ink-900">{branch.transaction_count}</dd>
              </div>
              <div>
                <dt className="text-ink-500">Items sold</dt>
                <dd className="text-lg font-bold text-ink-900">{branch.items_sold}</dd>
              </div>
              <div>
                <dt className="text-ink-500">Average sale</dt>
                <dd className="text-lg font-bold text-ink-900">{formatCurrency(branch.average_sale)}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      <h2 className="mb-3 font-mono text-base font-bold text-ink-900">Top sellers today</h2>
      <div className="card">
        {topItems.length === 0 ? (
          <EmptyState>No sales recorded yet today.</EmptyState>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th className="text-right">Qty sold</th>
                <th className="text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {topItems.map((item) => (
                <tr key={item.product_id}>
                  <td className="font-medium">{item.name}</td>
                  <td className="text-ink-600">{item.category}</td>
                  <td className="text-right font-mono tabular-nums">{item.total_quantity_sold}</td>
                  <td className="text-right font-mono tabular-nums">{formatCurrency(item.total_revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
