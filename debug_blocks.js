const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase
    .from('capture_funnels')
    .select('id, name, flow_blocks')
    .ilike('name', '%Anderson Silva%')
    .limit(1);

  if (error) {
    console.error(error);
    return;
  }

  if (data && data.length > 0) {
    console.log(JSON.stringify(data[0].flow_blocks, null, 2));
  } else {
    console.log('No funnel found');
  }
}

run();
