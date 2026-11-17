import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, Bell, CalendarDays, Check, ChevronDown, CircleHelp,
  Clock3, CreditCard, Ellipsis, Filter, LayoutDashboard, LoaderCircle, Pencil, Plus, Search, Settings2, Sparkles,
  ShoppingBasket, Tag, Target, Trash2, TrendingDown, TrendingUp, Wallet, X,
} from 'lucide-react';
import { api, authApi, setSelectedSpaceId, sharedExpensesApi, settlementsApi, spacesApi, type SharedExpenseInput } from './api';
import { confirmAction, showError, showInfo, showSuccess } from './alerts';
import PreferencesPanel from './PreferencesPanel';
import ShoppingPanel from './ShoppingPanel';
import type { AuditEvent, AuthSession, Budget, Category, DashboardData, Entry, EntryType, RecurringRule, SettlementLedger, SettlementRecord, SharedExpense, Space, SpaceMember, SplitMode } from './types';

type Tab = 'overview' | 'entries' | 'shopping' | 'recurring' | 'budgets' | 'shared' | 'settlements' | 'settings';
type Modal = 'entry' | 'recurring' | 'category' | 'budget' | 'shared-expense' | null;

const DailyCashflowChart = lazy(() => import('./ChartVisualizations').then((module) => ({ default: module.DailyCashflowChart })));
const ExpenseCategoryChart = lazy(() => import('./ChartVisualizations').then((module) => ({ default: module.ExpenseCategoryChart })));

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
  { id: 'shopping', label: 'Compras', icon: ShoppingBasket },
  { id: 'recurring', label: 'Recurrentes', icon: CalendarDays },
  { id: 'budgets', label: 'Presupuestos', icon: Target },
  { id: 'shared', label: 'Gastos CoLife', icon: Wallet },
  { id: 'settlements', label: 'Liquidaciones', icon: CreditCard },
  { id: 'settings', label: 'Preferencias', icon: Settings2 },
];

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);
  const refreshSequence = useRef(0);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [month, setMonth] = useState(monthToday);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [sharedExpenses, setSharedExpenses] = useState<SharedExpense[]>([]);
  const [spaceMembers, setSpaceMembers] = useState<SpaceMember[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [invitationOpen, setInvitationOpen] = useState(false);
  const [newInvitationUrl, setNewInvitationUrl] = useState('');
  const [settlementLedger, setSettlementLedger] = useState<SettlementLedger | null>(null);
  const [settlementRecords, setSettlementRecords] = useState<SettlementRecord[]>([]);
  const [modal, setModal] = useState<Modal>(null);
  const [editingSharedExpense, setEditingSharedExpense] = useState<SharedExpense | null>(null);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | EntryType>('ALL');
  const [cashflowFilter, setCashflowFilter] = useState<'income' | 'expense' | 'both'>('both');
  const [expenseDetailFilter, setExpenseDetailFilter] = useState<'both' | 'fixed' | 'variable'>('both');
  const [expenseFilter, setExpenseFilter] = useState<'variable' | 'fixed' | 'all'>('variable');

  const clearWorkspaceData = useCallback(() => {
    setDashboard(null);
    setCategories([]);
    setEntries([]);
    setRules([]);
    setBudgets([]);
    setSharedExpenses([]);
    setSpaceMembers([]);
    setAuditEvents([]);
    setInvitationOpen(false);
    setNewInvitationUrl('');
    setSettlementLedger(null);
    setSettlementRecords([]);
    setModal(null);
    setEditingSharedExpense(null);
    setEditingEntry(null);
    setEditingBudget(null);
    setSearch('');
  }, []);

  useEffect(() => {
    const initializeSession = async () => {
      try {
        const query = new URLSearchParams(window.location.search);
        const queryInvitationToken = query.get('invite');
        if (queryInvitationToken && /^[A-Za-z0-9_-]{32,128}$/.test(queryInvitationToken)) {
          window.sessionStorage.setItem('mylife.pendingInvitation', queryInvitationToken);
          query.delete('invite');
          const suffix = query.toString();
          window.history.replaceState({}, '', `${window.location.pathname}${suffix ? `?${suffix}` : ''}${window.location.hash}`);
        }
        const currentSession = await authApi.session();
        setSession(currentSession);
        if (currentSession.authenticated) {
          const spaces = await spacesApi.list();
          setSession({ ...currentSession, spaces });
          const invitationToken = window.sessionStorage.getItem('mylife.pendingInvitation');
          if (invitationToken) {
            const joined = await spacesApi.acceptInvitation(invitationToken);
            window.sessionStorage.removeItem('mylife.pendingInvitation');
            const refreshedSpaces = await spacesApi.list();
            setSession({ ...currentSession, spaces: refreshedSpaces });
            setSelectedSpace(refreshedSpaces.find((space) => space.id === joined.spaceId) ?? refreshedSpaces[0] ?? null);
          } else {
            const savedSpaceId = window.localStorage.getItem('mylife.selectedSpaceId');
            setSelectedSpace(spaces.find((space) => space.id === savedSpaceId) ?? spaces.find((space) => space.type === 'PERSONAL') ?? spaces[0] ?? null);
          }
        }
      } catch (reason) {
        setAuthError(reason instanceof Error ? reason.message : 'No se pudo verificar la sesión.');
      } finally {
        setAuthLoading(false);
      }
    };
    void initializeSession();
  }, []);

  useEffect(() => {
    setSelectedSpaceId(selectedSpace?.id ?? null);
    if (selectedSpace) window.localStorage.setItem('mylife.selectedSpaceId', selectedSpace.id);
  }, [selectedSpace]);

  const switchSpace = useCallback((space: Space) => {
    if (space.id === selectedSpace?.id) return;
    refreshSequence.current += 1;
    clearWorkspaceData();
    setSelectedSpaceId(null);
    setSelectedSpace(space);
    setLoading(true);
    setTab('overview');
  }, [clearWorkspaceData, selectedSpace?.id]);

  const refresh = useCallback(async () => {
    if (!selectedSpace) return;
    const sequence = ++refreshSequence.current;
    setError('');
    try {
      if (!selectedSpace.archivedAt) await api.generateRecurring();
      const sharedRequests = selectedSpace.type === 'COLIFE'
        ? [sharedExpensesApi.list(), spacesApi.members(selectedSpace.id), settlementsApi.ledger(), settlementsApi.list(), spacesApi.audit(selectedSpace.id)] as const
        : null;
      const [nextDashboard, nextCategories, nextEntries, nextRules, nextBudgets] = await Promise.all([
        api.dashboard(month), api.categories(), api.entries(month), api.recurring(), api.budgets(month),
      ]);
      let nextInvitationOpen = false;
      let nextCoLifeData: {
        expenses: SharedExpense[];
        members: SpaceMember[];
        ledger: SettlementLedger;
        settlements: SettlementRecord[];
        audit: AuditEvent[];
      } | null = null;
      if (sharedRequests) {
        const [nextExpenses, nextMembers, nextLedger, nextSettlements, nextAudit] = await Promise.all(sharedRequests);
        if (selectedSpace.role === 'ADMIN') nextInvitationOpen = (await spacesApi.invitationStatus(selectedSpace.id)).acceptanceOpen;
        nextCoLifeData = { expenses: nextExpenses, members: nextMembers, ledger: nextLedger, settlements: nextSettlements, audit: nextAudit };
      }
      if (sequence !== refreshSequence.current) return;
      if (nextCoLifeData) {
        setSharedExpenses(nextCoLifeData.expenses);
        setSpaceMembers(nextCoLifeData.members);
        setSettlementLedger(nextCoLifeData.ledger);
        setSettlementRecords(nextCoLifeData.settlements);
        setAuditEvents(nextCoLifeData.audit);
        setInvitationOpen(nextInvitationOpen);
      } else {
        setSharedExpenses([]);
        setSpaceMembers([]);
        setSettlementLedger(null);
        setSettlementRecords([]);
        setAuditEvents([]);
        setInvitationOpen(false);
      }
      setDashboard(nextDashboard);
      setCategories(nextCategories);
      setEntries(nextEntries.data);
      setRules(nextRules);
      setBudgets(nextBudgets);
    } catch (reason) {
      if (sequence === refreshSequence.current) setError(reason instanceof Error ? reason.message : 'No se pudo conectar con la API local.');
    } finally {
      if (sequence === refreshSequence.current) setLoading(false);
    }
  }, [month, selectedSpace]);

  useEffect(() => { if (session?.authenticated && selectedSpace) void refresh(); }, [refresh, session, selectedSpace]);
  const cashflowData = useMemo(() => dashboard?.dailyCashflow
    .map((point) => ({
      ...point,
      fixedExpense: cashflowFilter === 'expense' && expenseDetailFilter === 'variable' ? 0 : point.fixedExpense,
      variableExpense: cashflowFilter === 'expense' && expenseDetailFilter === 'fixed' ? 0 : point.variableExpense,
      expense: cashflowFilter === 'expense' && expenseDetailFilter === 'fixed'
        ? point.fixedExpense
        : cashflowFilter === 'expense' && expenseDetailFilter === 'variable' ? point.variableExpense : point.expense,
    }))
    .filter((point) => cashflowFilter === 'income' ? point.income > 0 : cashflowFilter === 'expense' ? point.expense > 0 : true) ?? [], [dashboard, cashflowFilter, expenseDetailFilter]);
  const expenseCategories = useMemo(() => dashboard?.categories
    .filter((category) => category.type === 'EXPENSE')
    .map((category) => ({
      name: category.categoryName,
      value: expenseFilter === 'variable' ? category.variable : expenseFilter === 'fixed' ? category.fixed : category.fixed + category.variable,
      color: category.color,
    }))
    .filter((category) => category.value > 0) ?? [], [dashboard, expenseFilter]);
  const categoryExpenseTotal = expenseCategories.reduce((total, category) => total + category.value, 0);
  const categoryExpenseLabel = expenseFilter === 'variable' ? 'Variables' : expenseFilter === 'fixed' ? 'Fijos' : 'Total del mes';
  const visibleNavItems = selectedSpace?.type === 'COLIFE' ? navItems : navItems.filter(({ id }) => id !== 'shared' && id !== 'settlements');

  async function handleCreateEntry(data: { type: EntryType; amount: number; description: string; date: string; categoryId: string }) {
    await api.createEntry({ ...data, status: 'CONFIRMED' });
    setModal(null); showSuccess('Movimiento guardado.'); await refresh();
  }

  async function handleCreateSharedExpense(input: SharedExpenseInput) {
    if (editingSharedExpense) await sharedExpensesApi.update(editingSharedExpense.id, input);
    else await sharedExpensesApi.create(input);
    setModal(null);
    setEditingSharedExpense(null);
    showSuccess(editingSharedExpense ? 'Gasto compartido actualizado y sincronizado.' : 'Gasto compartido guardado y sincronizado.');
    await refresh();
  }

  async function handleVoidSharedExpense(expense: SharedExpense) {
    if (!await confirmAction(`¿Anular «${expense.description}»?`, 'El gasto y sus cuotas se revertirán; las liquidaciones históricas permanecerán intactas.', 'Anular gasto')) return;
    try { await sharedExpensesApi.void(expense.id); showSuccess('Gasto anulado y registrado en auditoría.'); await refresh(); }
    catch (reason) { showError(reason instanceof Error ? reason.message : 'No se pudo anular el gasto.'); }
  }

  async function handleCreateSettlement(fromUserId: string, toUserId: string, amountCents: number, note?: string) {
    const updatedLedger = await settlementsApi.create({ fromUserId, toUserId, amountCents, note });
    setSettlementLedger(updatedLedger);
    setSettlementRecords(await settlementsApi.list());
    showSuccess('Liquidación registrada.');
  }

  async function handleCreateSpace(name: string) {
    if (!session?.authenticated) throw new Error('Inicia sesión para crear un CoLife.');
    const created = await spacesApi.create(name);
    const spaces = await spacesApi.list();
    setSession((current) => current?.authenticated ? { ...current, spaces } : current);
    const next = spaces.find((space) => space.id === created.id);
    if (next) switchSpace(next);
    setNewInvitationUrl(created.invitation?.url ?? '');
    showSuccess('CoLife creado. Guarda el enlace de invitación para compartirlo.');
  }

  async function handleInvitationToggle(open: boolean) {
    if (!selectedSpace) throw new Error('Selecciona un CoLife.');
    const result = await spacesApi.invite(selectedSpace.id, open);
    setInvitationOpen(result.acceptanceOpen);
    showSuccess(open ? 'La invitación está abierta.' : 'La invitación se ha cerrado.');
    await refresh();
  }

  async function handleRotateInvitation() {
    if (!selectedSpace) throw new Error('Selecciona un CoLife.');
    const invitation = await spacesApi.rotateInvitation(selectedSpace.id);
    setNewInvitationUrl(invitation.url);
    showSuccess('Enlace nuevo generado; cualquier enlace anterior deja de ser válido.');
    await refresh();
  }

  async function handleRenameSpace(name: string) {
    if (!selectedSpace || !session?.authenticated) throw new Error('Selecciona un CoLife e inicia sesión.');
    const updated = await spacesApi.rename(selectedSpace.id, name);
    const next: Space = { ...selectedSpace, name: updated.name };
    setSelectedSpace(next);
    setSession((current) => current?.authenticated ? { ...current, spaces: current.spaces.map((space) => space.id === next.id ? next : space) } : current);
    showSuccess('CoLife y sus categorías personales vinculadas se han renombrado.');
    await refresh();
  }

  async function handleMemberRole(userId: string, role: 'ADMIN' | 'MEMBER') {
    if (!selectedSpace) throw new Error('Selecciona un CoLife.');
    await spacesApi.changeMemberRole(selectedSpace.id, userId, role);
    showSuccess('Rol actualizado.');
    await refresh();
  }

  async function handleRemoveMember(userId: string) {
    if (!selectedSpace) throw new Error('Selecciona un CoLife.');
    await spacesApi.removeMember(selectedSpace.id, userId);
    showSuccess('Acceso del miembro retirado; su historial se conserva.');
    await refresh();
  }

  async function handleArchiveSpace(archived: boolean) {
    if (!selectedSpace || !session?.authenticated) throw new Error('Selecciona un CoLife e inicia sesión.');
    const updated = archived ? await spacesApi.archive(selectedSpace.id) : await spacesApi.restore(selectedSpace.id);
    const next: Space = { ...selectedSpace, archivedAt: updated.archivedAt };
    setSelectedSpace(next);
    setSession((current) => current?.authenticated ? { ...current, spaces: current.spaces.map((space) => space.id === next.id ? next : space) } : current);
    showSuccess(archived ? 'CoLife archivado.' : 'CoLife restaurado.');
    await refresh();
  }

  async function handleLeaveSpace() {
    if (!selectedSpace || !session?.authenticated) throw new Error('Selecciona un CoLife e inicia sesión.');
    await spacesApi.leave(selectedSpace.id);
    const spaces = await spacesApi.list();
    setSession((current) => current?.authenticated ? { ...current, spaces } : current);
    const personal = spaces.find((space) => space.type === 'PERSONAL') ?? spaces[0];
    if (personal) switchSpace(personal);
    showSuccess('Has salido del CoLife. Tu historial y saldo se conservan.');
  }

  async function copyInvitation() {
    try { await navigator.clipboard.writeText(newInvitationUrl); showSuccess('Enlace copiado.'); }
    catch { showInfo('Enlace de invitación', newInvitationUrl); }
  }

  async function handleUpdateEntry(data: { type: EntryType; amount: number; description: string; date: string; categoryId: string }) {
    if (!editingEntry) return;
    await api.updateEntry(editingEntry.id, data);
    setModal(null); setEditingEntry(null); showSuccess('Movimiento actualizado.'); await refresh();
  }

  async function handleCreateRule(data: { type: EntryType; amount: number; description: string; categoryId: string; startDate: string; splitMode?: SplitMode; participants?: Array<{ userId: string }> }) {
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

  const pageTitle = visibleNavItems.find((item) => item.id === tab)?.label ?? (tab === 'settings' ? 'Preferencias' : 'Resumen');

  if (authLoading) return <div className="loading-state auth-loading"><LoaderCircle className="spin" size={24} /> Verificando tu sesión segura…</div>;
  if (authError) return <main className="auth-screen"><section className="auth-card"><div className="brand"><div className="brand-mark"><Sparkles size={18} /></div><span>my<span>life</span></span></div><h1>No se pudo verificar la sesión</h1><p>{authError}</p><button className="button button-primary" onClick={() => window.location.reload()}>Reintentar</button></section></main>;
  if (!session?.authenticated) return <main className="auth-screen"><section className="auth-card"><div className="brand"><div className="brand-mark"><Sparkles size={18} /></div><span>my<span>life</span></span></div><h1>Tus finanzas, en privado</h1><p>Inicia sesión con Google para abrir tu espacio personal o unirte a un CoLife.</p><a className="button button-primary auth-login" href={authApi.loginUrl()}>Continuar con Google <ArrowRight size={17} /></a></section></main>;
  if (!selectedSpace) return <main className="auth-screen"><section className="auth-card"><div className="brand"><div className="brand-mark"><Sparkles size={18} /></div><span>my<span>life</span></span></div><h1>No hay espacios disponibles</h1><p>Crea un espacio Personal con la configuración de datos antes de continuar.</p><button className="button button-primary" onClick={() => void authApi.logout().then(() => window.location.reload())}>Cerrar sesión</button></section></main>;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Sparkles size={18} strokeWidth={2.2} /></div><span>my<span>life</span></span></div>
        <div className="workspace-label">ESPACIO ACTIVO</div>
        <label className="workspace-select-label" htmlFor="workspace-select">Cambiar espacio</label>
        <select id="workspace-select" className="workspace-select" value={selectedSpace.id} onChange={(event) => { const next = session.spaces.find((space) => space.id === event.target.value); if (next) switchSpace(next); }} aria-label="Seleccionar espacio">
          {session.spaces.map((space) => <option key={space.id} value={space.id}>{space.type === 'PERSONAL' ? 'Personal' : space.name}</option>)}
        </select>
        <nav className="primary-nav" aria-label="Navegación principal">
          {visibleNavItems.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}><Icon size={18} /><span>{label}</span>{id === 'entries' && dashboard?.monthSummary.pending ? <b className="nav-count">{dashboard.monthSummary.pending}</b> : null}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip"><div className="tip-icon"><Sparkles size={15} /></div><strong>Pequeños pasos,<br />grandes cambios.</strong><span>Tu futuro se construye con lo que haces hoy.</span><button onClick={() => setTab('budgets')}>Ver mis objetivos <ArrowRight size={14} /></button></div>
          <div className="profile-row"><div className="avatar">{(session.user.displayName ?? session.user.email).slice(0, 1).toUpperCase()}</div><div className="profile-copy"><strong>{session.user.displayName ?? session.user.email}</strong><span>{selectedSpace.type === 'PERSONAL' ? 'Espacio personal' : selectedSpace.name}</span></div><button className="icon-button" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={() => void authApi.logout().then(() => window.location.reload()).catch((reason) => showError(reason instanceof Error ? reason.message : 'No se pudo cerrar sesión.'))}><Ellipsis size={19} /></button></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><label className="topbar-space-picker"><span className="sr-only">Espacio activo</span><select value={selectedSpace.id} onChange={(event) => { const next = session.spaces.find((space) => space.id === event.target.value); if (next) switchSpace(next); }} aria-label="Seleccionar espacio activo">{session.spaces.map((space) => <option key={space.id} value={space.id}>{space.type === 'PERSONAL' ? 'Personal' : space.name}</option>)}</select></label><span className="crumb-slash">/</span><strong>{pageTitle}</strong></div>
          <div className="topbar-actions"><div className="secure-chip"><span className="secure-dot" /> Sesión protegida</div><button className="icon-button" aria-label="Ayuda" onClick={() => showInfo('Consejo de privacidad', 'Tu sesión está protegida con Google y los cambios se limitan al espacio activo.') }><CircleHelp size={18} /></button><button className="icon-button notification-button" aria-label="Ver movimientos pendientes" title="Ver movimientos pendientes" onClick={() => setTab('entries')}><Bell size={18} /><i /></button><div className="top-avatar">{(session.user.displayName ?? session.user.email).slice(0, 1).toUpperCase()}</div></div>
        </header>

        <div className="page-content">
          <section className="welcome-row">
            <div><div className="eyebrow"><span className="eyebrow-line" /> TU DINERO, CON MÁS CLARIDAD</div><h1>{tab === 'overview' ? 'Un vistazo a tus finanzas' : pageTitle}</h1><p>{tab === 'overview' ? 'Cada decisión cuenta. Aquí tienes el mapa de tu mes.' : tab === 'entries' ? 'Todo lo que entra y sale, en un solo lugar.' : tab === 'shopping' ? 'Tickets, lista y precios para organizar mejor la compra.' : tab === 'recurring' ? 'Tus ingresos y gastos que se repiten cada mes.' : tab === 'budgets' ? 'Ponle intención a cada euro con límites claros.' : selectedSpace.type === 'COLIFE' ? 'Gastos y acuerdos de tu espacio compartido.' : 'Personaliza tus categorías y revisa cómo protegemos tus datos.'}</p></div>
            {selectedSpace.type === 'PERSONAL' && tab !== 'settings' && tab !== 'shopping' && <button className="button button-primary" onClick={() => openEntryForm()}><Plus size={17} /> Nuevo movimiento</button>}
          </section>

          {tab !== 'settings' && tab !== 'shopping' && <div className="month-toolbar"><div className="month-selector"><button className="month-arrow" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mes anterior"><ArrowLeft size={16} /></button><button className="month-current" onClick={() => setMonth(monthToday())}><CalendarDays size={16} /><span>{formatMonth(month)}</span><ChevronDown size={14} /></button><button className="month-arrow" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Mes siguiente"><ArrowRight size={16} /></button></div><span className="updated-label">Actualizado ahora</span></div>}

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
              <article className="panel cashflow-panel">
                <div className="panel-heading"><div><h2>Ingresos y gastos</h2><p>{cashflowFilter === 'both' ? 'Acumulado mensual' : 'Importes diarios'} · {formatMonth(month)}</p></div><div className="chart-filters"><select className="chart-filter" aria-label="Filtrar ingresos y gastos" value={cashflowFilter} onChange={(event) => setCashflowFilter(event.target.value as 'income' | 'expense' | 'both')}><option value="income">Solo ingresos</option><option value="expense">Solo gastos</option><option value="both">Ambos</option></select>{cashflowFilter === 'expense' && <select className="chart-filter" aria-label="Filtrar gastos fijos o variables" value={expenseDetailFilter} onChange={(event) => setExpenseDetailFilter(event.target.value as 'both' | 'fixed' | 'variable')}><option value="both">Fijos y variables</option><option value="fixed">Solo fijos</option><option value="variable">Solo variables</option></select>}</div></div>
                <div className="chart-legend">{(cashflowFilter !== 'expense') && <span><i className="legend-dot legend-income" /> {cashflowFilter === 'both' ? 'Ingresos acumulados' : 'Ingresos diarios'}</span>}{(cashflowFilter !== 'income') && (cashflowFilter === 'expense' && expenseDetailFilter !== 'both' ? <span><i className="legend-dot legend-expense" /> {expenseDetailFilter === 'fixed' ? 'Gastos fijos diarios' : 'Gastos variables diarios'}</span> : cashflowFilter === 'expense' ? <><span><i className="legend-dot legend-expense" /> Gastos fijos diarios</span><span><i className="legend-dot legend-expense-variable" /> Gastos variables diarios</span></> : <span><i className="legend-dot legend-expense" /> Gastos acumulados</span>)}<span className="legend-note">{cashflowFilter === 'both' ? 'Al pasar el cursor: importes de ese día' : 'Al pasar el cursor: importe de ese día'}</span></div>
                <div className="cashflow-chart">{cashflowData.length ? <Suspense fallback={<div className="empty-chart">Preparando gráfica…</div>}><DailyCashflowChart data={cashflowData} mode={cashflowFilter} expenseMode={expenseDetailFilter} /></Suspense> : <div className="empty-chart">No hay {cashflowFilter === 'income' ? 'ingresos' : 'gastos'} {cashflowFilter === 'expense' && expenseDetailFilter !== 'both' ? expenseDetailFilter === 'fixed' ? 'fijos' : 'variables' : ''} confirmados<br />en este periodo</div>}</div>
              </article>

              <article className="panel category-panel"><div className="panel-heading"><div><h2>¿A dónde va?</h2><p>{expenseFilter === 'all' ? 'Todos los gastos por categoría' : expenseFilter === 'fixed' ? 'Solo gastos fijos' : 'Solo gastos variables'}</p></div><select className="chart-filter" aria-label="Filtrar gastos por tipo" value={expenseFilter} onChange={(event) => setExpenseFilter(event.target.value as 'variable' | 'fixed' | 'all')}><option value="variable">Solo variables</option><option value="fixed">Solo fijos</option><option value="all">Todos</option></select></div><div className="donut-wrap">{expenseCategories.length ? <><Suspense fallback={<div className="empty-chart">Preparando gráfica…</div>}><ExpenseCategoryChart data={expenseCategories} /></Suspense><div className="donut-center"><span>{categoryExpenseLabel}</span><strong>{currency.format(categoryExpenseTotal)}</strong></div></> : <div className="empty-chart">No hay gastos {expenseFilter === 'variable' ? 'variables' : expenseFilter === 'fixed' ? 'fijos' : 'registrados'}<br />en este periodo</div>}</div><div className="category-legend">{expenseCategories.slice(0, 4).map((item) => <div className="category-legend-row" key={item.name}><span><i style={{ backgroundColor: item.color }} />{item.name}</span><strong>{categoryExpenseTotal ? `${Math.round(item.value / categoryExpenseTotal * 100)}%` : '0%'}</strong></div>)}</div><button className="text-action" onClick={() => setTab('entries')}>Ver movimientos <ArrowRight size={15} /></button></article>
            </section>

            <section className="bottom-grid"><article className="panel recent-panel"><div className="panel-heading"><div><h2>Actividad reciente</h2><p>Los últimos movimientos de tu mes</p></div><button className="text-action compact-action" onClick={() => setTab('entries')}>Ver todos <ArrowRight size={15} /></button></div><EntryList entries={dashboard.recentEntries} onConfirm={confirmEntry} onDelete={removeEntry} onEdit={openEntryForm} compact /></article><article className="panel budget-preview"><div className="panel-heading"><div><h2>Presupuestos</h2><p>Cuida el ritmo de tus gastos</p></div><button className="more-button" aria-label="Ver presupuestos" onClick={() => setTab('budgets')}><ArrowRight size={18} /></button></div>{budgets.slice(0, 3).map((budget) => <BudgetLine key={budget.id} budget={budget} />)}{budgets.length === 0 && <div className="empty-inline"><div className="empty-icon"><Target size={19} /></div><strong>Empieza por marcar un objetivo</strong><span>Define un límite mensual por categoría.</span><button className="button button-soft" onClick={() => openBudgetForm()}><Plus size={15} /> Crear presupuesto</button></div>}</article></section>
          </>}

          {tab === 'entries' && <section className="panel full-panel"><div className="panel-heading"><div><h2>Movimientos de {formatMonth(month)}</h2><p>Revisa tus ingresos, gastos y pagos previstos.</p></div>{selectedSpace.type === 'PERSONAL' && <div className="heading-actions"><button className="button button-soft" onClick={() => setModal('category')}><Tag size={15} /> Categoría</button><button className="button button-primary" onClick={() => openEntryForm()}><Plus size={16} /> Añadir</button></div>}</div><div className="table-toolbar"><label className="search-box"><Search size={16} /><input placeholder="Buscar movimiento..." value={search} onChange={(event) => setSearch(event.target.value)} /></label><label className="filter-box"><Filter size={15} /><select value={filterType} onChange={(event) => setFilterType(event.target.value as 'ALL' | EntryType)}><option value="ALL">Todos los tipos</option><option value="INCOME">Ingresos</option><option value="EXPENSE">Gastos</option></select></label></div><EntryList entries={entries.filter((entry) => (filterType === 'ALL' || entry.type === filterType) && `${entry.description} ${entry.category.name}`.toLowerCase().includes(search.toLowerCase()))} onConfirm={confirmEntry} onDelete={removeEntry} onEdit={selectedSpace.type === 'PERSONAL' ? openEntryForm : undefined} /></section>}

          {tab === 'recurring' && <section className="panel full-panel"><div className="panel-heading"><div><h2>Reglas mensuales</h2><p>Al abrir la app se generan los pagos previstos pendientes, una sola vez.</p></div>{selectedSpace.type === 'PERSONAL' && <button className="button button-primary" onClick={() => setModal('recurring')}><Plus size={16} /> Nueva regla</button>}</div>{rules.length ? <div className="rule-list">{rules.map((rule) => <div className={`rule-row ${!rule.active ? 'rule-inactive' : ''}`} key={rule.id}><span className={`entry-icon ${rule.type === 'INCOME' ? 'income-bg' : 'expense-bg'}`}>{rule.type === 'INCOME' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}</span><div className="rule-copy"><strong>{rule.description}</strong><span>{rule.category.name} · cada mes, día {new Date(`${rule.startDate.slice(0, 10)}T12:00:00`).getDate()}{rule.active ? '' : ' · pausada'}</span>{rule.shares?.length ? <small>Repartido entre {rule.shares.length} {rule.shares.length === 1 ? 'miembro' : 'miembros'}</small> : null}</div><strong className={`entry-amount ${rule.type === 'INCOME' ? 'positive-text' : ''}`}>{rule.type === 'INCOME' ? '+' : '−'}{currency.format(numberValue(rule.amount))}</strong>{selectedSpace.type === 'PERSONAL' && <><button className="button button-small button-soft" onClick={() => void toggleRule(rule)}>{rule.active ? 'Pausar' : 'Reanudar'}</button><button className="icon-button settings-action danger-action" onClick={() => void removeRule(rule)} aria-label={`Eliminar regla ${rule.description}`}><Trash2 size={16} /></button></>}</div>)}</div> : <EmptyState icon={<CalendarDays size={23} />} title="Todavía no hay reglas" text="Añade tus pagos fijos o ingresos recurrentes para tenerlos siempre presentes." action={selectedSpace.type === 'PERSONAL' ? 'Crear regla' : 'Sin reglas'} onAction={() => { if (selectedSpace.type === 'PERSONAL') setModal('recurring'); }} />}</section>}

          {tab === 'budgets' && <section className="panel full-panel"><div className="panel-heading"><div><h2>Límites por categoría</h2><p>Lo que has gastado frente a tu objetivo este mes.</p></div><button className="button button-primary" onClick={() => openBudgetForm()}><Plus size={16} /> Añadir límite</button></div>{budgets.length ? <div className="budget-grid">{budgets.map((budget) => <BudgetCard key={budget.id} budget={budget} onEdit={() => openBudgetForm(budget)} onDelete={() => void removeBudget(budget)} />)}</div> : <EmptyState icon={<Target size={23} />} title="Un plan para gastar con calma" text="Crea un presupuesto mensual para las categorías que quieras cuidar." action="Crear presupuesto" onAction={() => openBudgetForm()} />}</section>}

          {tab === 'shared' && selectedSpace.type === 'COLIFE' && <SharedExpensesPanel expenses={sharedExpenses} members={spaceMembers} archived={Boolean(selectedSpace.archivedAt)} onCreate={() => { setEditingSharedExpense(null); setModal('shared-expense'); }} onEdit={(expense) => { setEditingSharedExpense(expense); setModal('shared-expense'); }} onVoid={(expense) => void handleVoidSharedExpense(expense)} onConfirm={confirmEntry} />}

          {tab === 'settlements' && selectedSpace.type === 'COLIFE' && <SettlementsPanel ledger={settlementLedger} records={settlementRecords} currentUserId={session.user.id} archived={Boolean(selectedSpace.archivedAt)} onCreate={(from, to, amount, note) => handleCreateSettlement(from, to, amount, note)} />}

          {tab === 'settings' && selectedSpace.type === 'PERSONAL' && <PreferencesPanel categories={categories} onAddCategory={() => setModal('category')} onUpdateCategory={handleUpdateCategory} onDeleteCategory={handleDeleteCategory} />}
          {tab === 'settings' && <SpaceSettingsPanel space={selectedSpace} userId={session.user.id} members={spaceMembers} audit={auditEvents} invitationOpen={invitationOpen} newInvitationUrl={newInvitationUrl} onCreate={handleCreateSpace} onRename={handleRenameSpace} onToggleInvitation={handleInvitationToggle} onRotateInvitation={handleRotateInvitation} onChangeRole={handleMemberRole} onRemoveMember={handleRemoveMember} onArchive={handleArchiveSpace} onLeave={handleLeaveSpace} onCopyInvitation={() => void copyInvitation()} />}
          {tab === 'shopping' && <ShoppingPanel key={selectedSpace.id} isCoLife={selectedSpace.type === 'COLIFE'} members={spaceMembers} currentUserId={session.user.id} categories={categories} onFinancialChange={() => { void refresh(); }} />}

          {tab !== 'settings' && !dashboard && !loading && !error && <div className="empty-state"><Wallet size={22} />No hay datos todavía. Añade tu primer movimiento.</div>}
        </div>
        <footer className="footer-note"><span>Un paso a la vez. Vas bien.</span><span>Privado · Tus finanzas, solo tuyas <span className="footer-heart">♥</span></span></footer>
      </main>

      {modal && <ModalDialog title={modal === 'entry' ? editingEntry ? 'Editar movimiento' : 'Nuevo movimiento' : modal === 'recurring' ? 'Nueva regla mensual' : modal === 'category' ? 'Nueva categoría' : modal === 'shared-expense' ? editingSharedExpense ? 'Editar gasto compartido' : 'Nuevo gasto compartido' : editingBudget ? 'Editar presupuesto' : 'Nuevo presupuesto'} onClose={() => { setModal(null); setEditingEntry(null); setEditingBudget(null); setEditingSharedExpense(null); }}>
        {modal === 'entry' && <EntryForm categories={categories} initial={editingEntry} onSubmit={editingEntry ? handleUpdateEntry : handleCreateEntry} />}
        {modal === 'recurring' && <RecurringForm categories={categories} isCoLife={selectedSpace.type === 'COLIFE'} members={spaceMembers} currentUserId={session.user.id} onSubmit={handleCreateRule} />}
        {modal === 'category' && <CategoryForm onSubmit={handleCreateCategory} />}
        {modal === 'budget' && <BudgetForm categories={categories} month={month} initial={editingBudget} onSubmit={handleSaveBudget} />}
        {modal === 'shared-expense' && <SharedExpenseForm categories={categories} members={spaceMembers} currentUserId={session.user.id} initial={editingSharedExpense} onSubmit={handleCreateSharedExpense} />}
      </ModalDialog>}
    </div>
  );
}

function SpaceSettingsPanel({ space, userId, members, audit, invitationOpen, newInvitationUrl, onCreate, onRename, onToggleInvitation, onRotateInvitation, onChangeRole, onRemoveMember, onArchive, onLeave, onCopyInvitation }: {
  space: Space; userId: string; members: SpaceMember[]; audit: AuditEvent[]; invitationOpen: boolean; newInvitationUrl: string;
  onCreate: (name: string) => Promise<void>; onRename: (name: string) => Promise<void>;
  onToggleInvitation: (open: boolean) => Promise<void>; onRotateInvitation: () => Promise<void>;
  onChangeRole: (userId: string, role: 'ADMIN' | 'MEMBER') => Promise<void>; onRemoveMember: (userId: string) => Promise<void>;
  onArchive: (archived: boolean) => Promise<void>; onLeave: () => Promise<void>; onCopyInvitation: () => void;
}) {
  const [name, setName] = useState(space.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isAdmin = space.role === 'ADMIN';
  useEffect(() => setName(space.name), [space.id, space.name]);

  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try { await action(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo completar la operación.'); }
    finally { setBusy(false); }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await perform(async () => { await onCreate(name.trim()); setName(''); });
  }

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() === space.name) return;
    await perform(() => onRename(name.trim()));
  }

  const detailsForDisplay = (details: string) => {
    try {
      return JSON.stringify(JSON.parse(details), (key, value: unknown) => /userId$/i.test(key) ? undefined : value);
    } catch { return 'Evento registrado'; }
  };

  return (
    <section className="panel full-panel space-settings-panel">
      <div className="panel-heading">
        <div>
          <h2>{space.type === 'PERSONAL' ? 'Espacios CoLife' : `Administrar ${space.name}`}</h2>
          <p>{space.type === 'PERSONAL' ? 'Crea un espacio compartido para gastos, compras y liquidaciones.' : space.archivedAt ? 'Espacio archivado: solo se permiten consultas y liquidaciones.' : 'Gestiona invitaciones, miembros y actividad de este espacio.'}</p>
        </div>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {space.type === 'PERSONAL' ? (
        <form className="space-create-form" onSubmit={(event) => void create(event)}>
          <label className="form-field">Nombre del CoLife<input required maxLength={33} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Viaje a Lisboa" /></label>
          <button className="button button-primary" type="submit" disabled={busy}>{busy && <LoaderCircle size={14} className="spin" />}Crear CoLife</button>
        </form>
      ) : (
        <>
          {newInvitationUrl && (
            <div className="invitation-link-card">
              <div><strong>Enlace de invitación</strong><span>Se muestra solo al crear o renovar el enlace. Guárdalo ahora.</span><input aria-label="Enlace de invitación" readOnly value={newInvitationUrl} /></div>
              <button className="button button-small button-soft" onClick={onCopyInvitation}>Copiar</button>
            </div>
          )}
          {isAdmin && <>
            <form className="space-rename-form" onSubmit={(event) => void rename(event)}><label className="form-field">Nombre del CoLife<input required maxLength={33} value={name} onChange={(event) => setName(event.target.value)} /></label><button className="button button-small button-soft" type="submit" disabled={busy || Boolean(space.archivedAt) || name.trim() === space.name}>Guardar nombre</button></form>
            <div className="space-admin-actions">
              <div><strong>Invitación reutilizable</strong><span>{invitationOpen ? 'Aceptación abierta' : 'Aceptación cerrada'}</span></div>
              <div className="space-member-actions">
                <button className="button button-small button-soft" disabled={busy || Boolean(space.archivedAt)} onClick={() => void perform(() => onToggleInvitation(!invitationOpen))}>{invitationOpen ? 'Cerrar invitación' : 'Abrir invitación'}</button>
                <button className="button button-small button-soft" disabled={busy || Boolean(space.archivedAt)} onClick={() => void perform(onRotateInvitation)}>Generar enlace nuevo</button>
              </div>
            </div>
            <div className="space-admin-actions">
              <div><strong>{space.archivedAt ? 'Espacio archivado' : 'Archivar espacio'}</strong><span>{space.archivedAt ? 'Los datos se conservan y el archivo es reversible.' : 'Bloquea cambios ordinarios sin borrar historial.'}</span></div>
              <button className="button button-small button-soft" disabled={busy} onClick={() => void perform(() => onArchive(!space.archivedAt))}>{space.archivedAt ? 'Restaurar' : 'Archivar'}</button>
            </div>
            <h3>Miembros activos</h3>
            <div className="space-member-list">
              {members.map(({ user, role }) => (
                <div className="space-member-row" key={user.id}>
                  <div><strong>{user.displayName ?? user.email}</strong><span>{role === 'ADMIN' ? 'Administrador' : 'Miembro'}{user.id === userId ? ' · Tú' : ''}</span></div>
                  {!space.archivedAt && user.id !== userId && (
                    <div className="space-member-actions">
                      <button className="button button-small button-soft" disabled={busy} onClick={() => void perform(() => onChangeRole(user.id, role === 'ADMIN' ? 'MEMBER' : 'ADMIN'))}>{role === 'ADMIN' ? 'Hacer miembro' : 'Hacer admin'}</button>
                      <button className="button button-small budget-delete" disabled={busy} onClick={() => void perform(() => onRemoveMember(user.id))}>Retirar acceso</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>}
          {!space.archivedAt && <button className="button button-soft leave-space-button" disabled={busy} onClick={() => void perform(onLeave)}>Salir del CoLife</button>}
          <h3>Auditoría reciente</h3>
          {audit.length ? <div className="space-audit-list">{audit.map((event) => <article key={event.id}><div><strong>{event.action.replaceAll('_', ' ')}</strong><span>{event.actor.displayName ?? event.actor.email} · {formatDate(event.createdAt)}</span></div><small>{detailsForDisplay(event.details)}</small></article>)}</div> : <p className="empty-inline">Todavía no hay eventos de auditoría.</p>}
        </>
      )}
    </section>
  );
}

function SharedExpensesPanel({ expenses, members, archived, onCreate, onEdit, onVoid, onConfirm }: {
  expenses: SharedExpense[]; members: SpaceMember[]; archived: boolean;
  onCreate: () => void; onEdit: (expense: SharedExpense) => void; onVoid: (expense: SharedExpense) => void; onConfirm: (entry: Entry) => void;
}) {
  return <section className="panel full-panel"><div className="panel-heading"><div><h2>Gastos compartidos</h2><p>Los gastos confirmados se reflejan automáticamente en el espacio personal de cada participante.</p></div><button className="button button-primary" onClick={onCreate} disabled={archived}><Plus size={16} /> Nuevo gasto</button></div>{expenses.length ? <div className="rule-list">{expenses.map((expense) => <article className="rule-row" key={expense.id}><span className={`entry-icon ${expense.status === 'CONFIRMED' ? 'expense-bg' : 'income-bg'}`}><ArrowUpRight size={18} /></span><div className="rule-copy"><strong>{expense.description}</strong><span>{formatDate(expense.date)} · {expense.category.name} · pagó {expense.payer.displayName ?? expense.payer.email}</span><small>{expense.shares.map((share) => `${share.user.displayName ?? share.user.email}: ${currency.format(numberValue(share.amount))}`).join(' · ')}</small></div><strong className="entry-amount">{currency.format(numberValue(expense.amount))}</strong>{expense.status === 'PENDING' ? <button className="button button-small button-soft" disabled={archived} onClick={() => onConfirm(expense)}>Confirmar</button> : <span className="secure-chip">Confirmado</span>}{!archived && <><button className="button button-small button-soft" onClick={() => onEdit(expense)}>Editar</button><button className="button button-small budget-delete" onClick={() => onVoid(expense)}>Anular</button></>}</article>)}</div> : <EmptyState icon={<Wallet size={23} />} title="Aún no hay gastos compartidos" text={archived ? 'Este CoLife está archivado y no admite nuevos cambios.' : 'Registra un gasto, define quién lo pagó y elige cómo repartirlo.'} action="Crear gasto" onAction={onCreate} />}{members.length > 0 && <p className="shopping-form-hint">{members.length} {members.length === 1 ? 'miembro activo' : 'miembros activos'} en este CoLife. Las cuotas personales se crean al confirmar gastos recurrentes.</p>}</section>;
}

function SettlementsPanel({ ledger, records, currentUserId, archived, onCreate }: {
  ledger: SettlementLedger | null; records: SettlementRecord[]; currentUserId: string; archived: boolean;
  onCreate: (fromUserId: string, toUserId: string, amountCents: number, note?: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  if (!ledger) return <section className="panel full-panel"><div className="loading-state"><LoaderCircle className="spin" size={22} /> Cargando saldos…</div></section>;
  const memberName = (userId: string) => {
    const user = ledger.balances.find(({ user: item }) => item.id === userId)?.user;
    return user?.displayName ?? user?.email ?? 'Miembro';
  };
  return <section className="panel full-panel"><div className="panel-heading"><div><h2>Liquidaciones</h2><p>Saldo actual y pagos registrados. Las liquidaciones guardadas no se editan ni eliminan.</p></div></div><div className="budget-grid">{ledger.balances.map((balance) => <article className="budget-card" key={balance.user.id}><div className="budget-card-header"><span className="budget-dot" /><div><strong>{balance.user.displayName ?? balance.user.email}</strong><span>{balance.status === 'ACTIVE' ? 'Miembro activo' : 'Historial · miembro inactivo'}</span></div></div><div className="budget-card-amount"><strong className={balance.balanceCents >= 0 ? 'positive-text' : 'negative-text'}>{currency.format(balance.balanceCents / 100)}</strong></div></article>)}</div><h3>Pagos sugeridos</h3>{ledger.suggestions.length ? <div className="rule-list">{ledger.suggestions.map((transfer) => { const key = `${transfer.fromUserId}-${transfer.toUserId}`; const canRegister = currentUserId === transfer.fromUserId || currentUserId === transfer.toUserId; const amountCents = Math.round(Number(amounts[key] ?? transfer.amountCents / 100) * 100); const validAmount = Number.isSafeInteger(amountCents) && amountCents > 0 && amountCents <= transfer.amountCents; return <div className="rule-row" key={key}><span className="entry-icon expense-bg"><ArrowRight size={18} /></span><div className="rule-copy"><strong>{memberName(transfer.fromUserId)} → {memberName(transfer.toUserId)}</strong><span>Máximo sugerido: {currency.format(transfer.amountCents / 100)}</span></div>{canRegister && !archived ? <><label className="settlement-amount-field"><span className="sr-only">Importe parcial a registrar</span><input aria-label={`Importe de ${memberName(transfer.fromUserId)} a ${memberName(transfer.toUserId)}`} type="number" min="0.01" max={transfer.amountCents / 100} step="0.01" value={amounts[key] ?? (transfer.amountCents / 100).toFixed(2)} onChange={(event) => setAmounts((current) => ({ ...current, [key]: event.target.value }))} /></label><button className="button button-small button-soft" disabled={busy === key || !validAmount} onClick={() => { setBusy(key); void onCreate(transfer.fromUserId, transfer.toUserId, amountCents).then(() => setAmounts((current) => ({ ...current, [key]: '' }))).catch((reason) => showError(reason instanceof Error ? reason.message : 'No se pudo registrar el pago.')).finally(() => setBusy(null)); }}>{busy === key && <LoaderCircle size={14} className="spin" />}Registrar pago</button></> : <strong className="entry-amount">{currency.format(transfer.amountCents / 100)}</strong>}</div>; })}</div> : <p className="empty-inline">No hay pagos pendientes entre miembros.</p>}{records.length > 0 && <><h3>Historial de pagos</h3><div className="rule-list">{records.map((record) => <div className="rule-row" key={record.id}><span className="entry-icon income-bg"><Check size={18} /></span><div className="rule-copy"><strong>{record.fromUser.displayName ?? record.fromUser.email} pagó a {record.toUser.displayName ?? record.toUser.email}</strong><span>{formatDate(record.paidAt)} · registrado por {record.createdBy.displayName ?? record.createdBy.email}{record.note ? ` · ${record.note}` : ''}</span></div><strong className="entry-amount">{currency.format(numberValue(record.amount))}</strong></div>)}</div></>}</section>;
}

function SharedExpenseForm({ categories, members, currentUserId, initial, onSubmit }: {
  categories: Category[]; members: SpaceMember[]; currentUserId: string; initial: SharedExpense | null; onSubmit: (input: SharedExpenseInput) => Promise<void>;
}) {
  const expenseCategories = categories.filter((category) => category.type === 'EXPENSE');
  const [amount, setAmount] = useState(initial ? String(numberValue(initial.amount)) : '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? expenseCategories[0]?.id ?? '');
  const [date, setDate] = useState(initial?.date.slice(0, 10) ?? localDate());
  const [splitMode, setSplitMode] = useState<SplitMode>(initial?.shares[0]?.allocationType ?? 'EQUAL');
  const [payerUserId, setPayerUserId] = useState(initial?.payerUserId ?? currentUserId);
  const [participantIds, setParticipantIds] = useState<string[]>(initial?.shares.map(({ userId }) => userId) ?? [currentUserId]);
  const [participantValues, setParticipantValues] = useState<Record<string, string>>(() => Object.fromEntries((initial?.shares ?? []).map((share) => [share.userId, splitMode === 'PERCENTAGE' ? String((share.shareBasis ?? 0) / 100) : String(numberValue(share.amount))])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const totalCents = Math.round(Number(amount) * 100);
      if (!Number.isSafeInteger(totalCents) || totalCents <= 0) throw new Error('El importe debe ser positivo y tener como máximo dos decimales.');
      if (participantIds.length === 0) throw new Error('Selecciona al menos un participante.');
      const participants = participantIds.map((userId) => {
        if (splitMode === 'EQUAL') return { userId };
        const value = Number(participantValues[userId]);
        if (!Number.isFinite(value) || value <= 0) throw new Error('Introduce un valor positivo para cada participante.');
        if (splitMode === 'PERCENTAGE') {
          const shareBasis = Math.round(value * 100);
          if (Math.abs(shareBasis / 100 - value) > 0.000001 || shareBasis > 10_000) throw new Error('Los porcentajes admiten hasta dos decimales y no pueden superar el 100 %.');
          return { userId, shareBasis };
        }
        const amountCents = Math.round(value * 100);
        if (Math.abs(amountCents / 100 - value) > 0.000001) throw new Error('Los importes exactos admiten hasta dos decimales.');
        return { userId, amountCents };
      });
      if (splitMode === 'PERCENTAGE' && participants.reduce((sum, participant) => sum + ('shareBasis' in participant ? participant.shareBasis ?? 0 : 0), 0) !== 10_000) throw new Error('Los porcentajes deben sumar exactamente 100 %.');
      if (splitMode === 'EXACT' && participants.reduce((sum, participant) => sum + ('amountCents' in participant ? participant.amountCents ?? 0 : 0), 0) !== totalCents) throw new Error('Los importes individuales deben sumar el total del gasto.');
      await onSubmit({ totalCents, description: description.trim(), categoryId, date, payerUserId, isFixed: initial?.isFixed ?? false, splitMode, participants });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar el gasto.'); }
    finally { setBusy(false); }
  }

  return <form className="form-stack" onSubmit={(event) => void submit(event)}><label className="form-field">Descripción<input required maxLength={160} value={description} onChange={(event) => setDescription(event.target.value)} /></label><div className="form-grid"><label className="form-field">Importe total (€)<input required type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><label className="form-field">Fecha<input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label></div><label className="form-field">Categoría<select required value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{expenseCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="form-field">Pagó<select value={payerUserId} onChange={(event) => setPayerUserId(event.target.value)}>{members.map(({ user }) => <option key={user.id} value={user.id}>{user.displayName ?? user.email}</option>)}</select></label><label className="form-field">Reparto<select value={splitMode} onChange={(event) => setSplitMode(event.target.value as SplitMode)}><option value="EQUAL">A partes iguales</option><option value="PERCENTAGE">Por porcentaje</option><option value="EXACT">Importes exactos</option></select></label><fieldset className="shared-participants"><legend>Participantes</legend>{members.map(({ user }) => <div className="shared-participant-row" key={user.id}><label><input type="checkbox" checked={participantIds.includes(user.id)} onChange={(event) => { setParticipantIds((current) => event.target.checked ? [...current, user.id] : current.filter((id) => id !== user.id)); setParticipantValues((current) => ({ ...current, [user.id]: splitMode === 'PERCENTAGE' ? '100' : '' })); }} />{user.displayName ?? user.email}</label>{participantIds.includes(user.id) && splitMode !== 'EQUAL' && <label className="form-field"><span>{splitMode === 'PERCENTAGE' ? 'Porcentaje (%)' : 'Importe (€)'}</span><input type="number" min="0.01" step="0.01" value={participantValues[user.id] ?? ''} onChange={(event) => setParticipantValues((current) => ({ ...current, [user.id]: event.target.value }))} /></label>}</div>)}</fieldset>{error && <div className="form-error" role="alert">{error}</div>}<div className="form-actions"><button className="button button-primary" type="submit" disabled={busy || expenseCategories.length === 0}>{busy && <LoaderCircle size={15} className="spin" />}{initial ? 'Guardar cambios' : 'Guardar gasto'}</button></div></form>;
}

function EntryList({ entries, onConfirm, onDelete, onEdit, compact = false }: { entries: Entry[]; onConfirm: (entry: Entry) => void; onDelete?: (entry: Entry) => void; onEdit?: (entry: Entry) => void; compact?: boolean }) {
  if (!entries.length) return <div className="empty-list"><span className="empty-icon"><CreditCard size={19} /></span><strong>No hay movimientos que mostrar</strong><span>Prueba con otro filtro o añade tu primer movimiento.</span></div>;
  return <div className={`entry-list ${compact ? 'compact-list' : ''}`}>{entries.map((entry) => <div className="entry-row" key={entry.id}><span className={`entry-icon ${entry.type === 'INCOME' ? 'income-bg' : 'expense-bg'}`}>{entry.type === 'INCOME' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}</span><div className="entry-copy"><strong>{entry.description}</strong><span>{entry.category.name} <i>·</i> {formatDate(entry.date)}{entry.isFixed && <em className="fixed-badge">Fijo</em>}</span></div><span className={`entry-amount ${entry.type === 'INCOME' ? 'positive-text' : ''}`}>{entry.type === 'INCOME' ? '+' : '−'}{currency.format(numberValue(entry.amount))}</span>{entry.status === 'PENDING' ? <button className="button button-small confirm-button" onClick={() => onConfirm(entry)}><Check size={14} /> Confirmar</button> : <span className="confirmed-mark" title="Confirmado"><Check size={15} /></span>}{onEdit && <button className="row-edit" onClick={() => onEdit(entry)} aria-label={`Editar ${entry.description}`} title="Editar movimiento"><Pencil size={15} /></button>}{onDelete && !entry.recurringRuleId && <button className="row-delete" onClick={() => onDelete(entry)} aria-label={`Eliminar ${entry.description}`} title="Eliminar movimiento"><X size={15} /></button>}</div>)}</div>;
}

function BudgetLine({ budget }: { budget: Budget }) {
  const limit = numberValue(budget.limitAmount); const percent = limit ? Math.min(100, budget.spent / limit * 100) : 0;
  return <div className="budget-line"><div className="budget-line-top"><span><i style={{ backgroundColor: budget.category.color }} />{budget.category.name}</span><strong>{currency.format(budget.spent)} <small>/ {currency.format(limit)}</small></strong></div><div className="budget-track"><i className={percent >= 100 ? 'over-budget' : ''} style={{ width: `${percent}%`, backgroundColor: percent >= 100 ? '#f0786d' : budget.category.color }} /></div></div>;
}

function BudgetCard({ budget, onEdit, onDelete }: { budget: Budget; onEdit: () => void; onDelete: () => void }) {
  const limit = numberValue(budget.limitAmount); const ratio = limit ? budget.spent / limit : 0; const remaining = limit - budget.spent;
  return <article className="budget-card"><div className="budget-card-header"><span className="budget-dot" style={{ backgroundColor: budget.category.color }} /><div><strong>{budget.category.name}</strong><span>{formatMonth(budget.month.slice(0,  7))}</span></div><span className="budget-percent">{Math.round(ratio * 100)}%</span></div><div className="budget-card-amount"><strong>{currency.format(budget.spent)}</strong><span>de {currency.format(limit)}</span></div><div className="budget-track large-track"><i className={ratio >= 1 ? 'over-budget' : ''} style={{ width: `${Math.min(100, ratio * 100)}%`, backgroundColor: ratio >= 1 ? '#f0786d' : budget.category.color }} /></div><div className={`budget-remaining ${remaining < 0 ? 'negative-text' : ''}`}>{remaining >= 0 ? `Te quedan ${currency.format(remaining)}` : `Has superado el límite por ${currency.format(Math.abs(remaining))}`}</div><div className="budget-card-actions"><button className="button button-small button-soft" onClick={onEdit}><Pencil size={13} /> Editar</button><button className="button button-small budget-delete" onClick={onDelete}><Trash2 size={13} /> Eliminar</button></div></article>;
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

function TransactionFields({ categories, initial, defaultType = 'EXPENSE', showTypeSwitch = true }: { categories: Category[]; initial?: Entry | null; defaultType?: EntryType; showTypeSwitch?: boolean }) {
  const [type, setType] = useState<EntryType>(initial?.type ?? defaultType);
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const matching = categories.filter((category) => category.type === type);
  function changeType(nextType: EntryType) {
    setType(nextType);
    setCategoryId(categories.find((category) => category.type === nextType)?.id ?? '');
  }
  return <>{showTypeSwitch && <div className="type-switch"><button type="button" className={type === 'EXPENSE' ? 'selected expense-selected' : ''} onClick={() => changeType('EXPENSE')}><TrendingDown size={15} /> Gasto</button><button type="button" className={type === 'INCOME' ? 'selected income-selected' : ''} onClick={() => changeType('INCOME')}><TrendingUp size={15} /> Ingreso</button></div>}<input type="hidden" name="type" value={type} /><label className="form-field">Concepto<input name="description" required maxLength={160} defaultValue={initial?.description ?? ''} placeholder="Ej. Compra semanal" /></label><div className="form-two"><label className="form-field">Importe (€)<input name="amount" type="number" required min="0.01" max="9999999999.99" step="0.01" defaultValue={initial ? numberValue(initial.amount) : ''} placeholder="0,00" /></label><label className="form-field">Fecha<input name="date" type="date" required defaultValue={initial?.date.slice(0, 10) ?? localDate()} /></label></div><label className="form-field">Categoría<select name="categoryId" required value={matching.some((category) => category.id === categoryId) ? categoryId : ''} onChange={(event) => setCategoryId(event.target.value)}><option value="" disabled>Elige una categoría</option>{matching.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>{!matching.length && <span className="form-hint">Primero crea una categoría de este tipo.</span>}</>;
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

function RecurringForm({ categories, isCoLife, members, currentUserId, onSubmit }: { categories: Category[]; isCoLife: boolean; members: SpaceMember[]; currentUserId: string; onSubmit: (data: { type: EntryType; amount: number; description: string; categoryId: string; startDate: string; splitMode?: SplitMode; participants?: Array<{ userId: string }> }) => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [participantIds, setParticipantIds] = useState<string[]>([currentUserId]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      if (isCoLife && participantIds.length === 0) throw new Error('Selecciona al menos un participante.');
      await onSubmit({ type: data.type as EntryType, amount: Number(data.amount), description: String(data.description), categoryId: String(data.categoryId), startDate: String(data.date), ...(isCoLife ? { splitMode: 'EQUAL' as const, participants: participantIds.map((userId) => ({ userId })) } : {}) });
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar.'); } finally { setBusy(false); }
  }
  return <form className="modal-form" onSubmit={(event) => void submit(event)}><TransactionFields categories={categories} defaultType="EXPENSE" showTypeSwitch={!isCoLife} />{isCoLife && <fieldset className="shared-participants"><legend>Reparto igual entre</legend>{members.map(({ user }) => <label key={user.id}><input type="checkbox" checked={participantIds.includes(user.id)} onChange={(event) => setParticipantIds((current) => event.target.checked ? [...current, user.id] : current.filter((id) => id !== user.id))} />{user.displayName ?? user.email}</label>)}</fieldset>}<p className="form-hint">Se creará un movimiento pendiente cada mes, el mismo día. En meses cortos se usará el último día. Las cuotas personales se crearán cuando se confirme.</p><FormError error={error} /><FormActions busy={busy} submit="Crear regla" /></form>;
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