import apiClient from './client';
import i18n from '../i18n';
import type {
  Balance,
  Transaction,
  PaymentMethod,
  PaginatedResponse,
  PendingPayment,
  ManualCheckResponse,
  SavedCardsResponse,
} from '../types';

export interface DonationUpsellInfo {
  available: boolean;
  tip_kopeks: number;
  presets_kopeks: number[];
  min_topup_kopeks: number;
  max_tip_kopeks: number;
}

export const balanceApi = {
  // Донат-апселл: показывать ли предложение добавить сумму к платежу.
  // Условия по сумме и способу оплаты кабинет проверяет сам, по этим значениям,
  // чтобы не ходить на сервер перед каждой оплатой.
  getDonationUpsell: async (): Promise<DonationUpsellInfo> => {
    const response = await apiClient.get<DonationUpsellInfo>('/cabinet/balance/donation-upsell');
    return response.data;
  },

  // Get current balance
  getBalance: async (): Promise<Balance> => {
    const response = await apiClient.get<Balance>('/cabinet/balance');
    return response.data;
  },

  // Get transaction history
  getTransactions: async (params?: {
    page?: number;
    per_page?: number;
    type?: string;
  }): Promise<PaginatedResponse<Transaction>> => {
    const response = await apiClient.get<PaginatedResponse<Transaction>>(
      '/cabinet/balance/transactions',
      {
        params,
      },
    );
    return response.data;
  },

  // Get available payment methods
  getPaymentMethods: async (): Promise<PaymentMethod[]> => {
    const response = await apiClient.get<PaymentMethod[]>('/cabinet/balance/payment-methods');
    return response.data;
  },

  // Create top-up payment.
  // `purpose: 'donation'` — оплата-пожертвование через те же платёжные системы;
  // бэкенд НЕ зачисляет сумму на баланс, а учитывает её отдельной статистикой.
  createTopUp: async (
    amountKopeks: number,
    paymentMethod: string,
    paymentOption?: string,
    purpose?: 'donation',
    donationTip?: { tipKopeks: number; shown: boolean },
  ): Promise<{
    payment_id: string;
    payment_url: string;
    amount_kopeks: number;
    amount_rubles: number;
    status: string;
    expires_at: string | null;
  }> => {
    const payload: {
      amount_kopeks: number;
      payment_method: string;
      payment_option?: string;
      purpose?: 'donation';
      language?: string;
      donation_upsell_shown?: boolean;
      donation_tip_kopeks?: number;
    } = {
      amount_kopeks: amountKopeks,
      payment_method: paymentMethod,
    };
    if (paymentOption) {
      payload.payment_option = paymentOption;
    }
    if (purpose) {
      payload.purpose = purpose;
    }
    // Донат-апселл: сервер сам прибавит надбавку к сумме и создаст «обещание».
    // shown без tipKopeks (0) — пользователь отказался: нужно для cooldown и воронки.
    if (donationTip?.shown) {
      payload.donation_upsell_shown = true;
      payload.donation_tip_kopeks = donationTip.tipKopeks;
    }
    payload.language = i18n.language || 'ru';
    const response = await apiClient.post('/cabinet/balance/topup', payload);
    return response.data;
  },

  // Activate promo code
  activatePromocode: async (
    code: string,
    subscriptionId?: number,
  ): Promise<{
    success: boolean;
    message?: string;
    balance_before?: number;
    balance_after?: number;
    bonus_description?: string | null;
    error?: string;
    eligible_subscriptions?: Array<{ id: number; tariff_name: string; days_left: number }>;
    code?: string;
  }> => {
    const response = await apiClient.post('/cabinet/promocode/activate', {
      code,
      ...(subscriptionId ? { subscription_id: subscriptionId } : {}),
    });
    return response.data;
  },

  // Create Telegram Stars invoice for Mini App balance top-up.
  // `purpose: 'donation'` — как и в createTopUp, помечает платёж как пожертвование
  // (бэкенд не зачисляет его на баланс).
  createStarsInvoice: async (
    amountKopeks: number,
    purpose?: 'donation',
    donationTip?: { tipKopeks: number; shown: boolean },
  ): Promise<{
    invoice_url: string;
    stars_amount?: number;
    amount_kopeks?: number;
  }> => {
    const payload: {
      amount_kopeks: number;
      purpose?: 'donation';
      donation_upsell_shown?: boolean;
      donation_tip_kopeks?: number;
    } = {
      amount_kopeks: amountKopeks,
    };
    if (purpose) {
      payload.purpose = purpose;
    }
    if (donationTip?.shown) {
      payload.donation_upsell_shown = true;
      payload.donation_tip_kopeks = donationTip.tipKopeks;
    }
    const response = await apiClient.post('/cabinet/balance/stars-invoice', payload);
    return response.data;
  },

  // Get pending payments for manual verification
  getPendingPayments: async (params?: {
    page?: number;
    per_page?: number;
  }): Promise<PaginatedResponse<PendingPayment>> => {
    const response = await apiClient.get<PaginatedResponse<PendingPayment>>(
      '/cabinet/balance/pending-payments',
      {
        params,
      },
    );
    return response.data;
  },

  // Get specific pending payment details
  getPendingPayment: async (method: string, paymentId: number): Promise<PendingPayment> => {
    const response = await apiClient.get<PendingPayment>(
      `/cabinet/balance/pending-payments/${encodeURIComponent(method)}/${encodeURIComponent(paymentId)}`,
    );
    return response.data;
  },

  // Get latest pending payment by method (fallback when sessionStorage unavailable)
  getLatestPayment: async (method: string): Promise<PendingPayment> => {
    const response = await apiClient.get<PendingPayment>(
      `/cabinet/balance/pending-payments/${encodeURIComponent(method)}/latest`,
    );
    return response.data;
  },

  // Manually check payment status
  checkPaymentStatus: async (method: string, paymentId: number): Promise<ManualCheckResponse> => {
    const response = await apiClient.post<ManualCheckResponse>(
      `/cabinet/balance/pending-payments/${encodeURIComponent(method)}/${encodeURIComponent(paymentId)}/check`,
    );
    return response.data;
  },

  // Get saved payment methods (cards) for recurrent payments
  getSavedCards: async (): Promise<SavedCardsResponse> => {
    const response = await apiClient.get<SavedCardsResponse>('/cabinet/balance/saved-cards');
    return response.data;
  },

  // Unlink (delete) a saved payment method
  deleteSavedCard: async (id: number): Promise<void> => {
    await apiClient.delete(`/cabinet/balance/saved-cards/${id}`);
  },
};
