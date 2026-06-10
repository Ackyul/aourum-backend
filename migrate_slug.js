const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function runMigration() {
  console.log('🔄 Running AOURUM migration: backfill slug for products, check whatsapp_number in brands...\n');

  console.log('🔄 Backfilling slugs for existing products...');
  const { data: products, error: pErr } = await supabase.from('products').select('id, name, slug');
  
  if (pErr) {
    // Column may not exist yet
    console.log('⚠️  Products slug column may not exist yet. Please run this SQL in Supabase SQL editor:');
    console.log(`
ALTER TABLE products ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
    `);
    return;
  }

  const slugs = new Set();
  function makeSlug(name) {
    if (!name) return 'product_' + Math.floor(Math.random() * 9999);
    let s = name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!s) s = 'product_' + Math.floor(Math.random() * 9999);
    return s;
  }

  let updated = 0;
  for (const prod of products) {
    if (prod.slug) { slugs.add(prod.slug); continue; }
    let slug = makeSlug(prod.name);
    let counter = 1;
    while (slugs.has(slug)) { slug = `${makeSlug(prod.name)}_${counter++}`; }
    slugs.add(slug);

    const { error } = await supabase.from('products').update({ slug }).eq('id', prod.id);
    if (!error) {
      updated++;
      console.log(`  ✓ products[${prod.id}] "${prod.name}" => slug: "${slug}"`);
    } else {
      console.log(`  ✗ Could not update products[${prod.id}]: ${error.message}`);
    }
  }
  console.log(`✅ Updated ${updated} products with slugs.\n`);

  // 3. Check brands table for whatsapp_number
  const { data: brands, error: bErr } = await supabase.from('brands').select('id, name, whatsapp_number');
  if (bErr) {
    console.log('⚠️  brands.whatsapp_number column may not exist. Please run in Supabase SQL editor:');
    console.log(`ALTER TABLE brands ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;`);
  } else {
    console.log(`✅ brands.whatsapp_number column exists (${brands.length} brands checked).`);
  }

  console.log('\n✅ Migration completed!');
  console.log('\n📋 IMPORTANT: If columns did not exist, run this SQL in the Supabase dashboard SQL editor:');
  console.log(`
-- Run these in Supabase SQL Editor (https://app.supabase.com → your project → SQL Editor):
ALTER TABLE products ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;

-- Create unique index on products.slug (optional but recommended):
CREATE UNIQUE INDEX IF NOT EXISTS products_slug_idx ON products(slug) WHERE slug IS NOT NULL;
  `);
}

runMigration().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
