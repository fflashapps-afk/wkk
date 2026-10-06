import React, { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { signInWithPopup, signOut, User } from 'firebase/auth';
import {
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Edit3,
  Eye,
  LogOut,
  Package,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import {
  DEFAULT_PAYMENT_SETTINGS,
  DEFAULT_PRODUCTS,
  DEFAULT_TELEGRAM_OPERATORS,
  buildTelegramOrderMessage,
  formatTimestamp,
  formatUZS,
  getProductTitle,
  Order,
  OrderStatus,
  PaymentSettings,
  Product,
  TelegramOperator,
} from '../types';

interface AdminViewProps {
  user: User | null;
  isAdmin: boolean;
  onExitAdmin?: () => void;
  products: Product[];
  paymentSettings: PaymentSettings;
  operators: TelegramOperator[];
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

type AdminTab = 'dashboard' | 'orders' | 'products' | 'payment' | 'telegram';

export const AdminView: React.FC<AdminViewProps> = ({
  user,
  isAdmin,
  onExitAdmin,
  products,
  paymentSettings,
  operators,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('Barchasi');

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productNameInput, setProductNameInput] = useState<string>('110 Diamonds');
  const [diamondAmountInput, setDiamondAmountInput] = useState<string>('110');
  const [referencePriceInput, setReferencePriceInput] = useState<string>('12200');
  const [sortOrderInput, setSortOrderInput] = useState<string>('1');
  const [activeInput, setActiveInput] = useState<boolean>(true);
  const [savingProduct, setSavingProduct] = useState(false);

  const [cardNumberInput, setCardNumberInput] = useState(paymentSettings.card_number);
  const [cardHolderInput, setCardHolderInput] = useState(paymentSettings.card_holder);
  const [instructionsInput, setInstructionsInput] = useState(paymentSettings.instructions);
  const [savingPayment, setSavingPayment] = useState(false);

  const [op1Username, setOp1Username] = useState(operators[0]?.username || 'SHLOFF');
  const [op1Label, setOp1Label] = useState(operators[0]?.label || 'Operator 1');
  const [op2Username, setOp2Username] = useState(operators[1]?.username || 'shrpvabu');
  const [op2Label, setOp2Label] = useState(operators[1]?.label || 'Operator 2');
  const [savingOperators, setSavingOperators] = useState(false);

  useEffect(() => {
    setCardNumberInput(paymentSettings.card_number);
    setCardHolderInput(paymentSettings.card_holder);
    setInstructionsInput(paymentSettings.instructions);
  }, [paymentSettings]);

  useEffect(() => {
    if (operators.length >= 1) {
      setOp1Username(operators[0].username);
      setOp1Label(operators[0].label);
    }
    if (operators.length >= 2) {
      setOp2Username(operators[1].username);
      setOp2Label(operators[1].label);
    }
  }, [operators]);

  useEffect(() => {
    if (!isAdmin) {
      setOrders([]);
      return;
    }
    setLoadingOrders(true);
    const q = query(collection(db, 'orders'), orderBy('created_at', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Order[] = [];
        snap.forEach((d) => list.push(d.data() as Order));
        setOrders(list);
        setLoadingOrders(false);
      },
      (err) => {
        setLoadingOrders(false);
        handleFirestoreError(err, OperationType.LIST, 'orders');
      }
    );
    return () => unsub();
  }, [isAdmin]);

  const handleSyncInitialDefaults = async () => {
    if (!isAdmin) return;
    try {
      const batch = writeBatch(db);
      for (const prod of DEFAULT_PRODUCTS) {
        batch.set(doc(db, 'products', prod.id), {
          id: prod.id,
          name: getProductTitle(prod),
          diamond_amount: prod.diamond_amount,
          reference_price: prod.reference_price,
          selling_price: prod.reference_price - 1,
          active: prod.active,
          sort_order: prod.sort_order,
          updated_at: serverTimestamp(),
        });
      }
      batch.set(doc(db, 'payment_settings', 'default'), {
        card_number: DEFAULT_PAYMENT_SETTINGS.card_number,
        card_holder: DEFAULT_PAYMENT_SETTINGS.card_holder,
        instructions: DEFAULT_PAYMENT_SETTINGS.instructions,
        updated_at: serverTimestamp(),
      });
      for (const op of DEFAULT_TELEGRAM_OPERATORS) {
        batch.set(doc(db, 'telegram_operators', op.id), {
          id: op.id,
          label: op.label,
          username: op.username,
          active: op.active,
          sort_order: op.sort_order,
          updated_at: serverTimestamp(),
        });
      }
      await batch.commit();
      showToast("Standart paketlar, karta va operatorlar bazaga yozildi!", 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'products/payment_settings/telegram_operators');
    }
  };

  // Automatically ensure the 11 packages exist in Firestore when admin opens panel if products are not yet synced
  useEffect(() => {
    if (!isAdmin) return;
    if (products.length < 11) {
      handleSyncInitialDefaults();
    }
  }, [isAdmin]);

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      showToast('Admin hisobiga muvaffaqiyatli kirdingiz.', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Kirishda xatolik yuz berdi.';
      showToast(`Kirish bekor qilindi yoki xatolik: ${message}`, 'error');
    }
  };

  const handleLogout = async () => {
    try {
      await deleteDoc(doc(db, 'admin_sessions', 'active'));
    } catch {
      // ignore
    }
    if (user) {
      await signOut(auth);
    }
    if (onExitAdmin) {
      onExitAdmin();
    }
    showToast('Admin paneldan chiqdingiz.', 'success');
  };

  const handleUpdateOrderStatus = async (order: Order, newStatus: OrderStatus) => {
    try {
      const batch = writeBatch(db);
      const orderRef = doc(db, 'orders', order.order_number);
      const trackingRef = doc(db, 'order_tracking', order.order_number);

      const orderUpdatePayload: Record<string, unknown> = {
        id: order.id,
        order_number: order.order_number,
        game: order.game,
        game_id: order.game_id,
        product_id: order.product_id,
        diamond_amount: order.diamond_amount,
        reference_price: order.reference_price,
        selling_price: order.selling_price,
        payment_screenshot_url: order.payment_screenshot_url,
        status: newStatus,
        telegram_operator: order.telegram_operator,
        created_at: order.created_at,
        updated_at: serverTimestamp(),
      };
      if (order.product_name) {
        orderUpdatePayload.product_name = order.product_name;
      }
      batch.set(orderRef, orderUpdatePayload);

      const trackingUpdatePayload: Record<string, unknown> = {
        order_number: order.order_number,
        game: order.game,
        game_id: order.game_id,
        diamond_amount: order.diamond_amount,
        selling_price: order.selling_price,
        status: newStatus,
        telegram_operator: order.telegram_operator,
        created_at: order.created_at,
        updated_at: serverTimestamp(),
      };
      if (order.product_name) {
        trackingUpdatePayload.product_name = order.product_name;
      }
      batch.set(trackingRef, trackingUpdatePayload);

      await batch.commit();
      if (selectedOrder && selectedOrder.order_number === order.order_number) {
        setSelectedOrder({ ...selectedOrder, status: newStatus });
      }
      showToast(`${order.order_number} holati "${newStatus}" ga o'zgartirildi.`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${order.order_number}`);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const diamonds = parseInt(diamondAmountInput, 10);
    const refPrice = parseInt(referencePriceInput, 10);
    const sortOrd = parseInt(sortOrderInput, 10) || 1;

    if (isNaN(diamonds) || diamonds <= 0) {
      showToast("Almaz miqdori to'g'ri kiritilishi shart.", 'error');
      return;
    }
    if (isNaN(refPrice) || refPrice < 100) {
      showToast("Rasmiy narx kamida 100 so'm bo'lishi kerak.", 'error');
      return;
    }

    const sellingPrice = refPrice - 1;
    const cleanName = productNameInput.trim() || `${diamonds} Diamonds`;
    const prodId = editingProduct
      ? editingProduct.id
      : `ff_${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;

    setSavingProduct(true);
    try {
      await setDoc(doc(db, 'products', prodId), {
        id: prodId,
        name: cleanName.slice(0, 80),
        diamond_amount: diamonds,
        reference_price: refPrice,
        selling_price: sellingPrice,
        active: activeInput,
        sort_order: sortOrd,
        updated_at: serverTimestamp(),
      });
      showToast(
        editingProduct
          ? `${cleanName} paketi yangilandi (${formatUZS(sellingPrice)}).`
          : `${cleanName} paketi qo'shildi (${formatUZS(sellingPrice)}).`,
        'success'
      );
      setEditingProduct(null);
      setProductNameInput('110 Diamonds');
      setDiamondAmountInput('110');
      setReferencePriceInput('12200');
      setSortOrderInput(String(products.length + 1));
      setActiveInput(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `products/${prodId}`);
    } finally {
      setSavingProduct(false);
    }
  };

  const handleToggleProductActive = async (prod: Product) => {
    try {
      await setDoc(doc(db, 'products', prod.id), {
        id: prod.id,
        name: getProductTitle(prod),
        diamond_amount: prod.diamond_amount,
        reference_price: prod.reference_price,
        selling_price: prod.reference_price - 1,
        active: !prod.active,
        sort_order: prod.sort_order,
        updated_at: serverTimestamp(),
      });
      showToast(`${getProductTitle(prod)} paketi yangilandi.`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `products/${prod.id}`);
    }
  };

  const handleDeleteProduct = async (prod: Product) => {
    try {
      await deleteDoc(doc(db, 'products', prod.id));
      showToast(`${prod.diamond_amount} Almaz paketi o'chirildi.`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `products/${prod.id}`);
    }
  };

  const handleSavePaymentSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardNumberInput.trim() || cardNumberInput.trim().length < 4) {
      showToast("Karta raqamini to'g'ri kiriting.", 'error');
      return;
    }
    setSavingPayment(true);
    try {
      await setDoc(doc(db, 'payment_settings', 'default'), {
        card_number: cardNumberInput.trim().slice(0, 32),
        card_holder: cardHolderInput.trim().slice(0, 120),
        instructions: instructionsInput.trim().slice(0, 500),
        updated_at: serverTimestamp(),
      });
      showToast("To'lov kartasi sozlamalari saqlandi!", 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'payment_settings/default');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleSaveOperators = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanOp1 = op1Username.replace(/^@/, '').trim();
    const cleanOp2 = op2Username.replace(/^@/, '').trim();

    if (!/^[a-zA-Z0-9_]+$/.test(cleanOp1) || !/^[a-zA-Z0-9_]+$/.test(cleanOp2)) {
      showToast('Telegram username faqat harf, raqam va pastki chiziqdan iborat bo\'lishi kerak.', 'error');
      return;
    }

    setSavingOperators(true);
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'telegram_operators', 'op_1'), {
        id: 'op_1',
        label: op1Label.trim().slice(0, 64) || 'Operator 1',
        username: cleanOp1,
        active: true,
        sort_order: 1,
        updated_at: serverTimestamp(),
      });
      batch.set(doc(db, 'telegram_operators', 'op_2'), {
        id: 'op_2',
        label: op2Label.trim().slice(0, 64) || 'Operator 2',
        username: cleanOp2,
        active: true,
        sort_order: 2,
        updated_at: serverTimestamp(),
      });
      await batch.commit();
      showToast('Telegram operatorlari saqlandi!', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'telegram_operators');
    } finally {
      setSavingOperators(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto py-12 px-4">
        <div className="glass-panel rounded-2xl p-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mx-auto mb-4">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">KAWAIDONATE Boshqaruv Paneli</h1>
          <p className="text-sm text-slate-400 mb-6">
            Admin panelga kirish uchun yuqoridagi <strong>KAWAIDONATE</strong> yozuvi ustiga bosing va maxfiy kodni kiriting.
          </p>
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="w-full min-h-[48px] rounded-xl bg-white/5 border border-white/10 text-slate-200 font-semibold text-sm hover:bg-white/10 transition-colors flex items-center justify-center gap-2"
          >
            <span>Google orqali Admin kirish</span>
          </button>
        </div>
      </div>
    );
  }

  const now = new Date();
  const todayStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const todaysOrders = orders.filter((o) => o.order_number.includes(`KD-${todayStr}`));
  const pendingOrders = orders.filter((o) =>
    ['Yangi', "To'lov tekshirilmoqda", 'Tasdiqlandi', 'Jarayonda'].includes(o.status)
  );
  const completedOrders = orders.filter((o) => o.status === 'Bajarildi');
  const cancelledOrders = orders.filter((o) => o.status === 'Bekor qilindi');
  const totalRevenue = completedOrders.reduce((acc, o) => acc + (o.selling_price || 0), 0);

  const filteredOrders =
    statusFilter === 'Barchasi' ? orders : orders.filter((o) => o.status === statusFilter);

  const parsedRefPrice = parseInt(referencePriceInput, 10);
  const previewSellingPrice = !isNaN(parsedRefPrice) && parsedRefPrice > 1 ? parsedRefPrice - 1 : 0;

  return (
    <div className="space-y-8">
      <div className="glass-panel rounded-2xl p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-cyan-400 font-medium mb-1">
            <span>KAWAIDONATE ADMIN</span>
            <span aria-hidden="true">·</span>
            <span>{user?.email || 'Maxfiy kod orqali tasdiqlangan'}</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Boshqaruv va Buyurtmalar Markazi</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSyncInitialDefaults}
            className="px-4 py-2 min-h-[42px] rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Standart ma'lumotlarni bazaga yozish</span>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="px-4 py-2 min-h-[42px] rounded-xl border border-white/10 bg-white/5 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Chiqish</span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 p-1.5 glass-panel rounded-xl overflow-x-auto">
        {(
          [
            { id: 'dashboard', label: 'Statistika' },
            { id: 'orders', label: `Buyurtmalar (${orders.length})` },
            { id: 'products', label: 'Almaz Paketlar va Narxlar' },
            { id: 'payment', label: "To'lov Kartasi" },
            { id: 'telegram', label: 'Telegram Operatorlar' },
          ] as { id: AdminTab; label: string }[]
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap min-h-[40px] ${
              activeTab === tab.id
                ? 'bg-cyan-500 text-slate-950'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'dashboard' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="glass-panel rounded-2xl p-5">
            <p className="text-xs text-slate-400">Bugungi buyurtmalar</p>
            <p className="text-3xl font-bold text-white tabular-nums mt-2">{todaysOrders.length}</p>
            <p className="text-xs text-slate-400 mt-2">Sana kodi: KD-{todayStr}</p>
          </div>
          <div className="glass-panel rounded-2xl p-5">
            <p className="text-xs text-slate-400">Jami buyurtmalar</p>
            <p className="text-3xl font-bold text-white tabular-nums mt-2">{orders.length}</p>
            <p className="text-xs text-slate-400 mt-2">Real vaqt bazasi</p>
          </div>
          <div className="glass-panel rounded-2xl p-5">
            <p className="text-xs text-slate-400">Kutilayotgan / Jarayonda</p>
            <p className="text-3xl font-bold text-amber-400 tabular-nums mt-2">{pendingOrders.length}</p>
            <p className="text-xs text-slate-400 mt-2">Tasdiqlash kutilmoqda</p>
          </div>
          <div className="glass-panel rounded-2xl p-5">
            <p className="text-xs text-slate-400">Bajarilgan buyurtmalar</p>
            <p className="text-3xl font-bold text-emerald-400 tabular-nums mt-2">{completedOrders.length}</p>
            <p className="text-xs text-slate-400 mt-2">Muvaffaqiyatli yakunlangan</p>
          </div>
          <div className="glass-panel rounded-2xl p-5">
            <p className="text-xs text-slate-400">Bekor qilingan</p>
            <p className="text-3xl font-bold text-rose-400 tabular-nums mt-2">{cancelledOrders.length}</p>
            <p className="text-xs text-slate-400 mt-2">Rad etilgan yoki bekor qilingan</p>
          </div>
          <div className="glass-panel rounded-2xl p-5">
            <p className="text-xs text-slate-400">Tasdiqlangan tushum (Bajarildi)</p>
            <p className="text-2xl font-bold text-cyan-400 tabular-nums mt-2">{formatUZS(totalRevenue)}</p>
            <p className="text-xs text-slate-400 mt-2">Faqat "Bajarildi" buyurtmalar yig'indisi</p>
          </div>
        </div>
      )}

      {activeTab === 'orders' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-white">Buyurtmalar Ro'yxati</h2>
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                'Barchasi',
                'Yangi',
                "To'lov tekshirilmoqda",
                'Tasdiqlandi',
                'Jarayonda',
                'Bajarildi',
                'Bekor qilindi',
              ].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    statusFilter === st
                      ? 'bg-cyan-500 text-slate-950 font-semibold'
                      : 'bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {loadingOrders ? (
            <div className="glass-panel rounded-2xl p-8 text-center text-sm text-slate-400">
              Buyurtmalar yuklanmoqda...
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="glass-panel rounded-2xl p-8 text-center text-sm text-slate-400">
              Hozircha buyurtmalar mavjud emas.
            </div>
          ) : (
            <div className="glass-panel rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-xs text-slate-400">
                      <th className="py-3.5 px-4 font-medium">Buyurtma ID</th>
                      <th className="py-3.5 px-4 font-medium">Game ID</th>
                      <th className="py-3.5 px-4 font-medium">Almaz</th>
                      <th className="py-3.5 px-4 font-medium">Summa</th>
                      <th className="py-3.5 px-4 font-medium">Chek</th>
                      <th className="py-3.5 px-4 font-medium">Holat</th>
                      <th className="py-3.5 px-4 font-medium">Operator</th>
                      <th className="py-3.5 px-4 font-medium">Vaqt</th>
                      <th className="py-3.5 px-4 font-medium text-right">Amallar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-sm">
                    {filteredOrders.map((ord) => (
                      <tr key={ord.order_number} className="hover:bg-white/[0.02]">
                        <td className="py-3.5 px-4 font-mono text-xs text-cyan-300 whitespace-nowrap">
                          {ord.order_number}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs text-white whitespace-nowrap">
                          {ord.game_id}
                        </td>
                        <td className="py-3.5 px-4 tabular-nums text-white whitespace-nowrap">
                          {ord.product_name || `${ord.diamond_amount} Diamonds`}
                        </td>
                        <td className="py-3.5 px-4 tabular-nums text-slate-200 whitespace-nowrap">
                          {formatUZS(ord.selling_price)}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setSelectedOrder(ord)}
                            className="inline-flex items-center gap-2 text-xs text-cyan-400 hover:text-cyan-300"
                          >
                            {ord.payment_screenshot_url ? (
                              <img
                                src={ord.payment_screenshot_url}
                                alt="Chek"
                                loading="lazy"
                                decoding="async"
                                referrerPolicy="no-referrer"
                                className="w-9 h-9 rounded-lg object-cover border border-cyan-400/40 shrink-0"
                              />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                            <span className="underline">Chek + Matn</span>
                          </button>
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-200 whitespace-nowrap">
                          {ord.status}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-300 whitespace-nowrap">
                          {ord.telegram_operator}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-400 whitespace-nowrap tabular-nums">
                          {formatTimestamp(ord.created_at)}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setSelectedOrder(ord)}
                              className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-white"
                            >
                              Boshqarish
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateOrderStatus(ord, 'Tasdiqlandi')}
                              className="px-2.5 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-xs text-cyan-300"
                            >
                              Tasdiqlash
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateOrderStatus(ord, 'Bajarildi')}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-xs text-emerald-300"
                            >
                              Bajarildi
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'products' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 glass-panel rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-1">
              {editingProduct ? 'Almaz Paketini Tahrirlash' : "Yangi Almaz Paketi Qo'shish"}
            </h2>
            <p className="text-xs text-slate-400 mb-5">
              Qoida: KAWAIDONATE narxi = Rasmiy narx − 1 UZS (avtomatik hisoblanadi).
            </p>
            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div>
                <label htmlFor="admin-product-name" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Paket nomi (masalan: Weekly Lite, 110 Diamonds)
                </label>
                <input
                  id="admin-product-name"
                  type="text"
                  required
                  value={productNameInput}
                  onChange={(e) => setProductNameInput(e.target.value)}
                  className="w-full h-11 rounded-xl bg-black/50 border border-white/15 px-3.5 text-sm text-white focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <label htmlFor="admin-diamond-amount" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Almaz miqdori (raqamda)
                </label>
                <input
                  id="admin-diamond-amount"
                  type="number"
                  min={1}
                  max={1000000}
                  required
                  value={diamondAmountInput}
                  onChange={(e) => setDiamondAmountInput(e.target.value)}
                  className="w-full h-11 rounded-xl bg-black/50 border border-white/15 px-3.5 text-sm text-white font-mono focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <label htmlFor="admin-reference-price" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Rasmiy / Etalon narx (UZS)
                </label>
                <input
                  id="admin-reference-price"
                  type="number"
                  min={100}
                  max={100000000}
                  required
                  value={referencePriceInput}
                  onChange={(e) => setReferencePriceInput(e.target.value)}
                  className="w-full h-11 rounded-xl bg-black/50 border border-white/15 px-3.5 text-sm text-white font-mono focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/30 p-3.5 flex items-center justify-between">
                <span className="text-xs text-cyan-200">KAWAIDONATE narxi (−1 UZS):</span>
                <span className="text-sm font-bold text-cyan-300 font-mono tabular-nums">
                  {formatUZS(previewSellingPrice)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="admin-sort-order" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Tartib raqami
                  </label>
                  <input
                    id="admin-sort-order"
                    type="number"
                    min={0}
                    max={1000}
                    value={sortOrderInput}
                    onChange={(e) => setSortOrderInput(e.target.value)}
                    className="w-full h-11 rounded-xl bg-black/50 border border-white/15 px-3.5 text-sm text-white font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2.5 h-11 px-3.5 rounded-xl bg-black/40 border border-white/10 w-full cursor-pointer">
                    <input
                      type="checkbox"
                      checked={activeInput}
                      onChange={(e) => setActiveInput(e.target.checked)}
                      className="w-4 h-4 accent-cyan-400"
                    />
                    <span className="text-xs text-slate-200 font-medium">Faol (Sotuvda)</span>
                  </label>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={savingProduct}
                  className="flex-1 min-h-[44px] rounded-xl bg-cyan-500 text-slate-950 font-semibold text-sm hover:bg-cyan-400 transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>{editingProduct ? 'Saqlash' : "Qo'shish"}</span>
                </button>
                {editingProduct && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingProduct(null);
                      setDiamondAmountInput('100');
                      setReferencePriceInput('13000');
                    }}
                    className="px-4 min-h-[44px] rounded-xl bg-white/5 text-slate-300 text-xs font-medium hover:bg-white/10"
                  >
                    Bekor qilish
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="lg:col-span-7 glass-panel rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Mavjud Free Fire Almaz Paketlari</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-xs text-slate-400">
                    <th className="py-3 px-3 font-medium">Tartib</th>
                    <th className="py-3 px-3 font-medium">Paket</th>
                    <th className="py-3 px-3 font-medium">Rasmiy narx</th>
                    <th className="py-3 px-3 font-medium">KAWAIDONATE</th>
                    <th className="py-3 px-3 font-medium">Holat</th>
                    <th className="py-3 px-3 font-medium text-right">Amallar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm">
                  {products.map((prod) => (
                    <tr key={prod.id} className="hover:bg-white/[0.02]">
                      <td className="py-3 px-3 font-mono text-xs text-slate-400">{prod.sort_order}</td>
                      <td className="py-3 px-3 font-semibold text-white tabular-nums">
                        {getProductTitle(prod)}
                      </td>
                      <td className="py-3 px-3 font-mono text-xs text-slate-400 tabular-nums">
                        {formatUZS(prod.reference_price)}
                      </td>
                      <td className="py-3 px-3 font-mono text-xs text-cyan-300 font-semibold tabular-nums">
                        {formatUZS(prod.selling_price)}
                      </td>
                      <td className="py-3 px-3 text-xs">
                        <button
                          type="button"
                          onClick={() => handleToggleProductActive(prod)}
                          className={`text-xs underline ${prod.active ? 'text-emerald-400' : 'text-slate-500'}`}
                        >
                          {prod.active ? 'Faol' : 'Nofaol'}
                        </button>
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingProduct(prod);
                              setProductNameInput(getProductTitle(prod));
                              setDiamondAmountInput(String(prod.diamond_amount));
                              setReferencePriceInput(String(prod.reference_price));
                              setSortOrderInput(String(prod.sort_order));
                              setActiveInput(prod.active);
                            }}
                            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200"
                            aria-label={`${getProductTitle(prod)} paketini tahrirlash`}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(prod)}
                            className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400"
                            aria-label={`${prod.diamond_amount} Almaz paketini o'chirish`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'payment' && (
        <div className="max-w-xl glass-panel rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Karta orqali to'lov sozlamalari</h2>
              <p className="text-xs text-slate-400">
                Ushbu ma'lumotlar bazada xavfsiz saqlanadi va to'lov bosqichida ko'rsatiladi.
              </p>
            </div>
          </div>

          <form onSubmit={handleSavePaymentSettings} className="space-y-4">
            <div>
              <label htmlFor="admin-card-number" className="block text-xs font-medium text-slate-300 mb-1.5">
                Plastik karta raqami (Uzcard / Humo)
              </label>
              <input
                id="admin-card-number"
                type="text"
                required
                value={cardNumberInput}
                onChange={(e) => setCardNumberInput(e.target.value)}
                className="w-full h-11 rounded-xl bg-black/50 border border-white/15 px-3.5 text-sm text-white font-mono focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label htmlFor="admin-card-holder" className="block text-xs font-medium text-slate-300 mb-1.5">
                Karta egasi / Qabul qiluvchi nomi
              </label>
              <input
                id="admin-card-holder"
                type="text"
                required
                value={cardHolderInput}
                onChange={(e) => setCardHolderInput(e.target.value)}
                className="w-full h-11 rounded-xl bg-black/50 border border-white/15 px-3.5 text-sm text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label htmlFor="admin-card-instructions" className="block text-xs font-medium text-slate-300 mb-1.5">
                To'lov yo'riqnomasi
              </label>
              <textarea
                id="admin-card-instructions"
                rows={3}
                required
                value={instructionsInput}
                onChange={(e) => setInstructionsInput(e.target.value)}
                className="w-full rounded-xl bg-black/50 border border-white/15 p-3.5 text-sm text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
            <button
              type="submit"
              disabled={savingPayment}
              className="w-full min-h-[46px] rounded-xl bg-cyan-500 text-slate-950 font-semibold text-sm hover:bg-cyan-400 transition-colors"
            >
              {savingPayment ? 'Saqlanmoqda...' : "To'lov sozlamalarini saqlash"}
            </button>
          </form>
        </div>
      )}

      {activeTab === 'telegram' && (
        <div className="max-w-xl glass-panel rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Telegram Operatorlarni Sozlash</h2>
              <p className="text-xs text-slate-400">
                Buyurtma yakunida mijoz tanlaydigan rasmiy Telegram operator profillari.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveOperators} className="space-y-5">
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-3">
              <p className="text-xs font-semibold text-cyan-300">1-Operator</p>
              <div>
                <label htmlFor="op1-label" className="block text-xs text-slate-400 mb-1">
                  Ko'rinadigan nom
                </label>
                <input
                  id="op1-label"
                  type="text"
                  value={op1Label}
                  onChange={(e) => setOp1Label(e.target.value)}
                  className="w-full h-10 rounded-lg bg-black/50 border border-white/15 px-3 text-sm text-white"
                />
              </div>
              <div>
                <label htmlFor="op1-username" className="block text-xs text-slate-400 mb-1">
                  Telegram username (@ belgisisiz)
                </label>
                <input
                  id="op1-username"
                  type="text"
                  value={op1Username}
                  onChange={(e) => setOp1Username(e.target.value)}
                  className="w-full h-10 rounded-lg bg-black/50 border border-white/15 px-3 text-sm text-white font-mono"
                />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-3">
              <p className="text-xs font-semibold text-purple-300">2-Operator</p>
              <div>
                <label htmlFor="op2-label" className="block text-xs text-slate-400 mb-1">
                  Ko'rinadigan nom
                </label>
                <input
                  id="op2-label"
                  type="text"
                  value={op2Label}
                  onChange={(e) => setOp2Label(e.target.value)}
                  className="w-full h-10 rounded-lg bg-black/50 border border-white/15 px-3 text-sm text-white"
                />
              </div>
              <div>
                <label htmlFor="op2-username" className="block text-xs text-slate-400 mb-1">
                  Telegram username (@ belgisisiz)
                </label>
                <input
                  id="op2-username"
                  type="text"
                  value={op2Username}
                  onChange={(e) => setOp2Username(e.target.value)}
                  className="w-full h-10 rounded-lg bg-black/50 border border-white/15 px-3 text-sm text-white font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingOperators}
              className="w-full min-h-[46px] rounded-xl bg-cyan-500 text-slate-950 font-semibold text-sm hover:bg-cyan-400 transition-colors"
            >
              {savingOperators ? 'Saqlanmoqda...' : 'Telegram operatorlarni saqlash'}
            </button>
          </form>
        </div>
      )}

      {selectedOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="order-modal-title"
        >
          <div className="glass-panel w-full max-w-2xl rounded-2xl p-6 relative my-8">
            <button
              type="button"
              onClick={() => setSelectedOrder(null)}
              className="absolute top-4 right-4 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              aria-label="Yopish"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-5">
              <p className="text-xs text-cyan-400 font-mono">{selectedOrder.order_number}</p>
              <h3 id="order-modal-title" className="text-xl font-bold text-white mt-0.5">
                Buyurtma tafsilotlari va To'lov cheki
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3 text-sm">
                <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">O'yin:</span>
                    <span className="text-white font-medium">{selectedOrder.game}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Free Fire ID:</span>
                    <span className="text-cyan-300 font-mono font-semibold">{selectedOrder.game_id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Almaz miqdori:</span>
                    <span className="text-white font-semibold tabular-nums">{selectedOrder.diamond_amount} Almaz</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Rasmiy narx:</span>
                    <span className="text-slate-400 font-mono text-xs tabular-nums">
                      {formatUZS(selectedOrder.reference_price)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">To'lov summasi:</span>
                    <span className="text-emerald-400 font-mono font-semibold tabular-nums">
                      {formatUZS(selectedOrder.selling_price)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Tanlangan operator:</span>
                    <span className="text-white font-mono text-xs">{selectedOrder.telegram_operator}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Joriy holat:</span>
                    <span className="text-cyan-300 font-semibold">{selectedOrder.status}</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-black/50 border border-white/10 space-y-2">
                  <p className="text-xs font-semibold text-cyan-300">Buyurtma matni (Chek bilan birga):</p>
                  <pre className="text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {buildTelegramOrderMessage({
                      orderNumber: selectedOrder.order_number,
                      gameId: selectedOrder.game_id,
                      productName: selectedOrder.product_name,
                      diamondAmount: selectedOrder.diamond_amount,
                      sellingPrice: selectedOrder.selling_price,
                    })}
                  </pre>
                </div>

                <div className="space-y-2 pt-2">
                  <p className="text-xs font-semibold text-slate-300">Holatni o'zgartirish:</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleUpdateOrderStatus(selectedOrder, "To'lov tekshirilmoqda")}
                      className="px-3 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-xs font-medium flex items-center justify-center gap-1.5"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>Tekshirilmoqda</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateOrderStatus(selectedOrder, 'Tasdiqlandi')}
                      className="px-3 py-2.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 text-xs font-medium flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Tasdiqlash</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateOrderStatus(selectedOrder, 'Jarayonda')}
                      className="px-3 py-2.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 text-xs font-medium flex items-center justify-center gap-1.5"
                    >
                      <Package className="w-3.5 h-3.5" />
                      <span>Jarayonda</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateOrderStatus(selectedOrder, 'Bajarildi')}
                      className="px-3 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                      <span>Bajarildi</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateOrderStatus(selectedOrder, 'Bekor qilindi')}
                      className="col-span-2 px-3 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-xs font-medium flex items-center justify-center gap-1.5"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Bekor qilish / Rad etish</span>
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-300 mb-2">Yuklangan to'lov cheki (maxfiy):</p>
                <div className="rounded-xl overflow-hidden border border-white/10 bg-black/60 flex items-center justify-center min-h-[260px] max-h-[420px]">
                  {selectedOrder.payment_screenshot_url ? (
                    <img
                      src={selectedOrder.payment_screenshot_url}
                      alt={`Buyurtma ${selectedOrder.order_number} to'lov cheki`}
                      referrerPolicy="no-referrer"
                      className="max-h-[400px] w-auto object-contain"
                    />
                  ) : (
                    <span className="text-xs text-slate-500">Skrinshot topilmadi</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
