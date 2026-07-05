const express = require('express');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const db = require('./db');

// ── JWT_SECRET es OBLIGATORIO ──
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET no está configurado en las variables de entorno.');
  console.error('   Genera uno con: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
  process.exit(1);
}

const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const app = express();
const PORT = process.env.PORT || 5000;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes'), false);
    }
  },
});

const allowedOrigins = [
  'http://localhost:3000',
  'https://www.aourum.com',
  'https://aourum.com'
];

if (process.env.FRONTEND_URL) {
  const extraOrigins = process.env.FRONTEND_URL.split(',').map(url => url.trim());
  extraOrigins.forEach(url => {
    if (url && !allowedOrigins.includes(url)) {
      allowedOrigins.push(url);
    }
  });
}

app.use(cors({
  origin: (origin, callback) => {
    // Permitir solicitudes sin origen (como curl o llamadas del mismo servidor)
    if (!origin) return callback(null, true);
    
    // Verificar coincidencia exacta con orígenes permitidos
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Permitir IPs de red local, localhost y puertos dinámicos (ej: 192.168.x.x, 192.188.x.x)
    const isLocal = /^(https?:\/\/)?(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|192\.188\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin);
    if (isLocal) {
      return callback(null, true);
    }
    
    // Permitir cualquier subdominio de aourum.com
    try {
      const parsed = new URL(origin);
      if (parsed.hostname === 'aourum.com' || parsed.hostname.endsWith('.aourum.com')) {
        return callback(null, true);
      }
    } catch (e) {
      // URL inválido
    }
    
    callback(new Error(`Origen ${origin} no permitido por CORS`));
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ── Rate Limiters ──
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo en un minuto.' }
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de autenticación. Espera un minuto.' }
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes de IA. Espera un minuto.' }
});

app.use(globalLimiter);

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'AOURUM API is running' });
});

app.post('/api/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo' });
    }

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'aourum',
          transformation: [
            { width: 1200, crop: 'limit' },
            { quality: 'auto:good' },
            { fetch_format: 'auto' },
          ],
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });

    res.json({ url: result.secure_url });
  } catch (error) {
    console.error('Error al subir imagen:', error);
    res.status(500).json({ error: 'Error al subir la imagen a Cloudinary' });
  }
});

app.post('/api/remove-bg-ai', requireAuth, aiLimiter, async (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const { execFile } = require('child_process');

  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'No se recibió ninguna imagen' });
    }

    // Decode base64 image
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');

    // 1. If PhotoRoom API Key is configured, use it for production-grade, ultra-fast removal
    const photoRoomKey = process.env.PHOTOROOM_API_KEY;
    if (photoRoomKey) {
      console.log("[PhotoRoom] Procesando remoción de fondo mediante la API oficial...");
      try {
        const formData = new FormData();
        const blob = new Blob([buffer], { type: 'image/png' });
        formData.append('image_file', blob, 'image.png');

        const response = await fetch('https://sdk.photoroom.com/v1/segment', {
          method: 'POST',
          headers: {
            'x-api-key': photoRoomKey
          },
          body: formData
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error("[PhotoRoom] Error de la API:", errText);
          return res.status(502).json({ error: `La API de PhotoRoom falló: ${errText}` });
        }

        const resBuffer = await response.arrayBuffer();
        const outBase64 = Buffer.from(resBuffer).toString('base64');
        return res.json({ image: `data:image/png;base64,${outBase64}` });
      } catch (apiErr) {
        console.error("[PhotoRoom] Error de red o ejecución:", apiErr);
        // Fallback to local python if API fails, just in case
      }
    }

    // 2. Fallback: Local Python script with rembg (Ideal for local testing without keys)
    console.log("[Local AI] Procesando remoción de fondo mediante rembg local...");
    const tempId = Date.now() + '_' + Math.round(Math.random() * 1e9);
    const inputPath = path.join(__dirname, `temp_in_${tempId}.png`);
    const outputPath = path.join(__dirname, `temp_out_${tempId}.png`);

    // Save temporary input file
    fs.writeFileSync(inputPath, buffer);

    // Run the Python script to remove background using rembg
    execFile('python', ['remove_bg.py', inputPath, outputPath], (error, stdout, stderr) => {
      // Clean up input file
      if (fs.existsSync(inputPath)) {
        try { fs.unlinkSync(inputPath); } catch (e) { console.error(e); }
      }

      if (error) {
        console.error('Error al ejecutar rembg:', stderr || error || stdout);
        if (fs.existsSync(outputPath)) {
          try { fs.unlinkSync(outputPath); } catch (e) { console.error(e); }
        }
        return res.status(500).json({ error: 'Error al procesar la imagen con IA local. Asegúrate de que rembg esté instalado o configura la API de PhotoRoom.' });
      }

      try {
        // Read the transparent output image
        const outBuffer = fs.readFileSync(outputPath);
        const outBase64 = outBuffer.toString('base64');
        const dataUrl = `data:image/png;base64,${outBase64}`;

        // Clean up output file
        if (fs.existsSync(outputPath)) {
          try { fs.unlinkSync(outputPath); } catch (e) { console.error(e); }
        }

        res.json({ image: dataUrl });
      } catch (readErr) {
        console.error('Error al leer imagen procesada:', readErr);
        if (fs.existsSync(outputPath)) {
          try { fs.unlinkSync(outputPath); } catch (e) { console.error(e); }
        }
        return res.status(500).json({ error: 'Error al leer la imagen procesada de la IA' });
      }
    });
  } catch (err) {
    console.error('Error en remove-bg-ai:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const products = await db.getProducts();
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/by-slug/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const products = await db.getProducts();
    const product = products.find(p => p.slug === slug);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.post('/api/products', requireAuth, async (req, res) => {
  try {
    const { name, description, price, priceAourum, stock, category, brandId, image, type } = req.body;
    if (!name || !price || !category || !brandId) {
      return res.status(400).json({ error: 'Faltan campos requeridos (nombre, precio, categoría, brandId)' });
    }
    // Verificar que el usuario es creador original de la marca
    const allowed = await isCreatorOriginal(req.user.id, 'brand', brandId);
    if (!allowed) {
      return res.status(403).json({ error: 'No tienes permiso para agregar productos a esta marca.' });
    }
    const product = await db.addProduct({
      name,
      description: description || '',
      price: Number(price),
      priceAourum: priceAourum ? Number(priceAourum) : null,
      stock: (stock === null || stock === undefined || stock === '') ? null : Number(stock),
      category,
      brandId: Number(brandId),
      type: type || 'product',
      image: image || 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=500&q=80',
    });
    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/products/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, priceAourum, stock, category, brandId, image, type } = req.body;
    if (!name || !price || !category || !brandId) {
      return res.status(400).json({ error: 'Faltan campos requeridos para la actualización (nombre, precio, categoría, brandId)' });
    }
    // Verificar que el usuario es creador original de la marca del producto
    const allowed = await isCreatorOriginal(req.user.id, 'brand', brandId);
    if (!allowed) {
      return res.status(403).json({ error: 'No tienes permiso para editar productos de esta marca.' });
    }
    const updated = await db.updateProduct(id, {
      name,
      description: description || '',
      price: Number(price),
      priceAourum: priceAourum ? Number(priceAourum) : null,
      stock: (stock === null || stock === undefined || stock === '') ? null : Number(stock),
      category,
      brandId: Number(brandId),
      type: type || 'product',
      image: image || 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=500&q=80',
    });
    if (!updated) return res.status(404).json({ error: 'Producto o servicio no encontrado' });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/products/:id', requireAuth, async (req, res) => {
  try {
    // Buscar el producto para verificar su brandId
    const products = await db.getProducts();
    const product = products.find(p => p.id === Number(req.params.id));
    if (!product) return res.status(404).json({ error: 'Producto o servicio no encontrado' });
    const allowed = await isCreatorOriginal(req.user.id, 'brand', product.brandId);
    if (!allowed) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar productos de esta marca.' });
    }
    const success = await db.deleteProduct(req.params.id);
    if (!success) return res.status(404).json({ error: 'Producto o servicio no encontrado' });
    res.json({ message: 'Producto/Servicio eliminado con éxito' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/fairs', async (req, res) => {
  try {
    const fairs = await db.getFairs();
    res.json(fairs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/fairs', requireAuth, async (req, res) => {
  try {
    const { name, location, date, time, banner, description, lat, lng, organizerId } = req.body;
    if (!name || !location || !date) {
      return res.status(400).json({ error: 'Faltan campos requeridos (nombre, ubicación, fecha)' });
    }
    // Verificar que el usuario es colaborador del organizador
    const allowed = await isCollaborator(req.user.id, 'organizer', organizerId);
    if (!allowed) {
      return res.status(403).json({ error: 'No tienes permiso para crear ferias con este organizador.' });
    }
    const fair = await db.addFair({
      name,
      location,
      date,
      time: time || '10:00 - 20:00',
      banner: banner || 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&q=80',
      description: description || '',
      lat: lat ? Number(lat) : -16.39889,
      lng: lng ? Number(lng) : -71.53694,
      organizerId: Number(organizerId || 1)
    });
    res.status(201).json(fair);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/bands', async (req, res) => {
  try {
    const bands = await db.getBands();
    res.json(bands);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/bands', requireAuth, async (req, res) => {
  try {
    const { name, genre, members, description, image, mediaLink, personId } = req.body;
    if (!name || !genre) {
      return res.status(400).json({ error: 'Faltan campos requeridos (nombre, género)' });
    }
    const band = await db.addBand({
      name,
      genre,
      members: Number(members || 1),
      description: description || '',
      image: image || 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=500&q=80',
      mediaLink: mediaLink || '',
      personId: personId ? Number(personId) : undefined
    });
    res.status(201).json(band);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/brands', async (req, res) => {
  try {
    const brands = await db.getBrands();
    res.json(brands);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/brands', requireAuth, async (req, res) => {
  try {
    const { name, owner, category, description, logo, personId } = req.body;
    if (!name || !owner || !category) {
      return res.status(400).json({ error: 'Faltan campos requeridos (nombre, dueño, categoría)' });
    }
    const brand = await db.addBrand({
      name,
      owner,
      category,
      description: description || '',
      logo: logo || 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=150&h=150&fit=crop&q=80',
      personId: personId ? Number(personId) : undefined
    });
    res.status(201).json(brand);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/organizers', async (req, res) => {
  try {
    const organizers = await db.getOrganizers();
    res.json(organizers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/organizers', requireAuth, async (req, res) => {
  try {
    const { name, owner, description, logo, personId } = req.body;
    if (!name || !owner) {
      return res.status(400).json({ error: 'Faltan campos requeridos (nombre, dueño)' });
    }
    const organizer = await db.addOrganizer({
      name,
      owner,
      description: description || '',
      logo: logo || 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=150&h=150&fit=crop&q=80',
      personId: personId ? Number(personId) : undefined
    });
    res.status(201).json(organizer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/bands/:id', requireAuth, requireOwnership('band'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, genre, members, description, image, mediaLink, gigs, slug } = req.body;
    if (!name || !genre) {
      return res.status(400).json({ error: 'Faltan campos requeridos (nombre, género)' });
    }
    let cleanSlug = undefined;
    if (slug !== undefined) {
      cleanSlug = slug.toLowerCase().replace(/[^a-z0-9_]/g, '').trim();
      if (!cleanSlug) {
        return res.status(400).json({ error: 'El identificador de URL (slug) no puede estar vacío.' });
      }
      const unique = await db.isSlugUnique('bands', cleanSlug, id);
      if (!unique) {
        return res.status(409).json({ error: 'El identificador de URL (slug) ya está en uso.' });
      }
    }
    const updated = await db.updateBand(id, { name, genre, members: Number(members || 1), description, image, mediaLink, gigs, slug: cleanSlug });
    if (!updated) return res.status(404).json({ error: 'Banda no encontrada' });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/brands/:id', requireAuth, requireOwnership('brand'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, owner, category, description, logo, slug, whatsappNumber } = req.body;
    if (!name || !owner || !category) {
      return res.status(400).json({ error: 'Faltan campos requeridos (nombre, dueño, categoría)' });
    }
    let cleanSlug = undefined;
    if (slug !== undefined) {
      cleanSlug = slug.toLowerCase().replace(/[^a-z0-9_]/g, '').trim();
      if (!cleanSlug) {
        return res.status(400).json({ error: 'El identificador de URL (slug) no puede estar vacío.' });
      }
      const unique = await db.isSlugUnique('brands', cleanSlug, id);
      if (!unique) {
        return res.status(409).json({ error: 'El identificador de URL (slug) ya está en uso.' });
      }
    }
    const updated = await db.updateBrand(id, { name, owner, category, description, logo, slug: cleanSlug, whatsappNumber });
    if (!updated) return res.status(404).json({ error: 'Marca no encontrada' });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/organizers/:id', requireAuth, requireOwnership('organizer'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, owner, description, logo } = req.body;
    if (!name || !owner) {
      return res.status(400).json({ error: 'Faltan campos requeridos (nombre, dueño)' });
    }
    const updated = await db.updateOrganizer(id, { name, owner, description, logo });
    if (!updated) return res.status(404).json({ error: 'Organizador no encontrado' });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/bands/:id', requireAuth, requireCreator('band'), async (req, res) => {
  try {
    const success = await db.deleteBand(req.params.id);
    if (!success) return res.status(404).json({ error: 'Banda no encontrada' });
    res.json({ message: 'Banda eliminada con éxito' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/brands/:id', requireAuth, requireCreator('brand'), async (req, res) => {
  try {
    const success = await db.deleteBrand(req.params.id);
    if (!success) return res.status(404).json({ error: 'Marca no encontrada' });
    res.json({ message: 'Marca eliminada con éxito' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/organizers/:id', requireAuth, requireCreator('organizer'), async (req, res) => {
  try {
    const success = await db.deleteOrganizer(req.params.id);
    if (!success) return res.status(404).json({ error: 'Organizador no encontrado' });
    res.json({ message: 'Organizador eliminado con éxito' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/people', async (req, res) => {
  try {
    const people = await db.getPeople();
    const safePeople = people.map(({ passwordHash, ...safe }) => safe);
    res.json(safePeople);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/people', async (req, res) => {
  try {
    const { name, occupation, description, logo, brandIds, organizerIds, bandIds, lastName } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }
    const person = await db.addPerson({
      name,
      occupation: occupation || '',
      description: description || '',
      logo: logo || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&h=150&fit=crop&q=80',
      brandIds,
      organizerIds,
      bandIds,
      lastName
    });
    const { passwordHash, ...safe } = person;
    res.status(201).json(safe);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/people/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    // Solo el propio usuario puede editar su perfil
    if (req.user.id !== Number(id)) {
      return res.status(403).json({ error: 'Solo puedes editar tu propio perfil.' });
    }
    const { name, occupation, description, logo, brandIds, organizerIds, bandIds, username, lastName } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }

    const cleanUsername = username ? username.toLowerCase().replace(/[^a-z0-9_]/g, '').trim() : '';
    if (cleanUsername) {
      const people = await db.getPeople();
      const existingUsername = people.find(p => p.username && p.username.toLowerCase() === cleanUsername && p.id !== Number(id));
      if (existingUsername) {
        return res.status(409).json({ error: 'Ya existe una cuenta con ese nombre de usuario.' });
      }
    }

    const updated = await db.updatePerson(id, {
      name,
      occupation: occupation || '',
      description,
      logo,
      brandIds,
      organizerIds,
      bandIds,
      username: cleanUsername || undefined,
      lastName
    });
    if (!updated) return res.status(404).json({ error: 'Persona no encontrada' });
    const { passwordHash, ...safe } = updated;
    res.json(safe);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/fairs/apply', requireAuth, async (req, res) => {
  try {
    const { fairId, type, id } = req.body;
    if (!fairId || !type || !id) {
      return res.status(400).json({ error: 'Faltan campos requeridos (fairId, type, id)' });
    }
    if (type !== 'brand' && type !== 'band') {
      return res.status(400).json({ error: 'Tipo de aplicación inválido (debe ser brand o band)' });
    }
    // Verificar que el usuario es creador original de la entidad que postula
    const allowed = await isCreatorOriginal(req.user.id, type, id);
    if (!allowed) {
      return res.status(403).json({ error: 'No tienes permiso para postular esta entidad.' });
    }
    const result = await db.applyToFair(fairId, type, id);
    if (result.error) return res.status(404).json({ error: result.error });
    res.json({ message: 'Postulación enviada con éxito', fair: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/invitations', async (req, res) => {
  try {
    const invitations = await db.getInvitations();
    res.json(invitations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/invitations', requireAuth, async (req, res) => {
  try {
    const { senderType, senderId, senderName, receiverPersonId, role } = req.body;
    if (!senderType || !senderId || !senderName || !receiverPersonId || !role) {
      return res.status(400).json({ error: 'Faltan campos requeridos (senderType, senderId, senderName, receiverPersonId, role)' });
    }
    // Verificar que el usuario es creador original del sender
    const allowed = await isCreatorOriginal(req.user.id, senderType, senderId);
    if (!allowed) {
      return res.status(403).json({ error: 'No tienes permiso para enviar invitaciones en nombre de esta entidad.' });
    }
    const invitation = await db.addInvitation({ senderType, senderId, senderName, receiverPersonId, role });
    res.status(201).json(invitation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/invitations/:id/respond', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { accept } = req.body;
    const status = accept ? 'accepted' : 'declined';
    const result = await db.respondToInvitation(id, status);
    if (result.error) return res.status(404).json({ error: result.error });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password, occupation, description, logo, username, lastName } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos.' });
    }
    const emailLower = email.toLowerCase().trim();
    const cleanUsername = username ? username.toLowerCase().replace(/[^a-z0-9_]/g, '').trim() : '';

    const people = await db.getPeople();
    const existing = people.find(p => p.email && p.email.toLowerCase() === emailLower);
    if (existing) {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
    }

    if (cleanUsername) {
      const existingUsername = people.find(p => p.username && p.username.toLowerCase() === cleanUsername);
      if (existingUsername) {
        return res.status(409).json({ error: 'Ya existe una cuenta con ese nombre de usuario.' });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const person = await db.addPerson({
      name,
      username: cleanUsername || undefined,
      email: emailLower,
      passwordHash,
      occupation: occupation || '',
      description: description || '',
      logo: logo || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&h=150&fit=crop&q=80',
      lastName
    });
    const token = jwt.sign({ id: person.id, email: person.email }, JWT_SECRET, { expiresIn: '30d' });
    const { passwordHash: _, ...safe } = person;
    res.status(201).json({ token, person: safe });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos.' });
    }
    const emailLower = email.toLowerCase().trim();
    const people = await db.getPeople();
    const person = people.find(p => p.email && p.email.toLowerCase() === emailLower);
    if (!person) {
      return res.status(401).json({ error: 'No existe una cuenta con ese correo.' });
    }
    if (!person.passwordHash) {
      return res.status(401).json({ error: 'Esta cuenta no tiene contraseña configurada.' });
    }
    const valid = await bcrypt.compare(password, person.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Contraseña incorrecta.' });
    }
    const token = jwt.sign({ id: person.id, email: person.email }, JWT_SECRET, { expiresIn: '30d' });
    const { passwordHash, ...safe } = person;
    res.json({ token, person: safe });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token requerido.' });
    }
    const token = authHeader.split(' ')[1];
    const payload = jwt.verify(token, JWT_SECRET);
    const people = await db.getPeople();
    const person = people.find(p => p.id === payload.id);
    if (!person) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    const { passwordHash, ...safe } = person;
    res.json(safe);
  } catch (error) {
    res.status(401).json({ error: 'Token inválido o expirado.' });
  }
});

app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'El correo electrónico es requerido.' });
    }
    const emailLower = email.toLowerCase().trim();
    const people = await db.getPeople();
    const person = people.find(p => p.email && p.email.toLowerCase() === emailLower);
    
    if (!person) {
      return res.status(404).json({ error: 'No existe una cuenta con ese correo.' });
    }

    // Usar la combinación de JWT_SECRET + passwordHash antiguo como firma secreta
    const tempSecret = JWT_SECRET + (person.passwordHash || '');
    const token = jwt.sign(
      { id: person.id, email: person.email },
      tempSecret,
      { expiresIn: '15m' }
    );

    // Obtener la URL base del frontend
    const host = req.headers.origin || 'http://localhost:3000';
    const resetUrl = `${host}/reset-password?token=${token}&email=${encodeURIComponent(person.email)}`;

    console.log(`\n🔑 [Recuperación de Contraseña] Enlace generado para ${person.email}:\n👉 ${resetUrl}\n`);

    if (resend) {
      try {
        await resend.emails.send({
          from: process.env.EMAIL_FROM || 'AOURUM <onboarding@resend.dev>',
          to: person.email,
          subject: 'Restablecer contraseña - AOURUM',
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
              <h2 style="color: #d4af37; text-align: center;">AOURUM</h2>
              <p>Hola, <strong>${person.name}</strong>:</p>
              <p>Has solicitado restablecer tu contraseña en AOURUM, el mercado cultural de Arequipa.</p>
              <p>Haz clic en el siguiente botón para establecer una nueva contraseña. Este enlace expira en 15 minutos:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" style="background: linear-gradient(135deg, #d4af37, #aa7c11); color: #1c1c1e; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Restablecer Contraseña</a>
              </div>
              <p style="color: #666; font-size: 0.9rem;">Si el botón no funciona, copia y pega el siguiente enlace en tu navegador:</p>
              <p style="color: #888; font-size: 0.85rem; word-break: break-all;">${resetUrl}</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
              <p style="color: #999; font-size: 0.8rem; text-align: center;">Si no solicitaste este cambio, puedes ignorar este correo de forma segura.</p>
            </div>
          `
        });
        return res.json({ message: 'Se ha enviado un enlace de recuperación a tu correo electrónico.' });
      } catch (emailError) {
        console.error('Error al enviar correo con Resend:', emailError);
        return res.status(500).json({ error: 'Error al enviar el correo. Por favor, inténtalo de nuevo más tarde.' });
      }
    } else {
      return res.json({ 
        message: 'Modo Desarrollo: El enlace de recuperación ha sido impreso en la consola de la terminal del servidor.',
        devMode: true 
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, email, password } = req.body;
    if (!token || !email || !password) {
      return res.status(400).json({ error: 'Token, correo y nueva contraseña son requeridos.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    const emailLower = email.toLowerCase().trim();
    const people = await db.getPeople();
    const person = people.find(p => p.email && p.email.toLowerCase() === emailLower);

    if (!person) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const tempSecret = JWT_SECRET + (person.passwordHash || '');
    let decoded;
    try {
      decoded = jwt.verify(token, tempSecret);
    } catch (err) {
      return res.status(401).json({ error: 'El enlace de recuperación es inválido o ha expirado.' });
    }

    if (decoded.id !== person.id) {
      return res.status(401).json({ error: 'El token no corresponde a este usuario.' });
    }

    const newPasswordHash = await bcrypt.hash(password, 10);

    const updated = await db.updatePerson(person.id, {
      name: person.name,
      username: person.username,
      email: person.email,
      passwordHash: newPasswordHash,
      occupation: person.occupation,
      description: person.description,
      logo: person.logo,
      brandIds: person.brandIds,
      organizerIds: person.organizerIds,
      bandIds: person.bandIds,
      lastName: person.lastName
    });

    if (!updated) {
      return res.status(500).json({ error: 'No se pudo actualizar la contraseña en la base de datos.' });
    }

    res.json({ message: 'Contraseña restablecida con éxito.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Middleware de autenticación
function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token requerido.' });
    }
    const token = authHeader.split(' ')[1];
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // payload tiene { id, email }
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
}

// ── Helpers de autorización por propiedad ──

// Verifica si el usuario autenticado es colaborador de una entidad
async function isCollaborator(personId, entityType, entityId) {
  const people = await db.getPeople();
  const person = people.find(p => p.id === Number(personId));
  if (!person) return false;

  if (entityType === 'brand') {
    return person.brandIds && person.brandIds.includes(Number(entityId));
  } else if (entityType === 'band') {
    return person.bandIds && person.bandIds.includes(Number(entityId));
  } else if (entityType === 'organizer') {
    return person.organizerIds && person.organizerIds.includes(Number(entityId));
  }
  return false;
}

// Verifica si el usuario es el creador_original de una entidad
async function isCreatorOriginal(personId, entityType, entityId) {
  let entity;
  if (entityType === 'brand') {
    const brands = await db.getBrands();
    entity = brands.find(b => b.id === Number(entityId));
  } else if (entityType === 'band') {
    const bands = await db.getBands();
    entity = bands.find(b => b.id === Number(entityId));
  } else if (entityType === 'organizer') {
    const organizers = await db.getOrganizers();
    entity = organizers.find(o => o.id === Number(entityId));
  }
  if (!entity || !entity.collaborators) return false;
  return entity.collaborators.some(c => c.personId === Number(personId) && c.role === 'creador_original');
}

// Middleware factory: verifica propiedad de una entidad
function requireOwnership(entityType) {
  return async (req, res, next) => {
    try {
      const entityId = req.params.id;
      const personId = req.user.id;
      const allowed = await isCollaborator(personId, entityType, entityId);
      if (!allowed) {
        return res.status(403).json({ error: 'No tienes permiso para modificar este recurso.' });
      }
      next();
    } catch (error) {
      return res.status(500).json({ error: 'Error al verificar permisos.' });
    }
  };
}

// Middleware: verifica que el usuario es creador_original (para eliminar)
function requireCreator(entityType) {
  return async (req, res, next) => {
    try {
      const entityId = req.params.id;
      const personId = req.user.id;
      const allowed = await isCreatorOriginal(personId, entityType, entityId);
      if (!allowed) {
        return res.status(403).json({ error: 'Solo el creador original puede realizar esta acción.' });
      }
      next();
    } catch (error) {
      return res.status(500).json({ error: 'Error al verificar permisos de creador.' });
    }
  };
}

// ── ENDPOINTS DE AUTENTICACIÓN GOOGLE, FACEBOOK & CONFIGURACIÓN DE PERFIL ──

app.post('/api/auth/facebook', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token de Facebook requerido.' });

    // Consultar Graph API de Facebook
    const fbResponse = await fetch(`https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${token}`);
    const fbData = await fbResponse.json();

    if (fbData.error) {
      console.error('Error de validación Facebook:', fbData.error);
      return res.status(401).json({ error: 'Token de Facebook inválido o expirado.' });
    }

    const { id: facebookId, name, email, picture } = fbData;
    if (!email) {
      return res.status(400).json({ error: 'No se pudo obtener el correo asociado a esta cuenta de Facebook.' });
    }

    const emailLower = email.toLowerCase().trim();
    const pictureUrl = picture?.data?.url || null;

    const people = await db.getPeople();
    // Buscar si ya está vinculado o si coincide el email
    let person = people.find(p => p.facebookId === facebookId || (p.email && p.email.toLowerCase() === emailLower));

    if (person) {
      // Si el usuario existe pero no tenía facebookId guardado, vincularlo
      if (!person.facebookId) {
        person = await db.updatePerson(person.id, {
          ...person,
          facebookId: facebookId
        });
      }
    } else {
      // Registrar nueva persona
      const cleanUsername = name ? name.toLowerCase().replace(/[^a-z0-9_]/g, '').trim() : 'user_' + Math.floor(Math.random() * 10000);
      let uniqueUsername = cleanUsername;
      let counter = 1;
      while (people.some(p => p.username && p.username.toLowerCase() === uniqueUsername.toLowerCase())) {
        uniqueUsername = `${cleanUsername}_${counter}`;
        counter++;
      }

      person = await db.addPerson({
        name: name || 'Usuario Aourum',
        username: uniqueUsername,
        email: emailLower,
        passwordHash: null,
        logo: pictureUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&h=150&fit=crop&q=80',
        occupation: '',
        description: 'Usuario registrado vía Facebook',
        facebookId: facebookId
      });
    }

    const customToken = jwt.sign({ id: person.id, email: person.email }, JWT_SECRET, { expiresIn: '30d' });
    const { passwordHash, ...safe } = person;

    res.json({ token: customToken, person: safe });
  } catch (error) {
    console.error('Error Facebook Login endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/google', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token de Google requerido.' });

    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    const { sub: googleId, name, email, picture } = payload;
    const emailLower = email.toLowerCase().trim();

    const people = await db.getPeople();
    // 1. Intentar buscar por google_id
    let person = people.find(p => p.googleId === googleId);

    // 2. Si no, buscar por email
    if (!person) {
      person = people.find(p => p.email && p.email.toLowerCase() === emailLower);
      if (person) {
        // Asociar google_id automáticamente si coincide el correo
        await db.updatePerson(person.id, {
          name: person.name,
          username: person.username,
          email: person.email,
          logo: person.logo || picture,
          googleId: googleId
        });
        person.googleId = googleId;
      }
    }

    // 3. Si no existe de ninguna forma, registrar nuevo usuario
    if (!person) {
      // Generar username único
      const cleanUsername = name ? name.toLowerCase().replace(/[^a-z0-9_]/g, '').trim() : 'user_' + Math.floor(Math.random() * 10000);
      let uniqueUsername = cleanUsername;
      let counter = 1;
      while (people.some(p => p.username && p.username.toLowerCase() === uniqueUsername.toLowerCase())) {
        uniqueUsername = `${cleanUsername}_${counter}`;
        counter++;
      }

      person = await db.addPerson({
        name: name || 'Usuario Aourum',
        username: uniqueUsername,
        email: emailLower,
        passwordHash: null, // Sin contraseña local al ser social
        logo: picture || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&h=150&fit=crop&q=80',
        googleId: googleId,
        occupation: '',
        description: 'Usuario registrado vía Google'
      });
    }

    const customToken = jwt.sign({ id: person.id, email: person.email }, JWT_SECRET, { expiresIn: '30d' });
    const { passwordHash, ...safe } = person;

    res.json({ token: customToken, person: safe });
  } catch (error) {
    console.error('Error Google OAuth:', error);
    res.status(401).json({ error: 'Autenticación con Google fallida.' });
  }
});

app.put('/api/auth/change-email', requireAuth, async (req, res) => {
  try {
    const { newEmail, password } = req.body;
    if (!newEmail) return res.status(400).json({ error: 'El nuevo correo es requerido.' });
    
    const emailLower = newEmail.toLowerCase().trim();
    const people = await db.getPeople();
    
    // Verificar si el correo ya está en uso
    const existing = people.find(p => p.email && p.email.toLowerCase() === emailLower);
    if (existing && existing.id !== req.user.id) {
      return res.status(409).json({ error: 'El correo electrónico ya está en uso por otra cuenta.' });
    }

    const person = people.find(p => p.id === req.user.id);
    if (!person) return res.status(404).json({ error: 'Usuario no encontrado.' });

    // Si el usuario tiene password_hash configurado, validarlo
    if (person.passwordHash) {
      if (!password) {
        return res.status(400).json({ error: 'Se requiere la contraseña actual para realizar este cambio.' });
      }
      const valid = await bcrypt.compare(password, person.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: 'Contraseña incorrecta.' });
      }
    }

    const updated = await db.updatePerson(person.id, {
      ...person,
      email: emailLower
    });

    if (!updated) return res.status(500).json({ error: 'No se pudo actualizar el correo.' });
    
    // Regenerar token con el nuevo email
    const token = jwt.sign({ id: updated.id, email: updated.email }, JWT_SECRET, { expiresIn: '30d' });
    const { passwordHash: _, ...safe } = updated;

    res.json({ message: 'Correo electrónico actualizado correctamente.', token, person: safe });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/auth/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
    }

    const people = await db.getPeople();
    const person = people.find(p => p.id === req.user.id);
    if (!person) return res.status(404).json({ error: 'Usuario no encontrado.' });

    // Validar contraseña actual si la tiene
    if (person.passwordHash) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Se requiere la contraseña actual.' });
      }
      const valid = await bcrypt.compare(currentPassword, person.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: 'La contraseña actual es incorrecta.' });
      }
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    const updated = await db.updatePerson(person.id, {
      ...person,
      passwordHash: newPasswordHash
    });

    if (!updated) return res.status(500).json({ error: 'No se pudo actualizar la contraseña.' });
    res.json({ message: 'Contraseña actualizada con éxito.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/link-google', requireAuth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token de Google requerido.' });

    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    const { sub: googleId } = payload;

    const people = await db.getPeople();
    // Validar si ese google_id ya está vinculado a otra cuenta
    const existing = people.find(p => p.googleId === googleId);
    if (existing && existing.id !== req.user.id) {
      return res.status(409).json({ error: 'Esta cuenta de Google ya está vinculada a otro perfil de AOURUM.' });
    }

    const person = people.find(p => p.id === req.user.id);
    if (!person) return res.status(404).json({ error: 'Usuario no encontrado.' });

    const updated = await db.updatePerson(person.id, {
      ...person,
      googleId: googleId
    });

    if (!updated) return res.status(500).json({ error: 'No se pudo vincular la cuenta.' });
    const { passwordHash: _, ...safe } = updated;
    res.json({ message: 'Cuenta de Google vinculada con éxito.', person: safe });
  } catch (error) {
    console.error('Link Google Error:', error);
    res.status(400).json({ error: 'Token de Google inválido.' });
  }
});

app.post('/api/auth/unlink-google', requireAuth, async (req, res) => {
  try {
    const people = await db.getPeople();
    const person = people.find(p => p.id === req.user.id);
    if (!person) return res.status(404).json({ error: 'Usuario no encontrado.' });

    // Impedir desvinculación si el usuario no tiene contraseña (para evitar que se quede sin métodos de login)
    if (!person.passwordHash) {
      return res.status(400).json({ error: 'No puedes desvincular Google si no tienes una contraseña configurada en tu cuenta.' });
    }

    const updated = await db.updatePerson(person.id, {
      ...person,
      googleId: null
    });

    if (!updated) return res.status(500).json({ error: 'No se pudo desvincular la cuenta.' });
    const { passwordHash: _, ...safe } = updated;
    res.json({ message: 'Cuenta de Google desvinculada con éxito.', person: safe });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/link-facebook', requireAuth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token de Facebook requerido.' });

    // Consultar Graph API de Facebook
    const fbResponse = await fetch(`https://graph.facebook.com/me?fields=id&access_token=${token}`);
    const fbData = await fbResponse.json();

    if (fbData.error) {
      console.error('Error de validación Facebook Link:', fbData.error);
      return res.status(401).json({ error: 'Token de Facebook inválido.' });
    }

    const { id: facebookId } = fbData;

    const people = await db.getPeople();
    const existing = people.find(p => p.facebookId === facebookId);
    if (existing && existing.id !== req.user.id) {
      return res.status(409).json({ error: 'Esta cuenta de Facebook ya está vinculada a otro perfil de AOURUM.' });
    }

    const person = people.find(p => p.id === req.user.id);
    if (!person) return res.status(404).json({ error: 'Usuario no encontrado.' });

    const updated = await db.updatePerson(person.id, {
      ...person,
      facebookId: facebookId
    });

    if (!updated) return res.status(500).json({ error: 'No se pudo vincular la cuenta.' });
    const { passwordHash: _, ...safe } = updated;
    res.json({ message: 'Cuenta de Facebook vinculada con éxito.', person: safe });
  } catch (error) {
    console.error('Link Facebook Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/unlink-facebook', requireAuth, async (req, res) => {
  try {
    const people = await db.getPeople();
    const person = people.find(p => p.id === req.user.id);
    if (!person) return res.status(404).json({ error: 'Usuario no encontrado.' });

    // Impedir desvinculación si no tiene otro método de acceso
    if (!person.passwordHash && !person.googleId) {
      return res.status(400).json({ error: 'No puedes desvincular Facebook si no tienes otro método de acceso configurado (contraseña o Google).' });
    }

    const updated = await db.updatePerson(person.id, {
      ...person,
      facebookId: null
    });

    if (!updated) return res.status(500).json({ error: 'No se pudo desvincular la cuenta.' });
    const { passwordHash: _, ...safe } = updated;
    res.json({ message: 'Cuenta de Facebook desvinculada con éxito.', person: safe });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/auth/delete-account', requireAuth, async (req, res) => {
  try {
    const { password } = req.body;
    const people = await db.getPeople();
    const person = people.find(p => p.id === req.user.id);
    if (!person) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    // Si el usuario tiene una contraseña registrada, la verificamos
    if (person.passwordHash) {
      if (!password) {
        return res.status(400).json({ error: 'Se requiere la contraseña para confirmar la eliminación de la cuenta.' });
      }
      const valid = await bcrypt.compare(password, person.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: 'Contraseña incorrecta.' });
      }
    }

    // Proceder con la eliminación en cascada
    const success = await db.deletePerson(person.id);
    if (!success) {
      return res.status(500).json({ error: 'No se pudo eliminar la cuenta.' });
    }

    res.json({ message: 'Cuenta eliminada con éxito de forma permanente.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/fairs/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, location, date, time, banner, description, lat, lng, organizerId, slug } = req.body;
    if (!name || !location || !date) {
      return res.status(400).json({ error: 'Faltan campos requeridos (nombre, ubicación, fecha)' });
    }
    // Verificar que el usuario es colaborador del organizador de esta feria
    if (organizerId) {
      const allowed = await isCollaborator(req.user.id, 'organizer', organizerId);
      if (!allowed) {
        return res.status(403).json({ error: 'No tienes permiso para editar esta feria.' });
      }
    }
    let cleanSlug = undefined;
    if (slug !== undefined) {
      cleanSlug = slug.toLowerCase().replace(/[^a-z0-9_]/g, '').trim();
      if (!cleanSlug) {
        return res.status(400).json({ error: 'El identificador de URL (slug) no puede estar vacío.' });
      }
      const unique = await db.isSlugUnique('fairs', cleanSlug, id);
      if (!unique) {
        return res.status(409).json({ error: 'El identificador de URL (slug) ya está en uso.' });
      }
    }
    const updated = await db.updateFair(id, {
      name, location, date, time, banner, description, lat, lng, organizerId, slug: cleanSlug
    });
    if (!updated) return res.status(404).json({ error: 'Feria no encontrada' });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/fairs/:id/respond', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { type, entityId, accept } = req.body;
    if (!type || !entityId || accept === undefined) {
      return res.status(400).json({ error: 'Faltan campos requeridos (type, entityId, accept)' });
    }
    // Verificar que el usuario es colaborador del organizador de esta feria
    const fairs = await db.getFairs();
    const fair = fairs.find(f => f.id === Number(id));
    if (!fair) return res.status(404).json({ error: 'Feria no encontrada' });
    const allowed = await isCreatorOriginal(req.user.id, 'organizer', fair.organizerId);
    if (!allowed) {
      return res.status(403).json({ error: 'No tienes permiso para responder a postulaciones de esta feria.' });
    }
    const result = await db.respondToFairApplication(id, type, entityId, accept);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/:entityType/:id/collaborators', requireAuth, async (req, res) => {
  try {
    const { entityType, id } = req.params;
    const { personId, role } = req.body;
    if (!personId || !role) {
      return res.status(400).json({ error: 'Faltan campos requeridos (personId, role)' });
    }
    let type = entityType;
    if (type === 'brands') type = 'brand';
    if (type === 'bands') type = 'band';
    if (type === 'organizers') type = 'organizer';

    if (type !== 'brand' && type !== 'band' && type !== 'organizer') {
      return res.status(400).json({ error: 'Tipo de entidad no válido' });
    }

    // Solo el creador puede cambiar roles
    const allowed = await isCreatorOriginal(req.user.id, type, id);
    if (!allowed) {
      return res.status(403).json({ error: 'Solo el creador original puede cambiar roles de colaboradores.' });
    }

    const result = await db.updateCollaboratorRole(type, id, personId, role);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/:entityType/:id/collaborators/:personId', requireAuth, async (req, res) => {
  try {
    const { entityType, id, personId } = req.params;
    let type = entityType;
    if (type === 'brands') type = 'brand';
    if (type === 'bands') type = 'band';
    if (type === 'organizers') type = 'organizer';

    if (type !== 'brand' && type !== 'band' && type !== 'organizer') {
      return res.status(400).json({ error: 'Tipo de entidad no válido' });
    }

    // Solo el creador puede remover colaboradores
    const allowed = await isCreatorOriginal(req.user.id, type, id);
    if (!allowed) {
      return res.status(403).json({ error: 'Solo el creador original puede remover colaboradores.' });
    }

    const result = await db.removeCollaborator(type, id, personId);
    res.json({ success: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ AOURUM API corriendo en http://localhost:${PORT}`);
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    console.warn('⚠️  ADVERTENCIA: Variables de Cloudinary no encontradas. Crea el archivo .env');
  }
});
