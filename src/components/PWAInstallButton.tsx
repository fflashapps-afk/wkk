import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (isInstallable) {
            install();
          } else {
            setShowModal(true);
          }
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 hover:border-cyan-400/50 hover:text-white transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
        aria-label="Ilovani o'rnatish"
      >
        <Download className="w-3.5 h-3.5 text-cyan-400" />
        <span>Ilova</span>
      </button>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-modal-title"
        >
          <div className="glass-panel w-full max-w-md rounded-2xl p-6 relative">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
              aria-label="Yopish"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 id="pwa-modal-title" className="text-base font-semibold text-white">
                  KAWAIDONATE Web-Ilovasini O'rnatish
                </h3>
                <p className="text-xs text-slate-400">Tezkor kirish uchun asosiy ekranga qo'shing</p>
              </div>
            </div>

            {isIOS ? (
              <div className="space-y-2.5 text-sm text-slate-300 bg-white/[0.03] border border-white/5 rounded-xl p-4">
                <p>1. Safari pastki panelidagi <strong>Ulashish (Share)</strong> tugmasini bosing.</p>
                <p>2. Ro'yxatdan <strong>Asosiy ekranga qo'shish (Add to Home Screen)</strong> bandini tanlang.</p>
              </div>
            ) : (
              <div className="space-y-2.5 text-sm text-slate-300 bg-white/[0.03] border border-white/5 rounded-xl p-4">
                <p>1. Brauzer manzillar qatoridagi <strong>O'rnatish (Install)</strong> belgisini yoki menyuni oching.</p>
                <p>2. <strong>Ilovani o'rnatish (Install App / Add to Home Screen)</strong> tugmasini bosing.</p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="mt-5 w-full min-h-[44px] rounded-xl bg-cyan-500 text-slate-950 font-semibold text-sm hover:bg-cyan-400 transition-colors"
            >
              Tushunarli
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-20 md:bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-500/95 px-3.5 py-2 text-xs font-semibold text-slate-950 shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5" />
      <span>Oflayn rejim — keshdagi ma'lumotlar ko'rsatilmoqda</span>
    </div>
  );
};
