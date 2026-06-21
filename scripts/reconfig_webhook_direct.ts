
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function run() {
  const { data: platform } = await supabase.from("platform_settings").select("*").single();
  const { data: instance } = await supabase.from("evolution_instances").select("*").eq("name", "9MmX47").single();

  if (!platform || !instance) {
    console.error("Platform or instance not found");
    return;
  }

  const uazapiUrl = platform.uazapi_url;
  const webhookUrl = `${supabaseUrl}/functions/v1/uazapi-webhook`;

  console.log(`Reconfiguring instance ${instance.name} at ${uazapiUrl}`);
  console.log(`Setting webhook to ${webhookUrl}`);

  const payload = {
    url: webhookUrl,
    events: ["messages", "connection", "presence", "messages_update", "qrcode", "history", "call", "contacts", "groups", "chats"],
    enabled: true
  };

  const res = await fetch(`${uazapiUrl.replace(/\/$/, "")}/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "token": instance.instance_token
    },
    body: JSON.stringify(payload)
  });

  const body = await res.text();
  console.log(`Response ${res.status}: ${body}`);
  
  if (!res.ok) {
     const res2 = await fetch(`${uazapiUrl.replace(/\/$/, "")}/webhook/set`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "token": instance.instance_token
        },
        body: JSON.stringify(payload)
      });
      const body2 = await res2.text();
      console.log(`Retry Response ${res2.status}: ${body2}`);
  }
}

run();
