export type OrderStatus =
  | 'Yangi'
  | "To'lov tekshirilmoqda"
  | 'Tasdiqlandi'
  | 'Jarayonda'
  | 'Bajarildi'
  | 'Bekor qilindi';

export interface Product {
  id: string;
  name?: string;
  diamond_amount: number;
  reference_price: number;
  selling_price: number;
  active: boolean;
  sort_order: number;
  updated_at?: unknown;
}

export interface Order {
  id: string;
  order_number: string;
  game: string;
  game_id: string;
  product_id: string;
  product_name?: string;
  diamond_amount: number;
  reference_price: number;
  selling_price: number;
  payment_screenshot_url: string;
  status: OrderStatus;
  telegram_operator: string;
  created_at: unknown;
  updated_at: unknown;
}

export interface OrderTracking {
  order_number: string;
  game: string;
  game_id: string;
  product_name?: string;
  diamond_amount: number;
  selling_price: number;
  status: OrderStatus;
  telegram_operator: string;
  created_at: unknown;
  updated_at: unknown;
}

export interface PaymentSettings {
  card_number: string;
  card_holder: string;
  instructions: string;
  updated_at?: unknown;
}

export interface TelegramOperator {
  id: string;
  label: string;
  username: string;
  active: boolean;
  sort_order: number;
  updated_at?: unknown;
}

export const DEFAULT_PRODUCTS: Product[] = [
  {
    id: 'ff_weekly_lite',
    name: 'Weekly Lite',
    diamond_amount: 1,
    reference_price: 5900,
    selling_price: 5899,
    active: true,
    sort_order: 1,
  },
  {
    id: 'ff_110',
    name: '110 Diamonds',
    diamond_amount: 110,
    reference_price: 12200,
    selling_price: 12199,
    active: true,
    sort_order: 2,
  },
  {
    id: 'ff_weekly_membership',
    name: 'Weekly Membership',
    diamond_amount: 450,
    reference_price: 24200,
    selling_price: 24199,
    active: true,
    sort_order: 3,
  },
  {
    id: 'ff_evo_30d',
    name: 'Evo Access 30D',
    diamond_amount: 30,
    reference_price: 32000,
    selling_price: 31999,
    active: true,
    sort_order: 4,
  },
  {
    id: 'ff_341',
    name: '341 Diamonds',
    diamond_amount: 341,
    reference_price: 36800,
    selling_price: 36799,
    active: true,
    sort_order: 5,
  },
  {
    id: 'ff_310',
    name: '310 Diamonds',
    diamond_amount: 310,
    reference_price: 44900,
    selling_price: 44899,
    active: true,
    sort_order: 6,
  },
  {
    id: 'ff_572',
    name: '572 Diamonds',
    diamond_amount: 572,
    reference_price: 59700,
    selling_price: 59699,
    active: true,
    sort_order: 7,
  },
  {
    id: 'ff_monthly_membership',
    name: 'Monthly Membership',
    diamond_amount: 2600,
    reference_price: 86400,
    selling_price: 86399,
    active: true,
    sort_order: 8,
  },
  {
    id: 'ff_1166',
    name: '1166 Diamonds',
    diamond_amount: 1166,
    reference_price: 119900,
    selling_price: 119899,
    active: true,
    sort_order: 9,
  },
  {
    id: 'ff_2398',
    name: '2398 Diamonds',
    diamond_amount: 2398,
    reference_price: 239900,
    selling_price: 239899,
    active: true,
    sort_order: 10,
  },
  {
    id: 'ff_6160',
    name: '6160 Diamonds',
    diamond_amount: 6160,
    reference_price: 607500,
    selling_price: 607499,
    active: true,
    sort_order: 11,
  },
];

import almazCrateImg from './assets/images/freefire_diamond_crate_icon_1791287136378.jpg';
import weeklyLiteImg from './assets/images/freefire_weekly_lite_icon_1791287264245.jpg';

export function getProductTitle(p: { name?: string; diamond_amount: number }): string {
  if (p.name && p.name.trim()) return p.name.trim();
  return `${p.diamond_amount} Diamonds`;
}

export function getProductImage(p: { id?: string; name?: string }): string {
  const title = (p.name || '').toLowerCase();
  const id = (p.id || '').toLowerCase();
  if (id.includes('weekly_lite') || title.includes('weekly lite') || title.includes('w lite')) {
    return weeklyLiteImg;
  }
  return almazCrateImg;
}

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  card_number: '9860 1901 4482 7731',
  card_holder: 'KAWAIDONATE PAY (SH. A.)',
  instructions:
    "Ko'rsatilgan karta raqamiga buyurtma summasini o'tkazing. To'lov yakunlangach, chek (kvitansiya) skrinshotini keyingi qadamda yuklang.",
};

export const DEFAULT_TELEGRAM_OPERATORS: TelegramOperator[] = [
  {
    id: 'op_1',
    label: 'Operator 1',
    username: 'SHLOFF',
    active: true,
    sort_order: 1,
  },
  {
    id: 'op_2',
    label: 'Operator 2',
    username: 'shrpvabu',
    active: true,
    sort_order: 2,
  },
];

export function formatUZS(amount: number): string {
  return `${new Intl.NumberFormat('ru-RU').format(amount).replace(/\s/g, ' ')} so'm`;
}

export function formatTimestamp(ts: unknown): string {
  if (!ts) return 'Hozirgina';
  try {
    if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
      const d = (ts as { toDate: () => Date }).toDate();
      return d.toLocaleString('uz-UZ', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    if (typeof ts === 'string' || typeof ts === 'number') {
      const d = new Date(ts);
      if (!isNaN(d.getTime())) {
        return d.toLocaleString('uz-UZ', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
      }
    }
  } catch {
    // ignore
  }
  return 'Hozirgina';
}

export function buildTelegramOrderMessage(params: {
  orderNumber: string;
  gameId: string;
  productName?: string;
  diamondAmount: number;
  sellingPrice: number;
  receiptUrl?: string;
}): string {
  const formattedPrice = new Intl.NumberFormat('ru-RU').format(params.sellingPrice).replace(/\s/g, ',');
  const label = params.productName || `${params.diamondAmount}`;
  const checkLine = params.receiptUrl
    ? `To'lov cheki (Rasm): ${params.receiptUrl}`
    : `To'lov cheki: yuklangan`;
  return `KAWAIDONATE BUYURTMA\n\nBuyurtma raqami: ${params.orderNumber}\nGame ID: ${params.gameId}\nAlmaz: ${label}\nSumma: ${formattedPrice} so'm\n\n${checkLine}\n\nKAWAIDONATE`;
}
