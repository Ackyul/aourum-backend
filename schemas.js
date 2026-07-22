const { z } = require('zod');

const registerSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(100),
  email: z.string().email('El correo electrónico no es válido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  occupation: z.string().optional().default(''),
  description: z.string().optional().default(''),
  logo: z.string().optional().default(''),
  username: z.string().regex(/^[a-z0-9_]*$/, 'El nombre de usuario solo puede contener letras minúsculas, números y guiones bajos').optional(),
  lastName: z.string().optional().nullable()
});

const loginSchema = z.object({
  email: z.string().email('El correo electrónico no es válido'),
  password: z.string().min(1, 'La contraseña es requerida')
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'El token es requerido'),
  email: z.string().email('El correo electrónico no es válido'),
  password: z.string().min(6, 'La nueva contraseña debe tener al menos 6 caracteres')
});

const productSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(200),
  description: z.string().optional().default(''),
  price: z.preprocess((val) => Number(val), z.number().positive('El precio debe ser un número positivo')),
  priceAourum: z.preprocess((val) => (val === null || val === undefined || val === '') ? null : Number(val), z.number().positive('El precio Aourum debe ser un número positivo').nullable().optional()),
  stock: z.preprocess((val) => (val === null || val === undefined || val === '') ? null : Number(val), z.number().int('El stock debe ser un entero').nonnegative('El stock no puede ser negativo').nullable().optional()),
  category: z.string().min(1, 'La categoría es requerida'),
  brandId: z.preprocess((val) => Number(val), z.number().int().positive('La ID de la marca debe ser válida')),
  image: z.string().optional().nullable(),
  type: z.string().optional().default('product')
});

const fairSchema = z.object({
  name: z.string().min(1, 'El nombre de la feria es requerido'),
  location: z.string().min(1, 'La ubicación es requerida'),
  date: z.string().min(1, 'La fecha es requerida'),
  time: z.string().optional().default('10:00 - 20:00'),
  banner: z.string().optional().nullable(),
  description: z.string().optional().default(''),
  lat: z.preprocess((val) => val === undefined || val === null ? -16.39889 : Number(val), z.number().optional()),
  lng: z.preprocess((val) => val === undefined || val === null ? -71.53694 : Number(val), z.number().optional()),
  organizerId: z.preprocess((val) => val === undefined || val === null ? 1 : Number(val), z.number().int().positive().optional()),
  slug: z.string().optional()
});

const bandSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  genre: z.string().min(1, 'El género es requerido'),
  members: z.preprocess((val) => val === undefined || val === null ? 1 : Number(val), z.number().int().positive().optional()),
  description: z.string().optional().default(''),
  image: z.string().optional().nullable(),
  mediaLink: z.string().optional().default(''),
  personId: z.preprocess((val) => val ? Number(val) : undefined, z.number().int().positive().optional()),
  gigs: z.array(z.any()).optional().default([]),
  slug: z.string().optional()
});

const brandSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  owner: z.string().min(1, 'El dueño es requerido'),
  category: z.string().min(1, 'La categoría es requerida'),
  description: z.string().optional().default(''),
  logo: z.string().optional().nullable(),
  personId: z.preprocess((val) => val ? Number(val) : undefined, z.number().int().positive().optional()),
  slug: z.string().optional(),
  whatsappNumber: z.string().optional().nullable()
});

const organizerSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  owner: z.string().min(1, 'El dueño es requerido'),
  description: z.string().optional().default(''),
  logo: z.string().optional().nullable(),
  personId: z.preprocess((val) => val ? Number(val) : undefined, z.number().int().positive().optional()),
  slug: z.string().optional()
});

const profileUpdateSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  occupation: z.string().optional().default(''),
  description: z.string().optional().default(''),
  logo: z.string().optional().nullable(),
  brandIds: z.array(z.preprocess((val) => Number(val), z.number())).optional().default([]),
  organizerIds: z.array(z.preprocess((val) => Number(val), z.number())).optional().default([]),
  bandIds: z.array(z.preprocess((val) => Number(val), z.number())).optional().default([]),
  username: z.string().regex(/^[a-z0-9_]*$/, 'El nombre de usuario solo puede contener letras minúsculas, números y guiones bajos').optional().nullable(),
  lastName: z.string().optional().nullable()
});

const postSchema = z.object({
  content: z.string().min(1, 'El contenido del post no puede estar vacío').max(5000),
  image: z.string().optional().nullable(),
  fairId: z.preprocess((val) => (val === null || val === undefined || val === '') ? null : Number(val), z.number().int().positive().nullable().optional()),
  brandId: z.preprocess((val) => (val === null || val === undefined || val === '') ? null : Number(val), z.number().int().positive().nullable().optional()),
  organizerId: z.preprocess((val) => (val === null || val === undefined || val === '') ? null : Number(val), z.number().int().positive().nullable().optional()),
  authorType: z.enum(['person', 'brand', 'organizer']).optional().default('person')
});

module.exports = {
  registerSchema,
  loginSchema,
  resetPasswordSchema,
  productSchema,
  fairSchema,
  bandSchema,
  brandSchema,
  organizerSchema,
  profileUpdateSchema,
  postSchema
};
