import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Archive, ArrowDown, Check, ChevronDown, ChevronUp, ClipboardList, LoaderCircle, Pencil, Plus, ReceiptText, Search, ShoppingBasket, Store, Trash2, X } from 'lucide-react';
import { api, type ShoppingReceiptInput } from './api';
import { confirmAction, showError, showSuccess } from './alerts';
import type { Category, ProductComparison, ShoppingDimension, ShoppingListItem, ShoppingProduct, ShoppingReceipt, ShoppingUnit, SpaceMember, Supermarket } from './types';
import type { PriceHistoryLine, PriceHistoryRow } from './ChartVisualizations';

type Section = 'receipts' | 'list' | 'compare' | 'catalog';
type ReceiptLineDraft = { key: string; productId: string; productQuery: string; brand: string; packageLabel: string; unitsPurchased: string; quantity: string; unit: ShoppingUnit; amount: string; prefilledDate: string };
const PriceHistoryChart = lazy(() => import('./ChartVisualizations').then((module) => ({ default: module.PriceHistoryChart })));
const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const dateToday = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
const commonSupermarkets = ['Mercadona', 'Lidl', 'Carrefour', 'DIA', 'Alcampo', 'Eroski', 'Consum', 'Aldi', 'El Corte Inglés', 'Ahorramás'];
const unitOptions: Array<{ value: ShoppingUnit; label: string; dimension: ShoppingDimension }> = [
  { value: 'g', label: 'g', dimension: 'WEIGHT' }, { value: 'kg', label: 'kg', dimension: 'WEIGHT' },
  { value: 'ml', label: 'ml', dimension: 'VOLUME' }, { value: 'l', label: 'l', dimension: 'VOLUME' },
  { value: 'unit', label: 'unidad', dimension: 'COUNT' },
];
const palette = ['#7868d5', '#34a98a', '#ef8b79', '#438ac7', '#d2a440', '#be70a4', '#508c87', '#817164'];
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
const quantityUnit = (dimension: ShoppingDimension | null): ShoppingUnit => dimension === 'VOLUME' ? 'ml' : dimension === 'COUNT' ? 'unit' : 'g';
const unitLabel = (dimension: ShoppingDimension | null) => dimension === 'WEIGHT' ? '€/kg' : dimension === 'VOLUME' ? '€/l' : dimension === 'COUNT' ? '€/unidad' : '';
const dimensionLabel = (dimension: ShoppingDimension | null) => dimension === 'WEIGHT' ? 'Peso' : dimension === 'VOLUME' ? 'Volumen' : dimension === 'COUNT' ? 'Unidades' : 'Pendiente de primera compra';
const baseQuantity = (quantity: number, unit: ShoppingUnit) => unit === 'kg' || unit === 'l' ? quantity * 1000 : quantity;
const fromBaseQuantity = (quantity: number, unit: ShoppingUnit) => unit === 'kg' || unit === 'l' ? quantity / 1000 : quantity;
const cents = (value: number) => Math.round(value * 100);
const quantityFormat = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 });
const moneyText = (value: number | string) => euro.format(Number(value));
const formatDate = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

export default function ShoppingPanel({ categories, onFinancialChange, isCoLife, members, currentUserId }: { categories: Category[]; onFinancialChange: () => void; isCoLife: boolean; members: SpaceMember[]; currentUserId: string }) {
  const [section, setSection] = useState<Section>('receipts');
  const [products, setProducts] = useState<ShoppingProduct[]>([]);
  const [supermarkets, setSupermarkets] = useState<Supermarket[]>([]);
  const [receipts, setReceipts] = useState<ShoppingReceipt[]>([]);
  const [listItems, setListItems] = useState<ShoppingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingReceipt, setEditingReceipt] = useState<ShoppingReceipt | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setProducts([]);
    setSupermarkets([]);
    setReceipts([]);
    setListItems([]);
    setEditingReceipt(null);
    try {
      const [nextProducts, nextStores, nextReceipts, nextList] = await Promise.all([
        api.shoppingProducts('', true), api.supermarkets(true), api.shoppingReceipts(), api.shoppingList(),
      ]);
      setProducts(nextProducts);
      setSupermarkets(nextStores);
      setReceipts(nextReceipts);
      setListItems(nextList);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudieron cargar los datos de Compras.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function createProduct(name: string) {
    const product = await api.createShoppingProduct(name);
    setProducts((current) => [...current.filter((item) => item.id !== product.id), product].sort((a, b) => a.name.localeCompare(b.name, 'es')));
    return product;
  }

  async function saveReceipt(input: ShoppingReceiptInput) {
    if (editingReceipt) await api.updateShoppingReceipt(editingReceipt.id, input);
    else await api.createShoppingReceipt(input);
    setEditingReceipt(null);
    showSuccess(editingReceipt ? 'Ticket actualizado y gasto sincronizado.' : 'Ticket guardado y añadido a tus movimientos.');
    await load();
    onFinancialChange();
  }

  async function deleteReceipt(receipt: ShoppingReceipt) {
    if (!await confirmAction('¿Eliminar este ticket?', `Se eliminará también el movimiento de ${moneyText(receipt.totalAmount)}. Esta acción no se puede deshacer.`)) return;
    try {
      await api.deleteShoppingReceipt(receipt.id);
      showSuccess('Ticket y movimiento eliminados.');
      await load();
      onFinancialChange();
    } catch (reason) { showError(reason instanceof Error ? reason.message : 'No se pudo eliminar el ticket.'); }
  }

  async function archiveProduct(product: ShoppingProduct) {
    const message = product.active
      ? 'El producto dejará de aparecer en sugerencias y en la lista, pero se conservarán sus compras e historial.'
      : 'El producto volverá a estar disponible en las sugerencias.';
    if (product.active && !await confirmAction(`¿Archivar «${product.name}»?`, message, 'Archivar')) return;
    try {
      if (product.active) await api.updateShoppingProduct(product.id, { active: false });
      else await api.updateShoppingProduct(product.id, { active: true });
      await load();
      showSuccess(product.active ? 'Producto archivado.' : 'Producto restaurado.');
    } catch (reason) { showError(reason instanceof Error ? reason.message : 'No se pudo actualizar el producto.'); }
  }

  async function archiveStore(store: Supermarket) {
    try {
      await api.updateSupermarket(store.id, { active: !store.active });
      await load();
      showSuccess(store.active ? 'Supermercado archivado.' : 'Supermercado restaurado.');
    } catch (reason) { showError(reason instanceof Error ? reason.message : 'No se pudo actualizar el supermercado.'); }
  }

  const sections: Array<{ id: Section; label: string; icon: typeof ReceiptText }> = [
    { id: 'receipts', label: 'Tickets', icon: ReceiptText }, { id: 'list', label: 'Lista', icon: ClipboardList },
    { id: 'compare', label: 'Comparador', icon: ShoppingBasket }, { id: 'catalog', label: 'Catálogo', icon: Store },
  ];

  return <section className="shopping-module">
    <div className="shopping-tabs" role="tablist" aria-label="Apartados de compras">
      {sections.map(({ id, label, icon: Icon }) => <button key={id} role="tab" aria-selected={section === id} className={section === id ? 'shopping-tab active' : 'shopping-tab'} onClick={() => setSection(id)}><Icon size={16} />{label}</button>)}
    </div>
    {error && <div className="shopping-error" role="alert"><strong>No se pudieron cargar las compras.</strong><span>{error}</span><button className="button button-small" onClick={() => { setLoading(true); void load(); }}>Reintentar</button></div>}
    {loading ? <div className="shopping-loading"><LoaderCircle className="spin" size={22} /> Cargando compras…</div> : <>
      {section === 'receipts' && <ReceiptsView receipts={receipts} categories={categories} products={products.filter((item) => item.active)} supermarkets={supermarkets.filter((item) => item.active)} editing={editingReceipt} isCoLife={isCoLife} members={members} currentUserId={currentUserId} onEdit={setEditingReceipt} onCancelEdit={() => setEditingReceipt(null)} onSave={saveReceipt} onDelete={(receipt) => void deleteReceipt(receipt)} onCreateProduct={createProduct} />}
      {section === 'list' && <ShoppingListView items={listItems} products={products.filter((item) => item.active)} onCreateProduct={createProduct} onReload={load} />}
      {section === 'compare' && <CompareView products={products.filter((item) => item.active)} />}
      {section === 'catalog' && <CatalogView products={products} supermarkets={supermarkets} onCreateProduct={createProduct} onReload={load} onArchiveProduct={(product) => void archiveProduct(product)} onArchiveStore={(store) => void archiveStore(store)} />}
    </>}
  </section>;
}

function ReceiptsView({ receipts, categories, products, supermarkets, editing, isCoLife, members, currentUserId, onEdit, onCancelEdit, onSave, onDelete, onCreateProduct }: {
  receipts: ShoppingReceipt[]; categories: Category[]; products: ShoppingProduct[]; supermarkets: Supermarket[]; editing: ShoppingReceipt | null;
  isCoLife: boolean; members: SpaceMember[]; currentUserId: string;
  onEdit: (receipt: ShoppingReceipt) => void; onCancelEdit: () => void; onSave: (input: ShoppingReceiptInput) => Promise<void>;
  onDelete: (receipt: ShoppingReceipt) => void; onCreateProduct: (name: string) => Promise<ShoppingProduct>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  useEffect(() => { if (editing) setFormOpen(true); }, [editing]);
  return <>
    <div className="shopping-section-heading"><div><h2>Tickets de compra</h2><p>Cada ticket se registra como un único gasto por el total final.</p></div><button className="button button-primary" onClick={() => { onCancelEdit(); setFormOpen(true); }}><Plus size={16} /> Añadir ticket</button></div>
    {formOpen && <ReceiptForm key={editing?.id ?? 'new'} categories={categories} products={products} supermarkets={supermarkets} initial={editing} isCoLife={isCoLife} members={members} currentUserId={currentUserId} onSave={onSave} onCreateProduct={onCreateProduct} onCancel={() => { setFormOpen(false); onCancelEdit(); }} />}
    {receipts.length ? <div className="shopping-receipt-list">{receipts.map((receipt) => <article className="shopping-receipt-card" key={receipt.id}>
      <button className="shopping-receipt-summary" onClick={() => setExpanded(expanded === receipt.id ? null : receipt.id)} aria-expanded={expanded === receipt.id}>
        <span className="shopping-store-mark"><Store size={17} /></span><span className="shopping-receipt-main"><strong>{receipt.supermarket.name}</strong><small>{formatDate(receipt.date)} · {receipt.items.length} {receipt.items.length === 1 ? 'producto' : 'productos'}</small></span>
        <strong className="shopping-receipt-total">{moneyText(receipt.totalAmount)}</strong>{expanded === receipt.id ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
      </button>
        {expanded === receipt.id && <div className="shopping-receipt-details"><div className="receipt-item-table">{receipt.items.map((item) => <div className="receipt-item-row" key={item.id}><span>{item.product.name}<small>{[item.variant.brand, item.variant.packageLabel].filter(Boolean).join(' · ') || 'Sin marca indicada'}</small></span><span>{item.unitsPurchased} × {quantityFormat.format(fromBaseQuantity(Number(item.quantityBase) / item.unitsPurchased, item.unit))} {item.unit === 'unit' ? 'ud.' : item.unit}</span><strong>{moneyText(item.amount)}</strong></div>)}</div><div className="receipt-totals"><span>Ajuste</span><strong>{moneyText(receipt.adjustment)}</strong><span>Total enlazado a movimientos</span><strong>{moneyText(receipt.financialEntry.amount)}</strong></div><div className="shopping-row-actions"><span>Categoría: {receipt.financialEntry.category.name}</span><button className="button button-small button-soft" onClick={() => onEdit(receipt)}><Pencil size={14} /> Editar</button><button className="button button-small shopping-danger" onClick={() => onDelete(receipt)}><Trash2 size={14} /> Eliminar</button></div></div>}
    </article>)}</div> : !formOpen && <EmptyShopping icon={<ReceiptText size={22} />} title="Aún no hay tickets" text="Registra tu primera compra para empezar a comparar precios." action="Añadir ticket" onAction={() => setFormOpen(true)} />}
  </>;
}

function ReceiptForm({ categories, products, supermarkets, initial, isCoLife, members, currentUserId, onSave, onCreateProduct, onCancel }: {
  categories: Category[]; products: ShoppingProduct[]; supermarkets: Supermarket[]; initial: ShoppingReceipt | null;
  isCoLife: boolean; members: SpaceMember[]; currentUserId: string;
  onSave: (input: ShoppingReceiptInput) => Promise<void>; onCreateProduct: (name: string) => Promise<ShoppingProduct>; onCancel: () => void;
}) {
  const defaultCategory = categories.find((category) => category.type === 'EXPENSE' && normalized(category.name) === 'alimentacion')?.id ?? categories.find((category) => category.type === 'EXPENSE')?.id ?? '';
  const [storeName, setStoreName] = useState(initial?.supermarket.name ?? '');
  const [categoryId, setCategoryId] = useState(initial?.financialEntry.categoryId ?? defaultCategory);
  const [date, setDate] = useState(initial?.date.slice(0, 10) ?? dateToday());
  const [adjustment, setAdjustment] = useState(initial ? String(initial.adjustment) : '0');
  const [participantIds, setParticipantIds] = useState<string[]>(initial?.financialEntry.shares?.map(({ userId }) => userId) ?? [currentUserId]);
  const [lines, setLines] = useState<ReceiptLineDraft[]>(() => initial?.items.map((item) => {
    const unit = item.unit;
    return { key: item.id, productId: item.productId, productQuery: item.product.name, brand: item.variant.brand ?? '', packageLabel: item.variant.packageLabel ?? '', unitsPurchased: String(item.unitsPurchased), quantity: String(fromBaseQuantity(Number(item.quantityBase) / item.unitsPurchased, unit)), unit, amount: String(item.amount), prefilledDate: '' };
  }) ?? [newLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lineTotalCents = lines.reduce((sum, line) => sum + (Number.isFinite(Number(line.amount)) ? cents(Number(line.amount)) : 0), 0);
  const adjustmentCents = Number.isFinite(Number(adjustment)) ? cents(Number(adjustment)) : 0;
  const totalCents = lineTotalCents + adjustmentCents;

  function updateLine(key: string, patch: Partial<ReceiptLineDraft>) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (lines.some((line) => !line.productId)) throw new Error('Selecciona un producto existente o créalo antes de guardar el ticket.');
      if (lines.some((line) => !Number.isInteger(Number(line.unitsPurchased)) || Number(line.unitsPurchased) < 1)) throw new Error('El número de unidades compradas debe ser un entero mayor que cero.');
      if (lines.some((line) => !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0 || (line.unit === 'unit' && !Number.isInteger(Number(line.quantity))))) throw new Error('Revisa las cantidades: deben ser mayores que cero y las unidades, números enteros.');
      if (lines.some((line) => !Number.isFinite(Number(line.amount)) || Number(line.amount) <= 0 || Math.abs(cents(Number(line.amount)) - Number(line.amount) * 100) > 0.00001)) throw new Error('Cada precio debe ser mayor que cero y tener como máximo dos decimales.');
      if (!Number.isFinite(Number(adjustment)) || Math.abs(Number(adjustment)) > 9999999999.99) throw new Error('El ajuste debe ser un importe válido.');
      if (isCoLife && participantIds.length === 0) throw new Error('Selecciona al menos un participante para repartir este ticket.');
      const input: ShoppingReceiptInput = {
        supermarketName: storeName.trim(), categoryId, date, adjustment: adjustmentCents / 100,
        ...(isCoLife ? { splitMode: 'EQUAL' as const, participants: participantIds.map((userId) => ({ userId })) } : {}),
        items: lines.map((line) => ({ productId: line.productId, brand: line.brand.trim() || undefined, packageLabel: line.packageLabel.trim() || undefined, unitsPurchased: Number(line.unitsPurchased), quantity: Number(line.quantity), unit: line.unit, amount: Number(line.amount) })),
      };
      if (totalCents <= 0) throw new Error('El total final del ticket debe ser mayor que cero.');
      await onSave(input);
      onCancel();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar el ticket.'); }
    finally { setBusy(false); }
  }

  return <form className="shopping-receipt-form" onSubmit={(event) => void submit(event)}>
    <div className="shopping-form-title"><div><span className="shopping-kicker">{initial ? 'EDITAR REGISTRO' : 'NUEVO REGISTRO'}</span><h3>{initial ? 'Editar ticket' : 'Registrar compra'}</h3><p>Completa la tienda y añade cada producto una sola vez.</p></div><div className="receipt-form-heading-end"><span className="receipt-form-line-count">{lines.length} {lines.length === 1 ? 'línea' : 'líneas'}</span><button className="icon-button" type="button" onClick={onCancel} aria-label="Cerrar formulario"><X size={18} /></button></div></div>
    <div className="receipt-form-section-label"><span>01</span><div><strong>Datos de la compra</strong><small>La fecha y la categoría se asociarán al gasto del ticket.</small></div></div>
    <div className="shopping-form-grid"><label className="form-field">Supermercado<input list="supermarket-suggestions" required maxLength={80} value={storeName} onChange={(event) => setStoreName(event.target.value)} placeholder="Ej. Mercadona" /><datalist id="supermarket-suggestions">{[...new Set([...commonSupermarkets, ...supermarkets.map((item) => item.name)])].map((name) => <option key={name} value={name} />)}</datalist></label><label className="form-field">Fecha<input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></label><label className="form-field">Categoría del gasto<select required value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{categories.filter((category) => category.type === 'EXPENSE').map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label></div>
    {isCoLife && <fieldset className="shared-participants"><legend>Repartir el total por igual entre</legend>{members.map(({ user }) => <label key={user.id}><input type="checkbox" checked={participantIds.includes(user.id)} onChange={(event) => setParticipantIds((current) => event.target.checked ? [...current, user.id] : current.filter((id) => id !== user.id))} />{user.displayName ?? user.email}</label>)}</fieldset>}
    <div className="shopping-lines-heading"><div className="receipt-form-section-label"><span>02</span><div><h4>Productos</h4><small>Elige una marca guardada para recuperar sus datos de la última compra.</small></div></div><button className="button button-small button-soft" type="button" onClick={() => setLines((current) => [...current, newLine()])}><Plus size={14} /> Añadir producto</button></div>
    <div className="shopping-line-list">{lines.map((line, index) => <ReceiptLine key={line.key} index={index} line={line} products={products} onChange={(patch) => updateLine(line.key, patch)} onRemove={() => setLines((current) => current.length > 1 ? current.filter((item) => item.key !== line.key) : current)} onCreateProduct={onCreateProduct} />)}</div>
    <div className="shopping-adjustment-row"><label className="form-field">Ajuste final (+ cargo / − descuento)<input type="number" step="0.01" value={adjustment} onChange={(event) => setAdjustment(event.target.value)} /></label><div className="shopping-totals"><span>Subtotal de productos</span><strong>{euro.format(lineTotalCents / 100)}</strong><span>Total del movimiento</span><strong className="shopping-grand-total">{euro.format(totalCents / 100)}</strong></div></div>
    <p className="shopping-form-hint">Indica la cantidad contenida en cada unidad y el número de unidades compradas. El precio es el total pagado por todas ellas; se guardará un único movimiento confirmado en la categoría elegida.</p>
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="form-actions"><button className="button button-soft" type="button" onClick={onCancel}>Cancelar</button><button className="button button-primary" type="submit" disabled={busy || categories.every((category) => category.type !== 'EXPENSE')}>{busy && <LoaderCircle size={15} className="spin" />}{initial ? 'Guardar cambios' : 'Guardar ticket y gasto'}</button></div>
  </form>;
}

function newLine(): ReceiptLineDraft { return { key: crypto.randomUUID(), productId: '', productQuery: '', brand: '', packageLabel: '', unitsPurchased: '1', quantity: '', unit: 'g', amount: '', prefilledDate: '' }; }

function ReceiptLine({ index, line, products, onChange, onRemove, onCreateProduct }: {
  index: number; line: ReceiptLineDraft; products: ShoppingProduct[]; onChange: (patch: Partial<ReceiptLineDraft>) => void;
  onRemove: () => void; onCreateProduct: (name: string) => Promise<ShoppingProduct>;
}) {
  const selectedProduct = products.find((product) => product.id === line.productId);
  const searchText = line.productQuery || selectedProduct?.name || '';
  const matchingProducts = products.filter((product) => product.active && normalized(product.name).includes(normalized(searchText))).slice(0, 6);
  const exactMatch = products.find((product) => normalized(product.name) === normalized(searchText));
  const allowedUnits = unitOptions.filter((option) => !selectedProduct?.dimension || option.dimension === selectedProduct.dimension);
  const unitChoices = allowedUnits.length ? allowedUnits : unitOptions;
  const variants = selectedProduct?.variants ?? [];
  const isCountedProduct = line.unit === 'unit';
  function chooseProduct(product: ShoppingProduct) {
    onChange({ productId: product.id, productQuery: product.name, brand: '', packageLabel: '', unitsPurchased: '1', quantity: '', unit: quantityUnit(product.dimension), amount: '', prefilledDate: '' });
  }
  function chooseVariant(variant: NonNullable<ShoppingProduct['variants']>[number]) {
    const lastPurchase = variant.latestPurchase;
    if (!lastPurchase) {
      onChange({ brand: variant.brand ?? '', packageLabel: variant.packageLabel ?? '', prefilledDate: '' });
      return;
    }
    onChange({
      brand: variant.brand ?? '',
      packageLabel: variant.packageLabel ?? '',
      unitsPurchased: String(lastPurchase.unitsPurchased),
      quantity: String(fromBaseQuantity(lastPurchase.quantityBase / lastPurchase.unitsPurchased, lastPurchase.unit)),
      unit: lastPurchase.unit,
      amount: String(lastPurchase.amount),
      prefilledDate: lastPurchase.date.slice(0, 10),
    });
  }
  function changeBrand(value: string) {
    const matchingVariants = variants.filter((variant) => normalized(variant.brand ?? '') === normalized(value));
    const mostRecent = matchingVariants.sort((a, b) => (b.latestPurchase?.date ?? '').localeCompare(a.latestPurchase?.date ?? ''))[0];
    if (mostRecent && value.trim()) chooseVariant(mostRecent);
    else onChange({ brand: value, prefilledDate: '' });
  }
  async function makeProduct() {
    if (!searchText.trim() || exactMatch) return;
    try {
      const product = await onCreateProduct(searchText.trim());
      chooseProduct(product);
    } catch (reason) { showError(reason instanceof Error ? reason.message : 'No se pudo crear el producto.'); }
  }
  return <article className="shopping-line-card">
    <div className="shopping-line-head"><span>Línea {index + 1}</span><button className="icon-button shopping-remove-line" type="button" onClick={onRemove} aria-label={`Quitar línea ${index + 1}`}><X size={15} /></button></div>
    <div className="shopping-line-grid">
      <div className="form-field product-picker"><label htmlFor={`line-product-${line.key}`}>Producto</label><input id={`line-product-${line.key}`} value={searchText} onChange={(event) => onChange({ productId: '', productQuery: event.target.value, brand: '', packageLabel: '', unitsPurchased: '1', quantity: '', amount: '', prefilledDate: '' })} placeholder="Busca un producto…" autoComplete="off" />
        {searchText && !selectedProduct && <div className="product-suggestions">{matchingProducts.map((product) => <button key={product.id} type="button" onClick={() => chooseProduct(product)}><strong>{product.name}</strong><small>{product.variants?.length ? `${product.variants.length} marcas/formato` : dimensionLabel(product.dimension)}</small></button>)}{!exactMatch && searchText.trim().length > 1 && <button className="suggestion-create" type="button" onClick={() => void makeProduct()}><Plus size={14} /> Crear «{searchText.trim()}»</button>}</div>}
      </div>
      <label className="form-field">Marca (opcional)<input list={`brand-suggestions-${line.key}`} maxLength={80} value={line.brand} onChange={(event) => changeBrand(event.target.value)} placeholder={selectedProduct ? 'Escribe o elige una marca' : 'Primero elige producto'} disabled={!selectedProduct} /><datalist id={`brand-suggestions-${line.key}`}>{[...new Set(variants.map((variant) => variant.brand).filter((brand): brand is string => Boolean(brand)))].map((brand) => <option key={brand} value={brand} />)}</datalist></label>
      <label className="form-field">Formato (opcional)<input maxLength={100} value={line.packageLabel} onChange={(event) => onChange({ packageLabel: event.target.value })} placeholder="Ej. 2 × 250 g" /></label>
      <label className="form-field">{isCountedProduct ? 'Unidades compradas' : 'Envases comprados'}<input type="number" required min="1" max="999999" step="1" value={line.unitsPurchased} onChange={(event) => onChange({ unitsPurchased: event.target.value })} placeholder="1" /></label>
      <label className="form-field">{isCountedProduct ? 'Unidades por envase' : 'Contenido por envase'}<input type="number" required min={isCountedProduct ? '1' : '0.001'} max="999999" step={isCountedProduct ? '1' : '0.001'} value={line.quantity} onChange={(event) => onChange({ quantity: event.target.value })} placeholder={isCountedProduct ? '1' : '500'} /></label>
      <label className="form-field">Unidad<select value={line.unit} onChange={(event) => onChange({ unit: event.target.value as ShoppingUnit })}>{unitChoices.map((unit) => <option value={unit.value} key={unit.value}>{unit.label}</option>)}</select></label>
      <label className="form-field">Precio total de línea (€)<input type="number" required min="0.01" max="9999999999.99" step="0.01" value={line.amount} onChange={(event) => onChange({ amount: event.target.value })} placeholder="0,00" /></label>
      {variants.length > 0 && <div className="brand-recommendations"><span>Marcas y formatos guardados</span><div>{variants.map((variant) => <button type="button" key={variant.id} className={line.brand === (variant.brand ?? '') && line.packageLabel === (variant.packageLabel ?? '') ? 'brand-chip selected' : 'brand-chip'} onClick={() => chooseVariant(variant)}><strong>{variant.brand || 'Sin marca'}</strong>{variant.packageLabel && <small>{variant.packageLabel}</small>}{variant.latestPurchase && <em>{moneyText(variant.latestPurchase.amount)} · {formatDate(variant.latestPurchase.date)}</em>}</button>)}</div></div>}
      {line.prefilledDate && <div className="variant-prefill-note"><Check size={14} /><span>Datos de la última compra cargados ({formatDate(line.prefilledDate)}). Comprueba el precio y ajústalo si ha cambiado.</span></div>}
      {line.quantity && line.amount && Number(line.quantity) > 0 && Number(line.unitsPurchased) > 0 && <span className="line-unit-price">Precio comparable: {euro.format(line.unit === 'unit' ? Number(line.amount) / (Number(line.quantity) * Number(line.unitsPurchased)) : Number(line.amount) * 1000 / (baseQuantity(Number(line.quantity), line.unit) * Number(line.unitsPurchased)))} {line.unit === 'unit' ? '€/unidad' : line.unit === 'kg' || line.unit === 'g' ? '€/kg' : '€/l'}</span>}
    </div>
  </article>;
}

function ShoppingListView({ items, products, onCreateProduct, onReload }: { items: ShoppingListItem[]; products: ShoppingProduct[]; onCreateProduct: (name: string) => Promise<ShoppingProduct>; onReload: () => Promise<void> }) {
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [comparisons, setComparisons] = useState<Record<string, ProductComparison>>({});
  const [busy, setBusy] = useState(false);
  const matching = products.filter((product) => normalized(product.name).includes(normalized(query))).slice(0, 8);
  const exactMatch = products.find((product) => normalized(product.name) === normalized(query));

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    try {
      let productId = selectedId;
      if (!productId && query.trim()) {
        if (exactMatch) productId = exactMatch.id;
        else productId = (await onCreateProduct(query.trim())).id;
      }
      if (!productId) return;
      await api.addShoppingListItem(productId, note.trim() || undefined);
      setQuery(''); setNote(''); setSelectedId('');
      await onReload();
      showSuccess('Producto añadido a la lista.');
    } catch (reason) { showError(reason instanceof Error ? reason.message : 'No se pudo añadir a la lista.'); }
    finally { setBusy(false); }
  }

  async function markBought(item: ShoppingListItem) {
    try { await api.removeShoppingListItem(item.id); await onReload(); showSuccess('Producto quitado de la lista. El catálogo y el historial de precios se conservan.'); }
    catch (reason) { showError(reason instanceof Error ? reason.message : 'No se pudo actualizar la lista.'); }
  }

  async function toggleRecommendation(item: ShoppingListItem) {
    if (expandedId === item.id) { setExpandedId(null); return; }
    setExpandedId(item.id);
    if (comparisons[item.productId]) return;
    try { const data = await api.productComparison(item.productId); setComparisons((current) => ({ ...current, [item.productId]: data })); }
    catch (reason) { showError(reason instanceof Error ? reason.message : 'No se pudieron cargar los precios.'); }
  }

  return <>
    <div className="shopping-section-heading"><div><h2>Mi lista de la compra</h2><p>Al marcarlo como comprado desaparecerá de pendientes; registra el ticket por separado para guardar precio.</p></div><span className="shopping-count">{items.length} {items.length === 1 ? 'pendiente' : 'pendientes'}</span></div>
    <form className="shopping-list-add" onSubmit={(event) => void addItem(event)}><div className="product-picker form-field"><label htmlFor="shopping-list-product">Añadir producto</label><input id="shopping-list-product" value={query} onChange={(event) => { setQuery(event.target.value); setSelectedId(''); }} placeholder="Ej. queso cottage" autoComplete="off" />{query && !selectedId && <div className="product-suggestions">{matching.map((product) => <button type="button" key={product.id} onClick={() => { setSelectedId(product.id); setQuery(product.name); }}><strong>{product.name}</strong><small>{product.variants?.length ?? 0} marcas registradas</small></button>)}{!exactMatch && query.trim().length > 1 && <button className="suggestion-create" type="button" onClick={async () => { try { const product = await onCreateProduct(query.trim()); setSelectedId(product.id); setQuery(product.name); } catch (reason) { showError(reason instanceof Error ? reason.message : 'No se pudo crear el producto.'); } }}><Plus size={14} /> Crear producto genérico «{query.trim()}»</button>}</div>}</div><label className="form-field">Nota opcional<input maxLength={160} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ej. comprar dos" /></label><button className="button button-primary" disabled={busy || !query.trim()}><Plus size={15} /> Añadir a la lista</button></form>
    {items.length ? <div className="shopping-list-items">{items.map((item) => <article className="shopping-list-card" key={item.id}><button className="shopping-check" onClick={() => void markBought(item)} aria-label={`Marcar ${item.product.name} como comprado`} title="Quitar de pendientes"><Check size={17} /></button><div className="shopping-list-copy"><strong>{item.product.name}</strong>{item.note && <small>{item.note}</small>}</div><button className="button button-small button-soft recommendation-toggle" onClick={() => void toggleRecommendation(item)}>{expandedId === item.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Ver recomendación</button>{expandedId === item.id && <RecommendationDetails data={comparisons[item.productId]} dimension={item.product.dimension} />}</article>)}</div> : <EmptyShopping icon={<ClipboardList size={22} />} title="Tu lista está vacía" text="Añade productos genéricos; puedes reutilizar los del catálogo o crear otros nuevos." />}
  </>;
}

function RecommendationDetails({ data, dimension }: { data?: ProductComparison; dimension: ShoppingDimension | null }) {
  if (!data) return <div className="recommendation-details">Cargando recomendación…</div>;
  if (!data.recommendations.length) return <div className="recommendation-details recommendation-empty">Aún no hay compras registradas de este producto. Guarda un ticket para empezar a comparar.</div>;
  const best = data.recommendations[0];
  return <div className="recommendation-details"><div className="best-price"><span>Mejor último precio registrado</span><strong>{best.supermarketName} · {euro.format(best.pricePerStandard)} {unitLabel(dimension)}</strong><small>{[best.brand, best.packageLabel].filter(Boolean).join(' · ') || 'Sin marca indicada'} · visto el {formatDate(best.date)}</small></div><div className="recommendation-others">{data.recommendations.slice(1).map((item) => <span key={item.supermarketId}>{item.supermarketName}: {euro.format(item.pricePerStandard)} {unitLabel(dimension)} · {formatDate(item.date)}</span>)}</div></div>;
}

function CompareView({ products }: { products: ShoppingProduct[] }) {
  const [productId, setProductId] = useState('');
  const [comparison, setComparison] = useState<ProductComparison | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!productId) { setComparison(null); return; } setBusy(true); void api.productComparison(productId).then(setComparison).catch((reason: unknown) => showError(reason instanceof Error ? reason.message : 'No se pudo cargar la comparación.')).finally(() => setBusy(false)); }, [productId]);
  const chartData = useMemo(() => {
    if (!comparison) return { rows: [] as PriceHistoryRow[], lines: [] as PriceHistoryLine[] };
    const lineMap = new Map<string, PriceHistoryLine>();
    const rowsByDate = new Map<string, PriceHistoryRow>();
    comparison.history.forEach((point) => {
      const key = `${point.supermarketId}:${point.variantId}`;
      if (!lineMap.has(key)) {
        const label = `${point.supermarketName} · ${point.brand || 'Sin marca'}${point.packageLabel ? ` (${point.packageLabel})` : ''}`;
        lineMap.set(key, { key, label, color: palette[lineMap.size % palette.length] });
      }
      const dateKey = point.date.slice(0, 10);
      const row = rowsByDate.get(dateKey) ?? { date: dateKey };
      row[key] = point.pricePerStandard;
      rowsByDate.set(dateKey, row);
    });
    return { rows: [...rowsByDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))), lines: [...lineMap.values()] };
  }, [comparison]);
  return <>
    <div className="shopping-section-heading"><div><h2>Comparar precios</h2><p>Última compra conocida por variante y supermercado; los precios no son en tiempo real.</p></div></div>
    <label className="compare-product-select form-field"><span>Producto genérico</span><select value={productId} onChange={(event) => setProductId(event.target.value)}><option value="">Elige qué producto comparar</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
    {busy && <div className="shopping-loading"><LoaderCircle className="spin" size={20} /> Consultando historial…</div>}
    {comparison && !busy && <>
      <section className="panel comparison-panel"><div className="panel-heading"><div><h3>{comparison.product.name}</h3><p>Comparación por {unitLabel(comparison.product.dimension) || 'unidad comparable pendiente'}.</p></div><span className="comparison-period">Precio por unidad estándar</span></div>
        {comparison.recommendations.length ? <div className="comparison-table-wrap"><table className="comparison-table"><thead><tr><th>Supermercado</th><th>Variante más económica</th><th>Precio comparable</th><th>Última observación</th></tr></thead><tbody>{comparison.recommendations.map((item, index) => <tr key={item.supermarketId} className={index === 0 ? 'recommended-row' : ''}><td><strong>{index === 0 && <span className="recommendation-medal">★</span>}{item.supermarketName}</strong></td><td>{item.brand || 'Sin marca'}<small>{item.packageLabel || 'Formato no indicado'}</small></td><td><strong>{euro.format(item.pricePerStandard)} {comparison.unit}</strong><small>Pagado: {moneyText(item.amount)}</small></td><td>{formatDate(item.date)}</td></tr>)}</tbody></table></div> : <EmptyShopping icon={<Search size={22} />} title="Todavía no hay precios" text="Guarda un ticket con este producto para que aparezca la comparación." />}
      </section>
      <section className="panel price-history-panel"><div className="panel-heading"><div><h3>Historial de precios · últimos 12 meses</h3><p>Una serie por supermercado y variante observada en tus tickets.</p></div></div>{chartData.rows.length ? <div className="price-history-chart"><Suspense fallback={<div className="shopping-chart-empty">Preparando gráfica…</div>}><PriceHistoryChart rows={chartData.rows} lines={chartData.lines} unit={comparison.unit} /></Suspense></div> : <div className="shopping-chart-empty">El historial aparecerá aquí cuando registres compras de este producto.</div>}</section>
    </>}
  </>;
}

function CatalogView({ products, supermarkets, onCreateProduct, onReload, onArchiveProduct, onArchiveStore }: {
  products: ShoppingProduct[]; supermarkets: Supermarket[]; onCreateProduct: (name: string) => Promise<ShoppingProduct>; onReload: () => Promise<void>;
  onArchiveProduct: (product: ShoppingProduct) => void; onArchiveStore: (store: Supermarket) => void;
}) {
  const [productName, setProductName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [busy, setBusy] = useState(false);
  async function addProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    try { await onCreateProduct(productName); setProductName(''); showSuccess('Producto añadido al catálogo.'); }
    catch (reason) { showError(reason instanceof Error ? reason.message : 'No se pudo crear el producto.'); }
    finally { setBusy(false); }
  }
  async function addStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    try { await api.createSupermarket(storeName); setStoreName(''); await onReload(); showSuccess('Supermercado guardado.'); }
    catch (reason) { showError(reason instanceof Error ? reason.message : 'No se pudo crear el supermercado.'); }
    finally { setBusy(false); }
  }
  return <>
    <div className="shopping-section-heading"><div><h2>Catálogo de compras</h2><p>Los registros con historial se archivan, no se borran, para conservar los precios.</p></div></div>
    <div className="catalog-forms"><form className="catalog-add-form" onSubmit={(event) => void addProduct(event)}><label className="form-field">Nuevo producto genérico<input required maxLength={100} value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="Ej. queso cottage" /></label><button className="button button-primary" disabled={busy}><Plus size={15} /> Añadir</button></form><form className="catalog-add-form" onSubmit={(event) => void addStore(event)}><label className="form-field">Nueva cadena<input required maxLength={80} value={storeName} onChange={(event) => setStoreName(event.target.value)} placeholder="Ej. supermercado local" /></label><button className="button button-primary" disabled={busy}><Plus size={15} /> Añadir</button></form></div>
    <div className="catalog-grid"><section className="panel catalog-panel"><div className="panel-heading"><div><h3>Productos</h3><p>{products.filter((product) => product.active).length} activos · historial preservado</p></div></div>{products.length ? <div className="catalog-list">{products.map((product) => <article className={`catalog-row ${product.active ? '' : 'catalog-inactive'}`} key={product.id}><span className="shopping-store-mark"><ShoppingBasket size={16} /></span><div className="catalog-copy"><strong>{product.name}</strong><small>{dimensionLabel(product.dimension)} · {product.variants?.length ?? 0} variantes</small></div><button className="button button-small button-soft" onClick={() => onArchiveProduct(product)}>{product.active ? <><Archive size={13} /> Archivar</> : <><ArrowDown size={13} /> Restaurar</>}</button></article>)}</div> : <div className="shopping-chart-empty">Aún no hay productos.</div>}</section>
      <section className="panel catalog-panel"><div className="panel-heading"><div><h3>Supermercados</h3><p>Se archivan para no romper el historial.</p></div></div>{supermarkets.length ? <div className="catalog-list">{supermarkets.map((store) => <article className={`catalog-row ${store.active ? '' : 'catalog-inactive'}`} key={store.id}><span className="shopping-store-mark"><Store size={16} /></span><div className="catalog-copy"><strong>{store.name}</strong><small>{store.active ? 'Activo' : 'Archivado'}</small></div><button className="button button-small button-soft" onClick={() => onArchiveStore(store)}>{store.active ? <><Archive size={13} /> Archivar</> : <><ArrowDown size={13} /> Restaurar</>}</button></article>)}</div> : <div className="shopping-chart-empty">Las cadenas sugeridas también están disponibles al registrar un ticket.</div>}</section>
    </div>
  </>;
}

function EmptyShopping({ icon, title, text, action, onAction }: { icon: React.ReactNode; title: string; text: string; action?: string; onAction?: () => void }) {
  return <div className="empty-list shopping-empty"><span className="empty-icon">{icon}</span><strong>{title}</strong><span>{text}</span>{action && onAction && <button className="button button-primary" onClick={onAction}><Plus size={15} />{action}</button>}</div>;
}
