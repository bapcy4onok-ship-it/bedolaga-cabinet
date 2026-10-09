import apiClient from './client';

// ============ Словари ============

export const PROFIT_CATEGORIES = [
  'server',
  'ads',
  'cdn',
  'personal',
  'partner',
  'staff',
  'ai',
  'other',
] as const;

export type ProfitCategory = (typeof PROFIT_CATEGORIES)[number];

/**
 * monthly — задана месячная стоимость, разносится по дням периода;
 * once — разовая трата суммой; share — процент от прибыли после всех прочих расходов.
 */
export type ProfitKind = 'monthly' | 'once' | 'share';

export const PROFIT_CURRENCIES = ['RUB', 'USD', 'EUR'] as const;
export type ProfitCurrency = (typeof PROFIT_CURRENCIES)[number];

// ============ Параметры периода ============

export interface ProfitParams {
  days?: number;
  start_date?: string;
  end_date?: string;
}

// ============ Отчёт ============

export interface ProfitExpenseItem {
  /** null у автоматических строк (выплаты партнёрам, прикидка CDN) — их не редактируют. */
  id: number | null;
  category: ProfitCategory;
  kind: ProfitKind;
  title: string;
  group_name: string | null;
  link: string | null;
  amount_minor: number;
  currency: ProfitCurrency;
  full_amount_kopeks: number;
  /** Доля записи, попавшая в выбранный период. Именно она вычитается из дохода. */
  period_amount_kopeks: number;
  spent_at: string | null;
  period_start: string | null;
  period_end: string | null;
  started_at: string | null;
  ended_at: string | null;
  node_uuid: string | null;
  color: string | null;
  notes: string | null;
  /** Заполнены у строк вида «доля от прибыли». */
  percent: number | null;
  is_share: boolean;
  is_estimate: boolean;
  source: 'manual' | 'withdrawal' | 'estimate';
  payouts_count?: number | null;
  user_id?: number | null;
  uncovered_days?: number | null;
  daily_kopeks?: number | null;
}

export interface ProfitExpenseSubgroup {
  name: string;
  total_kopeks: number;
  count: number;
  color: string | null;
}

export interface ProfitExpenseGroup {
  category: ProfitCategory;
  total_kopeks: number;
  estimated_kopeks: number;
  items: ProfitExpenseItem[];
  subgroups: ProfitExpenseSubgroup[];
}

export interface ProfitRevenue {
  gateway_kopeks: number;
  gifts_kopeks: number;
  donations_kopeks: number;
  /** Часть donations_kopeks: надбавки «+N ₽ на поддержку», пришедшие внутри пополнений. */
  donations_upsell_kopeks: number;
  total_kopeks: number;
  /** Начисления админом вручную. В total НЕ входят — это не пришедшие деньги. */
  manual_topup_kopeks: number;
}

export interface ProfitFx {
  rates: Record<string, number>;
  source: string;
  date: string | null;
  fetched_at: string | null;
}

export interface ProfitReport {
  period: { start: string; end: string; days: number };
  revenue: ProfitRevenue;
  expenses: {
    total_kopeks: number;
    estimated_kopeks: number;
    groups: ProfitExpenseGroup[];
  };
  /** База, от которой считается процент каждой доли. */
  profit_before_shares_kopeks: number;
  shares_total_kopeks: number;
  shares_percent_total: number;
  net_profit_kopeks: number;
  margin_percent: number;
  fx: ProfitFx;
}

// ============ Строки расходов ============

export interface ProfitExpense {
  id: number;
  category: ProfitCategory;
  kind: ProfitKind;
  title: string;
  group_name: string | null;
  link: string | null;
  amount_minor: number;
  currency: ProfitCurrency;
  /** Сумма в основных единицах валюты — то, что видит и правит человек. */
  amount: number;
  /** Процент от прибыли у kind='share'. */
  percent: number | null;
  fx_rate_snapshot: number | null;
  spent_at: string | null;
  period_start: string | null;
  period_end: string | null;
  started_at: string | null;
  ended_at: string | null;
  is_active: boolean;
  node_uuid: string | null;
  color: string | null;
  sort_order: number;
  notes: string | null;
  created_at: string | null;
}

export interface ProfitExpenseWrite {
  category: ProfitCategory;
  kind?: ProfitKind;
  title: string;
  group_name?: string | null;
  link?: string | null;
  amount: number;
  currency?: ProfitCurrency;
  percent?: number | null;
  spent_at?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  is_active?: boolean;
  node_uuid?: string | null;
  color?: string | null;
  sort_order?: number;
  notes?: string | null;
}

// ============ Серверы ============

export interface ProfitNodeCost {
  uuid: string;
  name: string;
  address: string | null;
  country_code: string | null;
  is_connected: boolean;
  is_disabled: boolean;
  users_online: number;
  /** Хостинг из панели Remnawave — подставляется в форму, пока свой не задан. */
  provider_name: string | null;
  expense: ProfitExpense | null;
}

export interface ProfitServerCosts {
  panel_available: boolean;
  nodes: ProfitNodeCost[];
  /** Строки категории «серверы» вне панели: VPS бота, БД, купленные вручную. */
  standalone: ProfitExpense[];
  monthly_total_kopeks: number;
}

// ============ API ============

const BASE = '/cabinet/admin/profit';

export const profitApi = {
  getSummary: async (params: ProfitParams): Promise<ProfitReport> => {
    const response = await apiClient.get<ProfitReport>(`${BASE}/summary`, { params });
    return response.data;
  },

  getRates: async (): Promise<ProfitFx> => {
    const response = await apiClient.get<ProfitFx>(`${BASE}/rates`);
    return response.data;
  },

  listExpenses: async (category?: ProfitCategory): Promise<ProfitExpense[]> => {
    const response = await apiClient.get<ProfitExpense[]>(`${BASE}/expenses`, {
      params: category ? { category } : undefined,
    });
    return response.data;
  },

  createExpense: async (payload: ProfitExpenseWrite): Promise<ProfitExpense> => {
    const response = await apiClient.post<ProfitExpense>(`${BASE}/expenses`, payload);
    return response.data;
  },

  updateExpense: async (id: number, payload: ProfitExpenseWrite): Promise<ProfitExpense> => {
    const response = await apiClient.patch<ProfitExpense>(`${BASE}/expenses/${id}`, payload);
    return response.data;
  },

  deleteExpense: async (id: number): Promise<void> => {
    await apiClient.delete(`${BASE}/expenses/${id}`);
  },

  getServers: async (): Promise<ProfitServerCosts> => {
    const response = await apiClient.get<ProfitServerCosts>(`${BASE}/servers`);
    return response.data;
  },
};
