export type EntryType = 'INCOME' | 'EXPENSE';
export type EntryStatus = 'PENDING' | 'CONFIRMED';
export type SpaceType = 'PERSONAL' | 'COLIFE';
export type SplitMode = 'EQUAL' | 'PERCENTAGE' | 'EXACT';

export interface Space {
  id: string;
  name: string;
  type: SpaceType;
  currency: string;
  role: 'ADMIN' | 'MEMBER';
  archivedAt: string | null;
}

export interface CreatedSpace extends Space {
  invitation?: { token: string; url: string };
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl?: string | null;
}

export type AuthSession =
  | { authenticated: false }
  | { authenticated: true; user: UserProfile; spaces: Space[]; csrfToken: string | null };

export interface SpaceMember {
  user: UserProfile;
  role: 'ADMIN' | 'MEMBER';
  joinedAt: string;
}

export interface SharedExpenseShare {
  id: string;
  userId: string;
  amount: number | string;
  allocationType: SplitMode;
  shareBasis: number | null;
  user: UserProfile;
}

export interface SharedExpense extends Entry {
  payerUserId: string;
  payer: UserProfile;
  shares: SharedExpenseShare[];
  shoppingReceipt?: { id: string } | null;
}

export interface SettlementBalance {
  user: UserProfile;
  role: 'ADMIN' | 'MEMBER';
  status: 'ACTIVE' | 'LEFT';
  joinedAt: string;
  leftAt: string | null;
  balanceCents: number;
}

export interface SuggestedTransfer {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
}

export interface SettlementLedger {
  balances: SettlementBalance[];
  suggestions: SuggestedTransfer[];
}

export interface SettlementRecord {
  id: string;
  fromUser: UserProfile;
  toUser: UserProfile;
  createdBy: UserProfile;
  amount: number | string;
  note: string | null;
  paidAt: string;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  actorId: string;
  actor: UserProfile;
  entityType: string;
  entityId: string;
  action: string;
  details: string;
  createdAt: string;
}

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
  payerUserId?: string | null;
  derivedShareId?: string | null;
  voidedAt?: string | null;
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
  payerUserId?: string | null;
  splitMode?: SplitMode | null;
  shares?: Array<{ userId: string; allocationType: SplitMode; shareBasis: number | null; exactAmount: number | string | null }>;
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
  dailyCashflow: Array<{ date: string; income: number; expense: number; fixedExpense: number; variableExpense: number }>;
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
  financialEntry: Entry & { shares?: SharedExpenseShare[] };
  voidedAt?: string | null;
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
