const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function test() {
  try {
    const res = await supabase.from('organizers').delete().eq('id', 18).select();
    console.log('Delete response:', res);
  } catch (err) {
    console.error('Thrown error:', err);
  }
}

test();
