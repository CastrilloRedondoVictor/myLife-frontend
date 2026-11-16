import type { Budget, Category, DashboardData, Entry, EntryStatus, EntryType, RecurringRule } from './types';

const baseUrl = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:4000/api').replace(/\/$/, '');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error || `Error al consultar el servidor (${response.status}).`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

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
  createRecurring: (rule: { type: EntryType; amount: number; description: string; categoryId: string; startDate: string }) =>
    request<RecurringRule>('/recurring', { method: 'POST', body: JSON.stringify(rule) }),
  toggleRecurring: (id: string, active: boolean) =>
    request<RecurringRule>(`/recurring/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) }),
  deleteRecurring: (id: string) => request<void>(`/recurring/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  saveBudget: (budget: { categoryId: string; month: string; limitAmount: number }) =>
    request<Budget>('/budgets', { method: 'PUT', body: JSON.stringify(budget) }),
  updateBudget: (id: string, budget: { categoryId: string; month: string; limitAmount: number }) =>
    request<Budget>(`/budgets/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(budget) }),
  deleteBudget: (id: string) => request<void>(`/budgets/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
