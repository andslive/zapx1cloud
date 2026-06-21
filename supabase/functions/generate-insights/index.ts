import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveAIConfig, logAIConfig, prepareAIRequestBody } from "../_shared/ai-router.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PipelineAnalysis {
  totalLeads: number;
  leadsByStage: { stage: string; count: number; value: number }[];
  atRiskLeads: { name: string; company: string; daysWithoutContact: number }[];
  conversionRate: number;
  avgDaysInPipeline: number;
  hotLeadsCount: number;
  coldLeadsCount: number;
  overdueTasksCount: number;
  topPerformingStage: string;
  bottleneckStage: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, productId, organizationId } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch pipeline data
    let leadsQuery = supabase
      .from("leads")
      .select(`
        id, name, company, temperature, cadence_day, 
        last_contact_at, created_at, current_stage_id,
        pipeline_stages (name, order_index, is_won, is_lost)
      `)
      .eq("organization_id", organizationId);
    
    if (productId) {
      leadsQuery = leadsQuery.eq("product_id", productId);
    }
    if (userId) {
      leadsQuery = leadsQuery.eq("assigned_to", userId);
    }

    const { data: leads, error: leadsError } = await leadsQuery;
    if (leadsError) throw leadsError;

    // Fetch overdue tasks
    let tasksQuery = supabase
      .from("tasks")
      .select("id, status, due_date")
      .eq("status", "overdue");
    
    if (userId) {
      tasksQuery = tasksQuery.eq("user_id", userId);
    }

    const { data: overdueTasks } = await tasksQuery;

    // Fetch recent deals for conversion analysis
    let dealsQuery = supabase
      .from("deals")
      .select("id, status, deal_value, created_at")
      .eq("organization_id", organizationId)
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (productId) {
      dealsQuery = dealsQuery.eq("product_id", productId);
    }

    const { data: deals } = await dealsQuery;

    // Analyze data
    const now = new Date();
    const analysis: PipelineAnalysis = {
      totalLeads: leads?.length || 0,
      leadsByStage: [],
      atRiskLeads: [],
      conversionRate: 0,
      avgDaysInPipeline: 0,
      hotLeadsCount: 0,
      coldLeadsCount: 0,
      overdueTasksCount: overdueTasks?.length || 0,
      topPerformingStage: "",
      bottleneckStage: "",
    };

    if (leads && leads.length > 0) {
      // Group by stage
      const stageGroups: Record<string, { count: number; value: number }> = {};
      let totalDays = 0;

      for (const lead of leads) {
        const stageName = (lead.pipeline_stages as any)?.name || "Sem estágio";
        
        if (!stageGroups[stageName]) {
          stageGroups[stageName] = { count: 0, value: 0 };
        }
        stageGroups[stageName].count++;

        // Calculate days in pipeline
        const createdAt = new Date(lead.created_at);
        const daysInPipeline = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
        totalDays += daysInPipeline;

        // Check at-risk leads (no contact in 3+ days)
        if (lead.last_contact_at) {
          const lastContact = new Date(lead.last_contact_at);
          const daysSinceContact = Math.floor((now.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24));
          if (daysSinceContact >= 3) {
            analysis.atRiskLeads.push({
              name: lead.name,
              company: lead.company || "",
              daysWithoutContact: daysSinceContact,
            });
          }
        }

        // Temperature counts
        if (lead.temperature === "hot") analysis.hotLeadsCount++;
        if (lead.temperature === "cold") analysis.coldLeadsCount++;
      }

      analysis.leadsByStage = Object.entries(stageGroups).map(([stage, data]) => ({
        stage,
        count: data.count,
        value: data.value,
      }));

      analysis.avgDaysInPipeline = Math.round(totalDays / leads.length);

      // Find bottleneck (stage with most leads)
      const maxLeadsStage = analysis.leadsByStage.reduce((max, stage) => 
        stage.count > max.count ? stage : max, { stage: "", count: 0, value: 0 });
      analysis.bottleneckStage = maxLeadsStage.stage;
    }

    // Calculate conversion rate
    if (deals && deals.length > 0) {
      const wonDeals = deals.filter(d => d.status === "won").length;
      analysis.conversionRate = Math.round((wonDeals / deals.length) * 100);
    }

    // Build prompt for AI analysis
    const analysisPrompt = `Você é um coach de vendas experiente analisando o pipeline de um vendedor.

DADOS DO PIPELINE:
- Total de leads: ${analysis.totalLeads}
- Leads por estágio: ${JSON.stringify(analysis.leadsByStage)}
- Leads em risco (sem contato): ${analysis.atRiskLeads.length}
- Taxa de conversão (últimos 30 dias): ${analysis.conversionRate}%
- Média de dias no pipeline: ${analysis.avgDaysInPipeline}
- Leads quentes: ${analysis.hotLeadsCount}
- Leads frios: ${analysis.coldLeadsCount}
- Tarefas atrasadas: ${analysis.overdueTasksCount}
- Estágio com mais leads (potencial gargalo): ${analysis.bottleneckStage}

LEADS EM RISCO (sem contato há 3+ dias):
${analysis.atRiskLeads.slice(0, 5).map(l => `- ${l.name} (${l.company || 'sem empresa'}): ${l.daysWithoutContact} dias`).join("\n")}

Gere 3-5 insights acionáveis e específicos para este vendedor. Cada insight deve:
1. Ter um título curto e impactante
2. Explicar o problema ou oportunidade identificado
3. Sugerir uma ação específica
4. Indicar a prioridade (high, medium, low)

Responda APENAS no formato JSON abaixo, sem texto adicional:
{
  "insights": [
    {
      "title": "Título curto",
      "insight": "Descrição do insight e ação recomendada",
      "type": "opportunity|warning|action|tip",
      "priority": "high|medium|low"
    }
  ]
}`;

    const aiConfig = await resolveAIConfig(supabase, organizationId, 'agent_chat');
    logAIConfig('generate-insights', aiConfig);

    const requestBody = prepareAIRequestBody({
      messages: [{ role: "user", content: analysisPrompt }],
      temperature: 0.7,
    }, aiConfig);

    const response = await fetch(aiConfig.endpoint, {
      method: "POST",
      headers: aiConfig.headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        const msg = aiConfig.source === 'external_key'
          ? `Créditos esgotados na sua conta ${aiConfig.provider}. Verifique o saldo do provedor externo.`
          : "Créditos de IA esgotados. Configure uma chave externa (OpenAI) em Configurações > IA Roteamento ou adicione créditos Lovable.";
        return new Response(
          JSON.stringify({ error: msg }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText, "| provider:", aiConfig.provider, "| model:", aiConfig.model);
      throw new Error(`Erro ao processar análise de IA (${response.status}): ${errorText.slice(0, 200)}`);
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || "";

    // Parse JSON from AI response
    let insights = [];
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        insights = parsed.insights || [];
      }
    } catch (parseError) {
      console.error("Error parsing AI response:", parseError, content);
      // Fallback insights
      insights = [
        {
          title: "Análise em andamento",
          insight: "Não foi possível gerar insights automáticos no momento. Tente novamente.",
          type: "tip",
          priority: "low"
        }
      ];
    }

    // Save insights to database
    if (insights.length > 0 && userId) {
      const insightsToInsert = insights.map((insight: any) => ({
        user_id: userId,
        organization_id: organizationId,
        product_id: productId || null,
        title: insight.title,
        insight: insight.insight,
        type: insight.type,
        priority: insight.priority,
        is_dismissed: false,
      }));

      // Delete old non-dismissed insights for this user/product
      await supabase
        .from("ai_insights")
        .delete()
        .eq("user_id", userId)
        .eq("is_dismissed", false);

      // Insert new insights
      await supabase.from("ai_insights").insert(insightsToInsert);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        insights,
        analysis: {
          totalLeads: analysis.totalLeads,
          atRiskCount: analysis.atRiskLeads.length,
          conversionRate: analysis.conversionRate,
          overdueTasksCount: analysis.overdueTasksCount,
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Generate insights error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
