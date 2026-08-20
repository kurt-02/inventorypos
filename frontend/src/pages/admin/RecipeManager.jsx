import { useState } from 'react';
import api, { errorMessage } from '../../utils/api';
import { useFetch } from '../../hooks/useApi';
import { formatQuantity } from '../../utils/format';
import { Alert, Spinner, PageHeader, Modal, EmptyState } from '../../components/Ui';

/**
 * Two panes: ingredients (the raw stock items) and per-product recipes
 * (how much of each ingredient a product consumes when sold).
 */
export default function RecipeManager() {
  const [tab, setTab] = useState('recipes');

  return (
    <div>
      <PageHeader title="Recipes & Ingredients" subtitle="Define what each product consumes from inventory." />

      <div className="mb-6 flex gap-2">
        <button type="button" onClick={() => setTab('recipes')} className={tab === 'recipes' ? 'btn-primary' : 'btn-secondary'}>
          Product recipes
        </button>
        <button type="button" onClick={() => setTab('ingredients')} className={tab === 'ingredients' ? 'btn-primary' : 'btn-secondary'}>
          Ingredients
        </button>
      </div>

      {tab === 'recipes' ? <RecipesPane /> : <IngredientsPane />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Product recipes
// ---------------------------------------------------------------------------
function RecipesPane() {
  const { data: productData } = useFetch('/products', { params: { include_inactive: 'true' } });
  const { data: ingredientData } = useFetch('/ingredients');
  const { data, loading, error, refetch } = useFetch('/recipes');

  const [modal, setModal] = useState(null); // null | { mode, recipe?, productId? }
  const [form, setForm] = useState({ product_id: '', ingredient_id: '', quantity: '', unit: '' });
  const [feedback, setFeedback] = useState(null);
  const [saving, setSaving] = useState(false);

  const products = productData?.products ?? [];
  const ingredients = ingredientData?.ingredients ?? [];
  const recipes = data?.recipes ?? [];

  // Group recipe rows by product so each product renders as one card.
  const byProduct = products.map((product) => ({
    product,
    lines: recipes.filter((r) => r.product_id === product.id),
  }));

  const openCreate = (productId) => {
    setForm({ product_id: String(productId ?? ''), ingredient_id: '', quantity: '', unit: '' });
    setModal({ mode: 'create' });
  };

  const openEdit = (recipe) => {
    setForm({
      product_id: String(recipe.product_id),
      ingredient_id: String(recipe.ingredient_id),
      quantity: String(recipe.quantity),
      unit: recipe.unit,
    });
    setModal({ mode: 'edit', recipe });
  };

  // Picking an ingredient pre-fills the unit from that ingredient's own unit,
  // so recipe units stay consistent with inventory units.
  const onIngredientChange = (value) => {
    const ingredient = ingredients.find((i) => String(i.id) === value);
    setForm((f) => ({ ...f, ingredient_id: value, unit: ingredient?.unit || f.unit }));
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.product_id || !form.ingredient_id || form.quantity === '' || !form.unit) {
      setFeedback({ type: 'error', text: 'Product, ingredient, quantity and unit are all required.' });
      return;
    }
    setSaving(true);
    try {
      if (modal.mode === 'create') {
        await api.post('/recipes', {
          product_id: Number(form.product_id),
          ingredient_id: Number(form.ingredient_id),
          quantity: Number(form.quantity),
          unit: form.unit,
        });
        setFeedback({ type: 'success', text: 'Recipe line added.' });
      } else {
        await api.put(`/recipes/${modal.recipe.id}`, {
          quantity: Number(form.quantity),
          unit: form.unit,
        });
        setFeedback({ type: 'success', text: 'Recipe line updated.' });
      }
      setModal(null);
      refetch();
    } catch (err) {
      setFeedback({ type: 'error', text: errorMessage(err, 'Could not save the recipe line.') });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (recipe) => {
    if (!window.confirm(`Remove ${recipe.ingredient_name} from ${recipe.product_name}?`)) return;
    try {
      await api.delete(`/recipes/${recipe.id}`);
      setFeedback({ type: 'success', text: 'Recipe line removed.' });
      refetch();
    } catch (err) {
      setFeedback({ type: 'error', text: errorMessage(err, 'Could not remove the recipe line.') });
    }
  };

  if (loading) return <Spinner label="Loading recipes…" />;

  return (
    <div>
      {error && <Alert>{error}</Alert>}
      {feedback && <Alert type={feedback.type} onDismiss={() => setFeedback(null)}>{feedback.text}</Alert>}

      <div className="mb-4">
        <button type="button" onClick={() => openCreate()} className="btn-primary">+ Add recipe line</button>
      </div>

      {byProduct.length === 0 ? (
        <EmptyState>No products yet — create one first.</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {byProduct.map(({ product, lines }) => (
            <div key={product.id} className="card">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-mono text-sm font-bold text-ink-900">
                  {product.name}
                  {!product.is_active && <span className="ml-2 text-xs text-danger-500">(inactive)</span>}
                </h3>
                <button type="button" onClick={() => openCreate(product.id)} className="btn-secondary px-3 py-1">+ Add</button>
              </div>
              {lines.length === 0 ? (
                <p className="text-sm text-ink-500">
                  No recipe defined — selling this product will not deduct any inventory.
                </p>
              ) : (
                <ul className="divide-y divide-ink-100 text-sm">
                  {lines.map((line) => (
                    <li key={line.id} className="flex items-center justify-between gap-2 py-2">
                      <span>{line.ingredient_name}</span>
                      <span className="flex items-center gap-2">
                        <span className="font-mono tabular-nums text-ink-600">
                          {formatQuantity(line.quantity)} {line.unit}
                        </span>
                        <button type="button" onClick={() => openEdit(line)} className="text-ink-500 hover:text-ink-800">Edit</button>
                        <button type="button" onClick={() => remove(line)} className="text-ink-400 hover:text-danger-500">×</button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal
          title={modal.mode === 'create' ? 'Add recipe line' : 'Edit recipe line'}
          onClose={() => setModal(null)}
          footer={
            <>
              <button type="button" onClick={() => setModal(null)} className="btn-secondary">Cancel</button>
              <button type="submit" form="recipe-form" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <form id="recipe-form" onSubmit={save} className="space-y-4">
            <div>
              <label className="label" htmlFor="r-product">Product</label>
              <select id="r-product" className="input" value={form.product_id} disabled={modal.mode === 'edit'}
                onChange={(e) => setForm({ ...form, product_id: e.target.value })} required>
                <option value="">Select a product…</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="r-ingredient">Ingredient</label>
              <select id="r-ingredient" className="input" value={form.ingredient_id} disabled={modal.mode === 'edit'}
                onChange={(e) => onIngredientChange(e.target.value)} required>
                <option value="">Select an ingredient…</option>
                {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="r-qty">Quantity per unit sold</label>
                <input id="r-qty" type="number" step="0.001" min="0" className="input" value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
              </div>
              <div>
                <label className="label" htmlFor="r-unit">Unit</label>
                <input id="r-unit" className="input" value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })} required />
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ingredients
// ---------------------------------------------------------------------------
const EMPTY_INGREDIENT = { name: '', unit: '', category: '', low_stock_threshold: '0' };

function IngredientsPane() {
  const { data, loading, error, refetch } = useFetch('/ingredients');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_INGREDIENT);
  const [feedback, setFeedback] = useState(null);
  const [saving, setSaving] = useState(false);

  const ingredients = data?.ingredients ?? [];

  const openCreate = () => {
    setForm(EMPTY_INGREDIENT);
    setModal({ mode: 'create' });
  };

  const openEdit = (ingredient) => {
    setForm({
      name: ingredient.name,
      unit: ingredient.unit,
      category: ingredient.category,
      low_stock_threshold: String(ingredient.low_stock_threshold ?? 0),
    });
    setModal({ mode: 'edit', ingredient });
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.unit.trim()) {
      setFeedback({ type: 'error', text: 'Name and unit are required.' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        unit: form.unit.trim(),
        category: form.category.trim() || 'General',
        low_stock_threshold: Number(form.low_stock_threshold) || 0,
      };
      if (modal.mode === 'create') {
        await api.post('/ingredients', payload);
        setFeedback({ type: 'success', text: `Added "${payload.name}" and seeded it at 0 for both branches.` });
      } else {
        await api.put(`/ingredients/${modal.ingredient.id}`, payload);
        setFeedback({ type: 'success', text: `Updated "${payload.name}".` });
      }
      setModal(null);
      refetch();
    } catch (err) {
      setFeedback({ type: 'error', text: errorMessage(err, 'Could not save the ingredient.') });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (ingredient) => {
    if (!window.confirm(
      `Delete "${ingredient.name}"? This also removes it from every recipe and both branches' inventory.`
    )) return;
    try {
      await api.delete(`/ingredients/${ingredient.id}`);
      setFeedback({ type: 'success', text: `Deleted "${ingredient.name}".` });
      refetch();
    } catch (err) {
      setFeedback({ type: 'error', text: errorMessage(err, 'Could not delete the ingredient.') });
    }
  };

  if (loading) return <Spinner label="Loading ingredients…" />;

  return (
    <div>
      {error && <Alert>{error}</Alert>}
      {feedback && <Alert type={feedback.type} onDismiss={() => setFeedback(null)}>{feedback.text}</Alert>}

      <div className="mb-4">
        <button type="button" onClick={openCreate} className="btn-primary">+ New ingredient</button>
      </div>

      <div className="card overflow-x-auto">
        {ingredients.length === 0 ? (
          <EmptyState>No ingredients yet.</EmptyState>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Unit</th>
                <th className="text-right">Low-stock threshold</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {ingredients.map((ingredient) => (
                <tr key={ingredient.id}>
                  <td className="font-medium">{ingredient.name}</td>
                  <td className="text-ink-600">{ingredient.category}</td>
                  <td className="text-ink-600">{ingredient.unit}</td>
                  <td className="text-right font-mono tabular-nums">{formatQuantity(ingredient.low_stock_threshold)}</td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => openEdit(ingredient)} className="btn-secondary px-3 py-1">Edit</button>
                      <button type="button" onClick={() => remove(ingredient)} className="btn-danger px-3 py-1">Delete</button>
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
          title={modal.mode === 'create' ? 'New ingredient' : `Edit ${modal.ingredient.name}`}
          onClose={() => setModal(null)}
          footer={
            <>
              <button type="button" onClick={() => setModal(null)} className="btn-secondary">Cancel</button>
              <button type="submit" form="ingredient-form" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <form id="ingredient-form" onSubmit={save} className="space-y-4">
            <div>
              <label className="label" htmlFor="i-name">Name</label>
              <input id="i-name" className="input" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="i-unit">Unit</label>
                <input id="i-unit" className="input" placeholder="g, ml, pcs" value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })} required />
              </div>
              <div>
                <label className="label" htmlFor="i-category">Category</label>
                <input id="i-category" className="input" value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="i-threshold">Low-stock threshold</label>
              <input id="i-threshold" type="number" step="0.001" min="0" className="input"
                value={form.low_stock_threshold}
                onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} />
              <p className="mt-1 text-xs text-ink-500">
                Stock at or below this level is flagged as low in reports and on the inventory screens.
              </p>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
