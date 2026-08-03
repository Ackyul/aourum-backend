const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const cloudinary = require('cloudinary').v2;
require('dotenv').config({ path: path.join(__dirname, '.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

function extractPublicId(url) {
  if (!url || typeof url !== 'string' || !url.includes('cloudinary.com')) return null;
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-zA-Z0-9]+)?$/);
  return match ? match[1] : null;
}

async function cleanupCloudinary() {
  console.log('🔍 Auditando base de datos para extraer imágenes activas de Cloudinary...');
  const activeIds = new Set();
  const tables = ['products', 'brands', 'fairs', 'bands', 'people', 'organizers'];

  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*');
    if (error) {
      console.error(`⚠️ Error al consultar la tabla ${table}:`, error.message);
      continue;
    }
    if (!data) continue;
    const jsonStr = JSON.stringify(data);
    const urls = jsonStr.match(/https:\/\/res\.cloudinary\.com\/[^\s"',\\]+/g) || [];
    urls.forEach(u => {
      const cleanUrl = u.replace(/\\/g, '').replace(/"/g, '');
      const pid = extractPublicId(cleanUrl);
      if (pid) activeIds.add(pid);
    });
  }

  console.log(`✅ Se encontraron ${activeIds.size} imágenes en uso referenciadas en Supabase.`);

  console.log('🔍 Obteniendo la lista de imágenes guardadas en Cloudinary...');
  let allResources = [];
  let nextCursor = null;
  do {
    const options = { max_results: 500 };
    if (nextCursor) options.next_cursor = nextCursor;
    const res = await cloudinary.api.resources(options);
    allResources.push(...res.resources);
    nextCursor = res.next_cursor;
  } while (nextCursor);

  console.log(`📦 Total de recursos almacenados en Cloudinary: ${allResources.length}`);

  const unused = allResources.filter(r => !activeIds.has(r.public_id));

  if (unused.length === 0) {
    console.log('🎉 No hay imágenes huérfanas o sin uso en Cloudinary. ¡Todo limpio!');
    return;
  }

  console.log(`\n🗑️  Eliminando ${unused.length} imágenes no utilizadas de Cloudinary...`);
  let deletedCount = 0;
  for (const res of unused) {
    try {
      const delResult = await cloudinary.uploader.destroy(res.public_id);
      if (delResult.result === 'ok') {
        deletedCount++;
        console.log(`  ✓ Eliminada: ${res.public_id}`);
      } else {
        console.log(`  ⚠️ No se pudo eliminar ${res.public_id}:`, delResult.result);
      }
    } catch (err) {
      console.error(`  ✗ Error al eliminar ${res.public_id}:`, err.message);
    }
  }

  console.log(`\n✨ ¡Limpieza completada! Se eliminaron exitosamente ${deletedCount} imágenes huérfanas de Cloudinary.`);
}

cleanupCloudinary().catch(err => {
  console.error('❌ Error en el script de limpieza:', err);
  process.exit(1);
});
