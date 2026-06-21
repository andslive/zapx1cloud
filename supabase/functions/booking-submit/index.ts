import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.90.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  eventTypeId: string;
  startTime: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  additionalInfo?: Record<string, unknown>;
  timezone: string;
  tracking?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body: RequestBody = await req.json();
    const { eventTypeId, startTime, guestName, guestEmail, guestPhone, additionalInfo, timezone, tracking } = body;

    // Validation
    if (!eventTypeId || !startTime || !guestName || !guestEmail) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing booking for ${guestEmail} at ${startTime}`);

    // 1. Fetch event type
    const { data: eventType, error: eventError } = await supabase
      .from('booking_event_types')
      .select('*')
      .eq('id', eventTypeId)
      .single();

    if (eventError || !eventType) {
      console.error('Event type not found:', eventError);
      return new Response(
        JSON.stringify({ error: 'Event type not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!eventType.is_active) {
      return new Response(
        JSON.stringify({ error: 'Event type is not active' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Calculate end time
    const startDate = new Date(startTime);
    const endDate = new Date(startDate.getTime() + eventType.duration_minutes * 60 * 1000);
    const endTime = endDate.toISOString();

    // 3. Check for conflicts (double-booking protection)
    const { data: conflicts } = await supabase
      .from('calendar_events')
      .select('id')
      .eq('user_id', eventType.user_id)
      .neq('status', 'cancelled')
      .lt('start_time', endTime)
      .gt('end_time', startTime);

    if (conflicts && conflicts.length > 0) {
      console.log('Time slot is no longer available');
      return new Response(
        JSON.stringify({ error: 'Este horário não está mais disponível' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Create calendar event
    let meetLink: string | undefined;
    
    const { data: calendarEvent, error: calendarError } = await supabase
      .from('calendar_events')
      .insert({
        user_id: eventType.user_id,
        organization_id: eventType.organization_id,
        title: `${eventType.name} com ${guestName}`,
        description: `Agendamento via link público\n\nConvidado: ${guestName}\nEmail: ${guestEmail}${guestPhone ? `\nTelefone: ${guestPhone}` : ''}`,
        start_time: startTime,
        end_time: endTime,
        event_type: 'booking',
        status: 'confirmed',
        color: eventType.color,
        create_meet: eventType.create_meet,
        attendees: [{ email: guestEmail, name: guestName }],
        metadata: {
          booking_event_type_id: eventType.id,
          guest_name: guestName,
          guest_email: guestEmail,
          guest_phone: guestPhone,
        }
      })
      .select()
      .single();

    if (calendarError) {
      console.error('Error creating calendar event:', calendarError);
      return new Response(
        JSON.stringify({ error: 'Failed to create calendar event' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Create booking request
    const confirmationToken = crypto.randomUUID().replace(/-/g, '').substring(0, 32);

    const { data: booking, error: bookingError } = await supabase
      .from('booking_requests')
      .insert({
        organization_id: eventType.organization_id,
        event_type_id: eventType.id,
        host_user_id: eventType.user_id,
        calendar_event_id: calendarEvent.id,
        guest_name: guestName,
        guest_email: guestEmail,
        guest_phone: guestPhone || null,
        start_time: startTime,
        end_time: endTime,
        timezone: timezone || 'America/Sao_Paulo',
        status: 'confirmed',
        additional_info: additionalInfo || {},
        confirmation_token: confirmationToken,
        tracking: tracking || {},
      })
      .select()
      .single();

    if (bookingError) {
      console.error('Error creating booking:', bookingError);
      // Rollback calendar event
      await supabase.from('calendar_events').delete().eq('id', calendarEvent.id);
      return new Response(
        JSON.stringify({ error: 'Failed to create booking' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. If Google Meet enabled, try to trigger sync (if user has Google Calendar connected)
    if (eventType.create_meet) {
      try {
        const { data: googleConnection } = await supabase
          .from('google_calendar_connections')
          .select('*')
          .eq('user_id', eventType.user_id)
          .eq('is_active', true)
          .maybeSingle();

        if (googleConnection) {
          // Trigger calendar sync to create Google Meet link
          console.log('User has Google Calendar connected, triggering sync...');
          // The google-calendar-sync function will handle Meet link creation
        }
      } catch (syncError) {
        console.log('Could not trigger Google Calendar sync:', syncError);
        // Non-critical, continue without Meet link
      }
    }

    console.log(`Booking created successfully: ${booking.id}`);

    // ============= ENQUEUE AUTOMATION JOBS =============
    // Read notification settings + reminders for this event type and enqueue jobs.
    try {
      const { data: settings } = await supabase
        .from('booking_notification_settings')
        .select('*')
        .eq('event_type_id', eventType.id)
        .maybeSingle();

      const { data: reminders } = await supabase
        .from('booking_reminders')
        .select('*')
        .eq('event_type_id', eventType.id)
        .eq('is_active', true)
        .order('order_index', { ascending: true });

      const jobs: any[] = [];
      const now = new Date();

      // Confirmation: send immediately
      if (!settings || settings.send_email || settings.send_whatsapp) {
        const channel =
          settings?.send_whatsapp && settings?.send_email
            ? 'both'
            : settings?.send_whatsapp
              ? 'whatsapp'
              : 'email';
        jobs.push({
          booking_id: booking.id,
          organization_id: eventType.organization_id,
          kind: 'confirmation',
          channel,
          scheduled_for: now.toISOString(),
          status: 'pending',
          payload: {},
        });
      }

      // Internal notification to seller
      if (!settings || settings.notify_seller_on_new) {
        jobs.push({
          booking_id: booking.id,
          organization_id: eventType.organization_id,
          kind: 'internal_notification',
          channel: settings?.internal_channel || 'both',
          scheduled_for: now.toISOString(),
          status: 'pending',
          payload: { event: 'new' },
        });
      }

      // Reminders
      const startMs = startDate.getTime();
      const unitMs: Record<string, number> = {
        minutes: 60_000,
        hours: 3_600_000,
        days: 86_400_000,
      };
      for (const r of reminders || []) {
        const offset = (r.offset_value || 0) * (unitMs[r.offset_unit] || 60_000);
        const runAt = new Date(startMs - offset);
        if (runAt.getTime() <= now.getTime()) continue; // skip past reminders
        jobs.push({
          booking_id: booking.id,
          organization_id: eventType.organization_id,
          reminder_id: r.id,
          kind: 'reminder',
          channel: r.channel || 'whatsapp',
          scheduled_for: runAt.toISOString(),
          status: 'pending',
          payload: {},
        });
      }

      // Recovery (no-show)
      if (settings?.recovery_enabled) {
        const offset =
          (settings.recovery_offset_value || 0) *
          (unitMs[settings.recovery_offset_unit] || 3_600_000);
        const runAt = new Date(startMs + offset);
        jobs.push({
          booking_id: booking.id,
          organization_id: eventType.organization_id,
          kind: 'recovery',
          channel: settings.send_whatsapp ? 'whatsapp' : 'email',
          scheduled_for: runAt.toISOString(),
          status: 'pending',
          payload: {},
        });
      }

      if (jobs.length > 0) {
        const { error: jobsErr } = await supabase
          .from('booking_scheduled_jobs')
          .insert(jobs);
        if (jobsErr) console.error('[booking-submit] enqueue jobs error:', jobsErr);
        else console.log(`[booking-submit] enqueued ${jobs.length} jobs`);
      }
    } catch (e) {
      console.error('[booking-submit] failed to enqueue automation jobs:', e);
      // non-fatal
    }

    // Send confirmation email
    const siteUrl = Deno.env.get('SITE_URL') || 'https://salesflow1.lovable.app';
    try {
      const { data: hostProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', eventType.user_id)
        .single();

      await supabase.functions.invoke('send-booking-confirmation', {
        body: {
          bookingId: booking.id,
          guestName: guestName,
          guestEmail: guestEmail,
          eventName: eventType.name,
          hostName: hostProfile?.full_name || 'Anfitrião',
          startTime: startTime,
          endTime: endTime,
          meetLink: calendarEvent.meet_link || undefined,
          confirmationToken: confirmationToken,
          confirmationUrl: `${siteUrl}/confirmar/${confirmationToken}`,
        },
      });
      console.log('Confirmation email sent');
    } catch (emailError) {
      console.log('Could not send confirmation email:', emailError);
      // Non-critical, continue
    }

    return new Response(
      JSON.stringify({
        success: true,
        bookingId: booking.id,
        calendarEventId: calendarEvent.id,
        meetLink: calendarEvent.meet_link || undefined,
        confirmationToken: confirmationToken,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing booking:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
