const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function test() {
  try {
    const { data: fairs, error } = await supabase.from('fairs').select('id, name, slug');
    console.log('Fairs in db:', fairs);
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
