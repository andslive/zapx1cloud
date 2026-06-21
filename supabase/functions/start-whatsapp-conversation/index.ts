import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizePhoneBR, phoneVariantsBR } from "../_shared/phone.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get org
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return new Response(JSON.stringify({ error: "No organization" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { phone, lead_id, lead_name, initial_message } = await req.json();

    if (!phone) {
      return new Response(JSON.stringify({ error: "Phone is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize phone — canonical BR with mobile-9 (memo: normalizacao-telefone-ddi)
    const normalizedPhone = normalizePhoneBR(phone);

    // Procura QUALQUER conversa do mesmo telefone normalizado (inclusive fechada).
    // Reabrir conversa existente em vez de criar nova → nunca duplica histórico.
    const { data: existing } = await supabase
      .from("webchat_conversations")
      .select("id, status")
      .eq("organization_id", profile.organization_id)
      .eq("channel", "whatsapp")
      .eq("visitor_phone_normalized", normalizedPhone)
      .order("status", { ascending: true }) // não-closed primeiro
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1);

    if (existing && existing.length > 0) {
      await supabase
        .from("webchat_conversations")
        .update({
          assigned_user_id: user.id,
          status: "human_active",
          closed_at: null,
        })
        .eq("id", existing[0].id);

      // Send initial message if provided
      if (initial_message) {
        await supabase.from("webchat_messages").insert({
          conversation_id: existing[0].id,
          content: initial_message,
          sender_type: "agent",
        });
        try {
          await supabase.functions.invoke('whatsapp-send', {
            body: {
              organization_id: profile.organization_id,
              type: 'text',
              to: normalizedPhone,
              payload: { text: initial_message },
            },
          });
        } catch (e) {
          console.error("Evolution send error:", e);
        }
      }

      return new Response(
        JSON.stringify({ conversation_id: existing[0].id, is_new: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find a widget for this org to attach the conversation
    const { data: widget } = await supabase
      .from("webchat_widgets")
      .select("id")
      .eq("organization_id", profile.organization_id)
      .eq("is_active", true)
      .limit(1)
      .single();

    // Create new conversation - generate a visitor_id for WhatsApp conversations
    const visitorId = crypto.randomUUID();
    const conversationData: Record<string, any> = {
      organization_id: profile.organization_id,
      visitor_id: visitorId,
      channel: "whatsapp",
      status: "human_active",
      assigned_user_id: user.id,
      visitor_phone: normalizedPhone,
      visitor_name: lead_name || normalizedPhone,
    };

    if (widget?.id) {
      conversationData.widget_id = widget.id;
    }
    if (lead_id) {
      conversationData.lead_id = lead_id;
    }

    let { data: newConv, error: insertError } = await supabase
      .from("webchat_conversations")
      .insert(conversationData)
      .select("id")
      .single();

    if (insertError && (insertError as any).code === "23505") {
      // Race com webhook/automação — recupera a conversa que ganhou o INSERT
      const { data: race } = await supabase
        .from("webchat_conversations")
        .select("id")
        .eq("organization_id", profile.organization_id)
        .eq("channel", "whatsapp")
        .eq("visitor_phone_normalized", normalizedPhone)
        .neq("status", "closed")
        .limit(1)
        .maybeSingle();
      if (race?.id) {
        newConv = race as any;
        insertError = null as any;
        await supabase
          .from("webchat_conversations")
          .update({ assigned_user_id: user.id, status: "human_active" })
          .eq("id", race.id);
      }
    }

    if (insertError) {
      console.error("Error creating conversation:", insertError);
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send initial message if provided
    if (initial_message && newConv?.id) {
      // Save message in DB
      await supabase.from("webchat_messages").insert({
        conversation_id: newConv.id,
        content: initial_message,
        sender_type: "agent",
      });

      // Send via Evolution Go
      try {
        await supabase.functions.invoke('whatsapp-send', {
          body: {
            organization_id: profile.organization_id,
            type: 'text',
            to: normalizedPhone,
            payload: { text: initial_message },
          },
        });
      } catch (e) {
        console.error("Evolution send error:", e);
      }
    }

    return new Response(
      JSON.stringify({ conversation_id: newConv.id, is_new: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
