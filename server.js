import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure directories exist
const dataDir = path.join(process.cwd(), 'data');
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const ordersPath = path.join(dataDir, 'orders.json');
if (!fs.existsSync(ordersPath)) fs.writeFileSync(ordersPath, '[]', 'utf-8');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), 'public')));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
    cb(null, `${ts}-${safeOriginal}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Formato file non supportato. Usa PDF o DOC/DOCX.'));
  },
});

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function calcPrice(opts) {
  const pages = Math.max(1, parseInt(opts.pages || 1, 10));
  const copies = Math.max(1, parseInt(opts.copies || 1, 10));
  const color = (opts.color || 'bw') === 'color' ? 'color' : 'bw';
  const sides = (opts.sides || 'single') === 'double' ? 'double' : 'single';
  const binding = ['spiral', 'termica'].includes(opts.binding) ? opts.binding : 'none';
  const paper = ['80', '100'].includes(String(opts.paper)) ? String(opts.paper) : '80';
  const cover = ['trasparente', 'rigida'].includes(opts.cover) ? opts.cover : 'none';
  const delivery = ['spedizione', 'ritiro'].includes(opts.delivery) ? opts.delivery : 'ritiro';
  const speed = ['express', 'standard'].includes(opts.speed) ? opts.speed : 'standard';

  const sheets = sides === 'double' ? Math.ceil(pages / 2) : pages;
  const perPage = color === 'color' ? 0.2 : 0.05;
  const paperSurcharge = paper === '100' ? 0.01 : 0.0;
  const printing = (perPage + paperSurcharge) * sheets * copies;

  let bindingPerCopy = 0;
  if (binding === 'spiral') bindingPerCopy = 2.0;
  if (binding === 'termica') bindingPerCopy = 4.0;
  const bindingTotal = bindingPerCopy * copies;

  let coverPerCopy = 0;
  if (cover === 'trasparente') coverPerCopy = 1.5;
  if (cover === 'rigida') coverPerCopy = 6.0;
  const coverTotal = coverPerCopy * copies;

  let subtotal = printing + bindingTotal + coverTotal;
  if (speed === 'express') subtotal *= 1.2; // +20%

  let shipping = 0;
  if (delivery === 'spedizione') shipping = 6.9;

  const total = Math.max(3.0, subtotal) + shipping; // minimo ordine 3€
  return round2(total);
}

app.post('/api/quote', (req, res) => {
  try {
    const total = calcPrice(req.body || {});
    res.json({ total });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Errore calcolo preventivo' });
  }
});

app.post('/api/order', upload.single('file'), (req, res) => {
  try {
    const body = req.body || {};
    const total = calcPrice(body);
    const id = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fileInfo = req.file
      ? { filename: req.file.filename, originalname: req.file.originalname, size: req.file.size, mimetype: req.file.mimetype }
      : null;

    const order = {
      id,
      createdAt: new Date().toISOString(),
      customer: {
        name: body.name || '',
        email: body.email || '',
        phone: body.phone || '',
        address: body.address || '',
        notes: body.notes || '',
      },
      options: {
        pages: Number(body.pages || 1),
        copies: Number(body.copies || 1),
        color: body.color || 'bw',
        sides: body.sides || 'single',
        binding: body.binding || 'none',
        paper: body.paper || '80',
        cover: body.cover || 'none',
        delivery: body.delivery || 'ritiro',
        speed: body.speed || 'standard',
      },
      total,
      file: fileInfo,
      status: 'received',
    };

    const existing = JSON.parse(fs.readFileSync(ordersPath, 'utf-8'));
    existing.push(order);
    fs.writeFileSync(ordersPath, JSON.stringify(existing, null, 2));

    res.json({ ok: true, id, total });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Errore invio ordine' });
  }
});

app.get('/api/orders', (_req, res) => {
  try {
    const existing = JSON.parse(fs.readFileSync(ordersPath, 'utf-8'));
    res.json(existing);
  } catch (e) {
    res.status(500).json({ error: 'Impossibile leggere gli ordini' });
  }
});

app.listen(PORT, () => {
  console.log(`Server avviato su http://localhost:${PORT}`);
});

