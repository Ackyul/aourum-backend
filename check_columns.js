const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function test() {
  try {
    const { data: fairs, error } = await supabase.from('fairs').select('*');
    console.log('Fairs in db:', JSON.stringify(fairs, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
