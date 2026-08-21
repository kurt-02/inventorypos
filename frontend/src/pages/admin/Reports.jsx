import { useState } from 'react';
import { useFetch } from '../../hooks/useApi';
import { formatCurrency, formatQuantity, formatDateTime, toDateInput } from '../../utils/format';
import { paymentMethodLabel } from '../../constants/paymentMethods';
import { Alert, Spinner, PageHeader, StatCard, Badge, EmptyState } from '../../components/Ui';

/** Detailed sales and inventory reporting with date/branch filters. */
export default function Reports() {
  const [tab, setTab] = useState('sales');
  const [filters, setFilters] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return { start_date: toDateInput(start), end_date: toDateInput(end), branch_id: '' };
  });

  const { data: branchData } = useFetch('/branches');
  const branches = branchData?.branches ?? [];

  return (
    <div>
      <PageHeader title="Reports" subtitle="Detailed sales and inventory data." />

      <div className="mb-6 flex gap-2">
        <button type="button" onClick={() => setTab('sales')} className={tab === 'sales' ? 'btn-primary' : 'btn-secondary'}>
          Sales
        </button>
        <button type="button" onClick={() => setTab('top-items')} className={tab === 'top-items' ? 'btn-primary' : 'btn-secondary'}>
          Top items
        </button>
        <button type="button" onClick={() => setTab('inventory')} className={tab === 'inventory' ? 'btn-primary' : 'btn-secondary'}>
          Inventory
        </button>
      </div>

      {tab !== 'inventory' && (
        <div className="card mb-6 flex flex-wrap items-end gap-4">
          <div>
            <label className="label" htmlFor="f-start">From</label>
            <input id="f-start" type="date" className="input" value={filters.start_date}
              onChange={(e) => setFilters({ ...filters, start_date: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="f-end">To</label>
            <input id="f-end" type="date" className="input" value={filters.end_date}
              onChange={(e) => setFilters({ ...filters, end_date: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="f-branch">Branch</label>
            <select id="f-branch" className="input" value={filters.branch_id}
              onChange={(e) => setFilters({ ...filters, branch_id: e.target.value })}>
              <option value="">All branches</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>
      )}

      {tab === 'sales' && <SalesReport filters={filters} />}
      {tab === 'top-items' && <TopItemsReport filters={filters} />}
      {tab === 'inventory' && <InventoryReport />}
    </div>
  );
}

/** Strips empty filter values so we don't send `branch_id=` to the API. */
function cleanParams(filters) {
  return Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v != null));
}

function SalesReport({ filters }) {
  const { data, loading, error } = useFetch('/reports/sales', { params: cleanParams(filters) });

  if (loading) return <Spinner label="Loading sales…" />;

  const sales = data?.sales ?? [];
  const summary = data?.summary ?? { count: 0, total_revenue: 0 };
  const average = summary.count > 0 ? summary.total_revenue / summary.count : 0;
  const byMethod = summary.by_payment_method ?? {};

  return (
    <div>
      {error && <Alert>{error}</Alert>}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Transactions" value={summary.count} />
        <StatCard label="Total revenue" value={formatCurrency(summary.total_revenue)} accent="green" />
        <StatCard label="Average sale" value={formatCurrency(average)} />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Cash sales"
          value={formatCurrency(byMethod.cash?.total ?? 0)}
          sublabel={`${byMethod.cash?.count ?? 0} transaction(s)`}
        />
        <StatCard
          label="QRPH sales"
          value={formatCurrency(byMethod.qrph?.total ?? 0)}
          sublabel={`${byMethod.qrph?.count ?? 0} transaction(s)`}
        />
      </div>

      <div className="card overflow-x-auto">
        {sales.length === 0 ? (
          <EmptyState>No sales in this period.</EmptyState>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Sale #</th>
                <th>When</th>
                <th>Branch</th>
                <th>Cashier</th>
                <th>Payment</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id}>
                  <td className="font-medium">#{sale.id}</td>
                  <td className="whitespace-nowrap text-ink-600">{formatDateTime(sale.created_at)}</td>
                  <td className="text-ink-600">{sale.branch_name}</td>
                  <td className="text-ink-600">{sale.cashier_name}</td>
                  <td>
                    <Badge tone="blue">{paymentMethodLabel(sale.payment_method)}</Badge>
                  </td>
                  <td className="text-right font-mono tabular-nums font-medium">{formatCurrency(sale.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function TopItemsReport({ filters }) {
  const { data, loading, error } = useFetch('/reports/top-items', {
    params: { ...cleanParams(filters), limit: 20 },
  });

  if (loading) return <Spinner label="Loading top items…" />;

  const items = data?.top_items ?? [];
  const maxQty = Math.max(...items.map((i) => Number(i.total_quantity_sold)), 1);

  return (
    <div>
      {error && <Alert>{error}</Alert>}
      <div className="card overflow-x-auto">
        {items.length === 0 ? (
          <EmptyState>No sales in this period.</EmptyState>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>#</th>
                <th>Product</th>
                <th>Category</th>
                <th className="text-right">Qty sold</th>
                <th className="w-1/4">Share</th>
                <th className="text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.product_id}>
                  <td className="text-ink-400">{index + 1}</td>
                  <td className="font-medium">{item.name}</td>
                  <td className="text-ink-600">{item.category}</td>
                  <td className="text-right font-mono tabular-nums">{item.total_quantity_sold}</td>
                  <td>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
                      <div className="h-full rounded-full bg-brand-500"
                        style={{ width: `${(Number(item.total_quantity_sold) / maxQty) * 100}%` }} />
                    </div>
                  </td>
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

function InventoryReport() {
  const { data, loading, error } = useFetch('/reports/inventory');

  if (loading) return <Spinner label="Loading inventory report…" />;

  const inventory = data?.inventory ?? [];
  const lowCount = data?.low_stock_count ?? 0;

  return (
    <div>
      {error && <Alert>{error}</Alert>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard label="Tracked stock records" value={inventory.length} sublabel="Across both branches" />
        <StatCard label="Low-stock items" value={lowCount} accent={lowCount > 0 ? 'red' : 'green'} />
      </div>

      <div className="card overflow-x-auto">
        {inventory.length === 0 ? (
          <EmptyState>No inventory records.</EmptyState>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Branch</th>
                <th>Ingredient</th>
                <th>Category</th>
                <th className="text-right">Quantity</th>
                <th className="text-right">Threshold</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((row) => (
                <tr key={`${row.branch_id}-${row.ingredient_id}`}>
                  <td className="text-ink-600">{row.branch_name}</td>
                  <td className="font-medium">{row.ingredient_name}</td>
                  <td className="text-ink-600">{row.category}</td>
                  <td className="text-right font-mono tabular-nums">{formatQuantity(row.quantity)} {row.unit}</td>
                  <td className="text-right font-mono tabular-nums text-ink-500">
                    {formatQuantity(row.low_stock_threshold)} {row.unit}
                  </td>
                  <td>{row.is_low ? <Badge tone="red">Low</Badge> : <Badge tone="green">OK</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
