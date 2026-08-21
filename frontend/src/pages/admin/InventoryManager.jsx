import { Fragment, useMemo, useState } from 'react';
import api, { errorMessage } from '../../utils/api';
import { useFetch } from '../../hooks/useApi';
import { formatQuantity, formatDateTime } from '../../utils/format';
import { Alert, Spinner, PageHeader, Modal, Badge, EmptyState, Pagination } from '../../components/Ui';

const REASONS = [
  { value: 'restock', label: 'Restock (delivery received)' },
  { value: 'waste', label: 'Waste (spoilage, spillage)' },
  { value: 'correction', label: 'Correction (fix a miscount)' },
];

/**
 * Both branches' stock in one table, with a manual adjustment dialog that
 * requires a reason, plus the full adjustment audit trail below.
 */
export default function InventoryManager() {
  const { data, loading, error, refetch } = useFetch('/inventory');
  const [branchFilter, setBranchFilter] = useState('all');
  const [modal, setModal] = useState(null); // null | { row }
  const [form, setForm] = useState({ direction: 'add', amount: '', reason: 'restock', notes: '' });
  const [feedback, setFeedback] = useState(null);
  const [saving, setSaving] = useState(false);
  const [historyKey, setHistoryKey] = useState(0); // bump to reload the history pane

  const inventory = data?.inventory ?? [];
  const branches = [...new Map(inventory.map((i) => [i.branch_id, i.branch_name])).entries()];
  const visible = branchFilter === 'all'
    ? inventory
    : inventory.filter((i) => String(i.branch_id) === branchFilter);
  // Null while showing every branch; the history pane uses it to label itself.
  const branchName = branchFilter === 'all'
    ? null
    : branches.find(([id]) => String(id) === branchFilter)?.[1] ?? null;

  const openAdjust = (row) => {
    setForm({ direction: 'add', amount: '', reason: 'restock', notes: '' });
    setModal({ row });
  };

  const submitAdjustment = async (e) => {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!amount || amount <= 0) {
      setFeedback({ type: 'error', text: 'Enter an amount greater than zero.' });
      return;
    }
    // The API takes a signed delta; the UI splits it into direction + amount
    // so the operator doesn't have to think about negative numbers.
    const quantity_change = form.direction === 'add' ? amount : -amount;

    setSaving(true);
    try {
      await api.put('/inventory/adjust', {
        branch_id: modal.row.branch_id,
        ingredient_id: modal.row.ingredient_id,
        quantity_change,
        reason: form.reason,
        notes: form.notes.trim() || null,
      });
      setFeedback({
        type: 'success',
        text: `${form.direction === 'add' ? 'Added' : 'Removed'} ${amount} ${modal.row.unit} of ${modal.row.ingredient_name} at ${modal.row.branch_name}.`,
      });
      setModal(null);
      refetch();
      setHistoryKey((k) => k + 1);
    } catch (err) {
      setFeedback({ type: 'error', text: errorMessage(err, 'Could not apply the adjustment.') });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner label="Loading inventory…" />;

  return (
    <div>
      <PageHeader title="Inventory" subtitle="Both branches, with manual adjustments and full history.">
        <button type="button" onClick={refetch} className="btn-secondary">Refresh</button>
      </PageHeader>

      {error && <Alert>{error}</Alert>}
      {feedback && <Alert type={feedback.type} onDismiss={() => setFeedback(null)}>{feedback.text}</Alert>}

      {/* Applies to the stock table and the adjustment history below it. */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => setBranchFilter('all')}
          className={branchFilter === 'all' ? 'btn-primary' : 'btn-secondary'}>
          All branches
        </button>
        {branches.map(([id, name]) => (
          <button key={id} type="button" onClick={() => setBranchFilter(String(id))}
            className={branchFilter === String(id) ? 'btn-primary' : 'btn-secondary'}>
            {name}
          </button>
        ))}
      </div>

      <div className="card mb-8 overflow-x-auto">
        {visible.length === 0 ? (
          <EmptyState>No inventory records.</EmptyState>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Branch</th>
                <th>Ingredient</th>
                <th>Category</th>
                <th className="text-right">Quantity</th>
                <th>Status</th>
                <th>Last counted</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  <td className="text-ink-600">{row.branch_name}</td>
                  <td className="font-medium">{row.ingredient_name}</td>
                  <td className="text-ink-600">{row.category}</td>
                  <td className="text-right font-mono tabular-nums">{formatQuantity(row.quantity)} {row.unit}</td>
                  <td>{row.is_low ? <Badge tone="red">Low</Badge> : <Badge tone="green">OK</Badge>}</td>
                  <td className="text-ink-600">
                    {formatDateTime(row.last_counted_at)}
                    {row.last_counted_by_name && (
                      <span className="block text-xs text-ink-400">by {row.last_counted_by_name}</span>
                    )}
                  </td>
                  <td className="text-right">
                    <button type="button" onClick={() => openAdjust(row)} className="btn-secondary px-3 py-1">
                      Adjust
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <AdjustmentHistory key={historyKey} branchFilter={branchFilter} branchName={branchName} />

      {modal && (
        <Modal
          title={`Adjust ${modal.row.ingredient_name}`}
          onClose={() => setModal(null)}
          footer={
            <>
              <button type="button" onClick={() => setModal(null)} className="btn-secondary">Cancel</button>
              <button type="submit" form="adjust-form" className="btn-primary" disabled={saving}>
                {saving ? 'Applying…' : 'Apply adjustment'}
              </button>
            </>
          }
        >
          <p className="mb-4 rounded border border-ink-200 bg-ink-100 px-3 py-2 text-sm text-ink-700">
            {modal.row.branch_name} · current stock{' '}
            <strong className="font-mono">{formatQuantity(modal.row.quantity)} {modal.row.unit}</strong>
          </p>

          <form id="adjust-form" onSubmit={submitAdjustment} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="a-direction">Direction</label>
                <select id="a-direction" className="input" value={form.direction}
                  onChange={(e) => setForm({ ...form, direction: e.target.value })}>
                  <option value="add">Add to stock</option>
                  <option value="remove">Remove from stock</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="a-amount">Amount ({modal.row.unit})</label>
                <input id="a-amount" type="number" step="0.001" min="0" className="input" value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })} required autoFocus />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="a-reason">Reason (logged in history)</label>
              <select id="a-reason" className="input" value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}>
                {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="a-notes">Notes (optional)</label>
              <input id="a-notes" className="input" value={form.notes} maxLength={255}
                placeholder="e.g. Weekly delivery from supplier"
                onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

const REASON_TONES = {
  sale: 'blue',
  waste: 'red',
  restock: 'green',
  correction: 'amber',
  shift_count: 'neutral',
};

/** A signed stock movement, coloured by direction. */
function QuantityChange({ value, unit }) {
  const amount = Number(value);
  return (
    <span className={`font-mono tabular-nums font-medium ${amount >= 0 ? 'text-success-500' : 'text-danger-500'}`}>
      {amount > 0 ? '+' : ''}{formatQuantity(value)} {unit}
    </span>
  );
}

/**
 * Collapses the adjustment rows into display groups.
 *
 * One checkout deducts every ingredient its products call for, which used to
 * render as a separate row per ingredient. Rows carrying the same sale_id are
 * folded into a single group so a sale reads as one event. Everything else -
 * restocks, waste, corrections, shift counts - stays one row per adjustment,
 * because each of those really is its own independent event.
 *
 * Rows are already sorted newest-first by the API, and one sale's rows share a
 * timestamp, so appending groups in encounter order preserves that ordering.
 */
function groupAdjustments(adjustments, sales) {
  const salesById = new Map(sales.map((s) => [s.id, s]));
  const groups = [];
  const groupsBySale = new Map();

  for (const adj of adjustments) {
    // A pre-migration sale row with no sale_id falls through to its own row
    // rather than being dropped - the history must never lose an entry.
    if (!adj.sale_id) {
      groups.push({ key: `adj-${adj.id}`, head: adj, lines: [adj], sale: null });
      continue;
    }
    let group = groupsBySale.get(adj.sale_id);
    if (!group) {
      group = {
        key: `sale-${adj.sale_id}`,
        head: adj,
        lines: [],
        sale: salesById.get(adj.sale_id) ?? { id: adj.sale_id, products: [] },
      };
      groupsBySale.set(adj.sale_id, group);
      groups.push(group);
    }
    group.lines.push(adj);
  }

  return groups;
}

/** "Americano ×1, Latte ×2" */
function describeProducts(products) {
  return products.map((p) => `${p.name} ×${p.quantity}`).join(', ');
}

/** Says which slice of time is on screen, including open-ended ranges. */
function describeRange({ start_date: start, end_date: end }) {
  if (start && end) return `${start} to ${end}`;
  if (start) return `from ${start}`;
  if (end) return `up to ${end}`;
  return 'All dates';
}

/** The same range as a clause that reads correctly inside a sentence. */
function rangeClause({ start_date: start, end_date: end }) {
  if (start && end) return ` between ${start} and ${end}`;
  if (start) return ` on or after ${start}`;
  if (end) return ` on or before ${end}`;
  return '';
}

/**
 * Audit trail of every stock movement, filterable by reason.
 *
 * The branch comes from the page-level filter rather than a control of its own,
 * so picking a branch narrows the stock table and this history together instead
 * of leaving one showing rows from the branch you just filtered out.
 */
function AdjustmentHistory({ branchFilter = 'all', branchName = null }) {
  const [reason, setReason] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  // Closed until asked for. The audit trail is the largest table in the system
  // and most visits to this page are about current stock, not history, so it
  // costs nothing until someone actually opens it.
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  // Both blank by default, which means the whole history - narrowing the range
  // is opt-in, so opening the panel still shows the most recent movements.
  const [range, setRange] = useState({ start_date: '', end_date: '' });

  // Changing a filter restarts paging, so you can't land past the last page.
  // Reset during render so the next fetch already carries page 1, instead of
  // issuing a discarded request for the old page first.
  const filterKey = `${reason}|${branchFilter}|${range.start_date}|${range.end_date}`;
  const [seenFilterKey, setSeenFilterKey] = useState(filterKey);
  if (seenFilterKey !== filterKey) {
    setSeenFilterKey(filterKey);
    setPage(1);
  }

  const { data, loading, error } = useFetch('/inventory/adjustments', {
    enabled: open,
    params: {
      page,
      limit: 15,
      ...(reason ? { reason } : {}),
      ...(branchFilter !== 'all' ? { branch_id: branchFilter } : {}),
      ...(range.start_date ? { start_date: range.start_date } : {}),
      ...(range.end_date ? { end_date: range.end_date } : {}),
    },
  });

  const adjustments = data?.adjustments ?? [];
  const sales = data?.sales ?? [];
  const groups = useMemo(() => groupAdjustments(adjustments, sales), [adjustments, sales]);

  const toggle = (key) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const saleGroups = groups.filter((g) => g.sale);
  const allExpanded = saleGroups.length > 0 && saleGroups.every((g) => expanded.has(g.key));
  const toggleAll = () =>
    setExpanded(allExpanded ? new Set() : new Set(saleGroups.map((g) => g.key)));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="adjustment-history-panel"
            className="flex items-center gap-2 font-mono text-base font-bold text-ink-900"
          >
            <span aria-hidden="true" className={open ? 'rotate-90 transition-transform' : 'transition-transform'}>›</span>
            Adjustment history
          </button>
          <p className="mt-0.5 text-sm text-ink-500">
            {open
              ? `${branchName ? `${branchName} only` : 'All branches'} · ${describeRange(range)}`
              : 'Not loaded — open to fetch the audit trail.'}
          </p>
        </div>
        {open && (
          <div className="flex flex-wrap items-end gap-2">
            {saleGroups.length > 0 && (
              <button type="button" onClick={toggleAll} className="btn-secondary">
                {allExpanded ? 'Collapse all' : 'Expand all'}
              </button>
            )}
            <div>
              <label className="label" htmlFor="h-start">From</label>
              <input
                id="h-start"
                type="date"
                className="input"
                value={range.start_date}
                max={range.end_date || undefined}
                onChange={(e) => setRange({ ...range, start_date: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="h-end">To</label>
              <input
                id="h-end"
                type="date"
                className="input"
                value={range.end_date}
                min={range.start_date || undefined}
                onChange={(e) => setRange({ ...range, end_date: e.target.value })}
              />
            </div>
            {(range.start_date || range.end_date) && (
              <button
                type="button"
                onClick={() => setRange({ start_date: '', end_date: '' })}
                className="btn-secondary"
              >
                Clear dates
              </button>
            )}
            <div>
              <label className="label" htmlFor="h-reason">Filter by reason</label>
              <select id="h-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">All reasons</option>
                <option value="sale">Sale (auto-deduction)</option>
                <option value="shift_count">Shift count</option>
                <option value="restock">Restock</option>
                <option value="waste">Waste</option>
                <option value="correction">Correction</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {!open ? null : (
      <div id="adjustment-history-panel">
      {error && <Alert>{error}</Alert>}

      <div className="card overflow-x-auto">
        {loading ? (
          <Spinner label="Loading history…" />
        ) : groups.length === 0 ? (
          <EmptyState>
            No adjustments recorded{branchName ? ` at ${branchName}` : ''}
            {reason ? ` with reason "${reason.replace('_', ' ')}"` : ''}
            {rangeClause(range)}.
          </EmptyState>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-10"><span className="sr-only">Expand</span></th>
                <th>When</th>
                <th>Branch</th>
                <th>Item purchased</th>
                <th>Ingredients used</th>
                <th>Reason</th>
                <th>By</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const { key, head, lines, sale } = group;
                const isOpen = expanded.has(key);
                const detailId = `history-detail-${key}`;

                return (
                  <Fragment key={key}>
                    <tr>
                      <td className="align-top">
                        {sale && (
                          <button
                            type="button"
                            onClick={() => toggle(key)}
                            aria-expanded={isOpen}
                            aria-controls={detailId}
                            className="flex h-6 w-6 items-center justify-center rounded text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
                          >
                            <span aria-hidden="true" className={isOpen ? 'rotate-90 transition-transform' : 'transition-transform'}>›</span>
                            <span className="sr-only">
                              {isOpen ? 'Hide' : 'Show'} ingredients for sale #{sale.id}
                            </span>
                          </button>
                        )}
                      </td>
                      <td className="whitespace-nowrap align-top text-ink-600">{formatDateTime(head.adjusted_at)}</td>
                      <td className="whitespace-nowrap align-top text-ink-600">{head.branch_name}</td>
                      <td className="align-top">
                        {sale ? (
                          <div>
                            <span className="font-mono text-xs font-bold text-ink-900">
                              Sale #{String(sale.id).padStart(4, '0')}
                            </span>
                            <span className="block max-w-[16rem] truncate font-medium" title={describeProducts(sale.products)}>
                              {sale.products.length > 0 ? describeProducts(sale.products) : 'Products unavailable'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </td>
                      <td className="align-top">
                        {sale ? (
                          <button
                            type="button"
                            onClick={() => toggle(key)}
                            aria-expanded={isOpen}
                            aria-controls={detailId}
                            className="text-left font-medium text-brand-600 hover:underline"
                          >
                            {lines.length} ingredient{lines.length === 1 ? '' : 's'}
                          </button>
                        ) : (
                          <span className="flex flex-wrap items-baseline gap-x-2">
                            <span className="font-medium">{head.ingredient_name}</span>
                            <QuantityChange value={head.quantity_change} unit={head.unit} />
                          </span>
                        )}
                      </td>
                      <td className="align-top"><Badge tone={REASON_TONES[head.reason]}>{head.reason.replace('_', ' ')}</Badge></td>
                      <td className="align-top text-ink-600">{head.adjusted_by_name || '—'}</td>
                      <td className="max-w-xs truncate align-top text-ink-500" title={head.notes || ''}>{head.notes || '—'}</td>
                    </tr>

                    {sale && isOpen && (
                      <tr id={detailId}>
                        <td />
                        <td colSpan={7} className="bg-ink-50">
                          <div className="flex flex-wrap gap-x-12 gap-y-6 py-1">
                            <div className="min-w-[14rem]">
                              <p className="label">Products in this sale</p>
                              <ul className="space-y-1 text-sm">
                                {sale.products.map((p) => (
                                  <li key={p.product_id} className="flex items-baseline justify-between gap-6">
                                    <span>{p.name}</span>
                                    <span className="font-mono tabular-nums text-ink-600">×{p.quantity}</span>
                                  </li>
                                ))}
                                {sale.products.length === 0 && (
                                  <li className="text-ink-500">This sale's line items are no longer available.</li>
                                )}
                              </ul>
                            </div>
                            <div className="min-w-[16rem]">
                              <p className="label">Ingredients deducted</p>
                              <ul className="space-y-1 text-sm">
                                {lines.map((line) => (
                                  <li key={line.id} className="flex items-baseline justify-between gap-6">
                                    <span>{line.ingredient_name}</span>
                                    <QuantityChange value={line.quantity_change} unit={line.unit} />
                                  </li>
                                ))}
                              </ul>
                              {sale.products.length > 1 && (
                                <p className="mt-2 max-w-sm text-xs text-ink-500">
                                  Checkout records one deduction per ingredient for the whole basket, so
                                  shared ingredients are combined across these products.
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={data?.page} onChange={setPage} label="adjustments" />
      </div>
      )}
    </div>
  );
}
