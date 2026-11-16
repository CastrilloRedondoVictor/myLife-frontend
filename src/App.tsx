import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, Bell, CalendarDays, Check, ChevronDown, CircleHelp,
  Clock3, CreditCard, Ellipsis, Filter, LayoutDashboard, LoaderCircle, Pencil, Plus, Search, Settings2, Sparkles,
  Tag, Target, Trash2, TrendingDown, TrendingUp, Wallet, X,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from './api';
import { confirmAction, showError, showInfo, showSuccess } from './alerts';
import PreferencesPanel from './PreferencesPanel';
import type { Budget, Category, DashboardData, Entry, EntryType, RecurringRule } from './types';

type Tab = 'overview' | 'entries' | 'recurring' | 'budgets' | 'settings';
type Modal = 'entry' | 'recurring' | 'category' | 'budget' | null;

const currency = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
const numberValue = (value: number | string) => Number(value);
const monthToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};
const localDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const formatMonth = (month: string) => new Date(`${month}-01T12:00:00`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
const formatDate = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });

function shiftMonth(month: string, delta: number) {
  const [year, value] = month.split('-').map(Number);
  const date = new Date(year, value - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

const navItems: Array<{ id: Tab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Resumen', icon: LayoutDashboard },
  { id: 'entries', label: 'Movimientos', icon: CreditCard },
  { id: 'recurring', label: 'Recurrentes', icon: CalendarDays },
  { id: 'budgets', label: 'Presupuestos', icon: Target },
  { id: 'settings', label: 'Preferencias', icon: Settings2 },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('overview');
  const [month, setMonth] = useState(monthToday);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [modal, setModal] = useState<Modal>(null);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | EntryType>('ALL');

  const refresh = useCallback(async () => {
    setError('');
    try {
      await api.generateRecurring();
      const [nextDashboard, nextCategories, nextEntries, nextRules, nextBudgets] = await Promise.all([
        api.dashboard(month), api.categories(), api.entries(month), api.recurring(), api.budgets(month),
      ]);
      setDashboard(nextDashboard);
      setCategories(nextCategories);
      setEntries(nextEntries.data);
      setRules(nextRules);
      setBudgets(nextBudgets);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo conectar con la API local.');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { void refresh(); }, [refresh]);
  const expenseCategories = useMemo(() => dashboard?.categories
    .filter((category) => category.type === 'EXPENSE' && category.fixed + category.variable > 0)
    .map((category) => ({ name: category.categoryName, value: category.fixed + category.variable, color: category.color })) ?? [], [dashboard]);

  async function handleCreateEntry(data: { type: EntryType; amount: number; description: string; date: string; categoryId: string }) {
    await api.createEntry({ ...data, status: 'CONFIRMED' });
    setModal(null); showSuccess('Movimiento guardado.'); await refresh();
  }

  async function handleUpdateEntry(data: { type: EntryType; amount: number; description: string; date: string; categoryId: string }) {
    if (!editingEntry) return;
    await api.updateEntry(editingEntry.id, data);
    setModal(null); setEditingEntry(null); showSuccess('Movimiento actualizado.'); await refresh();
  }

  async function handleCreateRule(data: { type: EntryType; amount: number; description: string; categoryId: string; startDate: string }) {
    await api.createRecurring(data);
    setModal(null); showSuccess('Regla recurrente creada.'); await refresh();
  }

  async function handleCreateCategory(data: { name: string; type: EntryType; color: string; icon: string }) {
    await api.createCategory(data);
    setModal(null); showSuccess('Categoría creada.'); await refresh();
  }

  async function handleUpdateCategory(id: string, data: { name: string; color: string }) {
    await api.updateCategory(id, data);
    showSuccess('Categoría actualizada.'); await refresh();
  }

  async function handleDeleteCategory(category: Category) {
    await api.deleteCategory(category.id);
    showSuccess('Categoría eliminada.'); await refresh();
  }

  async function handleSaveBudget(data: { categoryId: string; month: string; limitAmount: number }) {
    if (editingBudget) await api.updateBudget(editingBudget.id, data);
    else await api.saveBudget(data);
    setModal(null); setEditingBudget(null); showSuccess('Presupuesto guardado.'); await refresh();
  }

  async function confirmEntry(entry: Entry) {
    try { await api.confirmEntry(entry.id); showSuccess('Movimiento confirmado.'); await refresh(); }
    catch (reason) { showError(reason instanceof Error ? reason.message : 'No se pudo confirmar el movimiento.'); }
  }

  async function removeEntry(entry: Entry) {
    if (!await confirmAction(`¿Eliminar «${entry.description}»?`, 'Esta acción no se puede deshacer.')) return;
    try { await api.deleteEntry(entry.id); showSuccess('Movimiento eliminado.'); await refresh(); }
    catch (reason) { showError(reason instanceof Error ? reason.message : 'No se pudo eliminar el movimiento.'); }
  }

  async function toggleRule(rule: RecurringRule) {
    try { await api.toggleRecurring(rule.id, !rule.active); showSuccess(rule.active ? 'Regla pausada.' : 'Regla reactivada.'); await refresh(); }
    catch (reason) { showError(reason instanceof Error ? reason.message : 'No se pudo actualizar la regla.'); }
  }

  async function removeRule(rule: RecurringRule) {
    if (!await confirmAction(`¿Eliminar «${rule.description}»?`, 'Los movimientos ya generados se conservarán.')) return;
    try { await api.deleteRecurring(rule.id); showSuccess('Regla recurrente eliminada.'); await refresh(); }
    catch (reason) { showError(reason instanceof Error ? reason.message : 'No se pudo eliminar la regla.'); }
  }

  async function removeBudget(budget: Budget) {
    if (!await confirmAction(`¿Eliminar el presupuesto de «${budget.category.name}»?`, 'Solo se eliminará el límite de este mes.')) return;
    try { await api.deleteBudget(budget.id); showSuccess('Presupuesto eliminado.'); await refresh(); }
    catch (reason) { showError(reason instanceof Error ? reason.message : 'No se pudo eliminar el presupuesto.'); }
  }

  function openEntryForm(entry?: Entry) {
    setEditingEntry(entry ?? null);
    setModal('entry');
  }

  function openBudgetForm(budget?: Budget) {
    setEditingBudget(budget ?? null);
    setModal('budget');
  }

  const pageTitle = navItems.find((item) => item.id === tab)?.label ?? (tab === 'settings' ? 'Preferencias' : 'Resumen');

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Sparkles size={18} strokeWidth={2.2} /></div><span>my<span>life</span></span></div>
        <div className="workspace-label">MI ESPACIO</div>
        <nav className="primary-nav" aria-label="Navegación principal">
          {navItems.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}><Icon size={18} /><span>{label}</span>{id === 'entries' && dashboard?.monthSummary.pending ? <b className="nav-count">{dashboard.monthSummary.pending}</b> : null}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip"><div className="tip-icon"><Sparkles size={15} /></div><strong>Pequeños pasos,<br />grandes cambios.</strong><span>Tu futuro se construye con lo que haces hoy.</span><button onClick={() => setTab('budgets')}>Ver mis objetivos <ArrowRight size={14} /></button></div>
          <div className="profile-row"><div className="avatar">V</div><div className="profile-copy"><strong>Mi espacio</strong><span>Finanzas personales</span></div><Ellipsis size={19} className="subtle-icon" /></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>Mi espacio</span><span className="crumb-slash">/</span><strong>{pageTitle}</strong></div>
          <div className="topbar-actions"><div className="secure-chip"><span className="secure-dot" /> Guardado en tu espacio</div><button className="icon-button" aria-label="Ayuda" onClick={() => showInfo('Consejo de privacidad', 'Esta versión funciona sin inicio de sesión. Mantén el backend disponible solo en tu equipo y no publiques tus credenciales.') }><CircleHelp size={18} /></button><button className="icon-button notification-button" aria-label="Ver movimientos pendientes" title="Ver movimientos pendientes" onClick={() => setTab('entries')}><Bell size={18} /><i /></button><div className="top-avatar">V</div></div>
        </header>

        <div className="page-content">
          <section className="welcome-row">
            <div><div className="eyebrow"><span className="eyebrow-line" /> TU DINERO, CON MÁS CLARIDAD</div><h1>{tab === 'overview' ? 'Un vistazo a tus finanzas' : pageTitle}</h1><p>{tab === 'overview' ? 'Cada decisión cuenta. Aquí tienes el mapa de tu mes.' : tab === 'entries' ? 'Todo lo que entra y sale, en un solo lugar.' : tab === 'recurring' ? 'Tus ingresos y gastos que se repiten cada mes.' : tab === 'budgets' ? 'Ponle intención a cada euro con límites claros.' : 'Personaliza tus categorías y revisa cómo protegemos tus datos.'}</p></div>
            {tab !== 'settings' && <button className="button button-primary" onClick={() => openEntryForm()}><Plus size={17} /> Nuevo movimiento</button>}
          </section>

          {tab !== 'settings' && <div className="month-toolbar"><div className="month-selector"><button className="month-arrow" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mes anterior"><ArrowLeft size={16} /></button><button className="month-current" onClick={() => setMonth(monthToday())}><CalendarDays size={16} /><span>{formatMonth(month)}</span><ChevronDown size={14} /></button><button className="month-arrow" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Mes siguiente"><ArrowRight size={16} /></button></div><span className="updated-label">Actualizado ahora</span></div>}

          {error && <div className="alert alert-error"><CircleHelp size={19} /><div><strong>No se pudo cargar tu información</strong><span>{error}. Comprueba Azure SQL y que el backend esté en marcha; revisa la guía del repositorio.</span></div><button className="button button-small" onClick={() => { setLoading(true); void refresh(); }}>Reintentar</button></div>}
          {loading && !dashboard && <div className="loading-state"><LoaderCircle className="spin" size={24} /> Conectando con tus finanzas…</div>}

          {tab === 'overview' && dashboard && <>
            <section className="summary-grid">
              <article className="summary-card balance-card"><div className="summary-card-top"><span>Saldo acumulado</span><span className="card-icon balance-icon"><Wallet size={17} /></span></div><strong className="balance-number">{currency.format(dashboard.balance)}</strong><div className="summary-foot"><span className="balance-caption">Ingresos confirmados − gastos confirmados</span><span className="tiny-status"><i /> En curso</span></div><div className="balance-decoration" /></article>
              <article className="summary-card"><div className="summary-card-top"><span>Ingresos del mes</span><span className="card-icon income-icon"><ArrowDownLeft size={17} /></span></div><strong className="summary-number">{currency.format(dashboard.monthSummary.income)}</strong><div className="summary-foot"><span><b className="positive-text">{currency.format(dashboard.monthSummary.fixedIncome)}</b> fijos</span><span className="foot-divider" /><span>{currency.format(dashboard.monthSummary.variableIncome)} variables</span></div><div className="mini-track income-track"><i style={{ width: `${dashboard.monthSummary.income ? Math.max(12, dashboard.monthSummary.fixedIncome / dashboard.monthSummary.income * 100) : 0}%` }} /></div></article>
              <article className="summary-card"><div className="summary-card-top"><span>Gastos del mes</span><span className="card-icon expense-icon"><ArrowUpRight size={17} /></span></div><strong className="summary-number">{currency.format(dashboard.monthSummary.expense)}</strong><div className="summary-foot"><span><b className="negative-text">{currency.format(dashboard.monthSummary.fixedExpense)}</b> fijos</span><span className="foot-divider" /><span>{currency.format(dashboard.monthSummary.variableExpense)} variables</span></div><div className="mini-track expense-track"><i style={{ width: `${dashboard.monthSummary.expense ? Math.max(12, dashboard.monthSummary.fixedExpense / dashboard.monthSummary.expense * 100) : 0}%` }} /></div></article>
            </section>

            {dashboard.monthSummary.pending > 0 && <button className="pending-banner" onClick={() => setTab('entries')}><span className="pending-symbol"><Clock3 size={17} /></span><span><strong>Tienes {dashboard.monthSummary.pending} {dashboard.monthSummary.pending === 1 ? 'movimiento pendiente' : 'movimientos pendientes'}</strong><small>Revisa los cobros y pagos previstos de tus reglas fijas.</small></span><ArrowRight size={17} /></button>}

            <section className="dashboard-grid">
              <article className="panel cashflow-panel"><div className="panel-heading"><div><h2>Ingresos y gastos</h2><p>Una vista clara de cómo se mueve tu dinero</p></div><span className="panel-select">Este mes <ChevronDown size={14} /></span></div><div className="chart-legend"><span><i className="legend-dot legend-income" /> Ingresos</span><span><i className="legend-dot legend-expense" /> Gastos</span><span className="legend-note">Fijos + variables</span></div><div className="cashflow-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={[{ name: 'Fijos', income: dashboard.monthSummary.fixedIncome, expense: dashboard.monthSummary.fixedExpense }, { name: 'Variables', income: dashboard.monthSummary.variableIncome, expense: dashboard.monthSummary.variableExpense }]} margin={{ top: 10, right: 12, left: -14, bottom: 0 }}><defs><linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#36b99a" stopOpacity={0.19} /><stop offset="95%" stopColor="#36b99a" stopOpacity={0.01} /></linearGradient><linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f38a79" stopOpacity={0.17} /><stop offset="95%" stopColor="#f38a79" stopOpacity={0.01} /></linearGradient></defs><CartesianGrid stroke="#edf0f4" vertical={false} /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#8b94a5', fontSize: 12 }} dy={12} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#a0a7b3', fontSize: 11 }} tickFormatter={(value: number) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : `${value}€`} /><Tooltip formatter={(value) => currency.format(Number(value))} contentStyle={{ borderRadius: 12, border: '1px solid #e8ebf0', fontFamily: 'DM Sans' }} /><Area type="monotone" dataKey="income" name="Ingresos" stroke="#35b696" strokeWidth={2.5} fill="url(#incomeFill)" /><Area type="monotone" dataKey="expense" name="Gastos" stroke="#f08b7d" strokeWidth={2.5} fill="url(#expenseFill)" /></AreaChart></ResponsiveContainer></div><div className="chart-insight"><span className="insight-mark"><TrendingUp size={15} /></span><span>Tu balance del mes es de <strong>{currency.format(dashboard.monthSummary.income - dashboard.monthSummary.expense)}</strong></span></div></article>

              <article className="panel category-panel"><div className="panel-heading"><div><h2>¿A dónde va?</h2><p>Tus gastos por categoría</p></div><button className="more-button" aria-label="Más opciones"><Ellipsis size={20} /></button></div><div className="donut-wrap">{expenseCategories.length ? <><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={expenseCategories} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="89%" paddingAngle={3} stroke="none" cornerRadius={5}>{expenseCategories.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip formatter={(value) => currency.format(Number(value))} contentStyle={{ borderRadius: 12, border: '1px solid #e8ebf0', fontFamily: 'DM Sans' }} /></PieChart></ResponsiveContainer><div className="donut-center"><span>Gasto total</span><strong>{currency.format(dashboard.monthSummary.expense)}</strong></div></> : <div className="empty-chart">Aún no hay gastos<br />en este periodo</div>}</div><div className="category-legend">{expenseCategories.slice(0, 4).map((item) => <div className="category-legend-row" key={item.name}><span><i style={{ backgroundColor: item.color }} />{item.name}</span><strong>{dashboard.monthSummary.expense ? `${Math.round(item.value / dashboard.monthSummary.expense * 100)}%` : '0%'}</strong></div>)}{expenseCategories.length === 0 && <span className="muted-copy">Añade un movimiento para ver el desglose.</span>}</div><button className="text-action" onClick={() => setTab('entries')}>Ver movimientos <ArrowRight size={15} /></button></article>
            </section>

            <section className="bottom-grid"><article className="panel recent-panel"><div className="panel-heading"><div><h2>Actividad reciente</h2><p>Los últimos movimientos de tu mes</p></div><button className="text-action compact-action" onClick={() => setTab('entries')}>Ver todos <ArrowRight size={15} /></button></div><EntryList entries={dashboard.recentEntries} onConfirm={confirmEntry} onDelete={removeEntry} onEdit={openEntryForm} compact /></article><article className="panel budget-preview"><div className="panel-heading"><div><h2>Presupuestos</h2><p>Cuida el ritmo de tus gastos</p></div><button className="more-button" aria-label="Ver presupuestos" onClick={() => setTab('budgets')}><ArrowRight size={18} /></button></div>{budgets.slice(0, 3).map((budget) => <BudgetLine key={budget.id} budget={budget} />)}{budgets.length === 0 && <div className="empty-inline"><div className="empty-icon"><Target size={19} /></div><strong>Empieza por marcar un objetivo</strong><span>Define un límite mensual por categoría.</span><button className="button button-soft" onClick={() => openBudgetForm()}><Plus size={15} /> Crear presupuesto</button></div>}</article></section>
          </>}

          {tab === 'entries' && <section className="panel full-panel"><div className="panel-heading"><div><h2>Movimientos de {formatMonth(month)}</h2><p>Revisa tus ingresos, gastos y pagos previstos.</p></div><div className="heading-actions"><button className="button button-soft" onClick={() => setModal('category')}><Tag size={15} /> Categoría</button><button className="button button-primary" onClick={() => openEntryForm()}><Plus size={16} /> Añadir</button></div></div><div className="table-toolbar"><label className="search-box"><Search size={16} /><input placeholder="Buscar movimiento..." value={search} onChange={(event) => setSearch(event.target.value)} /></label><label className="filter-box"><Filter size={15} /><select value={filterType} onChange={(event) => setFilterType(event.target.value as 'ALL' | EntryType)}><option value="ALL">Todos los tipos</option><option value="INCOME">Ingresos</option><option value="EXPENSE">Gastos</option></select></label></div><EntryList entries={entries.filter((entry) => (filterType === 'ALL' || entry.type === filterType) && `${entry.description} ${entry.category.name}`.toLowerCase().includes(search.toLowerCase()))} onConfirm={confirmEntry} onDelete={removeEntry} onEdit={openEntryForm} /></section>}

          {tab === 'recurring' && <section className="panel full-panel"><div className="panel-heading"><div><h2>Reglas mensuales</h2><p>Al abrir la app se generan los pagos previstos pendientes, una sola vez.</p></div><button className="button button-primary" onClick={() => setModal('recurring')}><Plus size={16} /> Nueva regla</button></div>{rules.length ? <div className="rule-list">{rules.map((rule) => <div className={`rule-row ${!rule.active ? 'rule-inactive' : ''}`} key={rule.id}><span className={`entry-icon ${rule.type === 'INCOME' ? 'income-bg' : 'expense-bg'}`}>{rule.type === 'INCOME' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}</span><div className="rule-copy"><strong>{rule.description}</strong><span>{rule.category.name} · cada mes, día {new Date(`${rule.startDate.slice(0, 10)}T12:00:00`).getDate()}{rule.active ? '' : ' · pausada'}</span></div><strong className={`entry-amount ${rule.type === 'INCOME' ? 'positive-text' : ''}`}>{rule.type === 'INCOME' ? '+' : '−'}{currency.format(numberValue(rule.amount))}</strong><button className="button button-small button-soft" onClick={() => void toggleRule(rule)}>{rule.active ? 'Pausar' : 'Reanudar'}</button><button className="icon-button settings-action danger-action" onClick={() => void removeRule(rule)} aria-label={`Eliminar regla ${rule.description}`}><Trash2 size={16} /></button></div>)}</div> : <EmptyState icon={<CalendarDays size={23} />} title="Todavía no hay reglas" text="Añade tus pagos fijos o ingresos recurrentes para tenerlos siempre presentes." action="Crear regla" onAction={() => setModal('recurring')} />}</section>}

          {tab === 'budgets' && <section className="panel full-panel"><div className="panel-heading"><div><h2>Límites por categoría</h2><p>Lo que has gastado frente a tu objetivo este mes.</p></div><button className="button button-primary" onClick={() => openBudgetForm()}><Plus size={16} /> Añadir límite</button></div>{budgets.length ? <div className="budget-grid">{budgets.map((budget) => <BudgetCard key={budget.id} budget={budget} onEdit={() => openBudgetForm(budget)} onDelete={() => void removeBudget(budget)} />)}</div> : <EmptyState icon={<Target size={23} />} title="Un plan para gastar con calma" text="Crea un presupuesto mensual para las categorías que quieras cuidar." action="Crear presupuesto" onAction={() => openBudgetForm()} />}</section>}

          {tab === 'settings' && <PreferencesPanel categories={categories} onAddCategory={() => setModal('category')} onUpdateCategory={handleUpdateCategory} onDeleteCategory={handleDeleteCategory} />}

          {tab !== 'settings' && !dashboard && !loading && !error && <div className="empty-state"><Wallet size={22} />No hay datos todavía. Añade tu primer movimiento.</div>}
        </div>
        <footer className="footer-note"><span>Un paso a la vez. Vas bien.</span><span>Privado · Tus finanzas, solo tuyas <span className="footer-heart">♥</span></span></footer>
      </main>

      {modal && <ModalDialog title={modal === 'entry' ? editingEntry ? 'Editar movimiento' : 'Nuevo movimiento' : modal === 'recurring' ? 'Nueva regla mensual' : modal === 'category' ? 'Nueva categoría' : editingBudget ? 'Editar presupuesto' : 'Nuevo presupuesto'} onClose={() => { setModal(null); setEditingEntry(null); setEditingBudget(null); }}>
        {modal === 'entry' && <EntryForm categories={categories} initial={editingEntry} onSubmit={editingEntry ? handleUpdateEntry : handleCreateEntry} />}
        {modal === 'recurring' && <RecurringForm categories={categories} onSubmit={handleCreateRule} />}
        {modal === 'category' && <CategoryForm onSubmit={handleCreateCategory} />}
        {modal === 'budget' && <BudgetForm categories={categories} month={month} initial={editingBudget} onSubmit={handleSaveBudget} />}
      </ModalDialog>}
    </div>
  );
}

function EntryList({ entries, onConfirm, onDelete, onEdit, compact = false }: { entries: Entry[]; onConfirm: (entry: Entry) => void; onDelete: (entry: Entry) => void; onEdit?: (entry: Entry) => void; compact?: boolean }) {
  if (!entries.length) return <div className="empty-list"><span className="empty-icon"><CreditCard size={19} /></span><strong>No hay movimientos que mostrar</strong><span>Prueba con otro filtro o añade tu primer movimiento.</span></div>;
  return <div className={`entry-list ${compact ? 'compact-list' : ''}`}>{entries.map((entry) => <div className="entry-row" key={entry.id}><span className={`entry-icon ${entry.type === 'INCOME' ? 'income-bg' : 'expense-bg'}`}>{entry.type === 'INCOME' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}</span><div className="entry-copy"><strong>{entry.description}</strong><span>{entry.category.name} <i>·</i> {formatDate(entry.date)}{entry.isFixed && <em className="fixed-badge">Fijo</em>}</span></div><span className={`entry-amount ${entry.type === 'INCOME' ? 'positive-text' : ''}`}>{entry.type === 'INCOME' ? '+' : '−'}{currency.format(numberValue(entry.amount))}</span>{entry.status === 'PENDING' ? <button className="button button-small confirm-button" onClick={() => onConfirm(entry)}><Check size={14} /> Confirmar</button> : <span className="confirmed-mark" title="Confirmado"><Check size={15} /></span>}{onEdit && <button className="row-edit" onClick={() => onEdit(entry)} aria-label={`Editar ${entry.description}`} title="Editar movimiento"><Pencil size={15} /></button>}{!entry.recurringRuleId && <button className="row-delete" onClick={() => onDelete(entry)} aria-label={`Eliminar ${entry.description}`} title="Eliminar movimiento"><X size={15} /></button>}</div>)}</div>;
}

function BudgetLine({ budget }: { budget: Budget }) {
  const limit = numberValue(budget.limitAmount); const percent = limit ? Math.min(100, budget.spent / limit * 100) : 0;
  return <div className="budget-line"><div className="budget-line-top"><span><i style={{ backgroundColor: budget.category.color }} />{budget.category.name}</span><strong>{currency.format(budget.spent)} <small>/ {currency.format(limit)}</small></strong></div><div className="budget-track"><i className={percent >= 100 ? 'over-budget' : ''} style={{ width: `${percent}%`, backgroundColor: percent >= 100 ? '#f0786d' : budget.category.color }} /></div></div>;
}

function BudgetCard({ budget, onEdit, onDelete }: { budget: Budget; onEdit: () => void; onDelete: () => void }) {
  const limit = numberValue(budget.limitAmount); const ratio = limit ? budget.spent / limit : 0; const remaining = limit - budget.spent;
  return <article className="budget-card"><div className="budget-card-header"><span className="budget-dot" style={{ backgroundColor: budget.category.color }} /><div><strong>{budget.category.name}</strong><span>{formatMonth(budget.month.slice(0, 7))}</span></div><span className="budget-percent">{Math.round(ratio * 100)}%</span></div><div className="budget-card-amount"><strong>{currency.format(budget.spent)}</strong><span>de {currency.format(limit)}</span></div><div className="budget-track large-track"><i className={ratio >= 1 ? 'over-budget' : ''} style={{ width: `${Math.min(100, ratio * 100)}%`, backgroundColor: ratio >= 1 ? '#f0786d' : budget.category.color }} /></div><div className={`budget-remaining ${remaining < 0 ? 'negative-text' : ''}`}>{remaining >= 0 ? `Te quedan ${currency.format(remaining)}` : `Has superado el límite por ${currency.format(Math.abs(remaining))}`}</div><div className="budget-card-actions"><button className="button button-small button-soft" onClick={onEdit}><Pencil size={13} /> Editar</button><button className="button button-small budget-delete" onClick={onDelete}><Trash2 size={13} /> Eliminar</button></div></article>;
}

function EmptyState({ icon, title, text, action, onAction }: { icon: ReactNode; title: string; text: string; action: string; onAction: () => void }) {
  return <div className="empty-list spacious-empty"><span className="empty-icon">{icon}</span><strong>{title}</strong><span>{text}</span><button className="button button-primary" onClick={onAction}><Plus size={16} />{action}</button></div>;
}

function ModalDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusable = () => dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])');
    focusable()?.[0]?.focus();
    function trapFocus(event: KeyboardEvent) {
      if (event.key === 'Escape') { onClose(); return; }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items?.length) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus(); }
    }
    document.addEventListener('keydown', trapFocus);
    return () => { document.removeEventListener('keydown', trapFocus); previousFocus?.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} className="modal-card" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}><div className="modal-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> MI ESPACIO</span><h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={18} /></button></div>{children}</section></div>;
}

function TransactionFields({ categories, initial, defaultType = 'EXPENSE' }: { categories: Category[]; initial?: Entry | null; defaultType?: EntryType }) {
  const [type, setType] = useState<EntryType>(initial?.type ?? defaultType);
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const matching = categories.filter((category) => category.type === type);
  function changeType(nextType: EntryType) {
    setType(nextType);
    setCategoryId(categories.find((category) => category.type === nextType)?.id ?? '');
  }
  return <><div className="type-switch"><button type="button" className={type === 'EXPENSE' ? 'selected expense-selected' : ''} onClick={() => changeType('EXPENSE')}><TrendingDown size={15} /> Gasto</button><button type="button" className={type === 'INCOME' ? 'selected income-selected' : ''} onClick={() => changeType('INCOME')}><TrendingUp size={15} /> Ingreso</button></div><input type="hidden" name="type" value={type} /><label className="form-field">Concepto<input name="description" required maxLength={160} defaultValue={initial?.description ?? ''} placeholder="Ej. Compra semanal" /></label><div className="form-two"><label className="form-field">Importe (€)<input name="amount" type="number" required min="0.01" max="9999999999.99" step="0.01" defaultValue={initial ? numberValue(initial.amount) : ''} placeholder="0,00" /></label><label className="form-field">Fecha<input name="date" type="date" required defaultValue={initial?.date.slice(0, 10) ?? localDate()} /></label></div><label className="form-field">Categoría<select name="categoryId" required value={matching.some((category) => category.id === categoryId) ? categoryId : ''} onChange={(event) => setCategoryId(event.target.value)}><option value="" disabled>Elige una categoría</option>{matching.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>{!matching.length && <span className="form-hint">Primero crea una categoría de este tipo.</span>}</>;
}

function EntryForm({ categories, initial, onSubmit }: { categories: Category[]; initial?: Entry | null; onSubmit: (data: { type: EntryType; amount: number; description: string; date: string; categoryId: string }) => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    try { await onSubmit({ type: data.type as EntryType, amount: Number(data.amount), description: String(data.description), date: String(data.date), categoryId: String(data.categoryId) }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar.'); }
    finally { setBusy(false); }
  }
  return <form className="modal-form" onSubmit={(event) => void submit(event)}><TransactionFields categories={categories} initial={initial} /><FormError error={error} /><FormActions busy={busy} submit={initial ? 'Guardar cambios' : 'Guardar movimiento'} /></form>;
}

function RecurringForm({ categories, onSubmit }: { categories: Category[]; onSubmit: (data: { type: EntryType; amount: number; description: string; categoryId: string; startDate: string }) => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    try { await onSubmit({ type: data.type as EntryType, amount: Number(data.amount), description: String(data.description), categoryId: String(data.categoryId), startDate: String(data.date) }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar.'); } finally { setBusy(false); }
  }
  return <form className="modal-form" onSubmit={(event) => void submit(event)}><TransactionFields categories={categories} /><p className="form-hint">Se creará un movimiento pendiente cada mes, el mismo día. En meses cortos se usará el último día.</p><FormError error={error} /><FormActions busy={busy} submit="Crear regla" /></form>;
}

function CategoryForm({ onSubmit }: { onSubmit: (data: { name: string; type: EntryType; color: string; icon: string }) => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    try { await onSubmit({ name: String(data.name), type: data.type as EntryType, color: String(data.color), icon: 'circle' }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar.'); } finally { setBusy(false); }
  }
  return <form className="modal-form" onSubmit={(event) => void submit(event)}><label className="form-field">Nombre<input name="name" required maxLength={40} placeholder="Ej. Mascotas" /></label><label className="form-field">Tipo<select name="type"><option value="EXPENSE">Gasto</option><option value="INCOME">Ingreso</option></select></label><label className="form-field">Color <span className="color-input"><input name="color" type="color" defaultValue="#7c8da6" /><span>Elige un color para reconocerla</span></span></label><FormError error={error} /><FormActions busy={busy} submit="Crear categoría" /></form>;
}

function BudgetForm({ categories, month, initial, onSubmit }: { categories: Category[]; month: string; initial?: Budget | null; onSubmit: (data: { categoryId: string; month: string; limitAmount: number }) => Promise<void> }) {
  const expenseCategories = categories.filter((category) => category.type === 'EXPENSE');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    try { await onSubmit({ categoryId: String(data.categoryId), month: String(data.month), limitAmount: Number(data.limitAmount) }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar.'); } finally { setBusy(false); }
  }
  return <form className="modal-form" onSubmit={(event) => void submit(event)}><label className="form-field">Categoría de gasto<select name="categoryId" required defaultValue={initial?.category.id ?? ''}><option value="" disabled>Elige una categoría</option>{expenseCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><div className="form-two"><label className="form-field">Límite mensual (€)<input name="limitAmount" type="number" required min="0.01" max="9999999999.99" step="0.01" defaultValue={initial ? numberValue(initial.limitAmount) : ''} placeholder="0,00" /></label><label className="form-field">Mes<input name="month" type="month" required defaultValue={initial?.month.slice(0, 7) ?? month} /></label></div><FormError error={error} /><FormActions busy={busy} submit={initial ? 'Guardar cambios' : 'Guardar presupuesto'} /></form>;
}

function FormError({ error }: { error: string }) { return error ? <div className="form-error">{error}</div> : null; }
function FormActions({ busy, submit }: { busy: boolean; submit: string }) {
  return <div className="form-actions"><span className="form-hint"><span className="required-star">*</span> Campos obligatorios</span><button className="button button-primary" disabled={busy} type="submit">{busy && <LoaderCircle size={15} className="spin" />}{submit}</button></div>;
}