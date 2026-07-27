/**
 * migrate_city_interests.js
 * 
 * Migración para verificar/crear las columnas city e interests en Supabase.
 *
 * INSTRUCCIONES EN SUPABASE (SQL Editor):
 * Ejecuta los siguientes comandos en el SQL Editor de tu panel de Supabase:
 *
 * ALTER TABLE people ADD COLUMN IF NOT EXISTS city TEXT DEFAULT '';
 * ALTER TABLE people ADD COLUMN IF NOT EXISTS interests TEXT DEFAULT '';
 * ALTER TABLE brands ADD COLUMN IF NOT EXISTS city TEXT DEFAULT '';
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkColumns() {
  console.log('--- Verificando columnas "city" e "interests" en Supabase ---');

  try {
    const { data: people, error: pErr } = await supabase.from('people').select('id, name, city, interests').limit(1);
    if (pErr) {
      console.log('⚠️  Recuerda ejecutar el SQL en el SQL Editor de Supabase si la columna no existe:');
      console.log('    ALTER TABLE people ADD COLUMN IF NOT EXISTS city TEXT DEFAULT \'\';');
      console.log('    ALTER TABLE people ADD COLUMN IF NOT EXISTS interests TEXT DEFAULT \'\';\n');
    } else {
      console.log('✅ Columnas "city" e "interests" en la tabla "people" están activas.');
    }

    const { data: brands, error: bErr } = await supabase.from('brands').select('id, name, city').limit(1);
    if (bErr) {
      console.log('⚠️  Recuerda ejecutar el SQL en el SQL Editor de Supabase:');
      console.log('    ALTER TABLE brands ADD COLUMN IF NOT EXISTS city TEXT DEFAULT \'\';\n');
    } else {
      console.log('✅ Columna "city" en la tabla "brands" está activa.');
    }
  } catch (err) {
    console.error('Error durante la verificación:', err.message);
  }
}

checkColumns();
