/**
 * migrate_brand_design.js
 * 
 * Migración en Supabase: agrega la columna brand_design (JSONB) a la tabla brands.
 *
 * INSTRUCCIONES:
 * 1. Corre este comando SQL en el Supabase SQL Editor:
 *    ALTER TABLE brands ADD COLUMN IF NOT EXISTS brand_design JSONB DEFAULT '{}'::jsonb;
 * 
 * 2. O corre este script para verificar/inicializar:
 *    node migrate_brand_design.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkAndMigrate() {
  console.log('--- Verificando columna brand_design en Supabase ---');

  const { data: brands, error } = await supabase
    .from('brands')
    .select('id, name, brand_design')
    .limit(5);

  if (error) {
    if (error.message.includes('brand_design')) {
      console.log('\n❌ La columna "brand_design" NO existe aún en la base de datos Supabase.');
      console.log('Por favor ejecuta el siguiente SQL en Supabase SQL Editor:\n');
      console.log("   ALTER TABLE brands ADD COLUMN IF NOT EXISTS brand_design JSONB DEFAULT '{}'::jsonb;\n");
    } else {
      console.error('Error al consultar marcas:', error.message);
    }
    process.exit(1);
  }

  console.log(`✓ La columna "brand_design" existe en Supabase y funciona correctamente.`);
  console.log(`Se encontraron ${brands.length} marcas de prueba.`);
}

checkAndMigrate().catch(err => {
  console.error('Error inesperado:', err);
  process.exit(1);
});
