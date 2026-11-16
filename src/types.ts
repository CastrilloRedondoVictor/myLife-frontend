export type EntryType = 'INCOME' | 'EXPENSE';
export type EntryStatus = 'PENDING' | 'CONFIRMED';

export interface Category {
  id: string;
  name: string;
  type: EntryType;
  color: string;
  icon: string;
}

export interface Entry {
  id: string;
  type: EntryType;
  status: EntryStatus;
  amount: number | string;
  description: string;
  date: string;
  categoryId: string;
  category: Category;
  recurringRuleId: string | null;
  isFixed: boolean;
}

export interface RecurringRule {
  id: string;
  type: EntryType;
  amount: number | string;
  description: string;
  startDate: string;
  endDate: string | null;
  active: boolean;
  category: Category;
}

export interface Budget {
  id: string;
  limitAmount: number | string;
  spent: number;
  month: string;
  category: Category;
}

export interface DashboardData {
  month: string;
  balance: number;
  monthSummary: {
    income: number;
    expense: number;
    fixedIncome: number;
    variableIncome: number;
    fixedExpense: number;
    variableExpense: number;
    pending: number;
  };
  categories: Array<{ categoryId: string; categoryName: string; color: string; type: EntryType; fixed: number; variable: number }>;
  recentEntries: Entry[];
}
