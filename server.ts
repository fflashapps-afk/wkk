import express from 'express';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Admin passcode configuration (server-side verified)
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || '20092009A';
const activeAdminSessions = new Map<string, number>();

// Ephemeral in-memory store for payment receipt images (12 hours TTL) so Telegram message includes direct check link
const receiptStore = new Map<string, { mime: string; buffer: Buffer; createdAt: number }>();

function cleanupExpiredReceipts() {
  const now = Date.now();
  const maxAge = 12 * 60 * 60 * 1000;
  for (const [id, entry] of receiptStore.entries()) {
    if (now - entry.createdAt > maxAge) {
      receiptStore.delete(id);
    }
  }
}

// Rate limiter for order number & admin login endpoints
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string, maxRequests = 35, windowMs = 60_000): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || now > record.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (record.count >= maxRequests) {
    return false;
  }
  record.count += 1;
  return true;
}

// Track generated order numbers in-memory to guarantee zero collisions on the same instance
const issuedOrderNumbers = new Set<string>();

function generateServerOrderNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const datePart = `${year}${month}${day}`;

  for (let attempt = 0; attempt < 100; attempt++) {
    const randomFour = String(Math.floor(1000 + Math.random() * 9000));
    const candidate = `KD-${datePart}-${randomFour}`;
    if (!issuedOrderNumbers.has(candidate)) {
      issuedOrderNumbers.add(candidate);
      return candidate;
    }
  }
  const fallbackFour = String((Date.now() % 9000) + 1000);
  return `KD-${datePart}-${fallbackFour}`;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '6mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Store receipt image by unique token so the operator link in Telegram opens the check image + order details
  app.post('/api/receipts/store', (req, res) => {
    cleanupExpiredReceipts();
    const { dataUrl } = req.body || {};
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Invalid image data' });
    }
    const matches = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ error: 'Malformed base64 image' });
    }
    const mime = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    const token = crypto.randomBytes(12).toString('hex');
    receiptStore.set(token, { mime, buffer, createdAt: Date.now() });
    return res.json({ token, path: `/api/receipts/${token}.jpg` });
  });

  app.get('/api/receipts/:tokenFile', (req, res) => {
    const raw = String(req.params.tokenFile || '').replace(/\.(jpg|jpeg|png|webp)$/i, '');
    const item = receiptStore.get(raw);
    if (!item) {
      return res.status(404).send('Chek rasmi topilmadi yoki muddati tugagan.');
    }
    res.setHeader('Content-Type', item.mime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.send(item.buffer);
  });

  // Server-side Admin Code Verification
  app.post('/api/admin/verify-code', (req, res) => {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(`admin_${clientIp}`, 20, 60_000)) {
      return res.status(429).json({
        error: "Juda ko'p urinish. Iltimos, 1 daqiqa kuting.",
      });
    }

    const { code } = req.body || {};
    if (typeof code !== 'string' || code.trim() !== ADMIN_PASSCODE) {
      return res.status(401).json({
        valid: false,
        error: "Maxfiy kod noto'g'ri kiritildi.",
      });
    }

    const sessionToken = crypto.randomBytes(24).toString('hex');
    activeAdminSessions.set(sessionToken, Date.now() + 12 * 60 * 60 * 1000);

    return res.json({
      valid: true,
      sessionToken,
    });
  });

  app.post('/api/orders/generate-number', (req, res) => {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp, 30, 60_000)) {
      return res.status(429).json({
        error: "Juda ko'p so'rov yuborildi. Iltimos, birozdan so'ng qayta urinib ko'ring.",
      });
    }

    const orderNumber = generateServerOrderNumber();
    return res.json({
      order_number: orderNumber,
      server_time: new Date().toISOString(),
    });
  });

  app.post('/api/orders/validate-payload', (req, res) => {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp, 25, 60_000)) {
      return res.status(429).json({
        error: "Juda ko'p so'rov yuborildi. Iltimos, 1 daqiqa kuting.",
      });
    }

    const { game_id, product_id, reference_price, selling_price, screenshot_mime, screenshot_size } = req.body || {};

    if (!product_id || typeof product_id !== 'string') {
      return res.status(400).json({ error: 'Almaz paketini tanlang.' });
    }

    if (!game_id || typeof game_id !== 'string' || !/^[0-9]{5,16}$/.test(game_id.trim())) {
      return res.status(400).json({
        error: "Free Fire ID faqat raqamlardan iborat bo'lishi kerak (5-16 ta raqam).",
      });
    }

    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!screenshot_mime || !allowedMimes.includes(String(screenshot_mime).toLowerCase())) {
      return res.status(400).json({
        error: 'Faqat JPG, JPEG, PNG yoki WEBP formatidagi chek rasmini yuklang.',
      });
    }

    if (typeof screenshot_size !== 'number' || screenshot_size <= 0 || screenshot_size > 5 * 1024 * 1024) {
      return res.status(400).json({
        error: 'Fayl hajmi 5 MB dan oshmasligi kerak.',
      });
    }

    if (typeof reference_price === 'number' && typeof selling_price === 'number') {
      if (selling_price !== reference_price - 1) {
        return res.status(400).json({
          error: "Narx tekshiruvida xatolik: KAWAIDONATE narxi rasmiy narxdan 1 UZS arzon bo'lishi shart.",
        });
      }
    }

    const orderNumber = generateServerOrderNumber();
    return res.json({
      valid: true,
      order_number: orderNumber,
      server_time: new Date().toISOString(),
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KAWAIDONATE full-stack server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
