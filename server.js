const express = require('express');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
require('dotenv').config();

const db = require('./db');
const JWT_SECRET = process.env.JWT_SECRET || 'aourum_secret_2026';
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

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'AOURUM API is running' });
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
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


app.post('/api/products', async (req, res) => {
  try {
    const { name, description, price, stock, category, brandId, image, type } = req.body;
    if (!name || !price || !category || !brandId) {
      return res.status(400).json({ error: 'Faltan campos requeridos (nombre, precio, categoría, brandId)' });
    }
    const product = await db.addProduct({
      name,
      description: description || '',
      price: Number(price),
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

app.put('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, stock, category, brandId, image, type } = req.body;
    if (!name || !price || !category || !brandId) {
      return res.status(400).json({ error: 'Faltan campos requeridos para la actualización (nombre, precio, categoría, brandId)' });
    }
    const updated = await db.updateProduct(id, {
      name,
      description: description || '',
      price: Number(price),
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

app.delete('/api/products/:id', async (req, res) => {
  try {
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

app.post('/api/fairs', async (req, res) => {
  try {
    const { name, location, date, time, banner, description, lat, lng, organizerId } = req.body;
    if (!name || !location || !date) {
      return res.status(400).json({ error: 'Faltan campos requeridos (nombre, ubicación, fecha)' });
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

app.post('/api/bands', async (req, res) => {
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

app.post('/api/brands', async (req, res) => {
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

app.post('/api/organizers', async (req, res) => {
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

app.put('/api/bands/:id', async (req, res) => {
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

app.put('/api/brands/:id', async (req, res) => {
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

app.put('/api/organizers/:id', async (req, res) => {
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

app.delete('/api/bands/:id', async (req, res) => {
  try {
    const success = await db.deleteBand(req.params.id);
    if (!success) return res.status(404).json({ error: 'Banda no encontrada' });
    res.json({ message: 'Banda eliminada con éxito' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/brands/:id', async (req, res) => {
  try {
    const success = await db.deleteBrand(req.params.id);
    if (!success) return res.status(404).json({ error: 'Marca no encontrada' });
    res.json({ message: 'Marca eliminada con éxito' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/organizers/:id', async (req, res) => {
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

app.put('/api/people/:id', async (req, res) => {
  try {
    const { id } = req.params;
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

app.post('/api/fairs/apply', async (req, res) => {
  try {
    const { fairId, type, id } = req.body;
    if (!fairId || !type || !id) {
      return res.status(400).json({ error: 'Faltan campos requeridos (fairId, type, id)' });
    }
    if (type !== 'brand' && type !== 'band') {
      return res.status(400).json({ error: 'Tipo de aplicación inválido (debe ser brand o band)' });
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

app.post('/api/invitations', async (req, res) => {
  try {
    const { senderType, senderId, senderName, receiverPersonId, role } = req.body;
    if (!senderType || !senderId || !senderName || !receiverPersonId || !role) {
      return res.status(400).json({ error: 'Faltan campos requeridos (senderType, senderId, senderName, receiverPersonId, role)' });
    }
    const invitation = await db.addInvitation({ senderType, senderId, senderName, receiverPersonId, role });
    res.status(201).json(invitation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/invitations/:id/respond', async (req, res) => {
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

app.post('/api/auth/register', async (req, res) => {
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

app.post('/api/auth/login', async (req, res) => {
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

app.post('/api/auth/forgot-password', async (req, res) => {
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

app.put('/api/fairs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, location, date, time, banner, description, lat, lng, organizerId, slug } = req.body;
    if (!name || !location || !date) {
      return res.status(400).json({ error: 'Faltan campos requeridos (nombre, ubicación, fecha)' });
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

app.post('/api/fairs/:id/respond', async (req, res) => {
  try {
    const { id } = req.params;
    const { type, entityId, accept } = req.body;
    if (!type || !entityId || accept === undefined) {
      return res.status(400).json({ error: 'Faltan campos requeridos (type, entityId, accept)' });
    }
    const result = await db.respondToFairApplication(id, type, entityId, accept);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/:entityType/:id/collaborators', async (req, res) => {
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

    const result = await db.updateCollaboratorRole(type, id, personId, role);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/:entityType/:id/collaborators/:personId', async (req, res) => {
  try {
    const { entityType, id, personId } = req.params;
    let type = entityType;
    if (type === 'brands') type = 'brand';
    if (type === 'bands') type = 'band';
    if (type === 'organizers') type = 'organizer';

    if (type !== 'brand' && type !== 'band' && type !== 'organizer') {
      return res.status(400).json({ error: 'Tipo de entidad no válido' });
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
