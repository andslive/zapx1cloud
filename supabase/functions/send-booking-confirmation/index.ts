import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPlatformEmail } from "../_shared/platform-email-send.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  bookingId: string;
  guestName: string;
  guestEmail: string;
  eventName: string;
  hostName: string;
  startTime: string;
  endTime: string;
  meetLink?: string;
  confirmationToken: string;
  confirmationUrl: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json();
    const { bookingId, guestName, guestEmail, eventName, hostName, startTime, endTime, meetLink, confirmationUrl } = body;

    const startDate = new Date(startTime);
    const endDate = new Date(endTime);
    const dateStr = startDate.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Sao_Paulo' });
    const timeStr = startDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    const endTimeStr = endDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

    const meetLinkBlock = meetLink
      ? `<p style="margin:16px 0"><a href="${meetLink}" style="background:#a3e635;color:#1f2937;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600">Entrar na reunião</a></p><p style="font-size:13px;color:#6b7280;word-break:break-all">${meetLink}</p>`
      : "";

    const result = await sendPlatformEmail({
      slug: "booking_confirmation",
      to: guestEmail,
      idempotencyKey: `booking-${bookingId}`,
      variables: {
        guest_name: guestName,
        event_name: eventName,
        host_name: hostName,
        date_time: `${dateStr} • ${timeStr} - ${endTimeStr}`,
        meet_link_block: meetLinkBlock,
        confirmation_url: confirmationUrl,
      },
    });

    if (!result.ok) throw new Error(result.error || "Falha ao enviar confirmação");

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error sending confirmation email:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
