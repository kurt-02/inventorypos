import { useState, useMemo } from 'react';
import api, { errorMessage } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { useFetch } from '../../hooks/useApi';
import { formatCurrency } from '../../utils/format';
import { Alert, Spinner, EmptyState, PageHeader } from '../../components/Ui';

/**
 * Main checkout screen: a grid of product buttons on the left, the running
 * cart and total on the right. Submitting the cart POSTs to /api/sales, which
 * records the sale and auto-deducts every recipe ingredient from this
 * branch's inventory.
 */
export default function Pos() {
  const { user } = useAuth();
  const { data, loading, error } = useFetch('/products');
  const [cart, setCart] = useState([]); // [{ product_id, name, price, quantity }]
  const [category, setCategory] = useState('All');
  const [feedback, setFeedback] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const products = data?.products ?? [];
  const categories = useMemo(
    () => ['All', ...new Set(products.map((p) => p.category))],
    [products]
  );
  const visibleProducts = category === 'All' ? products : products.filter((p) => p.category === category);

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const addToCart = (product) => {
    setFeedback(null);
    setCart((prev) => {
      const existing = prev.find((i) => i.product_id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { product_id: product.id, name: product.name, price: Number(product.price), quantity: 1 }];
    });
  };

  const changeQuantity = (productId, delta) => {
    setCart((prev) =>
      prev
        .map((i) => (i.product_id === productId ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0)
    );
  };

  const removeItem = (productId) => setCart((prev) => prev.filter((i) => i.product_id !== productId));

  const checkout = async () => {
    if (cart.length === 0) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const { data: sale } = await api.post('/sales', {
        branch_id: user.branch_id,
        items: cart.map(({ product_id, quantity }) => ({ product_id, quantity })),
      });
      setCart([]);
      setFeedback({
        type: 'success',
        text: `Sale #${sale.id} completed — ${formatCurrency(sale.total_amount)}. Inventory updated.`,
      });
    } catch (err) {
      // A 409 here means a recipe ingredient ran out at this branch.
      setFeedback({ type: 'error', text: errorMessage(err, 'Checkout failed.') });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Spinner label="Loading products…" />;

  return (
    <div>
      <PageHeader title="Point of Sale" subtitle="Tap a product to add it to the order." />

      {error && <Alert>{error}</Alert>}
      {feedback && (
        <Alert type={feedback.type} onDismiss={() => setFeedback(null)}>
          {feedback.text}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Product grid */}
        <div className="lg:col-span-2">
          <div className="mb-4 flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={category === c ? 'btn-primary' : 'btn-secondary'}
              >
                {c}
              </button>
            ))}
          </div>

          {visibleProducts.length === 0 ? (
            <EmptyState>No products in this category.</EmptyState>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {visibleProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => addToCart(product)}
                  className="card flex flex-col items-start text-left transition-transform hover:-translate-y-0.5 hover:border-brand-400"
                >
                  <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">{product.category}</span>
                  <span className="mt-1 font-semibold text-ink-900">{product.name}</span>
                  <span className="mt-2 font-mono text-lg font-bold tabular-nums text-brand-600">
                    {formatCurrency(product.price)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cart, styled as a printed order ticket */}
        <div>
          <div className="ticket sticky top-4">
            <p className="mb-3 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-ink-400">
              ✂ Order Ticket ✂
            </p>
            <h2 className="mb-3 font-mono text-base font-bold text-ink-900">
              Current Order {itemCount > 0 && <span className="font-sans text-sm font-normal text-ink-500">({itemCount} items)</span>}
            </h2>

            {cart.length === 0 ? (
              <EmptyState>No items yet.</EmptyState>
            ) : (
              <ul className="mb-4 space-y-3">
                {cart.map((item) => (
                  <li key={item.product_id}>
                    <div className="ticket-line">
                      <span className="truncate text-sm font-medium text-ink-900">
                        {item.quantity}× {item.name}
                      </span>
                      <span className="fill" />
                      <span className="font-mono text-sm tabular-nums text-ink-800">
                        {formatCurrency(item.price * item.quantity)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1">
                      <button type="button" onClick={() => changeQuantity(item.product_id, -1)} className="btn-secondary px-2 py-0.5 text-xs">−</button>
                      <span className="w-6 text-center text-xs font-medium text-ink-600">{item.quantity}</span>
                      <button type="button" onClick={() => changeQuantity(item.product_id, 1)} className="btn-secondary px-2 py-0.5 text-xs">+</button>
                      <button type="button" onClick={() => removeItem(item.product_id)} className="ml-1 text-xs text-ink-400 hover:text-danger-500" aria-label={`Remove ${item.name}`}>remove</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="ticket-total">
              <span className="text-sm font-semibold uppercase tracking-wide text-ink-600">Total</span>
              <span className="font-mono text-2xl font-bold tabular-nums text-ink-900">{formatCurrency(total)}</span>
            </div>

            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setCart([])} disabled={cart.length === 0} className="btn-secondary flex-1">
                Clear
              </button>
              <button type="button" onClick={checkout} disabled={cart.length === 0 || submitting} className="btn-primary flex-[2]">
                {submitting ? 'Processing…' : 'Checkout'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
