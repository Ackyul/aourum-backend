/**
 * migrate_theme_color.js
 * 
 * Migración: extrae theme_color del campo description (JSON) de la tabla brands
 * y lo mueve a la nueva columna dedicada theme_color.
 *
 * INSTRUCCIONES:
 * 1. Primero ejecuta el SQL en Supabase SQL Editor:
 *    ALTER TABLE brands ADD COLUMN IF NOT EXISTS theme_color TEXT DEFAULT '';
 * 2. Luego corre este script desde la raíz del backend:
 *    node migrate_theme_color.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function migrate() {
  console.log('--- Iniciando migración de theme_color en brands ---');

  const { data: brands, error } = await supabase
    .from('brands')
    .select('id, description, theme_color');

  if (error) {
    console.error('Error al obtener marcas:', error.message);
    process.exit(1);
  }

  console.log(`Encontradas ${brands.length} marcas.`);

  let migrated = 0;
  let skipped = 0;

  for (const brand of brands) {
    // Si ya tiene theme_color en la columna, saltar
    if (brand.theme_color && brand.theme_color.trim() !== '') {
      skipped++;
      continue;
    }

    // Intentar parsear el campo description como JSON
    let themeColor = '';
    if (brand.description && brand.description.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(brand.description);
        themeColor = parsed.theme_color || '';
      } catch (e) {
        // no es JSON válido, continuar
      }
    }

    if (!themeColor) {
      skipped++;
      continue;
    }

    // Actualizar la columna theme_color
    const { error: updateError } = await supabase
      .from('brands')
      .update({ theme_color: themeColor })
      .eq('id', brand.id);

    if (updateError) {
      console.error(`Error actualizando brand #${brand.id}:`, updateError.message);
    } else {
      console.log(`  ✓ Brand #${brand.id}: theme_color = "${themeColor}"`);
      migrated++;
    }
  }

  console.log(`\n=== Migración completada ===`);
  console.log(`  Migradas: ${migrated}`);
  console.log(`  Omitidas (sin color o ya migradas): ${skipped}`);
}

migrate().catch(err => {
  console.error('Error inesperado:', err);
  process.exit(1);
});
