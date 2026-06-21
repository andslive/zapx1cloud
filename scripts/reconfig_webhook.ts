
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing env vars");
  process.exit(1);
}

const response = await fetch(`${supabaseUrl}/functions/v1/whatsapp-proxy`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${serviceKey}`,
  },
  body: JSON.stringify({
    action: "connect_instance",
    id: "6a43a51d-6ee3-43a5-8261-5710e23356f2"
  }),
});

const data = await response.json();
console.log(JSON.stringify(data, null, 2));
