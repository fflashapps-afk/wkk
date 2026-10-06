import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Flame,
  HelpCircle,
  Home,
  Lock,
  Search,
  Send,
  ShieldCheck,
  X,
  Zap,
} from 'lucide-react';
import { auth, db } from './firebase';
import {
  DEFAULT_PAYMENT_SETTINGS,
  DEFAULT_PRODUCTS,
  DEFAULT_TELEGRAM_OPERATORS,
  formatUZS,
  getProductImage,
  getProductTitle,
  PaymentSettings,
  Product,
  TelegramOperator,
} from './types';
import { PWAInstallButton, OfflineIndicator } from './components/PWAInstallButton';
import { DonateFlowView } from './components/DonateFlowView';
import { OrderTrackingView, HelpView } from './components/OrderTrackingView';
import { AdminView } from './components/AdminView';
import heroArtworkImg from './assets/images/freefire_hero_artwork_1791282748430.jpg';
import crestLogoImg from './assets/images/kawaidonate_crest_logo_1791282733331.jpg';

type NavView = 'home' | 'donate' | 'check' | 'help' | 'admin';

export default function App() {
  const [currentView, setCurrentView] = useState<NavView>('home');
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  // Admin Passcode Modal State (opened when clicking KAWAIDONATE brand logo/title)
  const [showAdminCodeModal, setShowAdminCodeModal] = useState(false);
  const [adminCodeInput, setAdminCodeInput] = useState('');
  const [adminCodeError, setAdminCodeError] = useState<string | null>(null);
  const [verifyingCode, setVerifyingCode] = useState(false);

  // Live data from Firestore with instant deterministic defaults
  const [products, setProducts] = useState<Product[]>(DEFAULT_PRODUCTS);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(DEFAULT_PAYMENT_SETTINGS);
  const [operators, setOperators] = useState<TelegramOperator[]>(DEFAULT_TELEGRAM_OPERATORS);

  // Persistent order flow state so user never loses data between steps
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(DEFAULT_PRODUCTS[0]);
  const [gameId, setGameId] = useState<string>('');
  const [orderStep, setOrderStep] = useState<number>(1);
  const [trackingOrderNumber, setTrackingOrderNumber] = useState<string>('');

  // Toast Notification
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => {
      setToast((prev) => (prev?.msg === msg ? null : prev));
    }, 3500);
  };

  // Auth listener & URL query param check (?order=KD-...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderParam = params.get('order') || params.get('chek');
    if (orderParam && /^KD-[0-9]{8}-[0-9]{4}$/i.test(orderParam.trim())) {
      setTrackingOrderNumber(orderParam.trim().toUpperCase());
      setCurrentView('check');
    }

    const savedSession = sessionStorage.getItem('kawaidonate_admin_unlocked');
    if (savedSession === 'true') {
      setIsAdmin(true);
    }

    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser && currentUser.email === 'fflashapps@gmail.com' && currentUser.emailVerified) {
        setIsAdmin(true);
      }
    });
    return () => unsub();
  }, []);

  // Firestore listeners for active products, payment settings, and telegram operators
  useEffect(() => {
    const prodQuery = isAdmin
      ? collection(db, 'products')
      : query(collection(db, 'products'), where('active', '==', true));

    const unsubProducts = onSnapshot(
      prodQuery,
      (snap) => {
        if (!snap.empty) {
          const list: Product[] = [];
          snap.forEach((d) => list.push(d.data() as Product));
          list.sort((a, b) => a.sort_order - b.sort_order);
          setProducts(list);
        }
      },
      () => {}
    );

    const unsubPayment = onSnapshot(
      doc(db, 'payment_settings', 'default'),
      (snap) => {
        if (snap.exists()) {
          setPaymentSettings(snap.data() as PaymentSettings);
        }
      },
      () => {}
    );

    const opQuery = isAdmin
      ? collection(db, 'telegram_operators')
      : query(collection(db, 'telegram_operators'), where('active', '==', true));

    const unsubOperators = onSnapshot(
      opQuery,
      (snap) => {
        if (!snap.empty) {
          const list: TelegramOperator[] = [];
          snap.forEach((d) => list.push(d.data() as TelegramOperator));
          list.sort((a, b) => a.sort_order - b.sort_order);
          setOperators(list);
        }
      },
      () => {}
    );

    return () => {
      unsubProducts();
      unsubPayment();
      unsubOperators();
    };
  }, [isAdmin]);

  const handleOpenAdminPrompt = () => {
    if (isAdmin) {
      setCurrentView('admin');
      return;
    }
    setAdminCodeInput('');
    setAdminCodeError(null);
    setShowAdminCodeModal(true);
  };

  const handleVerifyAdminCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminCodeError(null);
    const trimmed = adminCodeInput.trim();
    if (!trimmed) {
      setAdminCodeError('Maxfiy kodni kiriting.');
      return;
    }

    setVerifyingCode(true);
    try {
      const resp = await fetch('/api/admin/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      });

      if (!resp.ok) {
        setAdminCodeError("Maxfiy kod noto'g'ri!");
        setVerifyingCode(false);
        return;
      }

      // Activate Firestore admin session lock so Firestore rules permit admin operations
      await setDoc(doc(db, 'admin_sessions', 'active'), {
        id: 'active',
        code_hash: trimmed,
        updated_at: serverTimestamp(),
      });

      sessionStorage.setItem('kawaidonate_admin_unlocked', 'true');
      setIsAdmin(true);
      setShowAdminCodeModal(false);
      setAdminCodeInput('');
      setCurrentView('admin');
      showToast('Admin panel ochildi!', 'success');
    } catch {
      setAdminCodeError("Maxfiy kodni tekshirishda xatolik yuz berdi.");
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleStartDonateWithProduct = (pkg?: Product) => {
    if (pkg) {
      setSelectedProduct(pkg);
      setOrderStep(2);
    } else {
      setOrderStep(1);
    }
    setCurrentView('donate');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const activeProducts = products.filter((p) => p.active).sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="min-h-screen flex flex-col bg-[#06070B] text-slate-100 pb-20 md:pb-0">
      <OfflineIndicator />

      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          className={`fixed top-16 right-4 z-50 px-4 py-3 rounded-xl text-xs font-semibold shadow-xl flex items-center gap-2 border ${
            toast.type === 'error'
              ? 'bg-rose-950/95 border-rose-500/50 text-rose-200'
              : 'bg-emerald-950/95 border-emerald-500/50 text-emerald-200'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toast.msg}</span>
        </div>
      )}

      {/* ADMIN PASSCODE MODAL (Triggered by clicking KAWAIDONATE) */}
      {showAdminCodeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-code-modal-title"
        >
          <div className="glass-panel w-full max-w-sm rounded-2xl p-6 relative border border-cyan-500/30">
            <button
              type="button"
              onClick={() => setShowAdminCodeModal(false)}
              className="absolute top-4 right-4 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              aria-label="Yopish"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h2 id="admin-code-modal-title" className="text-base font-bold text-white">
                  Admin Panelga Kirish
                </h2>
                <p className="text-xs text-slate-400">Maxfiy kirish kodini kiriting</p>
              </div>
            </div>

            <form onSubmit={handleVerifyAdminCode} className="space-y-4">
              <div>
                <label htmlFor="admin-secret-code-input" className="sr-only">
                  Maxfiy kod
                </label>
                <input
                  id="admin-secret-code-input"
                  type="password"
                  autoFocus
                  value={adminCodeInput}
                  onChange={(e) => {
                    setAdminCodeError(null);
                    setAdminCodeInput(e.target.value);
                  }}
                  placeholder="Maxfiy kod..."
                  className="w-full h-12 rounded-xl bg-black/60 border border-white/15 px-4 text-sm text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>

              {adminCodeError && (
                <p className="text-xs text-rose-400 font-medium">{adminCodeError}</p>
              )}

              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowAdminCodeModal(false)}
                  className="px-4 min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-300"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={verifyingCode}
                  className="flex-1 min-h-[44px] rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors"
                >
                  {verifyingCode ? 'Tekshirilmoqda...' : 'Kirish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TOP NAVIGATION BAR (Strict 3-Zone Top Bar Contract) */}
      <header className="sticky top-0 z-40 h-14 md:h-16 border-b border-white/[0.08] bg-[#06070B]/95 md:bg-[#06070B]/85 md:backdrop-blur-md px-4 md:px-8 flex items-center justify-between">
        {/* Zone 1: Single text element wordmark — clicking opens Admin Code modal */}
        <a
          href="#kawaidonate"
          onClick={(e) => {
            e.preventDefault();
            handleOpenAdminPrompt();
          }}
          className="text-lg md:text-xl font-extrabold tracking-tight text-white hover:text-cyan-300 transition-colors font-display whitespace-nowrap"
        >
          KAWAIDONATE
        </a>

        {/* Zone 2: 4 clean text navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300" aria-label="Asosiy menyu">
          <button
            type="button"
            onClick={() => setCurrentView('home')}
            className={`hover:text-white transition-colors whitespace-nowrap py-1 ${
              currentView === 'home' ? 'text-cyan-400 underline underline-offset-8' : ''
            }`}
          >
            Bosh sahifa
          </button>
          <button
            type="button"
            onClick={() => setCurrentView('donate')}
            className={`hover:text-white transition-colors whitespace-nowrap py-1 ${
              currentView === 'donate' ? 'text-cyan-400 underline underline-offset-8' : ''
            }`}
          >
            Donat
          </button>
          <button
            type="button"
            onClick={() => setCurrentView('check')}
            className={`hover:text-white transition-colors whitespace-nowrap py-1 ${
              currentView === 'check' ? 'text-cyan-400 underline underline-offset-8' : ''
            }`}
          >
            Buyurtmani tekshirish
          </button>
          <button
            type="button"
            onClick={() => setCurrentView('help')}
            className={`hover:text-white transition-colors whitespace-nowrap py-1 ${
              currentView === 'help' ? 'text-cyan-400 underline underline-offset-8' : ''
            }`}
          >
            Yordam
          </button>
        </nav>

        {/* Zone 3: 1–2 primary actions */}
        <div className="flex items-center gap-2.5">
          <PWAInstallButton />
          <button
            type="button"
            onClick={() => handleStartDonateWithProduct()}
            className="px-4 py-2 min-h-[40px] rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-colors whitespace-nowrap shrink-0"
          >
            Donat qilish
          </button>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10">
        {currentView === 'home' && (
          <div className="space-y-12">
            {/* HERO SECTION */}
            <section className="relative rounded-3xl overflow-hidden border border-white/10 bg-[#0A0C14]">
              <div className="grid grid-cols-1 lg:grid-cols-12 items-center">
                <div className="lg:col-span-7 p-6 sm:p-10 lg:p-12 space-y-6 z-10">
                  <div className="flex items-center gap-3">
                    <img
                      src={crestLogoImg}
                      alt="KAWAIDONATE emblemasi"
                      referrerPolicy="no-referrer"
                      className="w-11 h-11 rounded-xl border border-cyan-400/40 object-cover cursor-pointer"
                      onClick={handleOpenAdminPrompt}
                    />
                    <div className="text-xs text-slate-300 flex items-center gap-2">
                      <span className="text-cyan-400 font-semibold">FREE FIRE UCHUN ALMAZ</span>
                      <span aria-hidden="true">·</span>
                      <span>UZS / SO'M</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h1
                      onClick={handleOpenAdminPrompt}
                      title="KAWAIDONATE"
                      className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white hover:text-cyan-300 transition-colors font-display cursor-pointer select-none inline-block"
                      style={{ textWrap: 'balance' }}
                    >
                      KAWAIDONATE
                    </h1>
                    <p
                      className="text-lg sm:text-xl font-medium text-slate-200 max-w-xl"
                      style={{ textWrap: 'balance' }}
                    >
                      Free Fire uchun tezkor va qulay donat
                    </p>
                    <p className="text-sm text-slate-400 max-w-lg leading-relaxed">
                      O'zbekiston milliy valyutasida (so'mda) karta orqali xavfsiz to'lov, har bir buyurtma uchun maxsus ID raqam va rasmiy Telegram operatorlar orqali tezkor tasdiqlash.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => handleStartDonateWithProduct()}
                      className="min-h-[48px] px-7 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      <Flame className="w-4 h-4" />
                      <span>Donat qilish</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentView('check')}
                      className="min-h-[48px] px-6 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      <Search className="w-4 h-4 text-cyan-400" />
                      <span>Buyurtmani tekshirish</span>
                    </button>
                  </div>

                  {/* TRUST SECTION */}
                  <div className="pt-4 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                    <div className="flex items-center gap-2 text-slate-300">
                      <Zap className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span>Tezkor buyurtma</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-300">
                      <CreditCard className="w-4 h-4 text-purple-400 shrink-0" />
                      <span>So'mda to'lov</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-300">
                      <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Buyurtma ID orqali kuzatish</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-300">
                      <Send className="w-4 h-4 text-pink-400 shrink-0" />
                      <span>Telegram orqali tasdiqlash</span>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-5 relative h-64 sm:h-80 lg:h-full min-h-[320px]">
                  <img
                    src={heroArtworkImg}
                    alt="Free Fire KAWAIDONATE cyber key art"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t lg:bg-gradient-to-r from-[#0A0C14] via-[#0A0C14]/50 to-transparent" />
                </div>
              </div>
            </section>

            {/* FEATURED FREE FIRE ALMAZ PACKAGES */}
            <section className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-cyan-400">FREE FIRE ALMAZ</p>
                  <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1">
                    Almaz Paketlari va Narxlar
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentView('donate')}
                  className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5 self-start sm:self-auto"
                >
                  <span>Barcha paketlarni ko'rish</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
                {activeProducts.map((pkg) => (
                  <div
                    key={pkg.id}
                    onClick={() => handleStartDonateWithProduct(pkg)}
                    className="glass-panel-interactive rounded-2xl p-3 sm:p-5 flex flex-col justify-between cursor-pointer"
                  >
                    <div>
                      <div className="relative h-28 sm:h-36 rounded-xl overflow-hidden bg-[#0A0C14] border border-white/5 mb-3 sm:mb-4">
                        <img
                          src={getProductImage(pkg)}
                          alt={`${getProductTitle(pkg)} Free Fire`}
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover opacity-90"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#06070B] via-transparent to-transparent" />
                        <div className="absolute bottom-2 left-2.5 right-2.5 flex items-baseline justify-between gap-1">
                          <span className="text-sm sm:text-xl font-extrabold text-white font-display tabular-nums truncate">
                            {getProductTitle(pkg)}
                          </span>
                          <span className="hidden sm:inline text-xs text-cyan-300 font-medium shrink-0">
                            Free Fire
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 mb-3.5 sm:mb-5 px-0.5">
                        <div>
                          <p className="text-[11px] text-slate-400">KAWAIDONATE</p>
                          <p className="text-sm sm:text-xl font-bold text-cyan-300 font-mono tabular-nums">
                            {formatUZS(pkg.selling_price)}
                          </p>
                        </div>
                        <div className="sm:text-right">
                          <p className="text-[10px] sm:text-xs text-slate-500">Rasmiy narx</p>
                          <p className="text-[11px] sm:text-xs text-slate-400 line-through font-mono tabular-nums">
                            {formatUZS(pkg.reference_price)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartDonateWithProduct(pkg);
                      }}
                      className="w-full min-h-[44px] rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs sm:text-sm transition-colors flex items-center justify-center gap-1.5"
                    >
                      <span>Tanlash</span>
                      <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {currentView === 'donate' && (
          <DonateFlowView
            products={products}
            paymentSettings={paymentSettings}
            operators={operators}
            selectedProduct={selectedProduct}
            setSelectedProduct={setSelectedProduct}
            gameId={gameId}
            setGameId={setGameId}
            orderStep={orderStep}
            setOrderStep={setOrderStep}
            onOrderCreatedNavigateCheck={(ordNum) => {
              setTrackingOrderNumber(ordNum);
              setCurrentView('check');
            }}
            showToast={showToast}
          />
        )}

        {currentView === 'check' && (
          <OrderTrackingView
            initialOrderNumber={trackingOrderNumber}
            operators={operators}
            showToast={showToast}
          />
        )}

        {currentView === 'help' && (
          <HelpView
            operators={operators}
            onGoToDonate={() => {
              setCurrentView('donate');
              setOrderStep(1);
            }}
          />
        )}

        {currentView === 'admin' && (
          <AdminView
            user={user}
            isAdmin={isAdmin}
            onExitAdmin={() => {
              sessionStorage.removeItem('kawaidonate_admin_unlocked');
              setIsAdmin(false);
              setCurrentView('home');
            }}
            products={products}
            paymentSettings={paymentSettings}
            operators={operators}
            showToast={showToast}
          />
        )}
      </main>

      {/* DESKTOP FOOTER */}
      <footer className="hidden md:block border-t border-white/[0.08] py-6 px-8 mt-12">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleOpenAdminPrompt}
              className="font-bold text-white hover:text-cyan-300 transition-colors font-display"
            >
              KAWAIDONATE
            </button>
            <span aria-hidden="true">·</span>
            <span>Free Fire Almaz Top-Up Platformasi</span>
          </div>
          <div className="flex items-center gap-5">
            {operators.map((op) => (
              <a
                key={op.id}
                href={`https://t.me/${op.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-cyan-300 transition-colors font-mono"
              >
                @{op.username}
              </a>
            ))}
          </div>
        </div>
      </footer>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav
        aria-label="Mobil navigatsiya"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-[#06070B]/98 border-t border-white/10 grid grid-cols-4 items-center px-2"
      >
        <button
          type="button"
          onClick={() => setCurrentView('home')}
          className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors ${
            currentView === 'home' ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[11px] font-medium mt-1 whitespace-nowrap">Bosh sahifa</span>
        </button>

        <button
          type="button"
          onClick={() => setCurrentView('donate')}
          className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors ${
            currentView === 'donate' ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Flame className="w-5 h-5" />
          <span className="text-[11px] font-medium mt-1 whitespace-nowrap">Donat</span>
        </button>

        <button
          type="button"
          onClick={() => setCurrentView('check')}
          className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors ${
            currentView === 'check' ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Search className="w-5 h-5" />
          <span className="text-[11px] font-medium mt-1 whitespace-nowrap">Buyurtmalar</span>
        </button>

        <button
          type="button"
          onClick={() => setCurrentView('help')}
          className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors ${
            currentView === 'help' ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <HelpCircle className="w-5 h-5" />
          <span className="text-[11px] font-medium mt-1 whitespace-nowrap">Yordam</span>
        </button>
      </nav>
    </div>
  );
}
