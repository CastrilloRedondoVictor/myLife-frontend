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

export type ShoppingDimension = 'WEIGHT' | 'VOLUME' | 'COUNT';
export type ShoppingUnit = 'g' | 'kg' | 'ml' | 'l' | 'unit';

export interface Supermarket {
  id: string;
  name: string;
  active: boolean;
}

export interface ShoppingVariant {
  id: string;
  productId: string;
  brand: string | null;
  packageLabel: string | null;
  active: boolean;
  latestPurchase?: {
    unit: ShoppingUnit;
    unitsPurchased: number;
    quantityBase: number;
    amount: number;
    date: string;
  } | null;
}

export interface ShoppingProduct {
  id: string;
  name: string;
  dimension: ShoppingDimension | null;
  active: boolean;
  variants?: ShoppingVariant[];
}

export interface ShoppingListItem {
  id: string;
  productId: string;
  note: string | null;
  createdAt: string;
  product: ShoppingProduct;
}

export interface ShoppingReceiptItem {
  id: string;
  productId: string;
  variantId: string;
  unit: ShoppingUnit;
  unitsPurchased: number;
  quantityBase: number | string;
  amount: number | string;
  product: ShoppingProduct;
  variant: ShoppingVariant;
}

export interface ShoppingReceipt {
  id: string;
  supermarketId: string;
  date: string;
  adjustment: number | string;
  totalAmount: number | string;
  supermarket: Supermarket;
  financialEntry: Entry;
  items: ShoppingReceiptItem[];
}

export interface PriceRecommendation {
  supermarketId: string;
  supermarketName: string;
  variantId: string;
  brand: string | null;
  packageLabel: string | null;
  amount: number;
  quantityBase: number;
  pricePerStandard: number;
  date: string;
}

export interface PriceHistoryPoint extends PriceRecommendation {
  id: string;
}

export interface ProductComparison {
  product: ShoppingProduct;
  unit: string | null;
  recommendations: PriceRecommendation[];
  history: PriceHistoryPoint[];
}
