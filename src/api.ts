import type { AuditEvent, AuthSession, Budget, Category, CreatedSpace, DashboardData, Entry, EntryStatus, EntryType, ProductComparison, RecurringRule, SettlementLedger, SettlementRecord, SharedExpense, ShoppingListItem, ShoppingProduct, ShoppingReceipt, ShoppingUnit, Space, SpaceMember, SplitMode, Supermarket } from './types';

const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace(/\/$/, '');
const csrfCookieName = 'mylife_csrf';
let csrfToken: string | null = null;
let selectedSpaceId: string | null = null;

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

export function setSelectedSpaceId(spaceId: string | null) {
  selectedSpaceId = spaceId;
}

function readCsrfCookie() {
  if (typeof document === 'undefined') return null;
  const prefix = `${csrfCookieName}=`;
  const cookie = document.cookie.split('; ').find((part) => part.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (selectedSpaceId) headers.set('x-space-id', selectedSpaceId);
  if (!['GET', 'HEAD', 'OPTIONS'].includes((init?.method ?? 'GET').toUpperCase())) {
    const token = csrfToken ?? readCsrfCookie();
    if (token) headers.set('x-csrf-token', token);
  }
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string; message?: string } | null;
    throw new Error(body?.error || body?.message || `Error al consultar el servidor (${response.status}).`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const authApi = {
  session: async () => {
    const session = await request<AuthSession>('/auth/session');
    setCsrfToken(session.authenticated ? session.csrfToken : null);
    return session;
  },
  loginUrl: () => `${baseUrl}/auth/google/login`,
  logout: async () => {
    await request<void>('/auth/logout', { method: 'POST' });
    setCsrfToken(null);
    setSelectedSpaceId(null);
  },
};

export interface SharedExpenseInput {
  totalCents: number;
  description: string;
  categoryId: string;
  date: string;
  payerUserId?: string;
  isFixed?: boolean;
  splitMode: SplitMode;
  participants: Array<{ userId: string; shareBasis?: number; amountCents?: number }>;
}

export const spacesApi = {
  list: () => request<Space[]>('/spaces'),
  create: (name: string) => request<CreatedSpace>('/spaces', { method: 'POST', body: JSON.stringify({ name }) }),
  rename: (spaceId: string, name: string) => request<Pick<Space, 'id' | 'name' | 'type' | 'currency' | 'archivedAt'>>(`/spaces/${encodeURIComponent(spaceId)}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  members: (spaceId: string) => request<SpaceMember[]>(`/spaces/${encodeURIComponent(spaceId)}/members`),
  invitationStatus: (spaceId: string) => request<{ acceptanceOpen: boolean }>(`/spaces/${encodeURIComponent(spaceId)}/invitation`),
  rotateInvitation: (spaceId: string) => request<{ token: string; url: string }>(`/spaces/${encodeURIComponent(spaceId)}/invitation/rotate`, { method: 'POST' }),
  invite: (spaceId: string, open: boolean) => request<{ acceptanceOpen: boolean }>(`/spaces/${encodeURIComponent(spaceId)}/invitation`, { method: 'PATCH', body: JSON.stringify({ open }) }),
  changeMemberRole: (spaceId: string, userId: string, role: 'ADMIN' | 'MEMBER') => request<{ userId: string; role: 'ADMIN' | 'MEMBER' }>(`/spaces/${encodeURIComponent(spaceId)}/members/${encodeURIComponent(userId)}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  removeMember: (spaceId: string, userId: string) => request<void>(`/spaces/${encodeURIComponent(spaceId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  leave: (spaceId: string) => request<void>(`/spaces/${encodeURIComponent(spaceId)}/leave`, { method: 'POST' }),
  archive: (spaceId: string) => request<{ archivedAt: string | null }>(`/spaces/${encodeURIComponent(spaceId)}/archive`, { method: 'PATCH', body: JSON.stringify({ archived: true }) }),
  restore: (spaceId: string) => request<{ archivedAt: string | null }>(`/spaces/${encodeURIComponent(spaceId)}/archive`, { method: 'PATCH', body: JSON.stringify({ archived: false }) }),
  audit: (spaceId: string) => request<AuditEvent[]>(`/spaces/${encodeURIComponent(spaceId)}/audit`),
  acceptInvitation: (token: string) => request<{ spaceId: string; name: string }>('/spaces/invitations/accept', { method: 'POST', body: JSON.stringify({ token }) }),
};

export const sharedExpensesApi = {
  list: () => request<SharedExpense[]>('/shared-expenses'),
  create: (input: SharedExpenseInput) => request<SharedExpense>('/shared-expenses', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: SharedExpenseInput) => request<SharedExpense>(`/shared-expenses/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }),
  void: (id: string) => request<void>(`/shared-expenses/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export const settlementsApi = {
  ledger: () => request<SettlementLedger>('/settlements/balance'),
  list: () => request<SettlementRecord[]>('/settlements'),
  create: (input: { fromUserId: string; toUserId: string; amountCents: number; note?: string; paidAt?: string }) => request<SettlementLedger>('/settlements', { method: 'POST', body: JSON.stringify(input) }),
};

export const api = {
  generateRecurring: () => request<{ created: number }>('/recurring/generate', { method: 'POST' }),
  dashboard: (month: string) => request<DashboardData>(`/dashboard?month=${month}`),
  categories: () => request<Category[]>('/categories'),
  entries: (month: string) => {
    const [year, value] = month.split('-').map(Number);
    const lastDay = new Date(year, value, 0).getDate();
    return request<{ data: Entry[]; total: number }>(`/entries?from=${month}-01&to=${month}-${String(lastDay).padStart(2, '0')}&pageSize=100`);
  },
  recurring: () => request<RecurringRule[]>('/recurring'),
  budgets: (month: string) => request<Budget[]>(`/budgets?month=${month}`),
  createEntry: (entry: { type: EntryType; amount: number; description: string; date: string; categoryId: string; status: EntryStatus }) =>
    request<Entry>('/entries', { method: 'POST', body: JSON.stringify(entry) }),
  updateEntry: (id: string, entry: { type: EntryType; amount: number; description: string; date: string; categoryId: string }) =>
    request<Entry>(`/entries/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(entry) }),
  confirmEntry: (id: string) => request<Entry>(`/entries/${id}/confirm`, { method: 'PATCH' }),
  deleteEntry: (id: string) => request<void>(`/entries/${id}`, { method: 'DELETE' }),
  createCategory: (category: { name: string; type: EntryType; color: string; icon: string }) =>
    request<Category>('/categories', { method: 'POST', body: JSON.stringify(category) }),
  updateCategory: (id: string, category: { name: string; color: string }) =>
    request<Category>(`/categories/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(category) }),
  deleteCategory: (id: string) => request<void>(`/categories/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  createRecurring: (rule: { type: EntryType; amount: number; description: string; categoryId: string; startDate: string; endDate?: string; splitMode?: SplitMode; participants?: Array<{ userId: string }> }) =>
    request<RecurringRule>('/recurring', { method: 'POST', body: JSON.stringify(rule) }),
  toggleRecurring: (id: string, active: boolean) =>
    request<RecurringRule>(`/recurring/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) }),
  deleteRecurring: (id: string) => request<void>(`/recurring/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  saveBudget: (budget: { categoryId: string; month: string; limitAmount: number }) =>
    request<Budget>('/budgets', { method: 'PUT', body: JSON.stringify(budget) }),
  updateBudget: (id: string, budget: { categoryId: string; month: string; limitAmount: number }) =>
    request<Budget>(`/budgets/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(budget) }),
  deleteBudget: (id: string) => request<void>(`/budgets/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  supermarkets: (includeArchived = false) => request<Supermarket[]>(`/shopping/supermarkets${includeArchived ? '?includeArchived=true' : ''}`),
  createSupermarket: (name: string) => request<Supermarket>('/shopping/supermarkets', { method: 'POST', body: JSON.stringify({ name }) }),
  updateSupermarket: (id: string, data: { name?: string; active?: boolean }) =>
    request<Supermarket>(`/shopping/supermarkets/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  shoppingProducts: (query = '', includeArchived = false) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (includeArchived) params.set('includeArchived', 'true');
    return request<ShoppingProduct[]>(`/shopping/products${params.size ? `?${params}` : ''}`);
  },
  createShoppingProduct: (name: string) =>
    request<ShoppingProduct>('/shopping/products', { method: 'POST', body: JSON.stringify({ name }) }),
  updateShoppingProduct: (id: string, data: { name?: string; active?: boolean }) =>
    request<ShoppingProduct>(`/shopping/products/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  shoppingList: () => request<ShoppingListItem[]>('/shopping/list'),
  addShoppingListItem: (productId: string, note?: string) =>
    request<ShoppingListItem>('/shopping/list', { method: 'POST', body: JSON.stringify({ productId, note }) }),
  updateShoppingListItem: (id: string, note: string | null) =>
    request<ShoppingListItem>(`/shopping/list/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ note }) }),
  removeShoppingListItem: (id: string) => request<void>(`/shopping/list/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  shoppingReceipts: () => request<ShoppingReceipt[]>('/shopping/receipts'),
  createShoppingReceipt: (receipt: ShoppingReceiptInput) =>
    request<ShoppingReceipt>('/shopping/receipts', { method: 'POST', body: JSON.stringify(receipt) }),
  updateShoppingReceipt: (id: string, receipt: ShoppingReceiptInput) =>
    request<ShoppingReceipt>(`/shopping/receipts/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(receipt) }),
  deleteShoppingReceipt: (id: string) => request<void>(`/shopping/receipts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  productComparison: (productId: string) =>
    request<ProductComparison>(`/shopping/compare/${encodeURIComponent(productId)}`),
};

export interface ShoppingReceiptInput {
  supermarketName: string;
  categoryId: string;
  date: string;
  adjustment: number;
  splitMode?: SplitMode;
  participants?: Array<{ userId: string; shareBasis?: number; amountCents?: number }>;
  items: Array<{ productId: string; brand?: string; packageLabel?: string; unitsPurchased: number; quantity: number; unit: ShoppingUnit; amount: number }>;
}
