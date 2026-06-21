import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.90.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  eventTypeId: string;
  date: string;
  timezone: string;
}

interface TimeSlot {
  start: string;
  end: string;
  available: boolean;
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

    const { eventTypeId, date, timezone } = await req.json() as RequestBody;

    if (!eventTypeId || !date) {
      return new Response(
        JSON.stringify({ error: 'eventTypeId and date are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Calculating availability for event ${eventTypeId} on ${date}`);

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

    const userId = eventType.user_id;
    const dateObj = new Date(date + 'T00:00:00');
    const dayOfWeek = dateObj.getDay();

    // 2. Fetch weekly availability for this day
    const { data: weeklyAvailability } = await supabase
      .from('user_availability')
      .select('*')
      .eq('user_id', userId)
      .eq('day_of_week', dayOfWeek)
      .eq('is_available', true);

    // 3. Check for date override
    const { data: override } = await supabase
      .from('availability_overrides')
      .select('*')
      .eq('user_id', userId)
      .eq('date', date)
      .maybeSingle();

    // If blocked, return empty slots
    if (override && !override.is_available) {
      console.log('Date is blocked by override');
      return new Response(
        JSON.stringify({ slots: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine time ranges for the day
    let timeRanges: { start: string; end: string }[] = [];
    
    if (override && override.is_available && override.start_time && override.end_time) {
      // Use override times
      timeRanges = [{ start: override.start_time, end: override.end_time }];
    } else if (weeklyAvailability && weeklyAvailability.length > 0) {
      // Use weekly availability
      timeRanges = weeklyAvailability.map(a => ({
        start: a.start_time,
        end: a.end_time
      }));
    }

    if (timeRanges.length === 0) {
      console.log('No availability configured for this day');
      return new Response(
        JSON.stringify({ slots: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Fetch existing events for the day
    const startOfDay = `${date}T00:00:00`;
    const endOfDay = `${date}T23:59:59`;
    
    const { data: existingEvents } = await supabase
      .from('calendar_events')
      .select('start_time, end_time')
      .eq('user_id', userId)
      .neq('status', 'cancelled')
      .gte('start_time', startOfDay)
      .lte('start_time', endOfDay);

    // 5. Generate slots
    const duration = eventType.duration_minutes;
    const bufferBefore = eventType.buffer_before || 0;
    const bufferAfter = eventType.buffer_after || 0;
    const minNoticeHours = eventType.min_notice_hours || 0;

    const now = new Date();
    const minNoticeTime = new Date(now.getTime() + minNoticeHours * 60 * 60 * 1000);

    const slots: TimeSlot[] = [];

    for (const range of timeRanges) {
      const [startHour, startMin] = range.start.split(':').map(Number);
      const [endHour, endMin] = range.end.split(':').map(Number);
      
      let currentMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;

      while (currentMinutes + duration <= endMinutes) {
        const slotStartHour = Math.floor(currentMinutes / 60);
        const slotStartMin = currentMinutes % 60;
        const slotEndMin = currentMinutes + duration;
        const slotEndHour = Math.floor(slotEndMin / 60);
        const slotEndMinute = slotEndMin % 60;

        const startStr = `${slotStartHour.toString().padStart(2, '0')}:${slotStartMin.toString().padStart(2, '0')}`;
        const endStr = `${slotEndHour.toString().padStart(2, '0')}:${slotEndMinute.toString().padStart(2, '0')}`;

        // Create full datetime for this slot
        const slotDateTime = new Date(`${date}T${startStr}:00`);

        // Check minimum notice
        if (slotDateTime < minNoticeTime) {
          currentMinutes += 30;
          continue;
        }

        // Check conflicts with existing events
        const slotStart = currentMinutes;
        const slotEnd = currentMinutes + duration;
        
        let hasConflict = false;
        for (const event of existingEvents || []) {
          const eventStart = new Date(event.start_time);
          const eventEnd = new Date(event.end_time);
          
          // Convert to minutes from midnight for comparison
          const eventStartMinutes = eventStart.getHours() * 60 + eventStart.getMinutes() - bufferBefore;
          const eventEndMinutes = eventEnd.getHours() * 60 + eventEnd.getMinutes() + bufferAfter;

          // Check overlap
          if (slotStart < eventEndMinutes && slotEnd > eventStartMinutes) {
            hasConflict = true;
            break;
          }
        }

        slots.push({
          start: startStr,
          end: endStr,
          available: !hasConflict
        });

        currentMinutes += 30; // Increment by 30 minutes
      }
    }

    console.log(`Generated ${slots.length} slots, ${slots.filter(s => s.available).length} available`);

    return new Response(
      JSON.stringify({ slots }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error calculating availability:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
