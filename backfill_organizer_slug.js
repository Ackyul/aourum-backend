const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

function makeSlug(name) {
  if (!name) return 'productora_' + Math.floor(Math.random() * 9999);
  let s = name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!s) s = 'productora_' + Math.floor(Math.random() * 9999);
  return s;
}

async function run() {
  console.log('🔄 Running AOURUM migration: backfill slug for organizers...\n');
  const { data: organizers, error: oErr } = await supabase.from('organizers').select('id, name, slug');
  
  if (oErr) {
    console.log('⚠️  Organizers slug column may not exist yet. Please run this SQL in Supabase SQL editor first:');
    console.log('\nALTER TABLE organizers ADD COLUMN IF NOT EXISTS slug TEXT;\n');
    return;
  }

  const slugs = new Set();
  let updated = 0;
  for (const org of organizers) {
    if (org.slug) { slugs.add(org.slug); continue; }
    let slug = makeSlug(org.name);
    let counter = 1;
    while (slugs.has(slug)) { slug = `${makeSlug(org.name)}_${counter++}`; }
    slugs.add(slug);

    const { error } = await supabase.from('organizers').update({ slug }).eq('id', org.id);
    if (!error) {
      updated++;
      console.log(`  ✓ organizers[${org.id}] "${org.name}" => slug: "${slug}"`);
    } else {
      console.log(`  ✗ Could not update organizers[${org.id}]: ${error.message}`);
    }
  }
  console.log(`\n✅ Updated ${updated} organizers with slugs.`);
}

run();
