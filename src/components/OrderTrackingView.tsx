import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { CheckCircle2, Clock, Copy, HelpCircle, Search, Send, ShieldCheck, XCircle } from 'lucide-react';
import { db } from '../firebase';
import {
  buildTelegramOrderMessage,
  formatTimestamp,
  formatUZS,
  OrderTracking,
  TelegramOperator,
} from '../types';

interface OrderTrackingViewProps {
  initialOrderNumber?: string;
  operators: TelegramOperator[];
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export const OrderTrackingView: React.FC<OrderTrackingViewProps> = ({
  initialOrderNumber = '',
  operators,
  showToast,
}) => {
  const [queryOrderNumber, setQueryOrderNumber] = useState(initialOrderNumber);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [trackedOrder, setTrackedOrder] = useState<OrderTracking | null>(null);
  const [pulseKey, setPulseKey] = useState<number>(0);

  useEffect(() => {
    if (initialOrderNumber && /^KD-[0-9]{8}-[0-9]{4}$/.test(initialOrderNumber.trim())) {
      setQueryOrderNumber(initialOrderNumber.trim());
      handleSearchOrder(initialOrderNumber.trim());
    }
  }, [initialOrderNumber]);

  const handleSearchOrder = async (orderNumToFetch?: string) => {
    const cleanId = (orderNumToFetch ?? queryOrderNumber).trim().toUpperCase();
    setErrorMsg(null);

    if (!cleanId) {
      setErrorMsg('Buyurtma raqamini kiriting.');
      return;
    }

    if (!/^KD-[0-9]{8}-[0-9]{4}$/.test(cleanId)) {
      setErrorMsg('Bu buyurtma topilmadi. Format: KD-20261006-XXXX');
      setTrackedOrder(null);
      return;
    }

    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'order_tracking', cleanId));
      if (!snap.exists()) {
        setTrackedOrder(null);
        setErrorMsg('Bu buyurtma topilmadi.');
      } else {
        setTrackedOrder(snap.data() as OrderTracking);
        setPulseKey((prev) => prev + 1);
      }
    } catch {
      setTrackedOrder(null);
      setErrorMsg('Bu buyurtma topilmadi.');
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearchOrder();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="glass-panel rounded-2xl p-5 sm:p-8">
        <p className="text-xs font-medium text-cyan-400 mb-1">BUYURTMANI TEKSHIRISH</p>
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
          Buyurtma holatini kuzatish
        </h1>
        <p className="text-sm text-slate-400 mb-5">
          Buyurtma raqamingizni kiriting (masalan: <span className="font-mono text-slate-200">KD-20261006-4821</span>) va joriy holatni tekshiring.
        </p>

        <form onSubmit={handleFormSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label htmlFor="order-number-search" className="sr-only">
              Buyurtma raqami
            </label>
            <input
              id="order-number-search"
              type="text"
              value={queryOrderNumber}
              onChange={(e) => setQueryOrderNumber(e.target.value.toUpperCase())}
              placeholder="KD-20261006-4821"
              className="w-full h-12 rounded-xl bg-black/60 border border-white/15 px-4 text-sm text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="min-h-[48px] px-6 rounded-xl bg-cyan-500 text-slate-950 font-semibold text-sm hover:bg-cyan-400 active:scale-[0.99] transition-all flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
          >
            <Search className="w-4 h-4" />
            <span>{loading ? 'Tekshirilmoqda...' : 'Buyurtmani tekshirish'}</span>
          </button>
        </form>

        {errorMsg && (
          <div
            role="alert"
            className="mt-4 rounded-xl bg-rose-500/10 border border-rose-500/30 p-4 flex items-center gap-3 text-sm text-rose-300"
          >
            <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {trackedOrder && (
        <div
          key={pulseKey}
          className="glass-panel rounded-2xl p-5 sm:p-8 space-y-5 animate-order-found-pulse"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <p className="text-xs text-slate-400">Buyurtma raqami</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xl font-bold font-mono text-cyan-300">
                  {trackedOrder.order_number}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(trackedOrder.order_number);
                    showToast('Buyurtma raqami nusxalandi!', 'success');
                  }}
                  className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-slate-300"
                  aria-label="Buyurtma raqamini nusxalash"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 animate-status-subtle-pulse self-start sm:self-auto">
              {trackedOrder.status === 'Bajarildi' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : trackedOrder.status === 'Bekor qilindi' ? (
                <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
              ) : (
                <Clock className="w-5 h-5 text-amber-400 shrink-0" />
              )}
              <span className="text-sm font-semibold text-white">{trackedOrder.status}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-sm">
            <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
              <p className="text-xs text-slate-400">Free Fire Game ID</p>
              <p className="text-base font-semibold font-mono text-white mt-1">
                {trackedOrder.game_id}
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
              <p className="text-xs text-slate-400">Paket / Almaz</p>
              <p className="text-base font-semibold text-cyan-300 tabular-nums mt-1">
                {trackedOrder.product_name || `${trackedOrder.diamond_amount} Diamonds`}
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
              <p className="text-xs text-slate-400">To'lov summasi</p>
              <p className="text-base font-semibold text-white font-mono tabular-nums mt-1">
                {formatUZS(trackedOrder.selling_price)}
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
              <p className="text-xs text-slate-400">Yaratilgan vaqt</p>
              <p className="text-base font-medium text-slate-200 tabular-nums mt-1">
                {formatTimestamp(trackedOrder.created_at)}
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/20 space-y-3">
            <p className="text-xs text-slate-300">
              Buyurtma bo'yicha operatorga tezkor xabar yuborish:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {operators
                .filter((op) => op.active)
                .map((op) => {
                  const msg = buildTelegramOrderMessage({
                    orderNumber: trackedOrder.order_number,
                    gameId: trackedOrder.game_id,
                    productName: trackedOrder.product_name,
                    diamondAmount: trackedOrder.diamond_amount,
                    sellingPrice: trackedOrder.selling_price,
                  });
                  const tgHref = `https://t.me/${op.username}?text=${encodeURIComponent(msg)}`;
                  return (
                    <a
                      key={op.id}
                      href={tgHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[46px] rounded-xl bg-white/5 hover:bg-cyan-500/20 border border-white/10 hover:border-cyan-400/50 px-4 py-2.5 text-xs font-semibold text-white flex items-center justify-center gap-2 transition-colors"
                    >
                      <Send className="w-3.5 h-3.5 text-cyan-400" />
                      <span>@{op.username}</span>
                    </a>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface HelpViewProps {
  operators: TelegramOperator[];
  onGoToDonate: () => void;
}

export const HelpView: React.FC<HelpViewProps> = ({ operators, onGoToDonate }) => {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="glass-panel rounded-2xl p-5 sm:p-8">
        <p className="text-xs font-medium text-cyan-400 mb-1">YORDAM VA QO'LLAB-QUVVATLASH</p>
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
          KAWAIDONATE qanday ishlaydi?
        </h1>
        <p className="text-sm text-slate-400">
          Free Fire hisobingizga almaz xarid qilish va to'lovni tasdiqlash bo'yicha qisqa yo'riqnoma.
        </p>

        <div className="mt-6 space-y-3.5">
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
            <h2 className="text-base font-semibold text-white">01. Almaz paketini va Game ID ni kiriting</h2>
            <p className="text-sm text-slate-400 mt-1">
              O'zingizga kerakli Free Fire almaz miqdorini tanlang va o'yindagi shaxsiy raqamli ID'ingizni kiriting.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
            <h2 className="text-base font-semibold text-white">02. Kartaga so'mda to'lov va chek skrinshoti</h2>
            <p className="text-sm text-slate-400 mt-1">
              Ko'rsatilgan karta raqamiga to'lovni amalga oshirib, to'lov cheki (kvitansiya) rasmini JPG, PNG yoki WEBP formatida (5 MB gacha) yuklang.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
            <h2 className="text-base font-semibold text-white">03. Telegram operatorga chek va buyurtma matnini yuborish</h2>
            <p className="text-sm text-slate-400 mt-1">
              Buyurtma yaratilgach, chek rasmi va buyurtma matni avtomatik Admin panelga tushadi hamda telefon orqali bir bosishda chek rasmi + matnni Telegram operatorga (@SHLOFF yoki @shrpvabu) ulashishingiz mumkin.
            </p>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              <span>Rasmiy Telegram operatorlarimiz:</span>
            </p>
            <div className="flex items-center gap-3 mt-2">
              {operators.map((op) => (
                <a
                  key={op.id}
                  href={`https://t.me/${op.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-cyan-300 hover:text-cyan-200 underline"
                >
                  @{op.username}
                </a>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={onGoToDonate}
            className="min-h-[46px] px-6 rounded-xl bg-cyan-500 text-slate-950 font-semibold text-sm hover:bg-cyan-400 transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <HelpCircle className="w-4 h-4" />
            <span>Donat sahifasiga o'tish</span>
          </button>
        </div>
      </div>
    </div>
  );
};
