import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SellerContext {
  profile: any;
  tasksToday: any[];
  overdueTasks: any[];
  stalledLeads: any[];
  hotLeads: any[];
  goalProgress: any[];
  pendingCadences: any[];
  recentDeals: any[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get organizations with daily report enabled
    const { data: allSettings, error: settingsError } = await supabase
      .from('auto_notification_settings')
      .select('*')
      .eq('daily_report_enabled', true);

    if (settingsError) {
      console.error('Error fetching settings:', settingsError);
      throw settingsError;
    }

    const results = {
      reports_generated: 0,
      emails_sent: 0,
      errors: [] as string[],
    };

    for (const settings of allSettings || []) {
      try {
        // Get all sellers in the organization
        const { data: sellers, error: sellersError } = await supabase
          .from('profiles')
          .select('id, full_name, email, organization_id')
          .eq('organization_id', settings.organization_id)
          .eq('is_active', true);

        if (sellersError) throw sellersError;

        for (const seller of sellers || []) {
          try {
            // Check if already sent today
            const { data: existingLog } = await supabase
              .from('notification_logs')
              .select('id')
              .eq('user_id', seller.id)
              .eq('notification_type', 'daily_report')
              .eq('reference_date', new Date().toISOString().split('T')[0])
              .maybeSingle();

            if (existingLog) continue;

            // Gather context for the seller
            const context = await gatherSellerContext(supabase, seller.id, settings.organization_id);
            
            // Generate AI report
            const report = await generateAIReport(context, seller.full_name);
            
            // Create notification
            await supabase
              .from('notifications')
              .insert({
                user_id: seller.id,
                type: 'system',
                title: '☀️ Seu briefing do dia',
                message: report.summary,
                action_url: '/dashboard',
                metadata: { full_report: report.full },
              });

            // Log to prevent duplicate
            await supabase
              .from('notification_logs')
              .insert({
                user_id: seller.id,
                organization_id: settings.organization_id,
                notification_type: 'daily_report',
                reference_id: seller.id,
              });

            results.reports_generated++;

            // Send email if enabled
            if (settings.daily_report_send_email && seller.email) {
              const emailSent = await sendReportEmail(seller.email, seller.full_name, report);
              if (emailSent) results.emails_sent++;
            }
          } catch (sellerError: unknown) {
            const errorMessage = sellerError instanceof Error ? sellerError.message : 'Unknown error';
            console.error(`Error processing seller ${seller.id}:`, sellerError);
            results.errors.push(`Seller ${seller.id}: ${errorMessage}`);
          }
        }
      } catch (orgError: unknown) {
        const errorMessage = orgError instanceof Error ? orgError.message : 'Unknown error';
        console.error(`Error processing org ${settings.organization_id}:`, orgError);
        results.errors.push(`Org ${settings.organization_id}: ${errorMessage}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in daily-report-ai:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function gatherSellerContext(supabase: any, userId: string, orgId: string): Promise<SellerContext> {
  const today = new Date();
  const todayStart = new Date(today.setHours(0, 0, 0, 0)).toISOString();
  const todayEnd = new Date(today.setHours(23, 59, 59, 999)).toISOString();
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch all context in parallel
  const [
    profileResult,
    tasksTodayResult,
    overdueTasksResult,
    stalledLeadsResult,
    hotLeadsResult,
    goalProgressResult,
    recentDealsResult,
  ] = await Promise.all([
    // Profile
    supabase.from('profiles').select('*').eq('id', userId).single(),
    
    // Tasks for today
    supabase
      .from('tasks')
      .select('*, leads(name)')
      .eq('user_id', userId)
      .gte('due_date', todayStart)
      .lte('due_date', todayEnd)
      .neq('status', 'completed'),
    
    // Overdue tasks
    supabase
      .from('tasks')
      .select('*, leads(name)')
      .eq('user_id', userId)
      .lt('due_date', todayStart)
      .neq('status', 'completed'),
    
    // Stalled leads (no contact > 3 days)
    supabase
      .from('leads')
      .select('id, name, last_contact_at, temperature, current_stage_id')
      .eq('assigned_to', userId)
      .eq('organization_id', orgId)
      .lt('last_contact_at', threeDaysAgo)
      .limit(10),
    
    // Hot leads
    supabase
      .from('leads')
      .select('id, name, temperature, company')
      .eq('assigned_to', userId)
      .eq('organization_id', orgId)
      .eq('temperature', 'hot')
      .limit(5),
    
    // Goal progress
    supabase
      .from('sales_goals')
      .select('*, products(name)')
      .eq('user_id', userId)
      .eq('is_active', true)
      .lte('period_start', new Date().toISOString())
      .gte('period_end', new Date().toISOString()),
    
    // Recent deals (last 7 days)
    supabase
      .from('deals')
      .select('*, leads(name), products(name)')
      .eq('seller_id', userId)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  return {
    profile: profileResult.data,
    tasksToday: tasksTodayResult.data || [],
    overdueTasks: overdueTasksResult.data || [],
    stalledLeads: stalledLeadsResult.data || [],
    hotLeads: hotLeadsResult.data || [],
    goalProgress: goalProgressResult.data || [],
    recentDeals: recentDealsResult.data || [],
    pendingCadences: [], // Could be enhanced later
  };
}

async function generateAIReport(context: SellerContext, sellerName: string): Promise<{ summary: string; full: string }> {
  const firstName = sellerName.split(' ')[0];
  
  // Build context summary
  const taskCount = context.tasksToday.length;
  const overdueCount = context.overdueTasks.length;
  const stalledCount = context.stalledLeads.length;
  const hotCount = context.hotLeads.length;
  
  // Calculate goal progress
  let goalSummary = '';
  if (context.goalProgress.length > 0) {
    const goal = context.goalProgress[0];
    const progress = goal.target_value > 0 
      ? Math.round((goal.achieved_value / goal.target_value) * 100) 
      : 0;
    const remaining = goal.target_value - goal.achieved_value;
    goalSummary = `Meta do mês: ${progress}% (faltam ${formatCurrency(remaining)})`;
  }

  // Build priorities list
  const priorities: string[] = [];
  
  // Add overdue tasks
  context.overdueTasks.slice(0, 2).forEach(task => {
    priorities.push(`⚠️ Tarefa atrasada: ${task.title}`);
  });
  
  // Add stalled leads
  context.stalledLeads.slice(0, 2).forEach(lead => {
    const daysSince = Math.floor((Date.now() - new Date(lead.last_contact_at).getTime()) / (1000 * 60 * 60 * 24));
    priorities.push(`Retomar contato com ${lead.name} (${daysSince} dias sem contato)`);
  });
  
  // Add today's important tasks
  const highPriorityTasks = context.tasksToday.filter(t => t.priority === 'high' || t.priority === 'urgent');
  highPriorityTasks.slice(0, 2).forEach(task => {
    priorities.push(`${task.title}${task.leads?.name ? ` - ${task.leads.name}` : ''}`);
  });

  // Build summary (for notification)
  const summaryParts = [];
  if (taskCount > 0) summaryParts.push(`${taskCount} tarefa${taskCount > 1 ? 's' : ''} hoje`);
  if (overdueCount > 0) summaryParts.push(`${overdueCount} atrasada${overdueCount > 1 ? 's' : ''}`);
  if (stalledCount > 0) summaryParts.push(`${stalledCount} lead${stalledCount > 1 ? 's' : ''} precisa${stalledCount > 1 ? 'm' : ''} de atenção`);
  if (hotCount > 0) summaryParts.push(`${hotCount} lead${hotCount > 1 ? 's' : ''} quente${hotCount > 1 ? 's' : ''}`);
  
  const summary = summaryParts.length > 0 
    ? `📊 ${summaryParts.join(' • ')}` 
    : 'Tudo em dia! Continue focado nas suas metas.';

  // Build full report
  const fullReport = `
☀️ Bom dia, ${firstName}!

📊 RESUMO DO DIA
${taskCount > 0 ? `• ${taskCount} tarefa${taskCount > 1 ? 's' : ''} agendada${taskCount > 1 ? 's' : ''} para hoje` : '• Nenhuma tarefa agendada'}
${overdueCount > 0 ? `• ⚠️ ${overdueCount} tarefa${overdueCount > 1 ? 's' : ''} atrasada${overdueCount > 1 ? 's' : ''}` : ''}
${stalledCount > 0 ? `• ${stalledCount} lead${stalledCount > 1 ? 's' : ''} precisa${stalledCount > 1 ? 'm' : ''} de atenção` : ''}
${goalSummary ? `• ${goalSummary}` : ''}

${priorities.length > 0 ? `🎯 PRIORIDADES\n${priorities.map((p, i) => `${i + 1}. ${p}`).join('\n')}` : ''}

${hotCount > 0 ? `🔥 LEADS QUENTES\n${context.hotLeads.map(l => `• ${l.name}${l.company ? ` (${l.company})` : ''}`).join('\n')}` : ''}

${context.recentDeals.length > 0 ? `✅ NEGÓCIOS RECENTES\n${context.recentDeals.slice(0, 3).map(d => `• ${d.leads?.name} - ${formatCurrency(d.deal_value)}`).join('\n')}` : ''}

Boas vendas! 🚀
`.trim();

  return { summary, full: fullReport };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

async function sendReportEmail(email: string, name: string, report: { summary: string; full: string }): Promise<boolean> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    console.log('RESEND_API_KEY not configured, skipping email');
    return false;
  }

  try {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a2e; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
          .content { background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px; }
          .section { background: white; padding: 20px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #e2e8f0; }
          .section-title { font-weight: 600; color: #6366f1; margin-bottom: 10px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
          .priority-item { padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
          .priority-item:last-child { border-bottom: none; }
          .footer { text-align: center; padding: 20px; color: #64748b; font-size: 12px; }
          pre { white-space: pre-wrap; font-family: inherit; margin: 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 style="margin: 0; font-size: 24px;">☀️ Seu Briefing do Dia</h1>
          <p style="margin: 10px 0 0; opacity: 0.9;">Bom dia, ${name.split(' ')[0]}!</p>
        </div>
        <div class="content">
          <div class="section">
            <pre>${report.full.replace(/☀️.*?\n\n/, '')}</pre>
          </div>
        </div>
        <div class="footer">
          <p>Enviado automaticamente pelo seu assistente de vendas</p>
        </div>
      </body>
      </html>
    `;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Assistente de Vendas <noreply@resend.dev>',
        to: [email],
        subject: `☀️ Seu briefing do dia - ${new Date().toLocaleDateString('pt-BR')}`,
        html: htmlContent,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}
