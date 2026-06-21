import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SyncRequest {
  userId: string;
  direction?: "import" | "export" | "both";
  daysAhead?: number;
  daysBehind?: number;
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId, direction = "both", daysAhead = 30, daysBehind = 7 } = await req.json() as SyncRequest;

    if (!userId) {
      throw new Error("Missing userId parameter");
    }

    console.log(`Starting sync for user ${userId}, direction: ${direction}`);

    // Get user's connection
    const { data: connection, error: connError } = await supabase
      .from("google_calendar_connections")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .single();

    if (connError || !connection) {
      throw new Error("No active Google Calendar connection found");
    }

    // Check if token is expired and refresh if needed
    const tokenExpiry = new Date(connection.token_expires_at);
    let accessToken = connection.access_token;
    
    if (tokenExpiry < new Date()) {
      console.log("Token expired, refreshing...");
      
      // Call refresh function
      const { error: refreshError } = await supabase.functions.invoke("google-calendar-refresh", {
        body: { userId }
      });

      if (refreshError) {
        throw new Error("Failed to refresh token: " + refreshError.message);
      }

      // Refetch connection with new token
      const { data: refreshedConn } = await supabase
        .from("google_calendar_connections")
        .select("*")
        .eq("user_id", userId)
        .single();
      
      if (refreshedConn) {
        accessToken = refreshedConn.access_token;
      }
    }

    const results = { imported: 0, exported: 0, errors: [] as string[] };

    // Calculate date range
    const now = new Date();
    const timeMin = new Date(now.getTime() - daysBehind * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

    // Import from Google Calendar
    if (direction === "import" || direction === "both") {
      try {
        console.log("Importing events from Google Calendar...");
        
        const calendarId = connection.selected_calendar_id || "primary";
        const eventsUrl = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
        eventsUrl.searchParams.set("timeMin", timeMin);
        eventsUrl.searchParams.set("timeMax", timeMax);
        eventsUrl.searchParams.set("singleEvents", "true");
        eventsUrl.searchParams.set("orderBy", "startTime");
        eventsUrl.searchParams.set("maxResults", "250");

        const eventsResponse = await fetch(eventsUrl.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!eventsResponse.ok) {
          const errorData = await eventsResponse.json();
          throw new Error(errorData.error?.message || "Failed to fetch Google events");
        }

        const eventsData = await eventsResponse.json();
        const googleEvents = eventsData.items || [];

        console.log(`Found ${googleEvents.length} events in Google Calendar`);

        for (const gEvent of googleEvents) {
          try {
            // Check if event already exists (by google_event_id)
            const { data: existingEvent } = await supabase
              .from("calendar_events")
              .select("id")
              .eq("user_id", userId)
              .eq("google_event_id", gEvent.id)
              .single();

            const startTime = gEvent.start?.dateTime || gEvent.start?.date;
            const endTime = gEvent.end?.dateTime || gEvent.end?.date;
            const isAllDay = !gEvent.start?.dateTime;

            const eventData = {
              user_id: userId,
              organization_id: connection.organization_id,
              title: gEvent.summary || "Evento Google",
              description: gEvent.description || null,
              start_time: startTime,
              end_time: endTime,
              all_day: isAllDay,
              location: gEvent.location || null,
              event_type: "meeting",
              google_event_id: gEvent.id,
              google_calendar_id: calendarId,
              synced_from_google: true,
            };

            if (existingEvent) {
              // Update existing
              await supabase
                .from("calendar_events")
                .update(eventData)
                .eq("id", existingEvent.id);
            } else {
              // Insert new
              await supabase
                .from("calendar_events")
                .insert(eventData);
              results.imported++;
            }
          } catch (eventError) {
            console.error("Error processing event:", gEvent.id, eventError);
            results.errors.push(`Import error for ${gEvent.summary}: ${getErrorMessage(eventError)}`);
          }
        }
      } catch (importError) {
        console.error("Import error:", importError);
        results.errors.push(`Import failed: ${getErrorMessage(importError)}`);
      }
    }

    // Export to Google Calendar
    if (direction === "export" || direction === "both") {
      try {
        console.log("Exporting events to Google Calendar...");

        // Get local events that don't have google_event_id (not synced yet)
        const { data: localEvents, error: localError } = await supabase
          .from("calendar_events")
          .select("*")
          .eq("user_id", userId)
          .is("google_event_id", null)
          .eq("synced_from_google", false)
          .gte("start_time", timeMin)
          .lte("start_time", timeMax);

        if (localError) throw localError;

        console.log(`Found ${localEvents?.length || 0} local events to export`);

        const calendarId = connection.selected_calendar_id || "primary";

        for (const localEvent of localEvents || []) {
          try {
            // Build Google event object
            const googleEvent: Record<string, any> = {
              summary: localEvent.title,
              description: localEvent.description || undefined,
              location: localEvent.location || undefined,
              start: localEvent.all_day
                ? { date: localEvent.start_time.split("T")[0] }
                : { dateTime: localEvent.start_time, timeZone: "America/Sao_Paulo" },
              end: localEvent.all_day
                ? { date: localEvent.end_time?.split("T")[0] || localEvent.start_time.split("T")[0] }
                : { dateTime: localEvent.end_time || localEvent.start_time, timeZone: "America/Sao_Paulo" },
            };

            // Add reminders if configured
            if (localEvent.reminder_minutes && localEvent.reminder_minutes.length > 0) {
              googleEvent.reminders = {
                useDefault: false,
                overrides: localEvent.reminder_minutes.map((minutes: number) => ({
                  method: "popup",
                  minutes: minutes,
                })),
              };
            }

            // Add Google Meet conference if requested
            if (localEvent.create_meet) {
              googleEvent.conferenceData = {
                createRequest: {
                  requestId: localEvent.id,
                  conferenceSolutionKey: { type: "hangoutsMeet" },
                },
              };
            }

            // Build URL with conferenceDataVersion if creating Meet
            let createUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
            if (localEvent.create_meet) {
              createUrl += "?conferenceDataVersion=1";
            }

            const createResponse = await fetch(createUrl, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(googleEvent),
            });

            if (createResponse.ok) {
              const createdEvent = await createResponse.json();
              
              // Extract Meet link if present
              const meetLink = createdEvent.conferenceData?.entryPoints?.find(
                (ep: any) => ep.entryPointType === "video"
              )?.uri || null;

              // Update local event with google_event_id and meet_link
              await supabase
                .from("calendar_events")
                .update({
                  google_event_id: createdEvent.id,
                  google_calendar_id: calendarId,
                  meet_link: meetLink,
                })
                .eq("id", localEvent.id);

              results.exported++;
            } else {
              const errorData = await createResponse.json();
              throw new Error(errorData.error?.message || "Failed to create event");
            }
          } catch (eventError) {
            console.error("Error exporting event:", localEvent.id, eventError);
            results.errors.push(`Export error for ${localEvent.title}: ${getErrorMessage(eventError)}`);
          }
        }
      } catch (exportError) {
        console.error("Export error:", exportError);
        results.errors.push(`Export failed: ${getErrorMessage(exportError)}`);
      }
    }

    // Update last synced timestamp
    await supabase
      .from("google_calendar_connections")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("user_id", userId);

    console.log(`Sync complete. Imported: ${results.imported}, Exported: ${results.exported}, Errors: ${results.errors.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        imported: results.imported,
        exported: results.exported,
        errors: results.errors,
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      }
    );

  } catch (err) {
    console.error("Error in google-calendar-sync:", err);
    return new Response(
      JSON.stringify({ error: getErrorMessage(err) }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400
      }
    );
  }
});
