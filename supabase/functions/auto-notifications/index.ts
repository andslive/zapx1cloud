import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AutoNotificationSettings {
  organization_id: string;
  stalled_lead_enabled: boolean;
  stalled_lead_days: number;
  goal_achieved_enabled: boolean;
  commission_approved_enabled: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all organizations with auto notification settings
    const { data: allSettings, error: settingsError } = await supabase
      .from('auto_notification_settings')
      .select('*');

    if (settingsError) {
      console.error('Error fetching settings:', settingsError);
      throw settingsError;
    }

    const results = {
      stalled_leads: 0,
      goals_achieved: 0,
      commissions_approved: 0,
      errors: [] as string[],
    };

    for (const settings of allSettings || []) {
      try {
        // 1. Process Stalled Leads
        if (settings.stalled_lead_enabled) {
          const stalledCount = await processStalledLeads(supabase, settings);
          results.stalled_leads += stalledCount;
        }

        // 2. Process Achieved Goals
        if (settings.goal_achieved_enabled) {
          const goalsCount = await processAchievedGoals(supabase, settings);
          results.goals_achieved += goalsCount;
        }

        // 3. Process Approved Commissions
        if (settings.commission_approved_enabled) {
          const commissionsCount = await processApprovedCommissions(supabase, settings);
          results.commissions_approved += commissionsCount;
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error processing org ${settings.organization_id}:`, error);
        results.errors.push(`Org ${settings.organization_id}: ${errorMessage}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in auto-notifications:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function processStalledLeads(supabase: any, settings: AutoNotificationSettings): Promise<number> {
  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - settings.stalled_lead_days);

  // Find leads without contact for X days
  const { data: stalledLeads, error } = await supabase
    .from('leads')
    .select(`
      id,
      name,
      assigned_to,
      last_contact_at,
      organization_id,
      current_stage_id,
      pipeline_stages!leads_current_stage_id_fkey (is_won, is_lost)
    `)
    .eq('organization_id', settings.organization_id)
    .not('assigned_to', 'is', null)
    .or(`last_contact_at.is.null,last_contact_at.lt.${daysAgo.toISOString()}`)
    .not('pipeline_stages.is_won', 'eq', true)
    .not('pipeline_stages.is_lost', 'eq', true);

  if (error) {
    console.error('Error fetching stalled leads:', error);
    return 0;
  }

  let notificationCount = 0;

  for (const lead of stalledLeads || []) {
    // Skip if lead stage is won or lost
    if (lead.pipeline_stages?.is_won || lead.pipeline_stages?.is_lost) continue;

    // Check if already notified today
    const { data: existingLog } = await supabase
      .from('notification_logs')
      .select('id')
      .eq('user_id', lead.assigned_to)
      .eq('notification_type', 'stalled_lead')
      .eq('reference_id', lead.id)
      .eq('reference_date', new Date().toISOString().split('T')[0])
      .maybeSingle();

    if (existingLog) continue;

    // Calculate days since last contact
    const daysSince = lead.last_contact_at 
      ? Math.floor((Date.now() - new Date(lead.last_contact_at).getTime()) / (1000 * 60 * 60 * 24))
      : settings.stalled_lead_days + 1;

    // Create notification
    const { error: notifError } = await supabase
      .from('notifications')
      .insert({
        user_id: lead.assigned_to,
        type: 'urgency',
        title: `Lead parado: ${lead.name}`,
        message: `Sem contato há ${daysSince} dias. Que tal retomar a conversa?`,
        action_url: `/leads?highlight=${lead.id}`,
      });

    if (!notifError) {
      // Log to prevent duplicate
      await supabase
        .from('notification_logs')
        .insert({
          user_id: lead.assigned_to,
          organization_id: settings.organization_id,
          notification_type: 'stalled_lead',
          reference_id: lead.id,
        });
      notificationCount++;
    }
  }

  return notificationCount;
}

async function processAchievedGoals(supabase: any, settings: AutoNotificationSettings): Promise<number> {
  // Find goals that were just achieved (achieved_value >= target_value)
  const today = new Date();
  const { data: achievedGoals, error } = await supabase
    .from('sales_goals')
    .select(`
      id,
      user_id,
      target_value,
      achieved_value,
      target_deals,
      achieved_deals,
      product_id,
      products (name)
    `)
    .eq('organization_id', settings.organization_id)
    .eq('is_active', true)
    .lte('period_start', today.toISOString())
    .gte('period_end', today.toISOString())
    .or('achieved_value.gte.target_value,achieved_deals.gte.target_deals');

  if (error) {
    console.error('Error fetching achieved goals:', error);
    return 0;
  }

  let notificationCount = 0;

  for (const goal of achievedGoals || []) {
    // Check if already notified
    const { data: existingLog } = await supabase
      .from('notification_logs')
      .select('id')
      .eq('user_id', goal.user_id)
      .eq('notification_type', 'goal_achieved')
      .eq('reference_id', goal.id)
      .maybeSingle();

    if (existingLog) continue;

    const productName = goal.products?.name || 'Geral';
    const valueFormatted = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(goal.achieved_value);

    // Create notification
    const { error: notifError } = await supabase
      .from('notifications')
      .insert({
        user_id: goal.user_id,
        type: 'opportunity',
        title: `🎉 Meta atingida: ${productName}!`,
        message: `Parabéns! Você alcançou ${valueFormatted} de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(goal.target_value)}!`,
        action_url: '/goals',
        product_id: goal.product_id,
      });

    if (!notifError) {
      await supabase
        .from('notification_logs')
        .insert({
          user_id: goal.user_id,
          organization_id: settings.organization_id,
          notification_type: 'goal_achieved',
          reference_id: goal.id,
        });
      notificationCount++;
    }
  }

  return notificationCount;
}

async function processApprovedCommissions(supabase: any, settings: AutoNotificationSettings): Promise<number> {
  // Find recently approved commissions (within last hour, to catch recent approvals)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data: approvedCommissions, error } = await supabase
    .from('commissions')
    .select(`
      id,
      user_id,
      amount,
      product_id,
      products (name),
      deal_id,
      deals (
        lead_id,
        leads (name)
      )
    `)
    .eq('organization_id', settings.organization_id)
    .eq('status', 'approved')
    .gte('approved_at', oneHourAgo);

  if (error) {
    console.error('Error fetching approved commissions:', error);
    return 0;
  }

  let notificationCount = 0;

  for (const commission of approvedCommissions || []) {
    // Check if already notified
    const { data: existingLog } = await supabase
      .from('notification_logs')
      .select('id')
      .eq('user_id', commission.user_id)
      .eq('notification_type', 'commission_approved')
      .eq('reference_id', commission.id)
      .maybeSingle();

    if (existingLog) continue;

    const amountFormatted = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(commission.amount);

    const leadName = commission.deals?.leads?.name || 'Cliente';
    const productName = commission.products?.name || '';

    // Create notification
    const { error: notifError } = await supabase
      .from('notifications')
      .insert({
        user_id: commission.user_id,
        type: 'opportunity',
        title: `💰 Comissão aprovada: ${amountFormatted}`,
        message: `Sua comissão de ${productName} (${leadName}) foi aprovada!`,
        action_url: '/financeiro',
        product_id: commission.product_id,
      });

    if (!notifError) {
      await supabase
        .from('notification_logs')
        .insert({
          user_id: commission.user_id,
          organization_id: settings.organization_id,
          notification_type: 'commission_approved',
          reference_id: commission.id,
        });
      notificationCount++;
    }
  }

  return notificationCount;
}
