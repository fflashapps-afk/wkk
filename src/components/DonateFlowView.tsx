import React, { useState } from 'react';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Image as ImageIcon,
  Send,
  ShieldCheck,
  Upload,
  XCircle,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  buildTelegramOrderMessage,
  formatUZS,
  getProductImage,
  getProductTitle,
  OrderStatus,
  PaymentSettings,
  Product,
  TelegramOperator,
} from '../types';

interface DonateFlowViewProps {
  products: Product[];
  paymentSettings: PaymentSettings;
  operators: TelegramOperator[];
  selectedProduct: Product | null;
  setSelectedProduct: (p: Product | null) => void;
  gameId: string;
  setGameId: (val: string) => void;
  orderStep: number;
  setOrderStep: (step: number) => void;
  onOrderCreatedNavigateCheck: (orderNumber: string) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

const STEPS = [
  { num: 1, label: '1. Almaz' },
  { num: 2, label: '2. ID' },
  { num: 3, label: "3. To'lov" },
  { num: 4, label: '4. Chek' },
  { num: 5, label: '5. Telegram' },
];

async function compressAndEncodeScreenshot(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Faylni o'qishda xatolik yuz berdi."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Rasm formatini ochib bo'lmadi."));
      img.onload = () => {
        const maxDim = 960;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve(compressedDataUrl);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// Generates a single composite receipt card containing BOTH the uploaded check image AND the order details text
async function buildCombinedReceiptCard(params: {
  screenshotDataUrl: string;
  orderNumber: string;
  gameId: string;
  packageName: string;
  priceText: string;
}): Promise<{ jpegDataUrl: string; pngBlob: Blob }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('Failed to load image'));
    img.onload = () => {
      const canvasWidth = 720;
      const headerHeight = 200;
      const padding = 24;
      const maxImgWidth = canvasWidth - padding * 2;
      const scale = Math.min(1, maxImgWidth / img.width);
      const drawWidth = Math.round(img.width * scale);
      const drawHeight = Math.round(img.height * scale);
      const canvasHeight = headerHeight + drawHeight + padding * 2;

      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context unavailable'));
        return;
      }

      // Background
      ctx.fillStyle = '#080A12';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // Top Header Box
      ctx.fillStyle = '#101424';
      ctx.fillRect(padding, padding, canvasWidth - padding * 2, headerHeight - padding);
      ctx.strokeStyle = '#22D3EE';
      ctx.lineWidth = 2;
      ctx.strokeRect(padding, padding, canvasWidth - padding * 2, headerHeight - padding);

      // Text inside Header
      ctx.fillStyle = '#22D3EE';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('KAWAIDONATE BUYURTMA VA CHEK', padding + 20, padding + 38);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 19px monospace';
      ctx.fillText(`Buyurtma: ${params.orderNumber}`, padding + 20, padding + 76);
      ctx.fillText(`Game ID:  ${params.gameId}`, padding + 20, padding + 108);

      ctx.fillStyle = '#A5F3FC';
      ctx.fillText(`Paket:    ${params.packageName}`, padding + 20, padding + 140);

      ctx.fillStyle = '#34D399';
      ctx.fillText(`Summa:    ${params.priceText}`, padding + 360, padding + 140);

      // Draw Check Screenshot below Header
      const imgX = Math.round((canvasWidth - drawWidth) / 2);
      const imgY = headerHeight + padding / 2;
      ctx.drawImage(img, imgX, imgY, drawWidth, drawHeight);

      const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.88);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve({ jpegDataUrl, pngBlob: blob });
          else reject(new Error('Canvas toBlob failed'));
        },
        'image/png'
      );
    };
    img.src = params.screenshotDataUrl;
  });
}

async function requestServerOrderNumber(): Promise<string> {
  try {
    const resp = await fetch('/api/orders/generate-number', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.order_number && /^KD-[0-9]{8}-[0-9]{4}$/.test(data.order_number)) {
        return data.order_number;
      }
    }
  } catch {
    // Fallback if API route is unreachable
  }
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return `KD-${y}${m}${d}-${rand}`;
}

export const DonateFlowView: React.FC<DonateFlowViewProps> = ({
  products,
  paymentSettings,
  operators,
  selectedProduct,
  setSelectedProduct,
  gameId,
  setGameId,
  orderStep,
  setOrderStep,
  onOrderCreatedNavigateCheck,
  showToast,
}) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string>('');
  const [generatingOrderNum, setGeneratingOrderNum] = useState(false);

  // Screenshot upload state
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string>('');
  const [compositePngBlob, setCompositePngBlob] = useState<Blob | null>(null);
  const [receiptPublicUrl, setReceiptPublicUrl] = useState<string>('');
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);

  // Created order state for Step 5
  const [createdOrderStatus, setCreatedOrderStatus] = useState<OrderStatus>("To'lov tekshirilmoqda");
  const [selectedOperatorUsername, setSelectedOperatorUsername] = useState<string>(
    operators[0]?.username || 'SHLOFF'
  );
  const [copiedCard, setCopiedCard] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [copiedCheckImage, setCopiedCheckImage] = useState(false);

  const activeProducts = products.filter((p) => p.active).sort((a, b) => a.sort_order - b.sort_order);

  // Step 1 -> Step 2
  const handleSelectPackage = (pkg: Product) => {
    setErrorMsg(null);
    setSelectedProduct(pkg);
    setOrderStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Step 2 -> Step 3
  const handleProceedFromGameId = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedProduct) {
      setErrorMsg('Almaz paketini tanlang.');
      setOrderStep(1);
      return;
    }

    const trimmedId = gameId.trim();
    if (!trimmedId) {
      setErrorMsg('Game ID kiritilmagan.');
      return;
    }

    if (!/^[0-9]+$/.test(trimmedId)) {
      setErrorMsg("Free Fire ID faqat raqamlardan iborat bo'lishi kerak.");
      return;
    }

    if (trimmedId.length < 5 || trimmedId.length > 16) {
      setErrorMsg("Free Fire ID uzunligi 5 tadan 16 tagacha raqam bo'lishi kerak.");
      return;
    }

    if (!orderNumber) {
      setGeneratingOrderNum(true);
      const generated = await requestServerOrderNumber();
      setOrderNumber(generated);
      setGeneratingOrderNum(false);
    }

    setOrderStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Step 3 -> Step 4
  const handleProceedToScreenshot = () => {
    setErrorMsg(null);
    if (!selectedProduct) {
      setErrorMsg('Almaz paketini tanlang.');
      setOrderStep(1);
      return;
    }
    setOrderStep(4);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // File input handler on Step 4
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      setErrorMsg('Faqat JPG, JPEG, PNG yoki WEBP formatidagi chek rasmini yuklang.');
      setScreenshotFile(null);
      setScreenshotDataUrl('');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('Fayl hajmi 5 MB dan oshmasligi kerak.');
      setScreenshotFile(null);
      setScreenshotDataUrl('');
      return;
    }

    try {
      const encoded = await compressAndEncodeScreenshot(file);
      if (encoded.length > 890000) {
        setErrorMsg('Fayl hajmi 5 MB dan oshmasligi kerak.');
        return;
      }
      setScreenshotFile(file);
      setScreenshotDataUrl(encoded);
    } catch {
      setErrorMsg('Chek rasmini yuklashda xatolik yuz berdi.');
    }
  };

  // Step 4 -> Step 5 (Create order in Firestore + register direct receipt image link for Telegram)
  const handleSubmitOrderWithScreenshot = async () => {
    setErrorMsg(null);

    if (!selectedProduct) {
      setErrorMsg('Almaz paketini tanlang.');
      return;
    }
    if (!gameId.trim() || !/^[0-9]{5,16}$/.test(gameId.trim())) {
      setErrorMsg('Game ID kiritilmagan.');
      return;
    }
    if (!screenshotFile || !screenshotDataUrl) {
      setErrorMsg('Chek rasmini yuklang.');
      return;
    }

    setUploadingScreenshot(true);
    try {
      const authoritativeProduct =
        products.find((p) => p.id === selectedProduct.id) || selectedProduct;
      const finalRefPrice = authoritativeProduct.reference_price;
      const finalSellingPrice = finalRefPrice - 1;
      const finalOrderNum = orderNumber || (await requestServerOrderNumber());
      setOrderNumber(finalOrderNum);

      // Build composite Check + Text receipt card and register it on server so Telegram link shows Check + Text
      let compositeDataUrlToStore = screenshotDataUrl;
      try {
        const compositeResult = await buildCombinedReceiptCard({
          screenshotDataUrl,
          orderNumber: finalOrderNum,
          gameId: gameId.trim(),
          packageName: getProductTitle(authoritativeProduct),
          priceText: formatUZS(finalSellingPrice),
        });
        compositeDataUrlToStore = compositeResult.jpegDataUrl;
        setCompositePngBlob(compositeResult.pngBlob);
      } catch {
        // Fallback to raw screenshotDataUrl
      }

      try {
        await fetch('/api/receipts/store', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl: compositeDataUrlToStore }),
        });
      } catch {
        // Non-blocking
      }
      setReceiptPublicUrl('https://kawaidonate.vercel.app/');

      const defaultOp = operators[0]?.username ? `@${operators[0].username}` : '@SHLOFF';
      const initialStatus: OrderStatus = "To'lov tekshirilmoqda";

      const batch = writeBatch(db);
      const orderRef = doc(db, 'orders', finalOrderNum);
      const trackingRef = doc(db, 'order_tracking', finalOrderNum);

      batch.set(orderRef, {
        id: finalOrderNum,
        order_number: finalOrderNum,
        game: 'Free Fire',
        game_id: gameId.trim(),
        product_id: authoritativeProduct.id,
        product_name: getProductTitle(authoritativeProduct),
        diamond_amount: authoritativeProduct.diamond_amount,
        reference_price: finalRefPrice,
        selling_price: finalSellingPrice,
        payment_screenshot_url: screenshotDataUrl,
        status: initialStatus,
        telegram_operator: defaultOp,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });

      batch.set(trackingRef, {
        order_number: finalOrderNum,
        game: 'Free Fire',
        game_id: gameId.trim(),
        product_name: getProductTitle(authoritativeProduct),
        diamond_amount: authoritativeProduct.diamond_amount,
        selling_price: finalSellingPrice,
        status: initialStatus,
        telegram_operator: defaultOp,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });

      await batch.commit();
      setCreatedOrderStatus(initialStatus);
      setOrderStep(5);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      showToast("Buyurtma va to'lov cheki tayyorlandi!", 'success');
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.CREATE, `orders/${orderNumber}`);
      } catch {
        // Caught after structured logging
      }
      setErrorMsg("Buyurtma yaratishda xatolik yuz berdi. Qaytadan urinib ko'ring.");
    } finally {
      setUploadingScreenshot(false);
    }
  };

  const telegramMessageText =
    selectedProduct && orderNumber
      ? buildTelegramOrderMessage({
          orderNumber,
          gameId: gameId.trim(),
          productName: getProductTitle(selectedProduct),
          diamondAmount: selectedProduct.diamond_amount,
          sellingPrice: selectedProduct.selling_price,
          receiptUrl: receiptPublicUrl || undefined,
        })
      : '';

  // Operator button clicked:
  // 1. Updates chosen operator in Firestore
  // 2. Copies combined Check+Order image to clipboard synchronously using pre-generated PNG blob
  // 3. Opens operator's Telegram chat (`https://t.me/<operator>?text=...`) pre-filled with the order text AND direct clickable Check+Text receipt link
  const handleOperatorClick = async (
    _e: React.MouseEvent<HTMLAnchorElement>,
    username: string
  ) => {
    const cleanUsername = username.replace(/^@/, '');
    setSelectedOperatorUsername(cleanUsername);

    // Update Firestore operator choice in background
    if (orderNumber) {
      try {
        const batch = writeBatch(db);
        const orderRef = doc(db, 'orders', orderNumber);
        const trackingRef = doc(db, 'order_tracking', orderNumber);
        batch.update(orderRef, {
          telegram_operator: `@${cleanUsername}`,
          updated_at: serverTimestamp(),
        });
        batch.update(trackingRef, {
          telegram_operator: `@${cleanUsername}`,
          updated_at: serverTimestamp(),
        });
        batch.commit().catch(() => {});
      } catch {
        // ignore
      }
    }

    if (!screenshotDataUrl || !selectedProduct) return;

    // Copy pre-built composite Check + Text image to clipboard immediately during user click gesture
    try {
      let blobToCopy = compositePngBlob;
      if (!blobToCopy) {
        const built = await buildCombinedReceiptCard({
          screenshotDataUrl,
          orderNumber,
          gameId: gameId.trim(),
          packageName: getProductTitle(selectedProduct),
          priceText: formatUZS(selectedProduct.selling_price),
        });
        blobToCopy = built.pngBlob;
        setCompositePngBlob(blobToCopy);
      }

      if (
        blobToCopy &&
        navigator.clipboard &&
        'write' in navigator.clipboard &&
        typeof ClipboardItem !== 'undefined'
      ) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobToCopy })]);
        setCopiedCheckImage(true);
      }
    } catch {
      // Non-blocking: anchor href still opens Telegram chat with order text + receipt image URL
    }

    showToast(
      `@${cleanUsername} ochildi! Xabarda Chek + Text havolasi tayyor va Chek rasmi buferga nusxalandi.`,
      'success'
    );
  };

  const handleCopyCheckImageToClipboard = async () => {
    if (!screenshotDataUrl || !selectedProduct) return;
    try {
      let blobToCopy = compositePngBlob;
      if (!blobToCopy) {
        const built = await buildCombinedReceiptCard({
          screenshotDataUrl,
          orderNumber,
          gameId: gameId.trim(),
          packageName: getProductTitle(selectedProduct),
          priceText: formatUZS(selectedProduct.selling_price),
        });
        blobToCopy = built.pngBlob;
        setCompositePngBlob(blobToCopy);
      }

      if (
        blobToCopy &&
        navigator.clipboard &&
        'write' in navigator.clipboard &&
        typeof ClipboardItem !== 'undefined'
      ) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobToCopy })]);
        setCopiedCheckImage(true);
        showToast("Chek + Buyurtma rasmi nusxalandi! Telegramda 'Paste' qiling.", 'success');
        setTimeout(() => setCopiedCheckImage(false), 2500);
        return;
      }

      if (blobToCopy) {
        const url = URL.createObjectURL(blobToCopy);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${orderNumber || 'kawaidonate'}-chek.png`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Chek + Buyurtma rasmi yuklab olindi!', 'success');
      }
    } catch {
      showToast('Chek rasmini nusxalashda xatolik', 'error');
    }
  };

  const handleResetNewOrder = () => {
    setOrderNumber('');
    setScreenshotFile(null);
    setScreenshotDataUrl('');
    setCompositePngBlob(null);
    setReceiptPublicUrl('');
    setErrorMsg(null);
    setOrderStep(1);
  };

  return (
    <div className="space-y-6">
      {/* Progress Indicator: 1. Almaz -> 2. ID -> 3. To'lov -> 4. Chek -> 5. Telegram */}
      <div className="glass-panel rounded-2xl p-3 sm:p-4">
        <div className="grid grid-cols-5 gap-1.5 sm:flex sm:items-center sm:justify-between sm:gap-2">
          {STEPS.map((st, idx) => {
            const isCurrent = orderStep === st.num;
            const isCompleted = orderStep > st.num;
            return (
              <React.Fragment key={st.num}>
                <button
                  type="button"
                  disabled={st.num > orderStep}
                  onClick={() => {
                    if (st.num < orderStep && orderStep < 5) {
                      setErrorMsg(null);
                      setOrderStep(st.num);
                    }
                  }}
                  className={`flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2 rounded-xl text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap min-h-[40px] ${
                    isCurrent
                      ? 'bg-cyan-500 text-slate-950 shadow-sm'
                      : isCompleted
                      ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 cursor-pointer'
                      : 'bg-white/[0.03] text-slate-500 cursor-not-allowed'
                  }`}
                >
                  {isCompleted ? <Check className="w-3 h-3 shrink-0" /> : null}
                  <span className="truncate">{st.label}</span>
                </button>
                {idx < STEPS.length - 1 && (
                  <div
                    className={`hidden sm:block h-px flex-1 min-w-[12px] ${
                      orderStep > st.num ? 'bg-emerald-500/40' : 'bg-white/10'
                    }`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Global Step Error Banner */}
      {errorMsg && (
        <div
          role="alert"
          className="rounded-2xl bg-rose-500/10 border border-rose-500/40 p-4 flex items-center gap-3 text-sm text-rose-200"
        >
          <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* STEP 1: ALMAZ SELECTION */}
      {orderStep === 1 && (
        <div className="space-y-5">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-cyan-400 tracking-wide">FREE FIRE ALMAZ</p>
              <h1 className="text-2xl md:text-3xl font-bold text-white mt-0.5">
                Almaz paketini tanlang
              </h1>
            </div>
            <p className="text-xs text-slate-400">
              KAWAIDONATE narxi rasmiy etalon narxdan 1 so'm arzon hisoblanadi
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
            {activeProducts.map((pkg) => {
              const isSelected = selectedProduct?.id === pkg.id;
              return (
                <div
                  key={pkg.id}
                  onClick={() => handleSelectPackage(pkg)}
                  className={`rounded-2xl p-3 sm:p-5 flex flex-col justify-between cursor-pointer ${
                    isSelected ? 'glass-panel neon-border-active' : 'glass-panel-interactive'
                  }`}
                >
                  <div>
                    <div className="relative h-28 sm:h-36 rounded-xl overflow-hidden bg-[#0A0C14] border border-white/5 mb-3 sm:mb-4 flex items-center justify-center">
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
                        <span className="text-sm sm:text-xl font-extrabold text-white font-display tracking-tight tabular-nums truncate">
                          {getProductTitle(pkg)}
                        </span>
                        <span className="hidden sm:inline text-[11px] text-cyan-300 font-medium shrink-0">
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
                      handleSelectPackage(pkg);
                    }}
                    className="w-full min-h-[44px] rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs sm:text-sm transition-colors flex items-center justify-center gap-1.5"
                  >
                    <span className="truncate">Tanlash</span>
                    <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 2: GAME ID */}
      {orderStep === 2 && selectedProduct && (
        <div className="max-w-xl mx-auto glass-panel rounded-2xl p-5 sm:p-8 space-y-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-4 gap-2">
            <div className="min-w-0">
              <p className="text-xs text-cyan-400 font-medium">TANLANGAN PAKET</p>
              <p className="text-base sm:text-lg font-bold text-white tabular-nums mt-0.5 truncate">
                {getProductTitle(selectedProduct)} · {formatUZS(selectedProduct.selling_price)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOrderStep(1)}
              className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-slate-300 flex items-center gap-1.5 min-h-[40px] shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>O'zgartirish</span>
            </button>
          </div>

          <form onSubmit={handleProceedFromGameId} className="space-y-5">
            <div>
              <label htmlFor="freefire-game-id" className="block text-base font-bold text-white mb-2">
                Free Fire ID'ingizni kiriting
              </label>
              <p className="text-xs text-slate-400 mb-3">
                O'yin profilingizdagi faqat raqamlardan iborat Player ID (UID) ni kiriting.
              </p>
              <input
                id="freefire-game-id"
                type="text"
                inputMode="numeric"
                value={gameId}
                onChange={(e) => {
                  setErrorMsg(null);
                  setGameId(e.target.value.replace(/[^0-9]/g, ''));
                }}
                placeholder="Masalan: 123456789"
                className="w-full h-12 rounded-xl bg-black/60 border border-white/15 px-4 text-base text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={() => setOrderStep(1)}
                className="min-h-[48px] px-5 rounded-xl border border-white/10 bg-white/5 text-slate-300 text-sm font-medium hover:bg-white/10 transition-colors"
              >
                Orqaga
              </button>
              <button
                type="submit"
                disabled={generatingOrderNum}
                className="flex-1 min-h-[48px] rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm transition-colors flex items-center justify-center gap-2"
              >
                <span>{generatingOrderNum ? 'Tayyorlanmoqda...' : 'Davom etish'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STEP 3: PAYMENT PAGE (KARTA ORQALI TO'LOV) */}
      {orderStep === 3 && selectedProduct && (
        <div className="max-w-2xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-5">
          <div className="md:col-span-5 glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
            <p className="text-xs font-semibold text-cyan-400">BUYURTMA MA'LUMOTLARI</p>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-white/5">
                <span className="text-slate-400">O'yin:</span>
                <span className="text-white font-semibold">Free Fire</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/5">
                <span className="text-slate-400">Paket:</span>
                <span className="text-cyan-300 font-bold tabular-nums">
                  {getProductTitle(selectedProduct)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/5">
                <span className="text-slate-400">Game ID:</span>
                <span className="text-white font-mono font-semibold">{gameId}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/5">
                <span className="text-slate-400">Buyurtma raqami:</span>
                <span className="text-purple-300 font-mono text-xs font-semibold">
                  {orderNumber}
                </span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-slate-300 font-medium">Jami to'lov:</span>
                <span className="text-lg font-bold text-emerald-400 font-mono tabular-nums">
                  {formatUZS(selectedProduct.selling_price)}
                </span>
              </div>
            </div>
          </div>

          <div className="md:col-span-7 glass-panel rounded-2xl p-5 sm:p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-cyan-400">KARTA ORQALI TO'LOV</p>
                <h2 className="text-lg font-bold text-white">Kartaga to'lovni amalga oshiring</h2>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-gradient-to-br from-cyan-500/10 via-purple-500/10 to-pink-500/10 border border-cyan-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-300">{paymentSettings.card_holder}</span>
                <span className="text-xs font-mono text-cyan-300">UZS / SO'M</span>
              </div>
              <div className="flex items-center justify-between gap-2 bg-black/50 rounded-xl p-3 border border-white/10">
                <span className="text-sm sm:text-lg font-bold font-mono text-white tracking-wider">
                  {paymentSettings.card_number}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(paymentSettings.card_number.replace(/\s/g, ''));
                    setCopiedCard(true);
                    showToast('Karta raqami nusxalandi!', 'success');
                    setTimeout(() => setCopiedCard(false), 2000);
                  }}
                  className="px-3 py-2 min-h-[40px] rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors"
                >
                  {copiedCard ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCard ? 'Nusxalandi' : 'Copy'}</span>
                </button>
              </div>
            </div>

            <div className="text-xs text-slate-300 space-y-1.5 bg-white/[0.02] p-3.5 rounded-xl border border-white/5">
              <p className="font-semibold text-white">To'lovdan keyin chek screenshotini yuklang.</p>
              <p className="text-slate-400">{paymentSettings.instructions}</p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setOrderStep(2)}
                className="min-h-[48px] px-4 rounded-xl border border-white/10 bg-white/5 text-slate-300 text-sm font-medium hover:bg-white/10"
              >
                Orqaga
              </button>
              <button
                type="button"
                onClick={handleProceedToScreenshot}
                className="flex-1 min-h-[48px] rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm transition-colors flex items-center justify-center gap-2"
              >
                <span>To'lov qildim — Chekni yuklash</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: CHECK SCREENSHOT UPLOAD */}
      {orderStep === 4 && selectedProduct && (
        <div className="max-w-xl mx-auto glass-panel rounded-2xl p-5 sm:p-8 space-y-6">
          <div>
            <p className="text-xs font-semibold text-cyan-400">4-QADAM · TO'LOV TASDIG'I</p>
            <h2 className="text-2xl font-bold text-white mt-1">To'lov chekini yuklang</h2>
            <p className="text-xs text-slate-400 mt-1">
              Chek skrinshoti buyurtma matni bilan birgalikda Admin panelga va operatorga yuboriladi. (JPG, PNG, WEBP · Maks 5 MB)
            </p>
          </div>

          <div className="space-y-4">
            <label
              htmlFor="payment-screenshot-input"
              className="flex flex-col items-center justify-center border-2 border-dashed border-white/15 hover:border-cyan-400/60 rounded-2xl p-6 cursor-pointer bg-white/[0.02] transition-colors text-center"
            >
              <Upload className="w-8 h-8 text-cyan-400 mb-2" />
              <span className="text-sm font-semibold text-white">
                {screenshotFile ? screenshotFile.name : 'Chek skrinshotini tanlash uchun bosing'}
              </span>
              <span className="text-xs text-slate-400 mt-1">
                JPG, JPEG, PNG, WEBP · Maksimum 5 MB
              </span>
              <input
                id="payment-screenshot-input"
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>

            {screenshotDataUrl && (
              <div className="rounded-xl border border-white/10 bg-black/50 p-3">
                <p className="text-xs text-slate-400 mb-2">Yuklangan chek ko'rinishi:</p>
                <img
                  src={screenshotDataUrl}
                  alt="Yuklangan to'lov cheki"
                  referrerPolicy="no-referrer"
                  className="max-h-64 mx-auto rounded-lg object-contain"
                />
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setOrderStep(3)}
              className="min-h-[48px] px-5 rounded-xl border border-white/10 bg-white/5 text-slate-300 text-sm font-medium hover:bg-white/10"
            >
              Orqaga
            </button>
            <button
              type="button"
              disabled={uploadingScreenshot}
              onClick={handleSubmitOrderWithScreenshot}
              className="flex-1 min-h-[48px] rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              <span>{uploadingScreenshot ? 'Chek va buyurtma yuborilmoqda...' : 'Davom etish'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: SUCCESS & TELEGRAM CONFIRMATION (OPERATOR CLICK SENDS CHECK + TEXT) */}
      {orderStep === 5 && selectedProduct && (
        <div className="max-w-2xl mx-auto space-y-5">
          <div className="glass-panel rounded-2xl p-5 sm:p-8 space-y-6 neon-border-active">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-white/10 pb-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-white">Buyurtma qabul qilindi!</h2>
                  <p className="text-xs text-amber-300 font-medium mt-0.5">
                    Buyurtma raqamingizni saqlab qo'ying.
                  </p>
                </div>
              </div>
              <div className="sm:text-right bg-white/[0.03] sm:bg-transparent p-3 sm:p-0 rounded-xl border border-white/5 sm:border-0">
                <p className="text-xs text-slate-400">Buyurtma raqami</p>
                <p className="text-base sm:text-lg font-bold font-mono text-cyan-300 mt-0.5">
                  {orderNumber}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                <p className="text-xs text-slate-400">Game ID</p>
                <p className="font-mono font-semibold text-white mt-1 truncate">{gameId}</p>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                <p className="text-xs text-slate-400">Paket</p>
                <p className="font-semibold text-cyan-300 tabular-nums mt-1 truncate">
                  {getProductTitle(selectedProduct)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                <p className="text-xs text-slate-400">Summa</p>
                <p className="font-mono font-semibold text-emerald-400 tabular-nums mt-1">
                  {formatUZS(selectedProduct.selling_price)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                <p className="text-xs text-slate-400">Holat</p>
                <p className="font-semibold text-amber-300 text-xs mt-1">{createdOrderStatus}</p>
              </div>
            </div>

            {/* Telegram Operator Handoff Section (Primary action: sends Check + Text) */}
            <div className="space-y-3.5 pt-1">
              <div>
                <h3 className="text-lg font-bold text-white">Buyurtmani tasdiqlash</h3>
                <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
                  Operator ustiga bosganingizda <strong>To'lov cheki rasmi + Buyurtma matni</strong> birgalikda yuborish uchun tayyorlanadi:
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {operators
                  .filter((op) => op.active)
                  .map((op, index) => {
                    const deepLink = `https://t.me/${op.username}?text=${encodeURIComponent(
                      telegramMessageText
                    )}`;
                    return (
                      <a
                        key={op.id}
                        href={deepLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => handleOperatorClick(e, op.username)}
                        className={`min-h-[60px] rounded-xl p-4 flex items-center justify-between border transition-all ${
                          index === 0
                            ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 border-cyan-400 font-bold'
                            : 'bg-purple-600 hover:bg-purple-500 text-white border-purple-400/50 font-bold'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Send className="w-5 h-5 shrink-0" />
                          <div className="text-left">
                            <p className="text-xs opacity-90">{op.label} · Chek + Text yuborish</p>
                            <p className="text-base font-mono">@{op.username}</p>
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 shrink-0" />
                      </a>
                    );
                  })}
              </div>
            </div>

            {/* Combined Check Image + Text Preview Card */}
            <div className="rounded-2xl bg-black/60 border border-cyan-500/30 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-cyan-300">
                  Biriktirilgan Chek rasmi + Buyurtma matni ({`@${selectedOperatorUsername}`}):
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyCheckImageToClipboard}
                    className="px-3 py-1.5 min-h-[36px] rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-xs font-semibold text-cyan-300 flex items-center gap-1.5"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>{copiedCheckImage ? 'Chek nusxalandi!' : 'Chek + Text rasmni nusxalash'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(telegramMessageText);
                      setCopiedMessage(true);
                      showToast('Buyurtma matni nusxalandi!', 'success');
                      setTimeout(() => setCopiedMessage(false), 2000);
                    }}
                    className="px-3 py-1.5 min-h-[36px] rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium text-slate-200 flex items-center gap-1.5"
                  >
                    {copiedMessage ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedMessage ? 'Nusxalandi' : 'Matn'}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                {screenshotDataUrl && (
                  <div className="sm:col-span-5 rounded-xl overflow-hidden border border-white/10 bg-black/80 p-2 flex flex-col items-center">
                    <img
                      src={screenshotDataUrl}
                      alt="To'lov cheki"
                      referrerPolicy="no-referrer"
                      className="max-h-40 w-auto object-contain rounded-lg"
                    />
                    <span className="text-[11px] text-emerald-400 font-medium mt-1.5">
                      To'lov cheki tayyor
                    </span>
                  </div>
                )}
                <div className={screenshotDataUrl ? 'sm:col-span-7' : 'sm:col-span-12'}>
                  <pre className="text-xs font-mono text-slate-200 whitespace-pre-wrap break-all leading-relaxed bg-white/[0.03] p-3.5 rounded-xl border border-white/5">
                    {telegramMessageText}
                  </pre>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <button
                type="button"
                onClick={() => onOrderCreatedNavigateCheck(orderNumber)}
                className="flex-1 min-h-[46px] rounded-xl border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 font-semibold text-sm transition-colors flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Buyurtmani tekshirish sahifasida ko'rish</span>
              </button>
              <button
                type="button"
                onClick={handleResetNewOrder}
                className="min-h-[46px] px-5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-sm font-medium transition-colors"
              >
                Yangi buyurtma
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
