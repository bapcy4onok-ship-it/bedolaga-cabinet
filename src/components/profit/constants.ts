import type { ProfitCategory } from '../../api/adminProfit';

/** Порядок блоков расходов на странице — он же порядок групп в ответе бэкенда. */
export const CATEGORY_ORDER: ProfitCategory[] = [
  'server',
  'ads',
  'cdn',
  'personal',
  'partner',
  'staff',
  'ai',
  'other',
];

interface CategoryMeta {
  /** Ключ перевода названия категории. */
  labelKey: string;
  /** Цвет категории в разбивке и на полосе расходов. */
  color: string;
  /** Что предлагать по умолчанию при добавлении строки в этой категории. */
  defaultKind: 'monthly' | 'once';
  /** Показывать ли поле «ссылка» (нужно только рекламе). */
  hasLink: boolean;
  /** Показывать ли поле «хостинг/провайдер» — по нему идёт цветовая группировка. */
  hasGroup: boolean;
  /**
   * Можно ли завести долю от прибыли вместо суммы. У серверов и CDN нельзя:
   * там счёт выставляет хостер, а не процент от заработанного.
   */
  allowsShare: boolean;
  /** Категория заполняется автоматически и руками не редактируется. */
  readOnly?: boolean;
}

export const CATEGORY_META: Record<ProfitCategory, CategoryMeta> = {
  server: {
    labelKey: 'admin.profit.categories.server',
    color: '#818cf8',
    defaultKind: 'monthly',
    hasLink: false,
    hasGroup: true,
    allowsShare: false,
  },
  ads: {
    labelKey: 'admin.profit.categories.ads',
    color: '#f59e0b',
    defaultKind: 'once',
    hasLink: true,
    hasGroup: false,
    allowsShare: false,
  },
  cdn: {
    labelKey: 'admin.profit.categories.cdn',
    color: '#06b6d4',
    defaultKind: 'once',
    hasLink: false,
    hasGroup: true,
    allowsShare: false,
  },
  personal: {
    labelKey: 'admin.profit.categories.personal',
    color: '#ec4899',
    defaultKind: 'once',
    hasLink: false,
    hasGroup: false,
    allowsShare: true,
  },
  partner: {
    labelKey: 'admin.profit.categories.partner',
    color: '#8b5cf6',
    defaultKind: 'once',
    hasLink: false,
    hasGroup: false,
    allowsShare: true,
  },
  staff: {
    labelKey: 'admin.profit.categories.staff',
    color: '#34d399',
    defaultKind: 'monthly',
    hasLink: false,
    hasGroup: false,
    allowsShare: true,
  },
  ai: {
    labelKey: 'admin.profit.categories.ai',
    color: '#14b8a6',
    defaultKind: 'monthly',
    hasLink: false,
    hasGroup: false,
    allowsShare: false,
  },
  other: {
    labelKey: 'admin.profit.categories.other',
    color: '#94a3b8',
    defaultKind: 'once',
    hasLink: false,
    hasGroup: false,
    allowsShare: true,
  },
};

/** Палитра для хостингов и провайдеров CDN. */
const GROUP_PALETTE = [
  '#818cf8',
  '#f59e0b',
  '#34d399',
  '#ec4899',
  '#06b6d4',
  '#f97316',
  '#8b5cf6',
  '#14b8a6',
  '#facc15',
  '#fb7185',
];

/**
 * Цвет группы (хостинга) по её названию.
 *
 * Через хеш имени, а не по позиции в списке: список пересортировывается при
 * каждой смене периода, и цвет «Aeza» не должен от этого меняться — иначе
 * легенда и полоса разъезжаются между рендерами.
 */
export function groupColor(name: string, explicit?: string | null): string {
  if (explicit) return explicit;
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return GROUP_PALETTE[hash % GROUP_PALETTE.length];
}

export const KOPEKS_IN_RUBLE = 100;
