export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_agent_messages: {
        Row: {
          alert_kind: string | null
          content: string
          created_at: string
          direction: string
          id: string
          message_type: string
          organization_id: string
          reference_id: string | null
          whatsapp_message_id: string | null
        }
        Insert: {
          alert_kind?: string | null
          content: string
          created_at?: string
          direction: string
          id?: string
          message_type: string
          organization_id: string
          reference_id?: string | null
          whatsapp_message_id?: string | null
        }
        Update: {
          alert_kind?: string | null
          content?: string
          created_at?: string
          direction?: string
          id?: string
          message_type?: string
          organization_id?: string
          reference_id?: string | null
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_agent_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notification_logs: {
        Row: {
          connection_id: string | null
          created_at: string
          error: string | null
          id: string
          instance_name: string | null
          new_status: string | null
          old_status: string | null
          organization_id: string | null
          payload: Json | null
          reason: string | null
          send_response: Json | null
          sent_to: string | null
          success: boolean | null
        }
        Insert: {
          connection_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          instance_name?: string | null
          new_status?: string | null
          old_status?: string | null
          organization_id?: string | null
          payload?: Json | null
          reason?: string | null
          send_response?: Json | null
          sent_to?: string | null
          success?: boolean | null
        }
        Update: {
          connection_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          instance_name?: string | null
          new_status?: string | null
          old_status?: string | null
          organization_id?: string | null
          payload?: Json | null
          reason?: string | null
          send_response?: Json | null
          sent_to?: string | null
          success?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_notification_logs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "evolution_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_notification_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notifications: {
        Row: {
          action_url: string | null
          created_at: string | null
          created_by: string | null
          emails_failed: number | null
          emails_sent: number | null
          id: string
          message: string | null
          organization_id: string
          recipients_count: number | null
          scope: string
          scope_filters: Json | null
          send_app: boolean | null
          send_email: boolean | null
          sent_at: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"] | null
        }
        Insert: {
          action_url?: string | null
          created_at?: string | null
          created_by?: string | null
          emails_failed?: number | null
          emails_sent?: number | null
          id?: string
          message?: string | null
          organization_id: string
          recipients_count?: number | null
          scope?: string
          scope_filters?: Json | null
          send_app?: boolean | null
          send_email?: boolean | null
          sent_at?: string | null
          title: string
          type?: Database["public"]["Enums"]["notification_type"] | null
        }
        Update: {
          action_url?: string | null
          created_at?: string | null
          created_by?: string | null
          emails_failed?: number | null
          emails_sent?: number | null
          id?: string
          message?: string | null
          organization_id?: string
          recipients_count?: number | null
          scope?: string
          scope_filters?: Json | null
          send_app?: boolean | null
          send_email?: boolean | null
          sent_at?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_notifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_notifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_status_alert_configs: {
        Row: {
          created_at: string | null
          enabled: boolean | null
          id: string
          organization_id: string
          phone_numbers: string[] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          organization_id: string
          phone_numbers?: string[] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          organization_id?: string
          phone_numbers?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_status_alert_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_status_alert_logs: {
        Row: {
          connection_id: string | null
          connection_name: string | null
          created_at: string | null
          error_message: string | null
          id: string
          new_status: string | null
          old_status: string | null
          organization_id: string
          request_id: string | null
          sender_instance_id: string | null
          simulation: boolean | null
          status: string | null
        }
        Insert: {
          connection_id?: string | null
          connection_name?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          new_status?: string | null
          old_status?: string | null
          organization_id: string
          request_id?: string | null
          sender_instance_id?: string | null
          simulation?: boolean | null
          status?: string | null
        }
        Update: {
          connection_id?: string | null
          connection_name?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          new_status?: string | null
          old_status?: string | null
          organization_id?: string
          request_id?: string | null
          sender_instance_id?: string | null
          simulation?: boolean | null
          status?: string | null
        }
        Relationships: []
      }
      admin_status_alerts: {
        Row: {
          connection_id: string
          connection_name: string | null
          connection_phone: string | null
          created_at: string | null
          error_message: string | null
          id: string
          message: string | null
          new_status: string | null
          notify_phone: string | null
          old_status: string | null
          organization_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          connection_id: string
          connection_name?: string | null
          connection_phone?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          message?: string | null
          new_status?: string | null
          notify_phone?: string | null
          old_status?: string | null
          organization_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          connection_id?: string
          connection_name?: string | null
          connection_phone?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          message?: string | null
          new_status?: string | null
          notify_phone?: string | null
          old_status?: string | null
          organization_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_status_alerts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "evolution_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_status_alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_action_logs: {
        Row: {
          action_data: Json | null
          action_type: string
          agent_id: string | null
          conversation_id: string | null
          created_at: string
          error_message: string | null
          id: string
          lead_id: string | null
          organization_id: string
          product_id: string | null
          result: Json | null
          success: boolean
        }
        Insert: {
          action_data?: Json | null
          action_type: string
          agent_id?: string | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          lead_id?: string | null
          organization_id: string
          product_id?: string | null
          result?: Json | null
          success?: boolean
        }
        Update: {
          action_data?: Json | null
          action_type?: string
          agent_id?: string | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          lead_id?: string | null
          organization_id?: string
          product_id?: string | null
          result?: Json | null
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "agent_action_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_action_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_action_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_action_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_action_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_activation_logs: {
        Row: {
          channel: string | null
          conversation_id: string | null
          created_at: string
          from_agent_id: string | null
          id: string
          lead_id: string | null
          match_type: string | null
          matched_term: string | null
          organization_id: string
          product_id: string | null
          to_agent_id: string | null
        }
        Insert: {
          channel?: string | null
          conversation_id?: string | null
          created_at?: string
          from_agent_id?: string | null
          id?: string
          lead_id?: string | null
          match_type?: string | null
          matched_term?: string | null
          organization_id: string
          product_id?: string | null
          to_agent_id?: string | null
        }
        Update: {
          channel?: string | null
          conversation_id?: string | null
          created_at?: string
          from_agent_id?: string | null
          id?: string
          lead_id?: string | null
          match_type?: string | null
          matched_term?: string | null
          organization_id?: string
          product_id?: string | null
          to_agent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_activation_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_activation_logs_from_agent_id_fkey"
            columns: ["from_agent_id"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_activation_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_activation_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_activation_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_activation_logs_to_agent_id_fkey"
            columns: ["to_agent_id"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_handoff_history: {
        Row: {
          context: Json | null
          conversation_id: string | null
          created_at: string
          from_agent_id: string | null
          id: string
          lead_id: string | null
          organization_id: string
          reason: string | null
          rule_id: string | null
          to_agent_id: string | null
          to_specialist_id: string | null
        }
        Insert: {
          context?: Json | null
          conversation_id?: string | null
          created_at?: string
          from_agent_id?: string | null
          id?: string
          lead_id?: string | null
          organization_id: string
          reason?: string | null
          rule_id?: string | null
          to_agent_id?: string | null
          to_specialist_id?: string | null
        }
        Update: {
          context?: Json | null
          conversation_id?: string | null
          created_at?: string
          from_agent_id?: string | null
          id?: string
          lead_id?: string | null
          organization_id?: string
          reason?: string | null
          rule_id?: string | null
          to_agent_id?: string | null
          to_specialist_id?: string | null
        }
        Relationships: []
      }
      agent_post_sale_scenarios: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          filters: Json
          id: string
          instruction: string
          is_active: boolean
          links: Json
          name: string
          organization_id: string
          priority: number
          tags_to_apply: string[]
          trigger_event: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          filters?: Json
          id?: string
          instruction: string
          is_active?: boolean
          links?: Json
          name: string
          organization_id: string
          priority?: number
          tags_to_apply?: string[]
          trigger_event: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          filters?: Json
          id?: string
          instruction?: string
          is_active?: boolean
          links?: Json
          name?: string
          organization_id?: string
          priority?: number
          tags_to_apply?: string[]
          trigger_event?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_post_sale_scenarios_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_routing_rules: {
        Row: {
          created_at: string
          deal_value_max: number | null
          deal_value_min: number | null
          description: string | null
          id: string
          is_active: boolean
          last_matched_at: string | null
          match_channels: string[] | null
          match_count: number
          match_events: string[] | null
          match_product_ids: string[] | null
          match_stage_ids: string[] | null
          match_tag_ids: string[] | null
          name: string
          organization_id: string
          priority: number
          target_specialist_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deal_value_max?: number | null
          deal_value_min?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          last_matched_at?: string | null
          match_channels?: string[] | null
          match_count?: number
          match_events?: string[] | null
          match_product_ids?: string[] | null
          match_stage_ids?: string[] | null
          match_tag_ids?: string[] | null
          name: string
          organization_id: string
          priority?: number
          target_specialist_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deal_value_max?: number | null
          deal_value_min?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          last_matched_at?: string | null
          match_channels?: string[] | null
          match_count?: number
          match_events?: string[] | null
          match_product_ids?: string[] | null
          match_stage_ids?: string[] | null
          match_tag_ids?: string[] | null
          name?: string
          organization_id?: string
          priority?: number
          target_specialist_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_routing_rules_target_specialist_id_fkey"
            columns: ["target_specialist_id"]
            isOneToOne: false
            referencedRelation: "agent_specialists"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_safety_limits: {
        Row: {
          cooldown_seconds_between_same_tool: number
          created_at: string
          max_cost_cents_per_day: number
          max_tool_executions_per_day: number
          max_tools_per_turn: number
          organization_id: string
          updated_at: string
        }
        Insert: {
          cooldown_seconds_between_same_tool?: number
          created_at?: string
          max_cost_cents_per_day?: number
          max_tool_executions_per_day?: number
          max_tools_per_turn?: number
          organization_id: string
          updated_at?: string
        }
        Update: {
          cooldown_seconds_between_same_tool?: number
          created_at?: string
          max_cost_cents_per_day?: number
          max_tool_executions_per_day?: number
          max_tools_per_turn?: number
          organization_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      agent_specialists: {
        Row: {
          agent_id: string
          created_at: string
          description: string | null
          display_name: string
          id: string
          is_active: boolean
          organization_id: string
          priority: number
          role: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          organization_id: string
          priority?: number
          role: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          priority?: number
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      agent_tool_executions: {
        Row: {
          agent_id: string | null
          agent_name: string | null
          channel: string | null
          conversation_id: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          estimated_cost_cents: number | null
          id: string
          input: Json
          lead_id: string | null
          organization_id: string
          output: Json | null
          success: boolean
          tool_name: string
        }
        Insert: {
          agent_id?: string | null
          agent_name?: string | null
          channel?: string | null
          conversation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          estimated_cost_cents?: number | null
          id?: string
          input?: Json
          lead_id?: string | null
          organization_id: string
          output?: Json | null
          success?: boolean
          tool_name: string
        }
        Update: {
          agent_id?: string | null
          agent_name?: string | null
          channel?: string | null
          conversation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          estimated_cost_cents?: number | null
          id?: string
          input?: Json
          lead_id?: string | null
          organization_id?: string
          output?: Json | null
          success?: boolean
          tool_name?: string
        }
        Relationships: []
      }
      agent_training_materials: {
        Row: {
          agent_id: string | null
          category: string
          created_at: string | null
          created_by: string | null
          description: string | null
          extracted_content: string | null
          file_url: string | null
          id: string
          is_active: boolean | null
          material_type: string
          organization_id: string
          processing_error: string | null
          processing_status: string | null
          product_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          agent_id?: string | null
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          extracted_content?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          material_type: string
          organization_id: string
          processing_error?: string | null
          processing_status?: string | null
          product_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          agent_id?: string | null
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          extracted_content?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          material_type?: string
          organization_id?: string
          processing_error?: string | null
          processing_status?: string | null
          product_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_training_materials_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_training_materials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_training_materials_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_audits: {
        Row: {
          analyzed_at: string
          id: string
          interaction_id: string
          issues: string[] | null
          quality_score: number | null
          suggestions: string[] | null
          tone_analysis: Json | null
        }
        Insert: {
          analyzed_at?: string
          id?: string
          interaction_id: string
          issues?: string[] | null
          quality_score?: number | null
          suggestions?: string[] | null
          tone_analysis?: Json | null
        }
        Update: {
          analyzed_at?: string
          id?: string
          interaction_id?: string
          issues?: string[] | null
          quality_score?: number | null
          suggestions?: string[] | null
          tone_analysis?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_audits_interaction_id_fkey"
            columns: ["interaction_id"]
            isOneToOne: false
            referencedRelation: "interactions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_insights: {
        Row: {
          created_at: string
          id: string
          insight: string
          is_dismissed: boolean | null
          organization_id: string | null
          priority: Database["public"]["Enums"]["task_priority"] | null
          product_id: string | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          insight: string
          is_dismissed?: boolean | null
          organization_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          product_id?: string | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          insight?: string
          is_dismissed?: boolean | null
          organization_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          product_id?: string | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_insights_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_insights_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_knowledge_base: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          is_active: boolean | null
          organization_id: string
          product_id: string
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          organization_id: string
          product_id: string
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          organization_id?: string
          product_id?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_knowledge_base_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_knowledge_base_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_outreach_queue: {
        Row: {
          agent_id: string | null
          business_days: number[] | null
          business_hours_end: string | null
          business_hours_start: string | null
          conversation_id: string | null
          created_at: string
          error_message: string | null
          extra_context: string | null
          followup_enabled: boolean
          followup_interval_hours: number | null
          followup_steps: Json | null
          followups_sent: number
          id: string
          last_outreach_at: string | null
          lead_data: Json | null
          lead_id: string
          max_followups: number | null
          next_followup_at: string | null
          objective: string | null
          organization_id: string
          product_id: string | null
          status: string
          webhook_id: string | null
        }
        Insert: {
          agent_id?: string | null
          business_days?: number[] | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          extra_context?: string | null
          followup_enabled?: boolean
          followup_interval_hours?: number | null
          followup_steps?: Json | null
          followups_sent?: number
          id?: string
          last_outreach_at?: string | null
          lead_data?: Json | null
          lead_id: string
          max_followups?: number | null
          next_followup_at?: string | null
          objective?: string | null
          organization_id: string
          product_id?: string | null
          status?: string
          webhook_id?: string | null
        }
        Update: {
          agent_id?: string | null
          business_days?: number[] | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          extra_context?: string | null
          followup_enabled?: boolean
          followup_interval_hours?: number | null
          followup_steps?: Json | null
          followups_sent?: number
          id?: string
          last_outreach_at?: string | null
          lead_data?: Json | null
          lead_id?: string
          max_followups?: number | null
          next_followup_at?: string | null
          objective?: string | null
          organization_id?: string
          product_id?: string | null
          status?: string
          webhook_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_outreach_queue_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_outreach_queue_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_outreach_queue_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_outreach_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_outreach_queue_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_outreach_queue_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_prompt_experiments: {
        Row: {
          agent_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string | null
          id: string
          name: string
          organization_id: string
          primary_metric: string | null
          starts_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          name: string
          organization_id: string
          primary_metric?: string | null
          starts_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          name?: string
          organization_id?: string
          primary_metric?: string | null
          starts_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_prompt_variants: {
        Row: {
          conversions: number
          created_at: string
          evaluations_count: number
          experiment_id: string
          id: string
          impressions: number
          label: string
          organization_id: string
          prompt_mode: string
          prompt_override: string | null
          total_score: number
          updated_at: string
          weight: number
        }
        Insert: {
          conversions?: number
          created_at?: string
          evaluations_count?: number
          experiment_id: string
          id?: string
          impressions?: number
          label: string
          organization_id: string
          prompt_mode?: string
          prompt_override?: string | null
          total_score?: number
          updated_at?: string
          weight?: number
        }
        Update: {
          conversions?: number
          created_at?: string
          evaluations_count?: number
          experiment_id?: string
          id?: string
          impressions?: number
          label?: string
          organization_id?: string
          prompt_mode?: string
          prompt_override?: string | null
          total_score?: number
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_prompt_variants_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "ai_prompt_experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_quality_evaluations: {
        Row: {
          agent_id: string | null
          conversation_id: string | null
          cost_usd: number | null
          created_at: string
          detected_intents: Json | null
          detected_issues: Json | null
          detected_objections: Json | null
          evaluated_messages_count: number | null
          id: string
          improvement_suggestions: string | null
          judge_model: string | null
          lead_id: string | null
          organization_id: string
          score_accuracy: number | null
          score_clarity: number | null
          score_conversion_potential: number | null
          score_objectivity: number | null
          score_overall: number | null
          score_tone: number | null
          summary: string | null
        }
        Insert: {
          agent_id?: string | null
          conversation_id?: string | null
          cost_usd?: number | null
          created_at?: string
          detected_intents?: Json | null
          detected_issues?: Json | null
          detected_objections?: Json | null
          evaluated_messages_count?: number | null
          id?: string
          improvement_suggestions?: string | null
          judge_model?: string | null
          lead_id?: string | null
          organization_id: string
          score_accuracy?: number | null
          score_clarity?: number | null
          score_conversion_potential?: number | null
          score_objectivity?: number | null
          score_overall?: number | null
          score_tone?: number | null
          summary?: string | null
        }
        Update: {
          agent_id?: string | null
          conversation_id?: string | null
          cost_usd?: number | null
          created_at?: string
          detected_intents?: Json | null
          detected_issues?: Json | null
          detected_objections?: Json | null
          evaluated_messages_count?: number | null
          id?: string
          improvement_suggestions?: string | null
          judge_model?: string | null
          lead_id?: string | null
          organization_id?: string
          score_accuracy?: number | null
          score_clarity?: number | null
          score_conversion_potential?: number | null
          score_objectivity?: number | null
          score_overall?: number | null
          score_tone?: number | null
          summary?: string | null
        }
        Relationships: []
      }
      ai_receipt_audits: {
        Row: {
          block_id: string | null
          conversation_id: string | null
          created_at: string
          decision: string | null
          error: string | null
          funnel_id: string | null
          id: string
          identified: boolean | null
          lead_id: string | null
          message_id: string | null
          metadata: Json
          name: string | null
          ocr_text_preview: string | null
          organization_id: string | null
          route: string | null
          source: string | null
          value: string | null
        }
        Insert: {
          block_id?: string | null
          conversation_id?: string | null
          created_at?: string
          decision?: string | null
          error?: string | null
          funnel_id?: string | null
          id?: string
          identified?: boolean | null
          lead_id?: string | null
          message_id?: string | null
          metadata?: Json
          name?: string | null
          ocr_text_preview?: string | null
          organization_id?: string | null
          route?: string | null
          source?: string | null
          value?: string | null
        }
        Update: {
          block_id?: string | null
          conversation_id?: string | null
          created_at?: string
          decision?: string | null
          error?: string | null
          funnel_id?: string | null
          id?: string
          identified?: boolean | null
          lead_id?: string | null
          message_id?: string | null
          metadata?: Json
          name?: string | null
          ocr_text_preview?: string | null
          organization_id?: string | null
          route?: string | null
          source?: string | null
          value?: string | null
        }
        Relationships: []
      }
      ai_response_feedback: {
        Row: {
          applied_at: string | null
          applied_to_training: boolean | null
          conversation_id: string | null
          created_at: string | null
          created_by: string | null
          feedback_type: string | null
          id: string
          message_id: string | null
          organization_id: string
          original_response: string
          suggested_response: string
        }
        Insert: {
          applied_at?: string | null
          applied_to_training?: boolean | null
          conversation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          feedback_type?: string | null
          id?: string
          message_id?: string | null
          organization_id: string
          original_response: string
          suggested_response: string
        }
        Update: {
          applied_at?: string | null
          applied_to_training?: boolean | null
          conversation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          feedback_type?: string | null
          id?: string
          message_id?: string | null
          organization_id?: string
          original_response?: string
          suggested_response?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_response_feedback_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_response_feedback_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_response_feedback_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_response_feedback_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "webchat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_response_feedback_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_router_failures: {
        Row: {
          capability: string
          created_at: string
          error_message: string | null
          fell_back_to: string | null
          id: string
          organization_id: string
          provider: string
          status_code: number | null
        }
        Insert: {
          capability: string
          created_at?: string
          error_message?: string | null
          fell_back_to?: string | null
          id?: string
          organization_id: string
          provider: string
          status_code?: number | null
        }
        Update: {
          capability?: string
          created_at?: string
          error_message?: string | null
          fell_back_to?: string | null
          id?: string
          organization_id?: string
          provider?: string
          status_code?: number | null
        }
        Relationships: []
      }
      auto_notification_settings: {
        Row: {
          admin_agent_enabled: boolean | null
          admin_user_id: string | null
          admin_whatsapp_number: string | null
          alert_agent_error_threshold: number | null
          alert_critical_product_idle_hours: number | null
          alert_goal_achieved: boolean | null
          alert_high_value_threshold: number | null
          alert_meeting_changes: boolean | null
          alert_offline_minutes: number | null
          alert_product_volume_spike: boolean | null
          alert_product_volume_spike_pct: number | null
          alert_unattended_minutes: number | null
          commission_approved_enabled: boolean | null
          created_at: string | null
          daily_report_enabled: boolean | null
          daily_report_hour: number | null
          daily_report_send_email: boolean | null
          daily_summary_enabled: boolean | null
          daily_summary_hour: number | null
          goal_achieved_enabled: boolean | null
          id: string
          monitored_product_ids: string[] | null
          organization_id: string
          realtime_alerts_enabled: boolean | null
          stalled_lead_days: number | null
          stalled_lead_enabled: boolean | null
          summary_kpis: string[] | null
          updated_at: string | null
          weekly_include_comparison: boolean | null
          weekly_report_dow: number | null
          weekly_report_enabled: boolean | null
          weekly_report_hour: number | null
        }
        Insert: {
          admin_agent_enabled?: boolean | null
          admin_user_id?: string | null
          admin_whatsapp_number?: string | null
          alert_agent_error_threshold?: number | null
          alert_critical_product_idle_hours?: number | null
          alert_goal_achieved?: boolean | null
          alert_high_value_threshold?: number | null
          alert_meeting_changes?: boolean | null
          alert_offline_minutes?: number | null
          alert_product_volume_spike?: boolean | null
          alert_product_volume_spike_pct?: number | null
          alert_unattended_minutes?: number | null
          commission_approved_enabled?: boolean | null
          created_at?: string | null
          daily_report_enabled?: boolean | null
          daily_report_hour?: number | null
          daily_report_send_email?: boolean | null
          daily_summary_enabled?: boolean | null
          daily_summary_hour?: number | null
          goal_achieved_enabled?: boolean | null
          id?: string
          monitored_product_ids?: string[] | null
          organization_id: string
          realtime_alerts_enabled?: boolean | null
          stalled_lead_days?: number | null
          stalled_lead_enabled?: boolean | null
          summary_kpis?: string[] | null
          updated_at?: string | null
          weekly_include_comparison?: boolean | null
          weekly_report_dow?: number | null
          weekly_report_enabled?: boolean | null
          weekly_report_hour?: number | null
        }
        Update: {
          admin_agent_enabled?: boolean | null
          admin_user_id?: string | null
          admin_whatsapp_number?: string | null
          alert_agent_error_threshold?: number | null
          alert_critical_product_idle_hours?: number | null
          alert_goal_achieved?: boolean | null
          alert_high_value_threshold?: number | null
          alert_meeting_changes?: boolean | null
          alert_offline_minutes?: number | null
          alert_product_volume_spike?: boolean | null
          alert_product_volume_spike_pct?: number | null
          alert_unattended_minutes?: number | null
          commission_approved_enabled?: boolean | null
          created_at?: string | null
          daily_report_enabled?: boolean | null
          daily_report_hour?: number | null
          daily_report_send_email?: boolean | null
          daily_summary_enabled?: boolean | null
          daily_summary_hour?: number | null
          goal_achieved_enabled?: boolean | null
          id?: string
          monitored_product_ids?: string[] | null
          organization_id?: string
          realtime_alerts_enabled?: boolean | null
          stalled_lead_days?: number | null
          stalled_lead_enabled?: boolean | null
          summary_kpis?: string[] | null
          updated_at?: string | null
          weekly_include_comparison?: boolean | null
          weekly_report_dow?: number | null
          weekly_report_enabled?: boolean | null
          weekly_report_hour?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "auto_notification_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_overrides: {
        Row: {
          created_at: string | null
          date: string
          end_time: string | null
          id: string
          is_available: boolean | null
          organization_id: string
          reason: string | null
          start_time: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          date: string
          end_time?: string | null
          id?: string
          is_available?: boolean | null
          organization_id: string
          reason?: string | null
          start_time?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          end_time?: string | null
          id?: string
          is_available?: boolean | null
          organization_id?: string
          reason?: string | null
          start_time?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_overrides_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_history: {
        Row: {
          amount: number
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          invoice_url: string | null
          organization_id: string | null
          payment_date: string | null
          status: string | null
          stripe_invoice_id: string | null
          subscription_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          invoice_url?: string | null
          organization_id?: string | null
          payment_date?: string | null
          status?: string | null
          stripe_invoice_id?: string | null
          subscription_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          invoice_url?: string | null
          organization_id?: string | null
          payment_date?: string | null
          status?: string | null
          stripe_invoice_id?: string | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_history_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_event_types: {
        Row: {
          booking_experience: string | null
          buffer_after: number | null
          buffer_before: number | null
          color: string | null
          confirmation_message: string | null
          create_meet: boolean | null
          created_at: string | null
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean | null
          location_details: string | null
          location_type: string
          max_days_ahead: number | null
          min_notice_hours: number | null
          name: string
          next_steps: Json | null
          organization_id: string
          questions: Json | null
          slug: string
          thank_you_message: string | null
          thank_you_title: string | null
          updated_at: string | null
          user_id: string
          what_happens: Json | null
        }
        Insert: {
          booking_experience?: string | null
          buffer_after?: number | null
          buffer_before?: number | null
          color?: string | null
          confirmation_message?: string | null
          create_meet?: boolean | null
          created_at?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean | null
          location_details?: string | null
          location_type?: string
          max_days_ahead?: number | null
          min_notice_hours?: number | null
          name: string
          next_steps?: Json | null
          organization_id: string
          questions?: Json | null
          slug: string
          thank_you_message?: string | null
          thank_you_title?: string | null
          updated_at?: string | null
          user_id: string
          what_happens?: Json | null
        }
        Update: {
          booking_experience?: string | null
          buffer_after?: number | null
          buffer_before?: number | null
          color?: string | null
          confirmation_message?: string | null
          create_meet?: boolean | null
          created_at?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean | null
          location_details?: string | null
          location_type?: string
          max_days_ahead?: number | null
          min_notice_hours?: number | null
          name?: string
          next_steps?: Json | null
          organization_id?: string
          questions?: Json | null
          slug?: string
          thank_you_message?: string | null
          thank_you_title?: string | null
          updated_at?: string | null
          user_id?: string
          what_happens?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_event_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_event_types_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_event_types_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_logs: {
        Row: {
          booking_id: string
          channel: string | null
          created_at: string
          error: string | null
          id: string
          organization_id: string
          payload: Json
          type: string
        }
        Insert: {
          booking_id: string
          channel?: string | null
          created_at?: string
          error?: string | null
          id?: string
          organization_id: string
          payload?: Json
          type: string
        }
        Update: {
          booking_id?: string
          channel?: string | null
          created_at?: string
          error?: string | null
          id?: string
          organization_id?: string
          payload?: Json
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_logs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "booking_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_notification_settings: {
        Row: {
          confirmation_html_email: string | null
          confirmation_message_whatsapp: string | null
          confirmation_subject_email: string | null
          created_at: string
          event_type_id: string
          id: string
          internal_channel: string
          internal_message_template: string | null
          notify_seller_on_cancel: boolean
          notify_seller_on_confirm: boolean
          notify_seller_on_new: boolean
          notify_seller_on_reschedule: boolean
          organization_id: string
          recovery_enabled: boolean
          recovery_message: string | null
          recovery_offset_unit: string
          recovery_offset_value: number
          send_email: boolean
          send_whatsapp: boolean
          updated_at: string
          whatsapp_instance_id: string | null
        }
        Insert: {
          confirmation_html_email?: string | null
          confirmation_message_whatsapp?: string | null
          confirmation_subject_email?: string | null
          created_at?: string
          event_type_id: string
          id?: string
          internal_channel?: string
          internal_message_template?: string | null
          notify_seller_on_cancel?: boolean
          notify_seller_on_confirm?: boolean
          notify_seller_on_new?: boolean
          notify_seller_on_reschedule?: boolean
          organization_id: string
          recovery_enabled?: boolean
          recovery_message?: string | null
          recovery_offset_unit?: string
          recovery_offset_value?: number
          send_email?: boolean
          send_whatsapp?: boolean
          updated_at?: string
          whatsapp_instance_id?: string | null
        }
        Update: {
          confirmation_html_email?: string | null
          confirmation_message_whatsapp?: string | null
          confirmation_subject_email?: string | null
          created_at?: string
          event_type_id?: string
          id?: string
          internal_channel?: string
          internal_message_template?: string | null
          notify_seller_on_cancel?: boolean
          notify_seller_on_confirm?: boolean
          notify_seller_on_new?: boolean
          notify_seller_on_reschedule?: boolean
          organization_id?: string
          recovery_enabled?: boolean
          recovery_message?: string | null
          recovery_offset_unit?: string
          recovery_offset_value?: number
          send_email?: boolean
          send_whatsapp?: boolean
          updated_at?: string
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_notification_settings_event_type_id_fkey"
            columns: ["event_type_id"]
            isOneToOne: true
            referencedRelation: "booking_event_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_notification_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_notification_settings_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "evolution_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_reminders: {
        Row: {
          channel: string
          created_at: string
          email_subject: string | null
          event_type_id: string
          id: string
          is_active: boolean
          message_template: string
          offset_unit: string
          offset_value: number
          order_index: number
          organization_id: string
          updated_at: string
        }
        Insert: {
          channel?: string
          created_at?: string
          email_subject?: string | null
          event_type_id: string
          id?: string
          is_active?: boolean
          message_template: string
          offset_unit: string
          offset_value: number
          order_index?: number
          organization_id: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          email_subject?: string | null
          event_type_id?: string
          id?: string
          is_active?: boolean
          message_template?: string
          offset_unit?: string
          offset_value?: number
          order_index?: number
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_reminders_event_type_id_fkey"
            columns: ["event_type_id"]
            isOneToOne: false
            referencedRelation: "booking_event_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_reminders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_requests: {
        Row: {
          additional_info: Json | null
          calendar_event_id: string | null
          cancellation_reason: string | null
          confirmation_token: string | null
          confirmed_at: string | null
          created_at: string | null
          end_time: string
          event_type_id: string
          guest_email: string
          guest_name: string
          guest_phone: string | null
          host_user_id: string
          id: string
          last_reply_at: string | null
          last_reply_text: string | null
          lead_id: string | null
          organization_id: string
          start_time: string
          status: string | null
          timezone: string | null
          tracking: Json | null
          updated_at: string
          whatsapp_message_id: string | null
        }
        Insert: {
          additional_info?: Json | null
          calendar_event_id?: string | null
          cancellation_reason?: string | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          end_time: string
          event_type_id: string
          guest_email: string
          guest_name: string
          guest_phone?: string | null
          host_user_id: string
          id?: string
          last_reply_at?: string | null
          last_reply_text?: string | null
          lead_id?: string | null
          organization_id: string
          start_time: string
          status?: string | null
          timezone?: string | null
          tracking?: Json | null
          updated_at?: string
          whatsapp_message_id?: string | null
        }
        Update: {
          additional_info?: Json | null
          calendar_event_id?: string | null
          cancellation_reason?: string | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          end_time?: string
          event_type_id?: string
          guest_email?: string
          guest_name?: string
          guest_phone?: string | null
          host_user_id?: string
          id?: string
          last_reply_at?: string | null
          last_reply_text?: string | null
          lead_id?: string | null
          organization_id?: string
          start_time?: string
          status?: string | null
          timezone?: string | null
          tracking?: Json | null
          updated_at?: string
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_requests_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_event_type_id_fkey"
            columns: ["event_type_id"]
            isOneToOne: false
            referencedRelation: "booking_event_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_host_user_id_fkey"
            columns: ["host_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_host_user_id_fkey"
            columns: ["host_user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_scheduled_jobs: {
        Row: {
          attempts: number
          booking_id: string
          channel: string
          created_at: string
          id: string
          kind: string
          last_error: string | null
          organization_id: string
          payload: Json
          processed_at: string | null
          reminder_id: string | null
          scheduled_for: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          booking_id: string
          channel?: string
          created_at?: string
          id?: string
          kind: string
          last_error?: string | null
          organization_id: string
          payload?: Json
          processed_at?: string | null
          reminder_id?: string | null
          scheduled_for: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          booking_id?: string
          channel?: string
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          organization_id?: string
          payload?: Json
          processed_at?: string | null
          reminder_id?: string | null
          scheduled_for?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_scheduled_jobs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "booking_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_scheduled_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_scheduled_jobs_reminder_id_fkey"
            columns: ["reminder_id"]
            isOneToOne: false
            referencedRelation: "booking_reminders"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_status_history: {
        Row: {
          booking_id: string
          created_at: string
          from_status: string | null
          id: string
          metadata: Json
          organization_id: string
          source: string
          to_status: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          source?: string
          to_status: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          source?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_status_history_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "booking_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_status_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      business_holidays: {
        Row: {
          created_at: string
          date: string
          description: string | null
          id: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          date: string
          description?: string | null
          id?: string
          organization_id: string
        }
        Update: {
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_holidays_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      business_hours: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          out_of_hours_enabled: boolean
          out_of_hours_message: string
          schedule: Json
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          out_of_hours_enabled?: boolean
          out_of_hours_message?: string
          schedule?: Json
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          out_of_hours_enabled?: boolean
          out_of_hours_message?: string
          schedule?: Json
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_hours_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cadence_templates: {
        Row: {
          blocks: Json | null
          created_at: string
          day_number: number
          id: string
          product_id: string
          title: string
          trigger: string | null
          updated_at: string
        }
        Insert: {
          blocks?: Json | null
          created_at?: string
          day_number: number
          id?: string
          product_id: string
          title: string
          trigger?: string | null
          updated_at?: string
        }
        Update: {
          blocks?: Json | null
          created_at?: string
          day_number?: number
          id?: string
          product_id?: string
          title?: string
          trigger?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cadence_templates_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      cakto_credentials: {
        Row: {
          client_id: string
          client_secret: string
          connection_status: string
          created_at: string
          id: string
          last_error: string | null
          last_sync_at: string | null
          last_token: string | null
          organization_id: string | null
          scope: string
          scopes: string[]
          token_expires_at: string | null
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          client_id: string
          client_secret: string
          connection_status?: string
          created_at?: string
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          last_token?: string | null
          organization_id?: string | null
          scope: string
          scopes?: string[]
          token_expires_at?: string | null
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          client_id?: string
          client_secret?: string
          connection_status?: string
          created_at?: string
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          last_token?: string | null
          organization_id?: string | null
          scope?: string
          scopes?: string[]
          token_expires_at?: string | null
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cakto_credentials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cakto_orders: {
        Row: {
          amount: number | null
          assigned_to: string | null
          base_amount: number | null
          cakto_id: string
          cakto_ref_id: string | null
          coupon_code: string | null
          created_at: string
          created_at_cakto: string | null
          customer_document: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          discount: number | null
          id: string
          items: Json | null
          lead_id: string | null
          offer_id: string | null
          offer_type: string | null
          organization_id: string | null
          paid_at: string | null
          payment_method: string | null
          product_cakto_id: string | null
          product_id: string | null
          product_image: string | null
          product_name: string | null
          provider: string
          raw_payload: Json | null
          scope: string
          status: string
          synced_at: string
          type: string | null
          updated_at: string
        }
        Insert: {
          amount?: number | null
          assigned_to?: string | null
          base_amount?: number | null
          cakto_id: string
          cakto_ref_id?: string | null
          coupon_code?: string | null
          created_at?: string
          created_at_cakto?: string | null
          customer_document?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number | null
          id?: string
          items?: Json | null
          lead_id?: string | null
          offer_id?: string | null
          offer_type?: string | null
          organization_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          product_cakto_id?: string | null
          product_id?: string | null
          product_image?: string | null
          product_name?: string | null
          provider?: string
          raw_payload?: Json | null
          scope: string
          status: string
          synced_at?: string
          type?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number | null
          assigned_to?: string | null
          base_amount?: number | null
          cakto_id?: string
          cakto_ref_id?: string | null
          coupon_code?: string | null
          created_at?: string
          created_at_cakto?: string | null
          customer_document?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number | null
          id?: string
          items?: Json | null
          lead_id?: string | null
          offer_id?: string | null
          offer_type?: string | null
          organization_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          product_cakto_id?: string | null
          product_id?: string | null
          product_image?: string | null
          product_name?: string | null
          provider?: string
          raw_payload?: Json | null
          scope?: string
          status?: string
          synced_at?: string
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cakto_orders_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cakto_orders_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "product_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cakto_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cakto_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      cakto_recovery_config: {
        Row: {
          cooldown_minutes: number
          created_at: string
          delay_seconds: number
          id: string
          is_enabled: boolean
          organization_id: string
          recovery_agent_id: string | null
          trigger_on_abandoned: boolean
          trigger_on_paid: boolean
          trigger_on_refunded: boolean
          updated_at: string
        }
        Insert: {
          cooldown_minutes?: number
          created_at?: string
          delay_seconds?: number
          id?: string
          is_enabled?: boolean
          organization_id: string
          recovery_agent_id?: string | null
          trigger_on_abandoned?: boolean
          trigger_on_paid?: boolean
          trigger_on_refunded?: boolean
          updated_at?: string
        }
        Update: {
          cooldown_minutes?: number
          created_at?: string
          delay_seconds?: number
          id?: string
          is_enabled?: boolean
          organization_id?: string
          recovery_agent_id?: string | null
          trigger_on_abandoned?: boolean
          trigger_on_paid?: boolean
          trigger_on_refunded?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cakto_recovery_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cakto_recovery_config_recovery_agent_id_fkey"
            columns: ["recovery_agent_id"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      cakto_recovery_dispatches: {
        Row: {
          agent_id: string | null
          cakto_event: string
          cakto_order_id: string | null
          cakto_status: string | null
          conversation_id: string | null
          created_at: string
          customer_email: string | null
          customer_phone: string | null
          error_message: string | null
          id: string
          lead_id: string | null
          message_sent: string | null
          organization_id: string
          skipped_reason: string | null
          success: boolean
        }
        Insert: {
          agent_id?: string | null
          cakto_event: string
          cakto_order_id?: string | null
          cakto_status?: string | null
          conversation_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_phone?: string | null
          error_message?: string | null
          id?: string
          lead_id?: string | null
          message_sent?: string | null
          organization_id: string
          skipped_reason?: string | null
          success?: boolean
        }
        Update: {
          agent_id?: string | null
          cakto_event?: string
          cakto_order_id?: string | null
          cakto_status?: string | null
          conversation_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_phone?: string | null
          error_message?: string | null
          id?: string
          lead_id?: string | null
          message_sent?: string | null
          organization_id?: string
          skipped_reason?: string | null
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "cakto_recovery_dispatches_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cakto_recovery_dispatches_cakto_order_id_fkey"
            columns: ["cakto_order_id"]
            isOneToOne: false
            referencedRelation: "cakto_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cakto_recovery_dispatches_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cakto_recovery_dispatches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          all_day: boolean | null
          attendees: Json | null
          color: string | null
          create_meet: boolean | null
          created_at: string | null
          created_by: string | null
          deal_id: string | null
          description: string | null
          end_time: string
          event_type: string | null
          google_calendar_id: string | null
          google_event_id: string | null
          id: string
          is_recurring: boolean | null
          last_synced_at: string | null
          lead_id: string | null
          location: string | null
          meet_link: string | null
          metadata: Json | null
          notes: string | null
          organization_id: string
          parent_event_id: string | null
          product_id: string | null
          recurrence_end_date: string | null
          recurrence_rule: string | null
          reminder_minutes: number[] | null
          start_time: string
          status: string | null
          sync_status: string | null
          synced_from_google: boolean | null
          timezone: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          all_day?: boolean | null
          attendees?: Json | null
          color?: string | null
          create_meet?: boolean | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string | null
          description?: string | null
          end_time: string
          event_type?: string | null
          google_calendar_id?: string | null
          google_event_id?: string | null
          id?: string
          is_recurring?: boolean | null
          last_synced_at?: string | null
          lead_id?: string | null
          location?: string | null
          meet_link?: string | null
          metadata?: Json | null
          notes?: string | null
          organization_id: string
          parent_event_id?: string | null
          product_id?: string | null
          recurrence_end_date?: string | null
          recurrence_rule?: string | null
          reminder_minutes?: number[] | null
          start_time: string
          status?: string | null
          sync_status?: string | null
          synced_from_google?: boolean | null
          timezone?: string | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          all_day?: boolean | null
          attendees?: Json | null
          color?: string | null
          create_meet?: boolean | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string | null
          description?: string | null
          end_time?: string
          event_type?: string | null
          google_calendar_id?: string | null
          google_event_id?: string | null
          id?: string
          is_recurring?: boolean | null
          last_synced_at?: string | null
          lead_id?: string | null
          location?: string | null
          meet_link?: string | null
          metadata?: Json | null
          notes?: string | null
          organization_id?: string
          parent_event_id?: string | null
          product_id?: string | null
          recurrence_end_date?: string | null
          recurrence_rule?: string | null
          reminder_minutes?: number[] | null
          start_time?: string
          status?: string | null
          sync_status?: string | null
          synced_from_google?: boolean | null
          timezone?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_parent_event_id_fkey"
            columns: ["parent_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      capture_funnels: {
        Row: {
          ai_context: string | null
          ai_enabled: boolean | null
          allow_reentry: boolean | null
          appearance: Json | null
          assigned_squad_id: string | null
          assigned_user_id: string | null
          channels: Json
          created_at: string | null
          created_by: string | null
          custom_scripts: Json | null
          default_tags: string[] | null
          default_temperature: string | null
          description: string | null
          distribution_rule: string
          facebook_pixel_id: string | null
          flow_blocks: Json
          google_tag_id: string | null
          id: string
          name: string
          organization_id: string
          product_id: string
          round_robin_config: Json | null
          slug: string
          start_block_id: string | null
          status: string
          theme: Json | null
          total_leads: number | null
          total_views: number | null
          updated_at: string | null
          utm_capture: boolean | null
          widget_config: Json | null
        }
        Insert: {
          ai_context?: string | null
          ai_enabled?: boolean | null
          allow_reentry?: boolean | null
          appearance?: Json | null
          assigned_squad_id?: string | null
          assigned_user_id?: string | null
          channels?: Json
          created_at?: string | null
          created_by?: string | null
          custom_scripts?: Json | null
          default_tags?: string[] | null
          default_temperature?: string | null
          description?: string | null
          distribution_rule?: string
          facebook_pixel_id?: string | null
          flow_blocks?: Json
          google_tag_id?: string | null
          id?: string
          name: string
          organization_id: string
          product_id: string
          round_robin_config?: Json | null
          slug: string
          start_block_id?: string | null
          status?: string
          theme?: Json | null
          total_leads?: number | null
          total_views?: number | null
          updated_at?: string | null
          utm_capture?: boolean | null
          widget_config?: Json | null
        }
        Update: {
          ai_context?: string | null
          ai_enabled?: boolean | null
          allow_reentry?: boolean | null
          appearance?: Json | null
          assigned_squad_id?: string | null
          assigned_user_id?: string | null
          channels?: Json
          created_at?: string | null
          created_by?: string | null
          custom_scripts?: Json | null
          default_tags?: string[] | null
          default_temperature?: string | null
          description?: string | null
          distribution_rule?: string
          facebook_pixel_id?: string | null
          flow_blocks?: Json
          google_tag_id?: string | null
          id?: string
          name?: string
          organization_id?: string
          product_id?: string
          round_robin_config?: Json | null
          slug?: string
          start_block_id?: string | null
          status?: string
          theme?: Json | null
          total_leads?: number | null
          total_views?: number | null
          updated_at?: string | null
          utm_capture?: boolean | null
          widget_config?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "capture_funnels_assigned_squad_id_fkey"
            columns: ["assigned_squad_id"]
            isOneToOne: false
            referencedRelation: "sales_squads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_funnels_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_funnels_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_funnels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_funnels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_funnels_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_funnels_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_sync_logs: {
        Row: {
          base_url: string | null
          catalog_type: string | null
          created_by: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          items_created: number | null
          items_failed: number | null
          items_found: number | null
          items_updated: number | null
          organization_id: string
          product_id: string | null
          source_type: string
          started_at: string
          status: string
        }
        Insert: {
          base_url?: string | null
          catalog_type?: string | null
          created_by?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          items_created?: number | null
          items_failed?: number | null
          items_found?: number | null
          items_updated?: number | null
          organization_id: string
          product_id?: string | null
          source_type?: string
          started_at?: string
          status?: string
        }
        Update: {
          base_url?: string | null
          catalog_type?: string | null
          created_by?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          items_created?: number | null
          items_failed?: number | null
          items_found?: number | null
          items_updated?: number | null
          organization_id?: string
          product_id?: string | null
          source_type?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_sync_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_sync_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_sync_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_sync_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_flows: {
        Row: {
          blocks: Json
          collected_variables: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string
          product_id: string | null
          start_block_id: string | null
          trigger_conditions: Json | null
          trigger_type: string | null
          updated_at: string | null
        }
        Insert: {
          blocks?: Json
          collected_variables?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id: string
          product_id?: string | null
          start_block_id?: string | null
          trigger_conditions?: Json | null
          trigger_type?: string | null
          updated_at?: string | null
        }
        Update: {
          blocks?: Json
          collected_variables?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string
          product_id?: string | null
          start_block_id?: string | null
          trigger_conditions?: Json | null
          trigger_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_flows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_flows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_flows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_flows_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rules: {
        Row: {
          applies_to: string | null
          base_value: number
          created_at: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          max_value: number | null
          min_value: number | null
          organization_id: string
          product_id: string
          rule_type: string
          stage_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          applies_to?: string | null
          base_value?: number
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          max_value?: number | null
          min_value?: number | null
          organization_id: string
          product_id: string
          rule_type?: string
          stage_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          applies_to?: string | null
          base_value?: number
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          max_value?: number | null
          min_value?: number | null
          organization_id?: string
          product_id?: string
          rule_type?: string
          stage_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          deal_id: string
          earned_at: string | null
          id: string
          notes: string | null
          organization_id: string
          paid_at: string | null
          paid_by: string | null
          percentage_applied: number | null
          product_id: string
          rule_id: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          deal_id: string
          earned_at?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          paid_at?: string | null
          paid_by?: string | null
          percentage_applied?: number | null
          product_id: string
          rule_id?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          deal_id?: string
          earned_at?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          paid_at?: string | null
          paid_by?: string | null
          percentage_applied?: number | null
          product_id?: string
          rule_id?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "commission_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_health: {
        Row: {
          action_taken: string | null
          browser_alive: boolean | null
          connected: boolean | null
          connection_id: string | null
          created_at: string
          id: string
          instance_name: string | null
          last_ack_at: string | null
          last_heartbeat_at: string | null
          logged_in: boolean | null
          one_tick_count: number | null
          pending_ack_count: number | null
          status_crm: string | null
          status_real: Json | null
        }
        Insert: {
          action_taken?: string | null
          browser_alive?: boolean | null
          connected?: boolean | null
          connection_id?: string | null
          created_at?: string
          id?: string
          instance_name?: string | null
          last_ack_at?: string | null
          last_heartbeat_at?: string | null
          logged_in?: boolean | null
          one_tick_count?: number | null
          pending_ack_count?: number | null
          status_crm?: string | null
          status_real?: Json | null
        }
        Update: {
          action_taken?: string | null
          browser_alive?: boolean | null
          connected?: boolean | null
          connection_id?: string | null
          created_at?: string
          id?: string
          instance_name?: string | null
          last_ack_at?: string | null
          last_heartbeat_at?: string | null
          logged_in?: boolean | null
          one_tick_count?: number | null
          pending_ack_count?: number | null
          status_crm?: string | null
          status_real?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "connection_health_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "evolution_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_watchdog_config: {
        Row: {
          alert_threshold_one_tick: number | null
          created_at: string | null
          enabled: boolean | null
          ghost_threshold_minutes: number | null
          id: string
          max_recovery_attempts: number | null
          organization_id: string | null
          updated_at: string | null
        }
        Insert: {
          alert_threshold_one_tick?: number | null
          created_at?: string | null
          enabled?: boolean | null
          ghost_threshold_minutes?: number | null
          id?: string
          max_recovery_attempts?: number | null
          organization_id?: string | null
          updated_at?: string | null
        }
        Update: {
          alert_threshold_one_tick?: number | null
          created_at?: string | null
          enabled?: boolean | null
          ghost_threshold_minutes?: number | null
          id?: string
          max_recovery_attempts?: number | null
          organization_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "connection_watchdog_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      connections: {
        Row: {
          chromium_instance_id: string | null
          chromium_instance_name: string | null
          chromium_number: string | null
          chromium_pushname: string | null
          chromium_qr: string | null
          chromium_status: string | null
          created_at: string
          id: string
          name: string
          number: string | null
          provider: string | null
          pushname: string | null
          uazapi_base_url: string | null
          uazapi_instance_id: string | null
          uazapi_instance_name: string | null
          uazapi_linked: boolean | null
          uazapi_number: string | null
          uazapi_pushname: string | null
          uazapi_qr: string | null
          uazapi_status: string | null
          updated_at: string
        }
        Insert: {
          chromium_instance_id?: string | null
          chromium_instance_name?: string | null
          chromium_number?: string | null
          chromium_pushname?: string | null
          chromium_qr?: string | null
          chromium_status?: string | null
          created_at?: string
          id?: string
          name: string
          number?: string | null
          provider?: string | null
          pushname?: string | null
          uazapi_base_url?: string | null
          uazapi_instance_id?: string | null
          uazapi_instance_name?: string | null
          uazapi_linked?: boolean | null
          uazapi_number?: string | null
          uazapi_pushname?: string | null
          uazapi_qr?: string | null
          uazapi_status?: string | null
          updated_at?: string
        }
        Update: {
          chromium_instance_id?: string | null
          chromium_instance_name?: string | null
          chromium_number?: string | null
          chromium_pushname?: string | null
          chromium_qr?: string | null
          chromium_status?: string | null
          created_at?: string
          id?: string
          name?: string
          number?: string | null
          provider?: string | null
          pushname?: string | null
          uazapi_base_url?: string | null
          uazapi_instance_id?: string | null
          uazapi_instance_name?: string | null
          uazapi_linked?: boolean | null
          uazapi_number?: string | null
          uazapi_pushname?: string | null
          uazapi_qr?: string | null
          uazapi_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      conversation_notes: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_processing_locks: {
        Row: {
          conversation_id: string
          created_at: string
          locked_by: string | null
          locked_until: string
          updated_at: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          locked_by?: string | null
          locked_until: string
          updated_at?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          locked_by?: string | null
          locked_until?: string
          updated_at?: string
        }
        Relationships: []
      }
      conversation_transfers: {
        Row: {
          conversation_id: string
          created_at: string | null
          created_by: string
          from_user_id: string | null
          id: string
          internal_note: string | null
          to_queue_id: string | null
          to_user_id: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string | null
          created_by: string
          from_user_id?: string | null
          id?: string
          internal_note?: string | null
          to_queue_id?: string | null
          to_user_id?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string | null
          created_by?: string
          from_user_id?: string | null
          id?: string
          internal_note?: string | null
          to_queue_id?: string | null
          to_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_transfers_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_transfers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_transfers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_transfers_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_transfers_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_transfers_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_transfers_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_fields: {
        Row: {
          created_at: string
          description: string | null
          field_key: string
          field_type: string
          id: string
          is_active: boolean
          name: string
          options: Json
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          field_key: string
          field_type?: string
          id?: string
          is_active?: boolean
          name: string
          options?: Json
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          field_key?: string
          field_type?: string
          id?: string
          is_active?: boolean
          name?: string
          options?: Json
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_fields_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          closed_at: string | null
          created_at: string | null
          deal_value: number
          id: string
          lead_id: string
          notes: string | null
          organization_id: string
          plan_name: string | null
          product_id: string
          seller_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          closed_at?: string | null
          created_at?: string | null
          deal_value: number
          id?: string
          lead_id: string
          notes?: string | null
          organization_id: string
          plan_name?: string | null
          product_id: string
          seller_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          closed_at?: string | null
          created_at?: string | null
          deal_value?: number
          id?: string
          lead_id?: string
          notes?: string | null
          organization_id?: string
          plan_name?: string | null
          product_id?: string
          seller_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      distribution_config: {
        Row: {
          auto_reassign: boolean
          created_at: string
          id: string
          max_accept_time_minutes: number | null
          method: string
          organization_id: string
          round_robin_index: number
          squad_id: string | null
          updated_at: string
        }
        Insert: {
          auto_reassign?: boolean
          created_at?: string
          id?: string
          max_accept_time_minutes?: number | null
          method?: string
          organization_id: string
          round_robin_index?: number
          squad_id?: string | null
          updated_at?: string
        }
        Update: {
          auto_reassign?: boolean
          created_at?: string
          id?: string
          max_accept_time_minutes?: number | null
          method?: string
          organization_id?: string
          round_robin_index?: number
          squad_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distribution_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_config_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: true
            referencedRelation: "sales_squads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          created_at: string | null
          html_content: string
          id: string
          is_active: boolean | null
          is_system: boolean | null
          name: string
          organization_id: string
          slug: string
          subject: string
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          created_at?: string | null
          html_content: string
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          name: string
          organization_id: string
          slug: string
          subject: string
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          created_at?: string | null
          html_content?: string
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          name?: string
          organization_id?: string
          slug?: string
          subject?: string
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      evolution_instances: {
        Row: {
          always_online: boolean | null
          channel: string | null
          created_at: string
          created_by_super_admin: boolean
          custom_name: string | null
          health_data: Json | null
          high_delivery_mode: boolean | null
          id: string
          instance_id: string | null
          instance_token: string | null
          is_active: boolean | null
          is_default: boolean
          is_ghost: boolean | null
          is_stable: boolean | null
          keepalive_enabled: boolean | null
          last_ack_at: string | null
          last_connected_at: string | null
          last_health_at: string | null
          last_real_whatsapp_ping: string | null
          last_real_whatsapp_state: string | null
          last_reconnect_at: string | null
          last_recovery_at: string | null
          last_sync_at: string | null
          last_webhook_check_at: string | null
          last_webhook_event_at: string | null
          metadata: Json | null
          multi_device: boolean | null
          name: string
          offer_name: string | null
          one_tick_count: number | null
          organization_id: string | null
          phone_number: string | null
          profile_picture_url: string | null
          provider: string | null
          push_name: string | null
          qr_code: string | null
          qr_code_updated_at: string | null
          recovery_count: number | null
          status: string
          updated_at: string
          webhook_events: string[] | null
          webhook_status: string | null
          webhook_subscribed: boolean
          webhook_url: string | null
        }
        Insert: {
          always_online?: boolean | null
          channel?: string | null
          created_at?: string
          created_by_super_admin?: boolean
          custom_name?: string | null
          health_data?: Json | null
          high_delivery_mode?: boolean | null
          id?: string
          instance_id?: string | null
          instance_token?: string | null
          is_active?: boolean | null
          is_default?: boolean
          is_ghost?: boolean | null
          is_stable?: boolean | null
          keepalive_enabled?: boolean | null
          last_ack_at?: string | null
          last_connected_at?: string | null
          last_health_at?: string | null
          last_real_whatsapp_ping?: string | null
          last_real_whatsapp_state?: string | null
          last_reconnect_at?: string | null
          last_recovery_at?: string | null
          last_sync_at?: string | null
          last_webhook_check_at?: string | null
          last_webhook_event_at?: string | null
          metadata?: Json | null
          multi_device?: boolean | null
          name: string
          offer_name?: string | null
          one_tick_count?: number | null
          organization_id?: string | null
          phone_number?: string | null
          profile_picture_url?: string | null
          provider?: string | null
          push_name?: string | null
          qr_code?: string | null
          qr_code_updated_at?: string | null
          recovery_count?: number | null
          status?: string
          updated_at?: string
          webhook_events?: string[] | null
          webhook_status?: string | null
          webhook_subscribed?: boolean
          webhook_url?: string | null
        }
        Update: {
          always_online?: boolean | null
          channel?: string | null
          created_at?: string
          created_by_super_admin?: boolean
          custom_name?: string | null
          health_data?: Json | null
          high_delivery_mode?: boolean | null
          id?: string
          instance_id?: string | null
          instance_token?: string | null
          is_active?: boolean | null
          is_default?: boolean
          is_ghost?: boolean | null
          is_stable?: boolean | null
          keepalive_enabled?: boolean | null
          last_ack_at?: string | null
          last_connected_at?: string | null
          last_health_at?: string | null
          last_real_whatsapp_ping?: string | null
          last_real_whatsapp_state?: string | null
          last_reconnect_at?: string | null
          last_recovery_at?: string | null
          last_sync_at?: string | null
          last_webhook_check_at?: string | null
          last_webhook_event_at?: string | null
          metadata?: Json | null
          multi_device?: boolean | null
          name?: string
          offer_name?: string | null
          one_tick_count?: number | null
          organization_id?: string | null
          phone_number?: string | null
          profile_picture_url?: string | null
          provider?: string | null
          push_name?: string | null
          qr_code?: string | null
          qr_code_updated_at?: string | null
          recovery_count?: number | null
          status?: string
          updated_at?: string
          webhook_events?: string[] | null
          webhook_status?: string | null
          webhook_subscribed?: boolean
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evolution_instances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      facebook_lead_integrations: {
        Row: {
          app_secret: string | null
          assigned_squad_id: string | null
          assigned_user_id: string | null
          created_at: string | null
          default_tags: string[] | null
          default_temperature: string | null
          distribution_rule: string | null
          field_mapping: Json | null
          id: string
          is_active: boolean | null
          last_lead_received_at: string | null
          leads_count: number | null
          organization_id: string
          page_access_token: string
          page_id: string
          page_name: string | null
          pixel_access_token: string | null
          pixel_id: string | null
          pixel_name: string | null
          product_id: string
          updated_at: string | null
          verify_token: string
        }
        Insert: {
          app_secret?: string | null
          assigned_squad_id?: string | null
          assigned_user_id?: string | null
          created_at?: string | null
          default_tags?: string[] | null
          default_temperature?: string | null
          distribution_rule?: string | null
          field_mapping?: Json | null
          id?: string
          is_active?: boolean | null
          last_lead_received_at?: string | null
          leads_count?: number | null
          organization_id: string
          page_access_token: string
          page_id: string
          page_name?: string | null
          pixel_access_token?: string | null
          pixel_id?: string | null
          pixel_name?: string | null
          product_id: string
          updated_at?: string | null
          verify_token: string
        }
        Update: {
          app_secret?: string | null
          assigned_squad_id?: string | null
          assigned_user_id?: string | null
          created_at?: string | null
          default_tags?: string[] | null
          default_temperature?: string | null
          distribution_rule?: string | null
          field_mapping?: Json | null
          id?: string
          is_active?: boolean | null
          last_lead_received_at?: string | null
          leads_count?: number | null
          organization_id?: string
          page_access_token?: string
          page_id?: string
          page_name?: string | null
          pixel_access_token?: string | null
          pixel_id?: string | null
          pixel_name?: string | null
          product_id?: string
          updated_at?: string | null
          verify_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "facebook_lead_integrations_assigned_squad_id_fkey"
            columns: ["assigned_squad_id"]
            isOneToOne: false
            referencedRelation: "sales_squads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facebook_lead_integrations_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facebook_lead_integrations_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facebook_lead_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facebook_lead_integrations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      facebook_lead_logs: {
        Row: {
          ad_id: string | null
          campaign_id: string | null
          created_at: string | null
          error_message: string | null
          form_id: string | null
          id: string
          integration_id: string | null
          lead_data: Json | null
          lead_id: string | null
          leadgen_id: string
          processed_at: string | null
          raw_payload: Json | null
          status: string | null
        }
        Insert: {
          ad_id?: string | null
          campaign_id?: string | null
          created_at?: string | null
          error_message?: string | null
          form_id?: string | null
          id?: string
          integration_id?: string | null
          lead_data?: Json | null
          lead_id?: string | null
          leadgen_id: string
          processed_at?: string | null
          raw_payload?: Json | null
          status?: string | null
        }
        Update: {
          ad_id?: string | null
          campaign_id?: string | null
          created_at?: string | null
          error_message?: string | null
          form_id?: string | null
          id?: string
          integration_id?: string | null
          lead_data?: Json | null
          lead_id?: string | null
          leadgen_id?: string
          processed_at?: string | null
          raw_payload?: Json | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facebook_lead_logs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "facebook_lead_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facebook_lead_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      form_blocks: {
        Row: {
          apply_tags: string[] | null
          block_settings: Json | null
          block_type: string
          created_at: string | null
          description: string | null
          form_id: string
          id: string
          label: string
          logic_rules: Json | null
          maps_to: string | null
          options: Json | null
          order_index: number
          placeholder: string | null
          required: boolean | null
          score_rules: Json | null
          score_value: number | null
          validation: Json | null
        }
        Insert: {
          apply_tags?: string[] | null
          block_settings?: Json | null
          block_type: string
          created_at?: string | null
          description?: string | null
          form_id: string
          id?: string
          label: string
          logic_rules?: Json | null
          maps_to?: string | null
          options?: Json | null
          order_index?: number
          placeholder?: string | null
          required?: boolean | null
          score_rules?: Json | null
          score_value?: number | null
          validation?: Json | null
        }
        Update: {
          apply_tags?: string[] | null
          block_settings?: Json | null
          block_type?: string
          created_at?: string | null
          description?: string | null
          form_id?: string
          id?: string
          label?: string
          logic_rules?: Json | null
          maps_to?: string | null
          options?: Json | null
          order_index?: number
          placeholder?: string | null
          required?: boolean | null
          score_rules?: Json | null
          score_value?: number | null
          validation?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "form_blocks_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submissions: {
        Row: {
          completed_at: string | null
          created_at: string | null
          form_id: string
          geo_city: string | null
          geo_country: string | null
          id: string
          ip_address: unknown
          landing_page: string | null
          lead_id: string | null
          referrer_url: string | null
          responses: Json
          started_at: string | null
          status: string | null
          step_analytics: Json | null
          tags: string[] | null
          time_spent_seconds: number | null
          total_score: number | null
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          form_id: string
          geo_city?: string | null
          geo_country?: string | null
          id?: string
          ip_address?: unknown
          landing_page?: string | null
          lead_id?: string | null
          referrer_url?: string | null
          responses?: Json
          started_at?: string | null
          status?: string | null
          step_analytics?: Json | null
          tags?: string[] | null
          time_spent_seconds?: number | null
          total_score?: number | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          form_id?: string
          geo_city?: string | null
          geo_country?: string | null
          id?: string
          ip_address?: unknown
          landing_page?: string | null
          lead_id?: string | null
          referrer_url?: string | null
          responses?: Json
          started_at?: string | null
          status?: string | null
          step_analytics?: Json | null
          tags?: string[] | null
          time_spent_seconds?: number | null
          total_score?: number | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      form_templates: {
        Row: {
          blocks: Json
          category: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_public: boolean | null
          is_system: boolean | null
          name: string
          organization_id: string | null
          settings: Json | null
          theme: Json | null
          thumbnail_url: string | null
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          blocks?: Json
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          is_system?: boolean | null
          name: string
          organization_id?: string | null
          settings?: Json | null
          theme?: Json | null
          thumbnail_url?: string | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          blocks?: Json
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          is_system?: boolean | null
          name?: string
          organization_id?: string | null
          settings?: Json | null
          theme?: Json | null
          thumbnail_url?: string | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "form_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          assigned_squad_id: string | null
          assigned_user_id: string | null
          created_at: string | null
          created_by: string | null
          custom_scripts: Json | null
          default_temperature: string | null
          description: string | null
          distribution_rule: string | null
          facebook_pixel_id: string | null
          google_tag_id: string | null
          id: string
          name: string
          organization_id: string
          product_id: string
          round_robin_config: Json | null
          settings: Json | null
          slug: string
          status: string | null
          submissions_count: number | null
          theme: Json | null
          updated_at: string | null
          utm_capture: boolean | null
          views_count: number | null
        }
        Insert: {
          assigned_squad_id?: string | null
          assigned_user_id?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_scripts?: Json | null
          default_temperature?: string | null
          description?: string | null
          distribution_rule?: string | null
          facebook_pixel_id?: string | null
          google_tag_id?: string | null
          id?: string
          name: string
          organization_id: string
          product_id: string
          round_robin_config?: Json | null
          settings?: Json | null
          slug: string
          status?: string | null
          submissions_count?: number | null
          theme?: Json | null
          updated_at?: string | null
          utm_capture?: boolean | null
          views_count?: number | null
        }
        Update: {
          assigned_squad_id?: string | null
          assigned_user_id?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_scripts?: Json | null
          default_temperature?: string | null
          description?: string | null
          distribution_rule?: string | null
          facebook_pixel_id?: string | null
          google_tag_id?: string | null
          id?: string
          name?: string
          organization_id?: string
          product_id?: string
          round_robin_config?: Json | null
          settings?: Json | null
          slug?: string
          status?: string | null
          submissions_count?: number | null
          theme?: Json | null
          updated_at?: string | null
          utm_capture?: boolean | null
          views_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "forms_assigned_squad_id_fkey"
            columns: ["assigned_squad_id"]
            isOneToOne: false
            referencedRelation: "sales_squads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_analytics: {
        Row: {
          channel: string
          completions: number | null
          date: string
          funnel_id: string
          id: string
          leads_created: number | null
          starts: number | null
          views: number | null
        }
        Insert: {
          channel: string
          completions?: number | null
          date?: string
          funnel_id: string
          id?: string
          leads_created?: number | null
          starts?: number | null
          views?: number | null
        }
        Update: {
          channel?: string
          completions?: number | null
          date?: string
          funnel_id?: string
          id?: string
          leads_created?: number | null
          starts?: number | null
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "funnel_analytics_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "capture_funnels"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_execution_jobs: {
        Row: {
          attempts: number | null
          connection_id: string
          conversation_id: string
          created_at: string | null
          created_by: string | null
          finished_at: string | null
          flow_id: string
          id: string
          last_error: string | null
          lead_id: string
          metadata: Json | null
          organization_id: string
          start_block_id: string | null
          started_at: string | null
          status: string | null
          trigger_type: string | null
        }
        Insert: {
          attempts?: number | null
          connection_id: string
          conversation_id: string
          created_at?: string | null
          created_by?: string | null
          finished_at?: string | null
          flow_id: string
          id?: string
          last_error?: string | null
          lead_id: string
          metadata?: Json | null
          organization_id: string
          start_block_id?: string | null
          started_at?: string | null
          status?: string | null
          trigger_type?: string | null
        }
        Update: {
          attempts?: number | null
          connection_id?: string
          conversation_id?: string
          created_at?: string | null
          created_by?: string | null
          finished_at?: string | null
          flow_id?: string
          id?: string
          last_error?: string | null
          lead_id?: string
          metadata?: Json | null
          organization_id?: string
          start_block_id?: string | null
          started_at?: string | null
          status?: string | null
          trigger_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funnel_execution_jobs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_execution_jobs_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "capture_funnels"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_webhook_logs: {
        Row: {
          block_id: string
          created_at: string
          duration_ms: number | null
          error_message: string | null
          funnel_id: string
          id: string
          lead_id: string | null
          organization_id: string
          request_body: Json | null
          request_headers: Json | null
          request_method: string
          request_url: string
          response_body: string | null
          response_status: number | null
          success: boolean
          trigger_source: string
        }
        Insert: {
          block_id: string
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          funnel_id: string
          id?: string
          lead_id?: string | null
          organization_id: string
          request_body?: Json | null
          request_headers?: Json | null
          request_method?: string
          request_url: string
          response_body?: string | null
          response_status?: number | null
          success?: boolean
          trigger_source?: string
        }
        Update: {
          block_id?: string
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          funnel_id?: string
          id?: string
          lead_id?: string | null
          organization_id?: string
          request_body?: Json | null
          request_headers?: Json | null
          request_method?: string
          request_url?: string
          response_body?: string | null
          response_status?: number | null
          success?: boolean
          trigger_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "funnel_webhook_logs_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "capture_funnels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_webhook_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_webhook_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ghost_recovery_logs: {
        Row: {
          connection_id: string | null
          created_at: string
          details: Json | null
          event_type: string | null
          id: string
        }
        Insert: {
          connection_id?: string | null
          created_at?: string
          details?: Json | null
          event_type?: string | null
          id?: string
        }
        Update: {
          connection_id?: string | null
          created_at?: string
          details?: Json | null
          event_type?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghost_recovery_logs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "evolution_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_connections: {
        Row: {
          access_token: string | null
          calendar_id: string | null
          connected_at: string | null
          google_email: string | null
          google_event_id: string | null
          id: string
          is_active: boolean | null
          last_sync_at: string | null
          organization_id: string
          refresh_token: string | null
          selected_calendar_id: string | null
          sync_direction: string | null
          sync_enabled: boolean | null
          sync_error: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token?: string | null
          calendar_id?: string | null
          connected_at?: string | null
          google_email?: string | null
          google_event_id?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          organization_id: string
          refresh_token?: string | null
          selected_calendar_id?: string | null
          sync_direction?: string | null
          sync_enabled?: boolean | null
          sync_error?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string | null
          calendar_id?: string | null
          connected_at?: string | null
          google_email?: string | null
          google_event_id?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          organization_id?: string
          refresh_token?: string | null
          selected_calendar_id?: string | null
          sync_direction?: string | null
          sync_enabled?: boolean | null
          sync_error?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      help_article_feedback: {
        Row: {
          article_id: string
          comment: string | null
          created_at: string
          id: string
          is_helpful: boolean
          user_id: string
        }
        Insert: {
          article_id: string
          comment?: string | null
          created_at?: string
          id?: string
          is_helpful: boolean
          user_id: string
        }
        Update: {
          article_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          is_helpful?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "help_article_feedback_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "help_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      help_articles: {
        Row: {
          category_id: string | null
          content_html: string | null
          content_json: Json | null
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          display_order: number
          helpful_count: number
          id: string
          is_published: boolean
          not_helpful_count: number
          published_at: string | null
          related_release_id: string | null
          slug: string
          summary: string | null
          tags: string[] | null
          title: string
          updated_at: string
          view_count: number
        }
        Insert: {
          category_id?: string | null
          content_html?: string | null
          content_json?: Json | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          display_order?: number
          helpful_count?: number
          id?: string
          is_published?: boolean
          not_helpful_count?: number
          published_at?: string | null
          related_release_id?: string | null
          slug: string
          summary?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          category_id?: string | null
          content_html?: string | null
          content_json?: Json | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          display_order?: number
          helpful_count?: number
          id?: string
          is_published?: boolean
          not_helpful_count?: number
          published_at?: string | null
          related_release_id?: string | null
          slug?: string
          summary?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "help_articles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "help_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_articles_related_release_id_fkey"
            columns: ["related_release_id"]
            isOneToOne: false
            referencedRelation: "platform_releases"
            referencedColumns: ["id"]
          },
        ]
      }
      help_categories: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          display_order: number
          icon: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
          visibility: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: []
      }
      hotmart_credentials: {
        Row: {
          basic_token: string | null
          client_id: string | null
          client_secret: string | null
          created_at: string
          hottok: string | null
          id: string
          is_active: boolean
          last_verified_at: string | null
          organization_id: string
          updated_at: string
        }
        Insert: {
          basic_token?: string | null
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          hottok?: string | null
          id?: string
          is_active?: boolean
          last_verified_at?: string | null
          organization_id: string
          updated_at?: string
        }
        Update: {
          basic_token?: string | null
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          hottok?: string | null
          id?: string
          is_active?: boolean
          last_verified_at?: string | null
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotmart_credentials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hotmart_orders: {
        Row: {
          affiliate_email: string | null
          amount: number | null
          buyer_doc: string | null
          buyer_email: string | null
          buyer_name: string | null
          buyer_phone: string | null
          commission_amount: number | null
          created_at: string
          created_at_hotmart: string | null
          currency: string | null
          event_type: string | null
          hotmart_offer_code: string | null
          hotmart_product_id: string | null
          hotmart_product_name: string | null
          id: string
          installments: number | null
          organization_id: string
          payment_method: string | null
          product_id: string | null
          raw_payload: Json | null
          status: string
          subscription_code: string | null
          synced_at: string
          transaction_id: string
          updated_at: string
        }
        Insert: {
          affiliate_email?: string | null
          amount?: number | null
          buyer_doc?: string | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_phone?: string | null
          commission_amount?: number | null
          created_at?: string
          created_at_hotmart?: string | null
          currency?: string | null
          event_type?: string | null
          hotmart_offer_code?: string | null
          hotmart_product_id?: string | null
          hotmart_product_name?: string | null
          id?: string
          installments?: number | null
          organization_id: string
          payment_method?: string | null
          product_id?: string | null
          raw_payload?: Json | null
          status: string
          subscription_code?: string | null
          synced_at?: string
          transaction_id: string
          updated_at?: string
        }
        Update: {
          affiliate_email?: string | null
          amount?: number | null
          buyer_doc?: string | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_phone?: string | null
          commission_amount?: number | null
          created_at?: string
          created_at_hotmart?: string | null
          currency?: string | null
          event_type?: string | null
          hotmart_offer_code?: string | null
          hotmart_product_id?: string | null
          hotmart_product_name?: string | null
          id?: string
          installments?: number | null
          organization_id?: string
          payment_method?: string | null
          product_id?: string | null
          raw_payload?: Json | null
          status?: string
          subscription_code?: string | null
          synced_at?: string
          transaction_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotmart_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotmart_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      hotmart_product_mapping: {
        Row: {
          created_at: string
          hotmart_product_id: string
          hotmart_product_name: string | null
          id: string
          organization_id: string
          product_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          hotmart_product_id: string
          hotmart_product_name?: string | null
          id?: string
          organization_id: string
          product_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          hotmart_product_id?: string
          hotmart_product_name?: string | null
          id?: string
          organization_id?: string
          product_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotmart_product_mapping_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotmart_product_mapping_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      instance_health_logs: {
        Row: {
          details: Json | null
          event_type: string
          id: string
          instance_id: string
          message_id: string | null
          organization_id: string
          timestamp: string | null
        }
        Insert: {
          details?: Json | null
          event_type: string
          id?: string
          instance_id: string
          message_id?: string | null
          organization_id: string
          timestamp?: string | null
        }
        Update: {
          details?: Json | null
          event_type?: string
          id?: string
          instance_id?: string
          message_id?: string | null
          organization_id?: string
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instance_health_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_settings: {
        Row: {
          api_key_masked: string | null
          created_at: string | null
          id: string
          integration_type: string
          is_configured: boolean | null
          last_verified_at: string | null
          organization_id: string
          settings: Json | null
          updated_at: string | null
        }
        Insert: {
          api_key_masked?: string | null
          created_at?: string | null
          id?: string
          integration_type: string
          is_configured?: boolean | null
          last_verified_at?: string | null
          organization_id: string
          settings?: Json | null
          updated_at?: string | null
        }
        Update: {
          api_key_masked?: string | null
          created_at?: string | null
          id?: string
          integration_type?: string
          is_configured?: boolean | null
          last_verified_at?: string | null
          organization_id?: string
          settings?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      interactions: {
        Row: {
          cadence_day: number | null
          channel: Database["public"]["Enums"]["interaction_channel"]
          content: string
          created_at: string
          direction: string | null
          id: string
          lead_id: string
          metadata: Json | null
          template_used: string | null
          user_id: string | null
        }
        Insert: {
          cadence_day?: number | null
          channel?: Database["public"]["Enums"]["interaction_channel"]
          content: string
          created_at?: string
          direction?: string | null
          id?: string
          lead_id: string
          metadata?: Json | null
          template_used?: string | null
          user_id?: string | null
        }
        Update: {
          cadence_day?: number | null
          channel?: Database["public"]["Enums"]["interaction_channel"]
          content?: string
          created_at?: string
          direction?: string | null
          id?: string
          lead_id?: string
          metadata?: Json | null
          template_used?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interactions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_funnel_history: {
        Row: {
          completed_at: string | null
          created_at: string | null
          funnel_id: string
          id: string
          lead_id: string
          started_at: string | null
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          funnel_id: string
          id?: string
          lead_id: string
          started_at?: string | null
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          funnel_id?: string
          id?: string
          lead_id?: string
          started_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_funnel_history_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "capture_funnels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_funnel_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          lead_id: string
          role_label: string | null
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          lead_id: string
          role_label?: string | null
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          lead_id?: string
          role_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_queue: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          id: string
          lead_id: string
          organization_id: string
          priority: number
          product_id: string | null
          queued_at: string
          squad_id: string | null
          status: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          id?: string
          lead_id: string
          organization_id: string
          priority?: number
          product_id?: string | null
          queued_at?: string
          squad_id?: string | null
          status?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          id?: string
          lead_id?: string
          organization_id?: string
          priority?: number
          product_id?: string | null
          queued_at?: string
          squad_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_queue_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_queue_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_queue_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_queue_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_queue_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "sales_squads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_semantic_memory: {
        Row: {
          content: string
          conversation_id: string | null
          created_at: string
          embedding: string | null
          id: string
          importance_score: number | null
          lead_id: string
          message_id: string | null
          metadata: Json | null
          organization_id: string
          role: string | null
          source: string
        }
        Insert: {
          content: string
          conversation_id?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          importance_score?: number | null
          lead_id: string
          message_id?: string | null
          metadata?: Json | null
          organization_id: string
          role?: string | null
          source?: string
        }
        Update: {
          content?: string
          conversation_id?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          importance_score?: number | null
          lead_id?: string
          message_id?: string | null
          metadata?: Json | null
          organization_id?: string
          role?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_semantic_memory_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_stage_history: {
        Row: {
          days_in_stage: number | null
          entered_at: string
          exited_at: string | null
          id: string
          lead_id: string
          stage_id: string | null
        }
        Insert: {
          days_in_stage?: number | null
          entered_at?: string
          exited_at?: string | null
          id?: string
          lead_id: string
          stage_id?: string | null
        }
        Update: {
          days_in_stage?: number | null
          entered_at?: string
          exited_at?: string | null
          id?: string
          lead_id?: string
          stage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_stage_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_stage_history_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_tag_assignments: {
        Row: {
          applied_at: string
          applied_by: string | null
          lead_id: string
          source: string
          tag_id: string
        }
        Insert: {
          applied_at?: string
          applied_by?: string | null
          lead_id: string
          source?: string
          tag_id: string
        }
        Update: {
          applied_at?: string
          applied_by?: string | null
          lead_id?: string
          source?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tag_assignments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "lead_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_tags: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_automatic: boolean
          is_lifecycle_status: boolean
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_automatic?: boolean
          is_lifecycle_status?: boolean
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_automatic?: boolean
          is_lifecycle_status?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_tracking: {
        Row: {
          ad_body: string | null
          ad_headline: string | null
          ad_id: string | null
          ad_media_type: string | null
          ad_media_url: string | null
          ad_name: string | null
          ad_source_app: string | null
          ad_source_id: string | null
          ad_source_type: string | null
          ad_source_url: string | null
          adset_id: string | null
          adset_name: string | null
          browser: string | null
          business_id: string | null
          campaign_id: string | null
          campaign_name: string | null
          city: string | null
          click_id: string | null
          conversion_data: string | null
          conversion_delay_seconds: number | null
          conversion_source: string | null
          country: string | null
          created_at: string
          ctwa_clid: string | null
          ctwa_payload: string | null
          ctwa_signals: string | null
          device_type: string | null
          entry_point_conversion_app: string | null
          entry_point_conversion_delay_seconds: number | null
          entry_point_conversion_source: string | null
          fbclid: string | null
          gclid: string | null
          id: string
          landing_url: string | null
          lead_id: string | null
          organization_id: string | null
          os: string | null
          page_id: string | null
          page_name: string | null
          phone: string | null
          raw_ctwa_payload: Json | null
          raw_payload: Json | null
          referral: Json | null
          referral_ad_id: string | null
          referral_body: string | null
          referral_campaign_id: string | null
          referral_ctwa_clid: string | null
          referral_headline: string | null
          referral_media_type: string | null
          referral_post_id: string | null
          referral_source: string | null
          referral_type: string | null
          referral_video_id: string | null
          source: string | null
          source_channel: string | null
          source_platform: string | null
          state: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          wa_id: string | null
        }
        Insert: {
          ad_body?: string | null
          ad_headline?: string | null
          ad_id?: string | null
          ad_media_type?: string | null
          ad_media_url?: string | null
          ad_name?: string | null
          ad_source_app?: string | null
          ad_source_id?: string | null
          ad_source_type?: string | null
          ad_source_url?: string | null
          adset_id?: string | null
          adset_name?: string | null
          browser?: string | null
          business_id?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          city?: string | null
          click_id?: string | null
          conversion_data?: string | null
          conversion_delay_seconds?: number | null
          conversion_source?: string | null
          country?: string | null
          created_at?: string
          ctwa_clid?: string | null
          ctwa_payload?: string | null
          ctwa_signals?: string | null
          device_type?: string | null
          entry_point_conversion_app?: string | null
          entry_point_conversion_delay_seconds?: number | null
          entry_point_conversion_source?: string | null
          fbclid?: string | null
          gclid?: string | null
          id?: string
          landing_url?: string | null
          lead_id?: string | null
          organization_id?: string | null
          os?: string | null
          page_id?: string | null
          page_name?: string | null
          phone?: string | null
          raw_ctwa_payload?: Json | null
          raw_payload?: Json | null
          referral?: Json | null
          referral_ad_id?: string | null
          referral_body?: string | null
          referral_campaign_id?: string | null
          referral_ctwa_clid?: string | null
          referral_headline?: string | null
          referral_media_type?: string | null
          referral_post_id?: string | null
          referral_source?: string | null
          referral_type?: string | null
          referral_video_id?: string | null
          source?: string | null
          source_channel?: string | null
          source_platform?: string | null
          state?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          wa_id?: string | null
        }
        Update: {
          ad_body?: string | null
          ad_headline?: string | null
          ad_id?: string | null
          ad_media_type?: string | null
          ad_media_url?: string | null
          ad_name?: string | null
          ad_source_app?: string | null
          ad_source_id?: string | null
          ad_source_type?: string | null
          ad_source_url?: string | null
          adset_id?: string | null
          adset_name?: string | null
          browser?: string | null
          business_id?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          city?: string | null
          click_id?: string | null
          conversion_data?: string | null
          conversion_delay_seconds?: number | null
          conversion_source?: string | null
          country?: string | null
          created_at?: string
          ctwa_clid?: string | null
          ctwa_payload?: string | null
          ctwa_signals?: string | null
          device_type?: string | null
          entry_point_conversion_app?: string | null
          entry_point_conversion_delay_seconds?: number | null
          entry_point_conversion_source?: string | null
          fbclid?: string | null
          gclid?: string | null
          id?: string
          landing_url?: string | null
          lead_id?: string | null
          organization_id?: string | null
          os?: string | null
          page_id?: string | null
          page_name?: string | null
          phone?: string | null
          raw_ctwa_payload?: Json | null
          raw_payload?: Json | null
          referral?: Json | null
          referral_ad_id?: string | null
          referral_body?: string | null
          referral_campaign_id?: string | null
          referral_ctwa_clid?: string | null
          referral_headline?: string | null
          referral_media_type?: string | null
          referral_post_id?: string | null
          referral_source?: string | null
          referral_type?: string | null
          referral_video_id?: string | null
          source?: string | null
          source_channel?: string | null
          source_platform?: string | null
          state?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          wa_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_tracking_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_tracking_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_transfer_history: {
        Row: {
          created_at: string | null
          from_squad_id: string | null
          from_user_id: string | null
          id: string
          lead_id: string
          reason: string | null
          to_squad_id: string | null
          to_user_id: string | null
          transferred_by: string | null
        }
        Insert: {
          created_at?: string | null
          from_squad_id?: string | null
          from_user_id?: string | null
          id?: string
          lead_id: string
          reason?: string | null
          to_squad_id?: string | null
          to_user_id?: string | null
          transferred_by?: string | null
        }
        Update: {
          created_at?: string | null
          from_squad_id?: string | null
          from_user_id?: string | null
          id?: string
          lead_id?: string
          reason?: string | null
          to_squad_id?: string | null
          to_user_id?: string | null
          transferred_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_transfer_history_from_squad_id_fkey"
            columns: ["from_squad_id"]
            isOneToOne: false
            referencedRelation: "sales_squads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_transfer_history_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_transfer_history_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_transfer_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_transfer_history_to_squad_id_fkey"
            columns: ["to_squad_id"]
            isOneToOne: false
            referencedRelation: "sales_squads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_transfer_history_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_transfer_history_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_transfer_history_transferred_by_fkey"
            columns: ["transferred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_transfer_history_transferred_by_fkey"
            columns: ["transferred_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          ad_body: string | null
          ad_headline: string | null
          ad_id: string | null
          ad_name: string | null
          ad_source_app: string | null
          ad_source_url: string | null
          adset_id: string | null
          adset_name: string | null
          assigned_to: string | null
          bant_authority: string | null
          bant_budget: string | null
          bant_need: string | null
          bant_timing: string | null
          cadence_day: number | null
          campaign_id: string | null
          campaign_name: string | null
          closer_id: string | null
          company: string | null
          connection_id: string | null
          created_at: string
          ctwa_clid: string | null
          ctwa_detected: boolean | null
          current_stage_id: string | null
          deal_value: number | null
          email: string | null
          entry_point_conversion_source: string | null
          expected_close_date: string | null
          fbclid: string | null
          first_contact: boolean | null
          first_message_at: string | null
          funnels_completed: string[] | null
          id: string
          landing_page: string | null
          last_contact_at: string | null
          last_message_ack: number | null
          last_message_ack_at: string | null
          lead_channel: string | null
          lead_origin: string | null
          metadata: Json | null
          name: string
          next_action: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          phone_normalized: string | null
          placement: string | null
          position: string | null
          previous_assigned_to: string | null
          product_id: string | null
          referrer_url: string | null
          sdr_id: string | null
          sector_id: string | null
          source: string | null
          squad_id: string | null
          temperature: Database["public"]["Enums"]["lead_temperature"] | null
          transfer_reason: string | null
          transferred_at: string | null
          transferred_by: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          ad_body?: string | null
          ad_headline?: string | null
          ad_id?: string | null
          ad_name?: string | null
          ad_source_app?: string | null
          ad_source_url?: string | null
          adset_id?: string | null
          adset_name?: string | null
          assigned_to?: string | null
          bant_authority?: string | null
          bant_budget?: string | null
          bant_need?: string | null
          bant_timing?: string | null
          cadence_day?: number | null
          campaign_id?: string | null
          campaign_name?: string | null
          closer_id?: string | null
          company?: string | null
          connection_id?: string | null
          created_at?: string
          ctwa_clid?: string | null
          ctwa_detected?: boolean | null
          current_stage_id?: string | null
          deal_value?: number | null
          email?: string | null
          entry_point_conversion_source?: string | null
          expected_close_date?: string | null
          fbclid?: string | null
          first_contact?: boolean | null
          first_message_at?: string | null
          funnels_completed?: string[] | null
          id?: string
          landing_page?: string | null
          last_contact_at?: string | null
          last_message_ack?: number | null
          last_message_ack_at?: string | null
          lead_channel?: string | null
          lead_origin?: string | null
          metadata?: Json | null
          name: string
          next_action?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          phone_normalized?: string | null
          placement?: string | null
          position?: string | null
          previous_assigned_to?: string | null
          product_id?: string | null
          referrer_url?: string | null
          sdr_id?: string | null
          sector_id?: string | null
          source?: string | null
          squad_id?: string | null
          temperature?: Database["public"]["Enums"]["lead_temperature"] | null
          transfer_reason?: string | null
          transferred_at?: string | null
          transferred_by?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          ad_body?: string | null
          ad_headline?: string | null
          ad_id?: string | null
          ad_name?: string | null
          ad_source_app?: string | null
          ad_source_url?: string | null
          adset_id?: string | null
          adset_name?: string | null
          assigned_to?: string | null
          bant_authority?: string | null
          bant_budget?: string | null
          bant_need?: string | null
          bant_timing?: string | null
          cadence_day?: number | null
          campaign_id?: string | null
          campaign_name?: string | null
          closer_id?: string | null
          company?: string | null
          connection_id?: string | null
          created_at?: string
          ctwa_clid?: string | null
          ctwa_detected?: boolean | null
          current_stage_id?: string | null
          deal_value?: number | null
          email?: string | null
          entry_point_conversion_source?: string | null
          expected_close_date?: string | null
          fbclid?: string | null
          first_contact?: boolean | null
          first_message_at?: string | null
          funnels_completed?: string[] | null
          id?: string
          landing_page?: string | null
          last_contact_at?: string | null
          last_message_ack?: number | null
          last_message_ack_at?: string | null
          lead_channel?: string | null
          lead_origin?: string | null
          metadata?: Json | null
          name?: string
          next_action?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          phone_normalized?: string | null
          placement?: string | null
          position?: string | null
          previous_assigned_to?: string | null
          product_id?: string | null
          referrer_url?: string | null
          sdr_id?: string | null
          sector_id?: string | null
          source?: string | null
          squad_id?: string | null
          temperature?: Database["public"]["Enums"]["lead_temperature"] | null
          transfer_reason?: string | null
          transferred_at?: string | null
          transferred_by?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_current_stage_id_fkey"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_sdr_id_fkey"
            columns: ["sdr_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_sdr_id_fkey"
            columns: ["sdr_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "sales_squads"
            referencedColumns: ["id"]
          },
        ]
      }
      mass_email_campaigns: {
        Row: {
          created_at: string | null
          created_by: string | null
          html_content: string
          id: string
          organization_id: string
          scheduled_at: string | null
          sent_at: string | null
          stats: Json | null
          status: string | null
          subject: string
          target_filters: Json | null
          target_type: string
          template_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          html_content: string
          id?: string
          organization_id: string
          scheduled_at?: string | null
          sent_at?: string | null
          stats?: Json | null
          status?: string | null
          subject: string
          target_filters?: Json | null
          target_type?: string
          template_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          html_content?: string
          id?: string
          organization_id?: string
          scheduled_at?: string | null
          sent_at?: string | null
          stats?: Json | null
          status?: string | null
          subject?: string
          target_filters?: Json | null
          target_type?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mass_email_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mass_email_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mass_email_campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mass_email_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      mass_email_recipients: {
        Row: {
          campaign_id: string
          created_at: string | null
          email: string
          error_message: string | null
          id: string
          sent_at: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string | null
          email: string
          error_message?: string | null
          id?: string
          sent_at?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string | null
          email?: string
          error_message?: string | null
          id?: string
          sent_at?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mass_email_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mass_email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mass_email_recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mass_email_recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          created_at: string
          id: string
          name: string
          objective: string | null
          organization_id: string | null
          product_id: string | null
          status: string | null
          tags: string[] | null
          type: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          objective?: string | null
          organization_id?: string | null
          product_id?: string | null
          status?: string | null
          tags?: string[] | null
          type: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          objective?: string | null
          organization_id?: string | null
          product_id?: string | null
          status?: string | null
          tags?: string[] | null
          type?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "materials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          conversation_id: string
          created_at: string
          emoji: string
          id: string
          message_id: string
          reactor_type: string
          user_id: string | null
          visitor_id: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          reactor_type: string
          user_id?: string | null
          visitor_id?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          reactor_type?: string
          user_id?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "webchat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_logs: {
        Row: {
          id: string
          notification_type: string
          organization_id: string
          reference_date: string | null
          reference_id: string | null
          sent_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          notification_type: string
          organization_id: string
          reference_date?: string | null
          reference_id?: string | null
          sent_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          notification_type?: string
          organization_id?: string
          reference_date?: string | null
          reference_id?: string | null
          sent_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          admin_notification_id: string | null
          created_at: string
          id: string
          is_read: boolean | null
          message: string | null
          metadata: Json | null
          product_id: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          action_url?: string | null
          admin_notification_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string | null
          metadata?: Json | null
          product_id?: string | null
          title: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          action_url?: string | null
          admin_notification_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string | null
          metadata?: Json | null
          product_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_admin_notification_id_fkey"
            columns: ["admin_notification_id"]
            isOneToOne: false
            referencedRelation: "admin_notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      objections: {
        Row: {
          category: string
          created_at: string
          follow_up_question: string | null
          id: string
          organization_id: string | null
          product_id: string | null
          proof_material_id: string | null
          suggested_response: string
          updated_at: string
          what_they_mean: string | null
          what_they_say: string
        }
        Insert: {
          category: string
          created_at?: string
          follow_up_question?: string | null
          id?: string
          organization_id?: string | null
          product_id?: string | null
          proof_material_id?: string | null
          suggested_response: string
          updated_at?: string
          what_they_mean?: string | null
          what_they_say: string
        }
        Update: {
          category?: string
          created_at?: string
          follow_up_question?: string | null
          id?: string
          organization_id?: string | null
          product_id?: string | null
          proof_material_id?: string | null
          suggested_response?: string
          updated_at?: string
          what_they_mean?: string | null
          what_they_say?: string
        }
        Relationships: [
          {
            foreignKeyName: "objections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orchestration_logs: {
        Row: {
          action: string
          agent_routed_to: string | null
          channel: string | null
          confianca: number | null
          contexto_extraido: string | null
          conversation_id: string | null
          created_at: string
          id: string
          intencao: string | null
          lead_id: string | null
          message_in: string | null
          organization_id: string
          produto_id: string | null
          produto_nome: string | null
          raw_response: Json | null
        }
        Insert: {
          action: string
          agent_routed_to?: string | null
          channel?: string | null
          confianca?: number | null
          contexto_extraido?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          intencao?: string | null
          lead_id?: string | null
          message_in?: string | null
          organization_id: string
          produto_id?: string | null
          produto_nome?: string | null
          raw_response?: Json | null
        }
        Update: {
          action?: string
          agent_routed_to?: string | null
          channel?: string | null
          confianca?: number | null
          contexto_extraido?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          intencao?: string | null
          lead_id?: string | null
          message_in?: string | null
          organization_id?: string
          produto_id?: string | null
          produto_nome?: string | null
          raw_response?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "orchestration_logs_agent_routed_to_fkey"
            columns: ["agent_routed_to"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orchestration_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orchestration_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orchestration_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orchestration_logs_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      org_ai_credentials: {
        Row: {
          api_key_encrypted: string
          api_key_masked: string | null
          created_at: string
          id: string
          last_error: string | null
          last_verified_at: string | null
          model_default: string | null
          organization_id: string
          provider: string
          updated_at: string
        }
        Insert: {
          api_key_encrypted: string
          api_key_masked?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          last_verified_at?: string | null
          model_default?: string | null
          organization_id: string
          provider: string
          updated_at?: string
        }
        Update: {
          api_key_encrypted?: string
          api_key_masked?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          last_verified_at?: string | null
          model_default?: string | null
          organization_id?: string
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      org_ai_routing: {
        Row: {
          capability: string
          created_at: string
          fallback_to_lovable: boolean
          id: string
          model: string | null
          organization_id: string
          provider: string
          updated_at: string
        }
        Insert: {
          capability: string
          created_at?: string
          fallback_to_lovable?: boolean
          id?: string
          model?: string | null
          organization_id: string
          provider: string
          updated_at?: string
        }
        Update: {
          capability?: string
          created_at?: string
          fallback_to_lovable?: boolean
          id?: string
          model?: string | null
          organization_id?: string
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      organization_orchestrator_config: {
        Row: {
          created_at: string
          fallback_to_human_after: number
          id: string
          is_enabled: boolean
          max_triage_questions: number
          min_confidence: number
          orchestrator_agent_id: string | null
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fallback_to_human_after?: number
          id?: string
          is_enabled?: boolean
          max_triage_questions?: number
          min_confidence?: number
          orchestrator_agent_id?: string | null
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fallback_to_human_after?: number
          id?: string
          is_enabled?: boolean
          max_triage_questions?: number
          min_confidence?: number
          orchestrator_agent_id?: string | null
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_orchestrator_config_orchestrator_agent_id_fkey"
            columns: ["orchestrator_agent_id"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_orchestrator_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: Json | null
          admin_status_alerts_enabled: boolean | null
          admin_status_notify_phone: string | null
          ai_debounce_ms: number
          ai_dedup_enabled: boolean
          ai_dedup_window_ms: number
          ai_grouping_enabled: boolean
          ai_grouping_max_ms: number
          ai_grouping_window_ms: number
          ai_single_processing_per_conversation: boolean
          ai_typing_max_ms: number
          ai_typing_min_ms: number
          cakto_customer_email: string | null
          cakto_subscription_id: string | null
          cnpj: string | null
          created_at: string
          email: string | null
          features: Json | null
          id: string
          logo_url: string | null
          max_connections: number | null
          max_products: number | null
          max_users: number | null
          name: string
          owner_id: string | null
          payment_policy: string | null
          phone: string | null
          plan_id: string | null
          presence_enabled: boolean
          presence_jitter_pct: number
          presence_recording_enabled: boolean
          presence_typing_chars_per_sec: number
          refund_policy: string | null
          settings: Json | null
          status: string | null
          updated_at: string
        }
        Insert: {
          address?: Json | null
          admin_status_alerts_enabled?: boolean | null
          admin_status_notify_phone?: string | null
          ai_debounce_ms?: number
          ai_dedup_enabled?: boolean
          ai_dedup_window_ms?: number
          ai_grouping_enabled?: boolean
          ai_grouping_max_ms?: number
          ai_grouping_window_ms?: number
          ai_single_processing_per_conversation?: boolean
          ai_typing_max_ms?: number
          ai_typing_min_ms?: number
          cakto_customer_email?: string | null
          cakto_subscription_id?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          features?: Json | null
          id?: string
          logo_url?: string | null
          max_connections?: number | null
          max_products?: number | null
          max_users?: number | null
          name: string
          owner_id?: string | null
          payment_policy?: string | null
          phone?: string | null
          plan_id?: string | null
          presence_enabled?: boolean
          presence_jitter_pct?: number
          presence_recording_enabled?: boolean
          presence_typing_chars_per_sec?: number
          refund_policy?: string | null
          settings?: Json | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          address?: Json | null
          admin_status_alerts_enabled?: boolean | null
          admin_status_notify_phone?: string | null
          ai_debounce_ms?: number
          ai_dedup_enabled?: boolean
          ai_dedup_window_ms?: number
          ai_grouping_enabled?: boolean
          ai_grouping_max_ms?: number
          ai_grouping_window_ms?: number
          ai_single_processing_per_conversation?: boolean
          ai_typing_max_ms?: number
          ai_typing_min_ms?: number
          cakto_customer_email?: string | null
          cakto_subscription_id?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          features?: Json | null
          id?: string
          logo_url?: string | null
          max_connections?: number | null
          max_products?: number | null
          max_users?: number | null
          name?: string
          owner_id?: string | null
          payment_policy?: string | null
          phone?: string | null
          plan_id?: string | null
          presence_enabled?: boolean
          presence_jitter_pct?: number
          presence_recording_enabled?: boolean
          presence_typing_chars_per_sec?: number
          refund_policy?: string | null
          settings?: Json | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "platform_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_links: {
        Row: {
          amount: number
          conversation_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          id: string
          lead_id: string | null
          metadata: Json
          opened_at: string | null
          organization_id: string
          paid_at: string | null
          status: string
          title: string
          updated_at: string
          url: string
        }
        Insert: {
          amount: number
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json
          opened_at?: string | null
          organization_id: string
          paid_at?: string | null
          status?: string
          title: string
          updated_at?: string
          url: string
        }
        Update: {
          amount?: number
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json
          opened_at?: string | null
          organization_id?: string
          paid_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_links_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_read_receipts: {
        Row: {
          attempts: number
          created_at: string
          id: string
          instance_id: string | null
          last_attempt_at: string | null
          message_id: string
          organization_id: string | null
          remote_jid: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          instance_id?: string | null
          last_attempt_at?: string | null
          message_id: string
          organization_id?: string | null
          remote_jid: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          instance_id?: string | null
          last_attempt_at?: string | null
          message_id?: string
          organization_id?: string | null
          remote_jid?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_read_receipts_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "evolution_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_read_receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          is_lost: boolean | null
          is_won: boolean | null
          name: string
          order_index: number
          product_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_lost?: boolean | null
          is_won?: boolean | null
          name: string
          order_index?: number
          product_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_lost?: boolean | null
          is_won?: boolean | null
          name?: string
          order_index?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      pixel_event_logs: {
        Row: {
          block_id: string
          conversation_id: string
          created_at: string | null
          event_name: string
          id: string
          lead_id: string | null
          payload: Json | null
          pixel_id: string
          response: Json | null
          success: boolean | null
        }
        Insert: {
          block_id: string
          conversation_id: string
          created_at?: string | null
          event_name: string
          id?: string
          lead_id?: string | null
          payload?: Json | null
          pixel_id: string
          response?: Json | null
          success?: boolean | null
        }
        Update: {
          block_id?: string
          conversation_id?: string
          created_at?: string | null
          event_name?: string
          id?: string
          lead_id?: string | null
          payload?: Json | null
          pixel_id?: string
          response?: Json | null
          success?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "pixel_event_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pixel_event_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_email_settings: {
        Row: {
          alert_days_after: number | null
          api_key_encrypted: string | null
          created_at: string | null
          id: string
          provider: string | null
          reminder_days_before: number | null
          reminder_on_due_date: boolean | null
          sender_email: string | null
          sender_name: string | null
          smtp_host: string | null
          smtp_pass_encrypted: string | null
          smtp_port: number | null
          smtp_user: string | null
          suspend_days_after: number | null
          updated_at: string | null
        }
        Insert: {
          alert_days_after?: number | null
          api_key_encrypted?: string | null
          created_at?: string | null
          id?: string
          provider?: string | null
          reminder_days_before?: number | null
          reminder_on_due_date?: boolean | null
          sender_email?: string | null
          sender_name?: string | null
          smtp_host?: string | null
          smtp_pass_encrypted?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          suspend_days_after?: number | null
          updated_at?: string | null
        }
        Update: {
          alert_days_after?: number | null
          api_key_encrypted?: string | null
          created_at?: string | null
          id?: string
          provider?: string | null
          reminder_days_before?: number | null
          reminder_on_due_date?: boolean | null
          sender_email?: string | null
          sender_name?: string | null
          smtp_host?: string | null
          smtp_pass_encrypted?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          suspend_days_after?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      platform_email_templates: {
        Row: {
          category: string
          created_at: string
          description: string | null
          html_content: string
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          slug: string
          subject: string
          updated_at: string
          variables: Json
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          html_content: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          slug: string
          subject: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          html_content?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          slug?: string
          subject?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: []
      }
      platform_plans: {
        Row: {
          cakto_product_id: string | null
          checkout_url: string | null
          checkout_url_cakto: string | null
          created_at: string
          description: string | null
          display_order: number
          extra_features: Json
          feature_ai_agents: boolean
          feature_audio_transcription_ai: boolean
          feature_campaigns: boolean
          feature_capture_funnels: boolean
          feature_external_api: boolean
          feature_facebook: boolean
          feature_forms: boolean
          feature_instagram: boolean
          feature_integrations: boolean
          feature_internal_chat: boolean
          feature_kanban: boolean
          feature_outreach: boolean
          feature_pipeline: boolean
          feature_scheduling: boolean
          feature_text_correction_ai: boolean
          feature_voice_agents: boolean
          feature_webhooks: boolean
          feature_whatsapp: boolean
          grace_period_days: number
          highlight_label: string | null
          id: string
          is_active: boolean
          is_default: boolean
          is_public: boolean
          max_ai_tokens_month: number
          max_connections: number
          max_contacts: number
          max_messages_month: number
          max_products: number
          max_sectors: number
          max_users: number
          name: string
          price_monthly: number
          price_yearly: number
          slug: string
          trial_days: number
          updated_at: string
        }
        Insert: {
          cakto_product_id?: string | null
          checkout_url?: string | null
          checkout_url_cakto?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          extra_features?: Json
          feature_ai_agents?: boolean
          feature_audio_transcription_ai?: boolean
          feature_campaigns?: boolean
          feature_capture_funnels?: boolean
          feature_external_api?: boolean
          feature_facebook?: boolean
          feature_forms?: boolean
          feature_instagram?: boolean
          feature_integrations?: boolean
          feature_internal_chat?: boolean
          feature_kanban?: boolean
          feature_outreach?: boolean
          feature_pipeline?: boolean
          feature_scheduling?: boolean
          feature_text_correction_ai?: boolean
          feature_voice_agents?: boolean
          feature_webhooks?: boolean
          feature_whatsapp?: boolean
          grace_period_days?: number
          highlight_label?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          is_public?: boolean
          max_ai_tokens_month?: number
          max_connections?: number
          max_contacts?: number
          max_messages_month?: number
          max_products?: number
          max_sectors?: number
          max_users?: number
          name: string
          price_monthly?: number
          price_yearly?: number
          slug: string
          trial_days?: number
          updated_at?: string
        }
        Update: {
          cakto_product_id?: string | null
          checkout_url?: string | null
          checkout_url_cakto?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          extra_features?: Json
          feature_ai_agents?: boolean
          feature_audio_transcription_ai?: boolean
          feature_campaigns?: boolean
          feature_capture_funnels?: boolean
          feature_external_api?: boolean
          feature_facebook?: boolean
          feature_forms?: boolean
          feature_instagram?: boolean
          feature_integrations?: boolean
          feature_internal_chat?: boolean
          feature_kanban?: boolean
          feature_outreach?: boolean
          feature_pipeline?: boolean
          feature_scheduling?: boolean
          feature_text_correction_ai?: boolean
          feature_voice_agents?: boolean
          feature_webhooks?: boolean
          feature_whatsapp?: boolean
          grace_period_days?: number
          highlight_label?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          is_public?: boolean
          max_ai_tokens_month?: number
          max_connections?: number
          max_contacts?: number
          max_messages_month?: number
          max_products?: number
          max_sectors?: number
          max_users?: number
          name?: string
          price_monthly?: number
          price_yearly?: number
          slug?: string
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_release_reads: {
        Row: {
          read_at: string
          release_id: string
          user_id: string
        }
        Insert: {
          read_at?: string
          release_id: string
          user_id: string
        }
        Update: {
          read_at?: string
          release_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_release_reads_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "platform_releases"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_releases: {
        Row: {
          content_html: string | null
          content_json: Json | null
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          id: string
          is_published: boolean
          published_at: string | null
          release_types: string[]
          summary: string | null
          title: string
          updated_at: string
          version: string | null
        }
        Insert: {
          content_html?: string | null
          content_json?: Json | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          published_at?: string | null
          release_types?: string[]
          summary?: string | null
          title: string
          updated_at?: string
          version?: string | null
        }
        Update: {
          content_html?: string | null
          content_json?: Json | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          published_at?: string | null
          release_types?: string[]
          summary?: string | null
          title?: string
          updated_at?: string
          version?: string | null
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          accent_color: string | null
          base_font_size: number | null
          border_radius: number | null
          browser_title: string | null
          created_at: string | null
          default_language: string | null
          default_password_changed: boolean
          default_theme: string | null
          evolution_go_global_api_key: string | null
          evolution_go_url: string | null
          favicon_url: string | null
          font_family: string | null
          font_url: string | null
          footer_text: string | null
          google_oauth_configured: boolean
          gradient_custom: Json | null
          gradient_style: string | null
          hide_widget_branding: boolean | null
          id: string
          login_bg_image_url: string | null
          login_bg_layout: string
          login_headline: string | null
          login_logo_position: string | null
          login_stats_enabled: boolean | null
          login_subheadline: string | null
          logo_dark_url: string | null
          logo_url: string | null
          max_connections: number | null
          meta_description: string | null
          og_image_url: string | null
          platform_name: string | null
          powered_by_text: string | null
          primary_color: string | null
          privacy_url: string | null
          remix_setup_completed: boolean
          super_admin_bootstrapped: boolean
          super_admin_bootstrapped_at: string | null
          support_email: string | null
          terms_url: string | null
          twitter_handle: string | null
          uazapi_admin_token: string | null
          uazapi_system_name: string | null
          uazapi_url: string | null
          updated_at: string | null
          whatsapp_provider: string | null
          widget_accent_color: string | null
        }
        Insert: {
          accent_color?: string | null
          base_font_size?: number | null
          border_radius?: number | null
          browser_title?: string | null
          created_at?: string | null
          default_language?: string | null
          default_password_changed?: boolean
          default_theme?: string | null
          evolution_go_global_api_key?: string | null
          evolution_go_url?: string | null
          favicon_url?: string | null
          font_family?: string | null
          font_url?: string | null
          footer_text?: string | null
          google_oauth_configured?: boolean
          gradient_custom?: Json | null
          gradient_style?: string | null
          hide_widget_branding?: boolean | null
          id?: string
          login_bg_image_url?: string | null
          login_bg_layout?: string
          login_headline?: string | null
          login_logo_position?: string | null
          login_stats_enabled?: boolean | null
          login_subheadline?: string | null
          logo_dark_url?: string | null
          logo_url?: string | null
          max_connections?: number | null
          meta_description?: string | null
          og_image_url?: string | null
          platform_name?: string | null
          powered_by_text?: string | null
          primary_color?: string | null
          privacy_url?: string | null
          remix_setup_completed?: boolean
          super_admin_bootstrapped?: boolean
          super_admin_bootstrapped_at?: string | null
          support_email?: string | null
          terms_url?: string | null
          twitter_handle?: string | null
          uazapi_admin_token?: string | null
          uazapi_system_name?: string | null
          uazapi_url?: string | null
          updated_at?: string | null
          whatsapp_provider?: string | null
          widget_accent_color?: string | null
        }
        Update: {
          accent_color?: string | null
          base_font_size?: number | null
          border_radius?: number | null
          browser_title?: string | null
          created_at?: string | null
          default_language?: string | null
          default_password_changed?: boolean
          default_theme?: string | null
          evolution_go_global_api_key?: string | null
          evolution_go_url?: string | null
          favicon_url?: string | null
          font_family?: string | null
          font_url?: string | null
          footer_text?: string | null
          google_oauth_configured?: boolean
          gradient_custom?: Json | null
          gradient_style?: string | null
          hide_widget_branding?: boolean | null
          id?: string
          login_bg_image_url?: string | null
          login_bg_layout?: string
          login_headline?: string | null
          login_logo_position?: string | null
          login_stats_enabled?: boolean | null
          login_subheadline?: string | null
          logo_dark_url?: string | null
          logo_url?: string | null
          max_connections?: number | null
          meta_description?: string | null
          og_image_url?: string | null
          platform_name?: string | null
          powered_by_text?: string | null
          primary_color?: string | null
          privacy_url?: string | null
          remix_setup_completed?: boolean
          super_admin_bootstrapped?: boolean
          super_admin_bootstrapped_at?: string | null
          support_email?: string | null
          terms_url?: string | null
          twitter_handle?: string | null
          uazapi_admin_token?: string | null
          uazapi_system_name?: string | null
          uazapi_url?: string | null
          updated_at?: string | null
          whatsapp_provider?: string | null
          widget_accent_color?: string | null
        }
        Relationships: []
      }
      post_sale_event_actions: {
        Row: {
          add_tag_ids: string[]
          agent_extra_context: string | null
          agent_id: string | null
          agent_objective: string | null
          agent_outreach_mode: string
          assign_sector_id: string | null
          assign_user_id: string | null
          created_at: string
          created_by: string | null
          deal_outcome: string
          deal_value_manual: number | null
          deal_value_source: string
          delay_minutes: number
          email_template_id: string | null
          event_type: string
          evolution_instance_id: string | null
          flow_id: string | null
          id: string
          inline_message: string | null
          is_active: boolean
          message_channel: string
          notify_user_id: string | null
          organization_id: string
          product_id: string
          remove_tag_ids: string[]
          send_mode: string
          target_stage_id: string | null
          updated_at: string
        }
        Insert: {
          add_tag_ids?: string[]
          agent_extra_context?: string | null
          agent_id?: string | null
          agent_objective?: string | null
          agent_outreach_mode?: string
          assign_sector_id?: string | null
          assign_user_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_outcome?: string
          deal_value_manual?: number | null
          deal_value_source?: string
          delay_minutes?: number
          email_template_id?: string | null
          event_type: string
          evolution_instance_id?: string | null
          flow_id?: string | null
          id?: string
          inline_message?: string | null
          is_active?: boolean
          message_channel?: string
          notify_user_id?: string | null
          organization_id: string
          product_id: string
          remove_tag_ids?: string[]
          send_mode?: string
          target_stage_id?: string | null
          updated_at?: string
        }
        Update: {
          add_tag_ids?: string[]
          agent_extra_context?: string | null
          agent_id?: string | null
          agent_objective?: string | null
          agent_outreach_mode?: string
          assign_sector_id?: string | null
          assign_user_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_outcome?: string
          deal_value_manual?: number | null
          deal_value_source?: string
          delay_minutes?: number
          email_template_id?: string | null
          event_type?: string
          evolution_instance_id?: string | null
          flow_id?: string | null
          id?: string
          inline_message?: string | null
          is_active?: boolean
          message_channel?: string
          notify_user_id?: string | null
          organization_id?: string
          product_id?: string
          remove_tag_ids?: string[]
          send_mode?: string
          target_stage_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_sale_event_actions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sale_event_actions_assign_sector_id_fkey"
            columns: ["assign_sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sale_event_actions_assign_user_id_fkey"
            columns: ["assign_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sale_event_actions_assign_user_id_fkey"
            columns: ["assign_user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sale_event_actions_email_template_id_fkey"
            columns: ["email_template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sale_event_actions_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "chat_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sale_event_actions_notify_user_id_fkey"
            columns: ["notify_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sale_event_actions_notify_user_id_fkey"
            columns: ["notify_user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sale_event_actions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sale_event_actions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sale_event_actions_target_stage_id_fkey"
            columns: ["target_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      post_sale_event_logs: {
        Row: {
          action_id: string | null
          created_at: string
          event_data: Json
          event_type: string
          executed_actions: Json
          id: string
          lead_id: string | null
          organization_id: string
          product_id: string | null
          source: string
        }
        Insert: {
          action_id?: string | null
          created_at?: string
          event_data?: Json
          event_type: string
          executed_actions?: Json
          id?: string
          lead_id?: string | null
          organization_id: string
          product_id?: string | null
          source: string
        }
        Update: {
          action_id?: string | null
          created_at?: string
          event_data?: Json
          event_type?: string
          executed_actions?: Json
          id?: string
          lead_id?: string | null
          organization_id?: string
          product_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_sale_event_logs_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "post_sale_event_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sale_event_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sale_event_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sale_event_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      post_sale_scheduled_runs: {
        Row: {
          action_id: string
          attempts: number
          created_at: string
          event_data: Json
          event_type: string
          executed_at: string | null
          id: string
          last_error: string | null
          lead_id: string
          organization_id: string
          product_id: string | null
          run_at: string
          source: string
          status: string
        }
        Insert: {
          action_id: string
          attempts?: number
          created_at?: string
          event_data?: Json
          event_type: string
          executed_at?: string | null
          id?: string
          last_error?: string | null
          lead_id: string
          organization_id: string
          product_id?: string | null
          run_at: string
          source?: string
          status?: string
        }
        Update: {
          action_id?: string
          attempts?: number
          created_at?: string
          event_data?: Json
          event_type?: string
          executed_at?: string | null
          id?: string
          last_error?: string | null
          lead_id?: string
          organization_id?: string
          product_id?: string | null
          run_at?: string
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_sale_scheduled_runs_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "post_sale_event_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sale_scheduled_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      processed_messages: {
        Row: {
          ack: number | null
          ack_at: string | null
          created_at: string
          id: string
          instance_id: string | null
          message_id: string
          remote_jid: string | null
        }
        Insert: {
          ack?: number | null
          ack_at?: string | null
          created_at?: string
          id?: string
          instance_id?: string | null
          message_id: string
          remote_jid?: string | null
        }
        Update: {
          ack?: number | null
          ack_at?: string | null
          created_at?: string
          id?: string
          instance_id?: string | null
          message_id?: string
          remote_jid?: string | null
        }
        Relationships: []
      }
      product_agents: {
        Row: {
          activation_keywords: string[]
          activation_phrases: string[]
          activation_priority: number
          activation_scope: string
          active_in_chat: boolean | null
          active_in_copilot: boolean | null
          active_in_facebook: boolean | null
          active_in_funnels: boolean | null
          active_in_inbox: boolean | null
          active_in_instagram: boolean | null
          active_in_whatsapp: boolean | null
          active_in_widget: boolean | null
          additional_prompt: string | null
          agent_type: string
          allowed_event_type_ids: string[] | null
          always_end_with_question: boolean | null
          auto_tag_leads: boolean | null
          avatar_url: string | null
          booking_notification_user_ids: string[] | null
          booking_notify_org_admins: boolean | null
          can_add_notes: boolean
          can_apply_tags: boolean
          can_create_tasks: boolean | null
          can_do: string[] | null
          can_notify: boolean
          can_qualify: boolean
          can_schedule_meetings: boolean | null
          can_send_emails: boolean
          can_send_materials: boolean
          can_start_cadence: boolean
          can_transfer: boolean
          can_trigger_flows: boolean
          can_update_lead: boolean
          can_update_pipeline: boolean | null
          cannot_do: string[] | null
          created_at: string | null
          created_by: string | null
          default_schedule_user_id: string | null
          default_tags: string[] | null
          description: string | null
          enable_audio_transcription: boolean
          enable_image_vision: boolean
          end_conversation_triggers: string[] | null
          evolution_instance_id: string | null
          handoff_delay_seconds: number
          handoff_include_summary: boolean
          handoff_incoming_message: string | null
          handoff_outgoing_message: string | null
          handoff_triggers: string[] | null
          humanization: Json
          id: string
          is_active: boolean | null
          is_default: boolean | null
          message_delay_seconds: number
          message_style: string | null
          name: string
          organization_id: string
          primary_objective: string
          product_id: string | null
          prohibited_phrases: string[] | null
          quick_menu_intro: string | null
          quick_menu_invalid_message: string | null
          quick_menu_mode: string
          quick_menu_options: Json
          required_phrases: string[] | null
          takeover_on_match: boolean
          tone_style: string | null
          tool_configs: Json
          updated_at: string | null
          welcome_enabled: boolean
          welcome_message: string | null
        }
        Insert: {
          activation_keywords?: string[]
          activation_phrases?: string[]
          activation_priority?: number
          activation_scope?: string
          active_in_chat?: boolean | null
          active_in_copilot?: boolean | null
          active_in_facebook?: boolean | null
          active_in_funnels?: boolean | null
          active_in_inbox?: boolean | null
          active_in_instagram?: boolean | null
          active_in_whatsapp?: boolean | null
          active_in_widget?: boolean | null
          additional_prompt?: string | null
          agent_type?: string
          allowed_event_type_ids?: string[] | null
          always_end_with_question?: boolean | null
          auto_tag_leads?: boolean | null
          avatar_url?: string | null
          booking_notification_user_ids?: string[] | null
          booking_notify_org_admins?: boolean | null
          can_add_notes?: boolean
          can_apply_tags?: boolean
          can_create_tasks?: boolean | null
          can_do?: string[] | null
          can_notify?: boolean
          can_qualify?: boolean
          can_schedule_meetings?: boolean | null
          can_send_emails?: boolean
          can_send_materials?: boolean
          can_start_cadence?: boolean
          can_transfer?: boolean
          can_trigger_flows?: boolean
          can_update_lead?: boolean
          can_update_pipeline?: boolean | null
          cannot_do?: string[] | null
          created_at?: string | null
          created_by?: string | null
          default_schedule_user_id?: string | null
          default_tags?: string[] | null
          description?: string | null
          enable_audio_transcription?: boolean
          enable_image_vision?: boolean
          end_conversation_triggers?: string[] | null
          evolution_instance_id?: string | null
          handoff_delay_seconds?: number
          handoff_include_summary?: boolean
          handoff_incoming_message?: string | null
          handoff_outgoing_message?: string | null
          handoff_triggers?: string[] | null
          humanization?: Json
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          message_delay_seconds?: number
          message_style?: string | null
          name: string
          organization_id: string
          primary_objective: string
          product_id?: string | null
          prohibited_phrases?: string[] | null
          quick_menu_intro?: string | null
          quick_menu_invalid_message?: string | null
          quick_menu_mode?: string
          quick_menu_options?: Json
          required_phrases?: string[] | null
          takeover_on_match?: boolean
          tone_style?: string | null
          tool_configs?: Json
          updated_at?: string | null
          welcome_enabled?: boolean
          welcome_message?: string | null
        }
        Update: {
          activation_keywords?: string[]
          activation_phrases?: string[]
          activation_priority?: number
          activation_scope?: string
          active_in_chat?: boolean | null
          active_in_copilot?: boolean | null
          active_in_facebook?: boolean | null
          active_in_funnels?: boolean | null
          active_in_inbox?: boolean | null
          active_in_instagram?: boolean | null
          active_in_whatsapp?: boolean | null
          active_in_widget?: boolean | null
          additional_prompt?: string | null
          agent_type?: string
          allowed_event_type_ids?: string[] | null
          always_end_with_question?: boolean | null
          auto_tag_leads?: boolean | null
          avatar_url?: string | null
          booking_notification_user_ids?: string[] | null
          booking_notify_org_admins?: boolean | null
          can_add_notes?: boolean
          can_apply_tags?: boolean
          can_create_tasks?: boolean | null
          can_do?: string[] | null
          can_notify?: boolean
          can_qualify?: boolean
          can_schedule_meetings?: boolean | null
          can_send_emails?: boolean
          can_send_materials?: boolean
          can_start_cadence?: boolean
          can_transfer?: boolean
          can_trigger_flows?: boolean
          can_update_lead?: boolean
          can_update_pipeline?: boolean | null
          cannot_do?: string[] | null
          created_at?: string | null
          created_by?: string | null
          default_schedule_user_id?: string | null
          default_tags?: string[] | null
          description?: string | null
          enable_audio_transcription?: boolean
          enable_image_vision?: boolean
          end_conversation_triggers?: string[] | null
          evolution_instance_id?: string | null
          handoff_delay_seconds?: number
          handoff_include_summary?: boolean
          handoff_incoming_message?: string | null
          handoff_outgoing_message?: string | null
          handoff_triggers?: string[] | null
          humanization?: Json
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          message_delay_seconds?: number
          message_style?: string | null
          name?: string
          organization_id?: string
          primary_objective?: string
          product_id?: string | null
          prohibited_phrases?: string[] | null
          quick_menu_intro?: string | null
          quick_menu_invalid_message?: string | null
          quick_menu_mode?: string
          quick_menu_options?: Json
          required_phrases?: string[] | null
          takeover_on_match?: boolean
          tone_style?: string | null
          tool_configs?: Json
          updated_at?: string | null
          welcome_enabled?: boolean
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_agents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_agents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_agents_evolution_instance_id_fkey"
            columns: ["evolution_instance_id"]
            isOneToOne: false
            referencedRelation: "evolution_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_agents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_agents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_catalog_items: {
        Row: {
          attributes: Json | null
          created_at: string
          currency: string | null
          description: string | null
          documents: Json
          external_id: string | null
          id: string
          images: string[] | null
          is_active: boolean
          last_synced_at: string | null
          organization_id: string
          price: number | null
          product_id: string | null
          search_vector: unknown
          source_type: string
          source_url: string | null
          tags: string[] | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          url: string | null
          videos: string[]
        }
        Insert: {
          attributes?: Json | null
          created_at?: string
          currency?: string | null
          description?: string | null
          documents?: Json
          external_id?: string | null
          id?: string
          images?: string[] | null
          is_active?: boolean
          last_synced_at?: string | null
          organization_id: string
          price?: number | null
          product_id?: string | null
          search_vector?: unknown
          source_type?: string
          source_url?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          url?: string | null
          videos?: string[]
        }
        Update: {
          attributes?: Json | null
          created_at?: string
          currency?: string | null
          description?: string | null
          documents?: Json
          external_id?: string | null
          id?: string
          images?: string[] | null
          is_active?: boolean
          last_synced_at?: string | null
          organization_id?: string
          price?: number | null
          product_id?: string | null
          search_vector?: unknown
          source_type?: string
          source_url?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          url?: string | null
          videos?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "product_catalog_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_catalog_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_ctas: {
        Row: {
          action_url: string | null
          created_at: string | null
          cta_type: string
          display_order: number | null
          icon: string | null
          id: string
          intent_level: string | null
          is_active: boolean | null
          label: string
          organization_id: string
          product_id: string | null
          trigger_keywords: string[] | null
          updated_at: string | null
          video_url: string | null
          whatsapp_message: string | null
          whatsapp_number: string | null
        }
        Insert: {
          action_url?: string | null
          created_at?: string | null
          cta_type: string
          display_order?: number | null
          icon?: string | null
          id?: string
          intent_level?: string | null
          is_active?: boolean | null
          label: string
          organization_id: string
          product_id?: string | null
          trigger_keywords?: string[] | null
          updated_at?: string | null
          video_url?: string | null
          whatsapp_message?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          action_url?: string | null
          created_at?: string | null
          cta_type?: string
          display_order?: number | null
          icon?: string | null
          id?: string
          intent_level?: string | null
          is_active?: boolean | null
          label?: string
          organization_id?: string
          product_id?: string | null
          trigger_keywords?: string[] | null
          updated_at?: string | null
          video_url?: string | null
          whatsapp_message?: string | null
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_ctas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_ctas_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_knowledge_sources: {
        Row: {
          answer: string | null
          created_at: string | null
          created_by: string | null
          data_category: string | null
          data_json: Json | null
          description: string | null
          extracted_content: string | null
          file_size: number | null
          file_type: string | null
          file_url: string | null
          id: string
          is_active: boolean | null
          is_synced: boolean | null
          last_crawled_at: string | null
          organization_id: string
          processed_at: string | null
          processing_error: string | null
          processing_status: string | null
          product_id: string
          question: string | null
          raw_content: string | null
          source_type: string
          source_url: string | null
          title: string
          transcript: string | null
          updated_at: string | null
          video_duration: number | null
          video_id: string | null
        }
        Insert: {
          answer?: string | null
          created_at?: string | null
          created_by?: string | null
          data_category?: string | null
          data_json?: Json | null
          description?: string | null
          extracted_content?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          is_synced?: boolean | null
          last_crawled_at?: string | null
          organization_id: string
          processed_at?: string | null
          processing_error?: string | null
          processing_status?: string | null
          product_id: string
          question?: string | null
          raw_content?: string | null
          source_type: string
          source_url?: string | null
          title: string
          transcript?: string | null
          updated_at?: string | null
          video_duration?: number | null
          video_id?: string | null
        }
        Update: {
          answer?: string | null
          created_at?: string | null
          created_by?: string | null
          data_category?: string | null
          data_json?: Json | null
          description?: string | null
          extracted_content?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          is_synced?: boolean | null
          last_crawled_at?: string | null
          organization_id?: string
          processed_at?: string | null
          processing_error?: string | null
          processing_status?: string | null
          product_id?: string
          question?: string | null
          raw_content?: string | null
          source_type?: string
          source_url?: string | null
          title?: string
          transcript?: string | null
          updated_at?: string | null
          video_duration?: number | null
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_knowledge_sources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_knowledge_sources_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_offers: {
        Row: {
          cakto_product_id: string | null
          created_at: string
          currency: string | null
          external_source: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          organization_id: string
          position: number | null
          price: number | null
          product_id: string | null
          role: string
          updated_at: string
        }
        Insert: {
          cakto_product_id?: string | null
          created_at?: string
          currency?: string | null
          external_source?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          organization_id: string
          position?: number | null
          price?: number | null
          product_id?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          cakto_product_id?: string | null
          created_at?: string
          currency?: string | null
          external_source?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          organization_id?: string
          position?: number | null
          price?: number | null
          product_id?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_offers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_onboarding_state: {
        Row: {
          ai_optimizations: Json | null
          completed_at: string | null
          created_at: string | null
          current_step: number | null
          draft_data: Json | null
          id: string
          organization_id: string
          product_id: string | null
          total_steps: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ai_optimizations?: Json | null
          completed_at?: string | null
          created_at?: string | null
          current_step?: number | null
          draft_data?: Json | null
          id?: string
          organization_id: string
          product_id?: string | null
          total_steps?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ai_optimizations?: Json | null
          completed_at?: string | null
          created_at?: string | null
          current_step?: number | null
          draft_data?: Json | null
          id?: string
          organization_id?: string
          product_id?: string | null
          total_steps?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_onboarding_state_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_onboarding_state_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_suites: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          icon_url: string | null
          id: string
          name: string
          organization_id: string
          slug: string | null
          status: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon_url?: string | null
          id?: string
          name: string
          organization_id: string
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon_url?: string | null
          id?: string
          name?: string
          organization_id?: string
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_training_videos: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          duration_seconds: number | null
          id: string
          is_active: boolean | null
          order_index: number | null
          organization_id: string
          product_id: string
          thumbnail_url: string | null
          title: string
          updated_at: string | null
          video_url: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          is_active?: boolean | null
          order_index?: number | null
          organization_id: string
          product_id: string
          thumbnail_url?: string | null
          title: string
          updated_at?: string | null
          video_url: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          is_active?: boolean | null
          order_index?: number | null
          organization_id?: string
          product_id?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string | null
          video_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_training_videos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_training_videos_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          banner_url: string | null
          benefits: string | null
          bonuses: string | null
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          differentials: string[] | null
          discount_policy: string | null
          external_links: Json | null
          guarantee: string | null
          icp: string | null
          id: string
          knowledge_base: string | null
          logo_url: string | null
          name: string
          objections: string | null
          organization_id: string
          payment_conditions: string | null
          pitch_15s: string | null
          pitch_2min: string | null
          pitch_30s: string | null
          plans: string | null
          pricing: Json | null
          product_image_url: string | null
          settings: Json | null
          short_description: string | null
          status: Database["public"]["Enums"]["product_status"] | null
          suite_id: string | null
          updated_at: string
        }
        Insert: {
          banner_url?: string | null
          benefits?: string | null
          bonuses?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          differentials?: string[] | null
          discount_policy?: string | null
          external_links?: Json | null
          guarantee?: string | null
          icp?: string | null
          id?: string
          knowledge_base?: string | null
          logo_url?: string | null
          name: string
          objections?: string | null
          organization_id: string
          payment_conditions?: string | null
          pitch_15s?: string | null
          pitch_2min?: string | null
          pitch_30s?: string | null
          plans?: string | null
          pricing?: Json | null
          product_image_url?: string | null
          settings?: Json | null
          short_description?: string | null
          status?: Database["public"]["Enums"]["product_status"] | null
          suite_id?: string | null
          updated_at?: string
        }
        Update: {
          banner_url?: string | null
          benefits?: string | null
          bonuses?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          differentials?: string[] | null
          discount_policy?: string | null
          external_links?: Json | null
          guarantee?: string | null
          icp?: string | null
          id?: string
          knowledge_base?: string | null
          logo_url?: string | null
          name?: string
          objections?: string | null
          organization_id?: string
          payment_conditions?: string | null
          pitch_15s?: string | null
          pitch_2min?: string | null
          pitch_30s?: string | null
          plans?: string | null
          pricing?: Json | null
          product_image_url?: string | null
          settings?: Json | null
          short_description?: string | null
          status?: Database["public"]["Enums"]["product_status"] | null
          suite_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_suite_id_fkey"
            columns: ["suite_id"]
            isOneToOne: false
            referencedRelation: "product_suites"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          booking_bio: string | null
          booking_slug: string | null
          created_at: string
          default_connection_id: string | null
          default_menu_state: string | null
          default_theme: string | null
          email: string
          farewell_message: string | null
          full_name: string
          guided_onboarding_completed_at: string | null
          guided_onboarding_skipped_at: string | null
          id: string
          is_active: boolean | null
          organization_id: string | null
          phone: string | null
          recovery_whatsapp: string | null
          updated_at: string
          work_end_time: string | null
          work_start_time: string | null
        }
        Insert: {
          avatar_url?: string | null
          booking_bio?: string | null
          booking_slug?: string | null
          created_at?: string
          default_connection_id?: string | null
          default_menu_state?: string | null
          default_theme?: string | null
          email: string
          farewell_message?: string | null
          full_name: string
          guided_onboarding_completed_at?: string | null
          guided_onboarding_skipped_at?: string | null
          id: string
          is_active?: boolean | null
          organization_id?: string | null
          phone?: string | null
          recovery_whatsapp?: string | null
          updated_at?: string
          work_end_time?: string | null
          work_start_time?: string | null
        }
        Update: {
          avatar_url?: string | null
          booking_bio?: string | null
          booking_slug?: string | null
          created_at?: string
          default_connection_id?: string | null
          default_menu_state?: string | null
          default_theme?: string | null
          email?: string
          farewell_message?: string | null
          full_name?: string
          guided_onboarding_completed_at?: string | null
          guided_onboarding_skipped_at?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          phone?: string | null
          recovery_whatsapp?: string | null
          updated_at?: string
          work_end_time?: string | null
          work_start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_audit: {
        Row: {
          action_source: string | null
          ad_id: string | null
          ad_name: string | null
          ad_source_id: string | null
          ad_source_type: string | null
          adset_id: string | null
          adset_name: string | null
          campaign_id: string | null
          campaign_name: string | null
          connection_id: string | null
          conversation_id: string | null
          created_at: string | null
          ctwa_clid: string | null
          currency: string | null
          customer_name: string | null
          entry_point_conversion_source: string | null
          error_details: Json | null
          event_id: string | null
          fbtrace_id: string | null
          flow_execution_id: string | null
          flow_id: string | null
          funnel_name: string | null
          id: string
          lead_id: string | null
          meta_status: string | null
          offer_name: string | null
          phone: string | null
          pixel_block_id: string | null
          pixel_event_log_id: string | null
          pixel_id: string | null
          purchase_source: string | null
          purchase_status: string | null
          purchase_value: number | null
          raw_payload: Json | null
          raw_response: Json | null
          receipt_block_id: string | null
        }
        Insert: {
          action_source?: string | null
          ad_id?: string | null
          ad_name?: string | null
          ad_source_id?: string | null
          ad_source_type?: string | null
          adset_id?: string | null
          adset_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          connection_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          ctwa_clid?: string | null
          currency?: string | null
          customer_name?: string | null
          entry_point_conversion_source?: string | null
          error_details?: Json | null
          event_id?: string | null
          fbtrace_id?: string | null
          flow_execution_id?: string | null
          flow_id?: string | null
          funnel_name?: string | null
          id?: string
          lead_id?: string | null
          meta_status?: string | null
          offer_name?: string | null
          phone?: string | null
          pixel_block_id?: string | null
          pixel_event_log_id?: string | null
          pixel_id?: string | null
          purchase_source?: string | null
          purchase_status?: string | null
          purchase_value?: number | null
          raw_payload?: Json | null
          raw_response?: Json | null
          receipt_block_id?: string | null
        }
        Update: {
          action_source?: string | null
          ad_id?: string | null
          ad_name?: string | null
          ad_source_id?: string | null
          ad_source_type?: string | null
          adset_id?: string | null
          adset_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          connection_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          ctwa_clid?: string | null
          currency?: string | null
          customer_name?: string | null
          entry_point_conversion_source?: string | null
          error_details?: Json | null
          event_id?: string | null
          fbtrace_id?: string | null
          flow_execution_id?: string | null
          flow_id?: string | null
          funnel_name?: string | null
          id?: string
          lead_id?: string | null
          meta_status?: string | null
          offer_name?: string | null
          phone?: string | null
          pixel_block_id?: string | null
          pixel_event_log_id?: string | null
          pixel_id?: string | null
          purchase_source?: string | null
          purchase_status?: string | null
          purchase_value?: number | null
          raw_payload?: Json | null
          raw_response?: Json | null
          receipt_block_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_audit_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_audit_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_audit_pixel_event_log_id_fkey"
            columns: ["pixel_event_log_id"]
            isOneToOne: true
            referencedRelation: "pixel_event_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_replies: {
        Row: {
          category: string
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          organization_id: string
          shortcut: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: string
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          organization_id: string
          shortcut?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string
          shortcut?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quick_replies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_replies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_replies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_shadow_results: {
        Row: {
          amount: number | null
          confidence: number | null
          created_at: string
          id: string
          instance: string | null
          is_receipt: boolean | null
          message_id: string | null
          ocr_text: string | null
          payer_name: string | null
          pix_id: string | null
          provider: string | null
          received_at: string | null
        }
        Insert: {
          amount?: number | null
          confidence?: number | null
          created_at?: string
          id?: string
          instance?: string | null
          is_receipt?: boolean | null
          message_id?: string | null
          ocr_text?: string | null
          payer_name?: string | null
          pix_id?: string | null
          provider?: string | null
          received_at?: string | null
        }
        Update: {
          amount?: number | null
          confidence?: number | null
          created_at?: string
          id?: string
          instance?: string | null
          is_receipt?: boolean | null
          message_id?: string | null
          ocr_text?: string | null
          payer_name?: string | null
          pix_id?: string | null
          provider?: string | null
          received_at?: string | null
        }
        Relationships: []
      }
      sales_goals: {
        Row: {
          achieved_deals: number | null
          achieved_value: number | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean | null
          organization_id: string | null
          period_end: string
          period_start: string
          product_id: string | null
          target_deals: number
          target_value: number
          updated_at: string
          user_id: string
        }
        Insert: {
          achieved_deals?: number | null
          achieved_value?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          period_end: string
          period_start: string
          product_id?: string | null
          target_deals?: number
          target_value?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          achieved_deals?: number | null
          achieved_value?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          period_end?: string
          period_start?: string
          product_id?: string | null
          target_deals?: number
          target_value?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_goals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_goals_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_leads: {
        Row: {
          company_name: string
          company_size: string | null
          contact_name: string
          created_at: string | null
          current_tools: string | null
          email: string
          id: string
          main_challenge: string | null
          message: string | null
          notes: string | null
          phone: string | null
          segment: string | null
          status: string | null
          updated_at: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          company_name: string
          company_size?: string | null
          contact_name: string
          created_at?: string | null
          current_tools?: string | null
          email: string
          id?: string
          main_challenge?: string | null
          message?: string | null
          notes?: string | null
          phone?: string | null
          segment?: string | null
          status?: string | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          company_name?: string
          company_size?: string | null
          contact_name?: string
          created_at?: string | null
          current_tools?: string | null
          email?: string
          id?: string
          main_challenge?: string | null
          message?: string | null
          notes?: string | null
          phone?: string | null
          segment?: string | null
          status?: string | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      sales_squads: {
        Row: {
          color: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          leader_id: string | null
          name: string
          organization_id: string
          product_id: string | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          leader_id?: string | null
          name: string
          organization_id: string
          product_id?: string | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          leader_id?: string | null
          name?: string
          organization_id?: string
          product_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_squads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_squads_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      sankhya_mappings: {
        Row: {
          created_at: string | null
          entity_type: string
          id: string
          last_sync_at: string | null
          local_id: string
          metadata: Json | null
          organization_id: string
          sankhya_id: string
          sync_direction: string | null
          sync_status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          entity_type: string
          id?: string
          last_sync_at?: string | null
          local_id: string
          metadata?: Json | null
          organization_id: string
          sankhya_id: string
          sync_direction?: string | null
          sync_status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          entity_type?: string
          id?: string
          last_sync_at?: string | null
          local_id?: string
          metadata?: Json | null
          organization_id?: string
          sankhya_id?: string
          sync_direction?: string | null
          sync_status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sankhya_mappings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sankhya_sync_logs: {
        Row: {
          entity_type: string
          error_details: Json | null
          finished_at: string | null
          id: string
          organization_id: string
          records_failed: number | null
          records_processed: number | null
          records_success: number | null
          started_at: string | null
          status: string | null
          sync_type: string
        }
        Insert: {
          entity_type: string
          error_details?: Json | null
          finished_at?: string | null
          id?: string
          organization_id: string
          records_failed?: number | null
          records_processed?: number | null
          records_success?: number | null
          started_at?: string | null
          status?: string | null
          sync_type: string
        }
        Update: {
          entity_type?: string
          error_details?: Json | null
          finished_at?: string | null
          id?: string
          organization_id?: string
          records_failed?: number | null
          records_processed?: number | null
          records_success?: number | null
          started_at?: string | null
          status?: string | null
          sync_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sankhya_sync_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_messages: {
        Row: {
          content: string
          conversation_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          organization_id: string | null
          scheduled_at: string
          sent_at: string | null
          status: string | null
        }
        Insert: {
          content: string
          conversation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          organization_id?: string | null
          scheduled_at: string
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          organization_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sector_members: {
        Row: {
          id: string
          joined_at: string
          sector_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          sector_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          sector_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sector_members_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sector_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sector_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sectors: {
        Row: {
          auto_close_ticket: boolean | null
          bot_order: number | null
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          enable_scheduling: boolean | null
          farewell_message: string | null
          greeting_message: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          is_default: boolean
          name: string
          organization_id: string
          rotation_enabled: boolean | null
          rotation_strategy:
            | Database["public"]["Enums"]["sector_rotation_strategy"]
            | null
          updated_at: string
        }
        Insert: {
          auto_close_ticket?: boolean | null
          bot_order?: number | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          enable_scheduling?: boolean | null
          farewell_message?: string | null
          greeting_message?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean
          name: string
          organization_id: string
          rotation_enabled?: boolean | null
          rotation_strategy?:
            | Database["public"]["Enums"]["sector_rotation_strategy"]
            | null
          updated_at?: string
        }
        Update: {
          auto_close_ticket?: boolean | null
          bot_order?: number | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          enable_scheduling?: boolean | null
          farewell_message?: string | null
          greeting_message?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean
          name?: string
          organization_id?: string
          rotation_enabled?: boolean | null
          rotation_strategy?:
            | Database["public"]["Enums"]["sector_rotation_strategy"]
            | null
          updated_at?: string
        }
        Relationships: []
      }
      seller_notification_settings: {
        Row: {
          channel: string
          created_at: string
          id: string
          notify_cancel: boolean
          notify_confirmed: boolean
          notify_new_booking: boolean
          notify_reschedule: boolean
          organization_id: string
          updated_at: string
          user_id: string
          whatsapp_number: string | null
        }
        Insert: {
          channel?: string
          created_at?: string
          id?: string
          notify_cancel?: boolean
          notify_confirmed?: boolean
          notify_new_booking?: boolean
          notify_reschedule?: boolean
          organization_id: string
          updated_at?: string
          user_id: string
          whatsapp_number?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          notify_cancel?: boolean
          notify_confirmed?: boolean
          notify_new_booking?: boolean
          notify_reschedule?: boolean
          organization_id?: string
          updated_at?: string
          user_id?: string
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seller_notification_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_notification_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_notification_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sent_responses: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          response_hash: string
          response_text: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          response_hash: string
          response_text?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          response_hash?: string
          response_text?: string | null
        }
        Relationships: []
      }
      squad_members: {
        Row: {
          id: string
          joined_at: string | null
          role: string | null
          squad_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          role?: string | null
          squad_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          role?: string | null
          squad_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "squad_members_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "sales_squads"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_values: {
        Row: {
          created_at: string | null
          expected_value: number | null
          id: string
          probability_percent: number | null
          product_id: string
          stage_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          expected_value?: number | null
          id?: string
          probability_percent?: number | null
          product_id: string
          stage_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          expected_value?: number | null
          id?: string
          probability_percent?: number | null
          product_id?: string
          stage_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stage_values_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_values_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: true
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_cycle: string | null
          canceled_at: string | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          organization_id: string | null
          payment_method: Json | null
          plan_id: string | null
          plan_type: string | null
          price_monthly: number | null
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          updated_at: string | null
        }
        Insert: {
          billing_cycle?: string | null
          canceled_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          organization_id?: string | null
          payment_method?: Json | null
          plan_id?: string | null
          plan_type?: string | null
          price_monthly?: number | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Update: {
          billing_cycle?: string | null
          canceled_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          organization_id?: string | null
          payment_method?: Json | null
          plan_id?: string | null
          plan_type?: string | null
          price_monthly?: number | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "platform_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          author_id: string
          author_role: string
          content: string
          created_at: string
          id: string
          ticket_id: string
        }
        Insert: {
          author_id: string
          author_role: string
          content: string
          created_at?: string
          id?: string
          ticket_id: string
        }
        Update: {
          author_id?: string
          author_role?: string
          content?: string
          created_at?: string
          id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_super_admin: string | null
          category: string | null
          created_at: string
          created_by: string
          id: string
          last_message_at: string
          last_message_by_role: string
          organization_id: string
          priority: Database["public"]["Enums"]["support_ticket_priority"]
          status: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          unread_for_admin: boolean
          unread_for_super_admin: boolean
          updated_at: string
        }
        Insert: {
          assigned_super_admin?: string | null
          category?: string | null
          created_at?: string
          created_by: string
          id?: string
          last_message_at?: string
          last_message_by_role?: string
          organization_id: string
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          unread_for_admin?: boolean
          unread_for_super_admin?: boolean
          updated_at?: string
        }
        Update: {
          assigned_super_admin?: string | null
          category?: string | null
          created_at?: string
          created_by?: string
          id?: string
          last_message_at?: string
          last_message_by_role?: string
          organization_id?: string
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject?: string
          unread_for_admin?: boolean
          unread_for_super_admin?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tag_automations: {
        Row: {
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          is_active: boolean
          organization_id: string
          product_id: string | null
          tag_id_to_add: string
          tag_id_to_remove: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          is_active?: boolean
          organization_id: string
          product_id?: string | null
          tag_id_to_add: string
          tag_id_to_remove?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          product_id?: string | null
          tag_id_to_add?: string
          tag_id_to_remove?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_automations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_automations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_automations_tag_id_to_add_fkey"
            columns: ["tag_id_to_add"]
            isOneToOne: false
            referencedRelation: "lead_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_automations_tag_id_to_remove_fkey"
            columns: ["tag_id_to_remove"]
            isOneToOne: false
            referencedRelation: "lead_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          lead_id: string | null
          priority: Database["public"]["Enums"]["task_priority"] | null
          product_id: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          title: string
          type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          product_id?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          title: string
          type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          product_id?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          title?: string
          type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invitations: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          squad_id: string | null
          status: string
          token: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          squad_id?: string | null
          status?: string
          token?: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          squad_id?: string | null
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invitations_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "sales_squads"
            referencedColumns: ["id"]
          },
        ]
      }
      user_availability: {
        Row: {
          created_at: string | null
          day_of_week: number
          end_time: string
          id: string
          is_available: boolean | null
          organization_id: string
          start_time: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          day_of_week: number
          end_time: string
          id?: string
          is_available?: boolean | null
          organization_id: string
          start_time: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          day_of_week?: number
          end_time?: string
          id?: string
          is_available?: boolean | null
          organization_id?: string
          start_time?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_availability_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_availability_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_availability_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges: {
        Row: {
          badge_name: string
          badge_type: string
          description: string | null
          earned_at: string
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          badge_name: string
          badge_type: string
          description?: string | null
          earned_at?: string
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          badge_name?: string
          badge_type?: string
          description?: string | null
          earned_at?: string
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      user_notification_settings: {
        Row: {
          created_at: string
          notify_appointments: boolean | null
          notify_groups: boolean | null
          notify_new_messages: boolean | null
          notify_new_tickets: boolean | null
          notify_status_change: boolean | null
          notify_unassigned_sector_tickets: boolean | null
          organization_id: string | null
          push_enabled: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          notify_appointments?: boolean | null
          notify_groups?: boolean | null
          notify_new_messages?: boolean | null
          notify_new_tickets?: boolean | null
          notify_status_change?: boolean | null
          notify_unassigned_sector_tickets?: boolean | null
          organization_id?: string | null
          push_enabled?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          notify_appointments?: boolean | null
          notify_groups?: boolean | null
          notify_new_messages?: boolean | null
          notify_new_tickets?: boolean | null
          notify_status_change?: boolean | null
          notify_unassigned_sector_tickets?: boolean | null
          organization_id?: string | null
          push_enabled?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          allow_close_pending_tickets: boolean | null
          allow_connection_actions: boolean | null
          allow_dashboard: boolean | null
          allow_groups: boolean | null
          allow_inbox_panel: boolean | null
          allow_manage_client_portfolio: boolean | null
          allow_pipeline: boolean | null
          created_at: string | null
          id: string
          organization_id: string
          updated_at: string | null
          user_id: string
          view_all_contacts: boolean | null
          view_all_kanban_cards: boolean | null
          view_all_schedules: boolean | null
          view_other_queues_conversations: boolean | null
          view_other_users_conversations: boolean | null
          view_queue_conversations: boolean | null
          view_schedules_mode: string | null
          view_unassigned_sector_tickets: boolean | null
        }
        Insert: {
          allow_close_pending_tickets?: boolean | null
          allow_connection_actions?: boolean | null
          allow_dashboard?: boolean | null
          allow_groups?: boolean | null
          allow_inbox_panel?: boolean | null
          allow_manage_client_portfolio?: boolean | null
          allow_pipeline?: boolean | null
          created_at?: string | null
          id?: string
          organization_id: string
          updated_at?: string | null
          user_id: string
          view_all_contacts?: boolean | null
          view_all_kanban_cards?: boolean | null
          view_all_schedules?: boolean | null
          view_other_queues_conversations?: boolean | null
          view_other_users_conversations?: boolean | null
          view_queue_conversations?: boolean | null
          view_schedules_mode?: string | null
          view_unassigned_sector_tickets?: boolean | null
        }
        Update: {
          allow_close_pending_tickets?: boolean | null
          allow_connection_actions?: boolean | null
          allow_dashboard?: boolean | null
          allow_groups?: boolean | null
          allow_inbox_panel?: boolean | null
          allow_manage_client_portfolio?: boolean | null
          allow_pipeline?: boolean | null
          created_at?: string | null
          id?: string
          organization_id?: string
          updated_at?: string | null
          user_id?: string
          view_all_contacts?: boolean | null
          view_all_kanban_cards?: boolean | null
          view_all_schedules?: boolean | null
          view_other_queues_conversations?: boolean | null
          view_other_users_conversations?: boolean | null
          view_queue_conversations?: boolean | null
          view_schedules_mode?: string | null
          view_unassigned_sector_tickets?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_product_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          monthly_goal: number | null
          product_id: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          monthly_goal?: number | null
          product_id: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          monthly_goal?: number | null
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_product_assignments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_status: {
        Row: {
          active_leads_count: number
          id: string
          last_status_change: string
          organization_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active_leads_count?: number
          id?: string
          last_status_change?: string
          organization_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active_leads_count?: number
          id?: string
          last_status_change?: string
          organization_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_status_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_status_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_status_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vps_receipt_results: {
        Row: {
          ai_reason: string | null
          amount: number | null
          confidence: number | null
          created_at: string
          customer_name: string | null
          id: string
          instance: string | null
          is_receipt: boolean | null
          message_id: string
          ocr_text: string | null
          phone: string | null
          pix_id: string | null
          raw_payload: Json
          received_at: string | null
          updated_at: string
        }
        Insert: {
          ai_reason?: string | null
          amount?: number | null
          confidence?: number | null
          created_at?: string
          customer_name?: string | null
          id?: string
          instance?: string | null
          is_receipt?: boolean | null
          message_id: string
          ocr_text?: string | null
          phone?: string | null
          pix_id?: string | null
          raw_payload?: Json
          received_at?: string | null
          updated_at?: string
        }
        Update: {
          ai_reason?: string | null
          amount?: number | null
          confidence?: number | null
          created_at?: string
          customer_name?: string | null
          id?: string
          instance?: string | null
          is_receipt?: boolean | null
          message_id?: string
          ocr_text?: string | null
          phone?: string | null
          pix_id?: string | null
          raw_payload?: Json
          received_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      vps_shadow_webhook_logs: {
        Row: {
          chat_id: string | null
          created_at: string
          event: string | null
          from_me: boolean | null
          id: string
          instance_id: string | null
          instance_name: string | null
          message_id: string | null
          message_type: string | null
          origin: string | null
          payload_hash: string | null
          payload_summary: Json | null
          raw_file_path: string | null
          received_at: string
          remote_jid: string | null
          source: string | null
        }
        Insert: {
          chat_id?: string | null
          created_at?: string
          event?: string | null
          from_me?: boolean | null
          id?: string
          instance_id?: string | null
          instance_name?: string | null
          message_id?: string | null
          message_type?: string | null
          origin?: string | null
          payload_hash?: string | null
          payload_summary?: Json | null
          raw_file_path?: string | null
          received_at?: string
          remote_jid?: string | null
          source?: string | null
        }
        Update: {
          chat_id?: string | null
          created_at?: string
          event?: string | null
          from_me?: boolean | null
          id?: string
          instance_id?: string | null
          instance_name?: string | null
          message_id?: string | null
          message_type?: string | null
          origin?: string | null
          payload_hash?: string | null
          payload_summary?: Json | null
          raw_file_path?: string | null
          received_at?: string
          remote_jid?: string | null
          source?: string | null
        }
        Relationships: []
      }
      webchat_agent_configs: {
        Row: {
          agent_avatar_url: string | null
          agent_name: string | null
          auto_handoff_enabled: boolean | null
          chunked_messages_enabled: boolean | null
          collect_before_chat: boolean | null
          created_at: string | null
          fallback_message: string | null
          faq: Json | null
          greeting_message: string | null
          handoff_message: string | null
          handoff_triggers: string[] | null
          id: string
          is_active: boolean | null
          knowledge_base: string | null
          max_message_length: number | null
          max_tokens: number | null
          organization_id: string
          persona_style: string | null
          product_id: string | null
          required_fields: string[] | null
          sales_context: string | null
          sales_prompt: string | null
          system_prompt: string | null
          temperature: number | null
          typing_delay_ms: number | null
          updated_at: string | null
          use_product_brain: boolean | null
          welcome_flow: Json | null
          widget_id: string
        }
        Insert: {
          agent_avatar_url?: string | null
          agent_name?: string | null
          auto_handoff_enabled?: boolean | null
          chunked_messages_enabled?: boolean | null
          collect_before_chat?: boolean | null
          created_at?: string | null
          fallback_message?: string | null
          faq?: Json | null
          greeting_message?: string | null
          handoff_message?: string | null
          handoff_triggers?: string[] | null
          id?: string
          is_active?: boolean | null
          knowledge_base?: string | null
          max_message_length?: number | null
          max_tokens?: number | null
          organization_id: string
          persona_style?: string | null
          product_id?: string | null
          required_fields?: string[] | null
          sales_context?: string | null
          sales_prompt?: string | null
          system_prompt?: string | null
          temperature?: number | null
          typing_delay_ms?: number | null
          updated_at?: string | null
          use_product_brain?: boolean | null
          welcome_flow?: Json | null
          widget_id: string
        }
        Update: {
          agent_avatar_url?: string | null
          agent_name?: string | null
          auto_handoff_enabled?: boolean | null
          chunked_messages_enabled?: boolean | null
          collect_before_chat?: boolean | null
          created_at?: string | null
          fallback_message?: string | null
          faq?: Json | null
          greeting_message?: string | null
          handoff_message?: string | null
          handoff_triggers?: string[] | null
          id?: string
          is_active?: boolean | null
          knowledge_base?: string | null
          max_message_length?: number | null
          max_tokens?: number | null
          organization_id?: string
          persona_style?: string | null
          product_id?: string | null
          required_fields?: string[] | null
          sales_context?: string | null
          sales_prompt?: string | null
          system_prompt?: string | null
          temperature?: number | null
          typing_delay_ms?: number | null
          updated_at?: string | null
          use_product_brain?: boolean | null
          welcome_flow?: Json | null
          widget_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webchat_agent_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_agent_configs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_agent_configs_widget_id_fkey"
            columns: ["widget_id"]
            isOneToOne: false
            referencedRelation: "webchat_widgets"
            referencedColumns: ["id"]
          },
        ]
      }
      webchat_assignment_events: {
        Row: {
          action: string
          conversation_id: string
          created_at: string | null
          from_user_id: string | null
          id: string
          to_user_id: string | null
        }
        Insert: {
          action: string
          conversation_id: string
          created_at?: string | null
          from_user_id?: string | null
          id?: string
          to_user_id?: string | null
        }
        Update: {
          action?: string
          conversation_id?: string
          created_at?: string | null
          from_user_id?: string | null
          id?: string
          to_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webchat_assignment_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_assignment_events_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_assignment_events_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_assignment_events_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_assignment_events_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      webchat_conversations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          assigned_user_id: string | null
          bot_locked_until: string | null
          channel: string
          closed_at: string | null
          collected_data: Json | null
          connection_id: string | null
          created_at: string | null
          ctwa_data: Json | null
          current_agent_id: string | null
          current_block_id: string | null
          current_flow_id: string | null
          current_page_url: string | null
          data_collected: boolean | null
          detected_intent: string | null
          evolution_instance_id: string | null
          first_response_at: string | null
          flow_completed: boolean | null
          flow_completed_at: string | null
          flow_source: string | null
          flow_variables: Json | null
          id: string
          last_message_at: string | null
          lead_created_at: string | null
          lead_id: string | null
          meeting_event_id: string | null
          meeting_metadata: Json | null
          meeting_scheduled_at: string | null
          metadata: Json | null
          needs_human: boolean
          orchestrator_context: string | null
          orchestrator_question_count: number
          orchestrator_state: string
          organization_id: string
          product_id: string | null
          referrer_url: string | null
          sector_id: string | null
          status: Database["public"]["Enums"]["webchat_conversation_status"]
          unread_count_agents: number | null
          updated_at: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          visitor_avatar_url: string | null
          visitor_email: string | null
          visitor_id: string
          visitor_ip: string | null
          visitor_name: string | null
          visitor_phone: string | null
          visitor_phone_normalized: string | null
          visitor_user_agent: string | null
          visitor_whatsapp: string | null
          welcome_sent_at: string | null
          widget_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          assigned_user_id?: string | null
          bot_locked_until?: string | null
          channel?: string
          closed_at?: string | null
          collected_data?: Json | null
          connection_id?: string | null
          created_at?: string | null
          ctwa_data?: Json | null
          current_agent_id?: string | null
          current_block_id?: string | null
          current_flow_id?: string | null
          current_page_url?: string | null
          data_collected?: boolean | null
          detected_intent?: string | null
          evolution_instance_id?: string | null
          first_response_at?: string | null
          flow_completed?: boolean | null
          flow_completed_at?: string | null
          flow_source?: string | null
          flow_variables?: Json | null
          id?: string
          last_message_at?: string | null
          lead_created_at?: string | null
          lead_id?: string | null
          meeting_event_id?: string | null
          meeting_metadata?: Json | null
          meeting_scheduled_at?: string | null
          metadata?: Json | null
          needs_human?: boolean
          orchestrator_context?: string | null
          orchestrator_question_count?: number
          orchestrator_state?: string
          organization_id: string
          product_id?: string | null
          referrer_url?: string | null
          sector_id?: string | null
          status?: Database["public"]["Enums"]["webchat_conversation_status"]
          unread_count_agents?: number | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_avatar_url?: string | null
          visitor_email?: string | null
          visitor_id: string
          visitor_ip?: string | null
          visitor_name?: string | null
          visitor_phone?: string | null
          visitor_phone_normalized?: string | null
          visitor_user_agent?: string | null
          visitor_whatsapp?: string | null
          welcome_sent_at?: string | null
          widget_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          assigned_user_id?: string | null
          bot_locked_until?: string | null
          channel?: string
          closed_at?: string | null
          collected_data?: Json | null
          connection_id?: string | null
          created_at?: string | null
          ctwa_data?: Json | null
          current_agent_id?: string | null
          current_block_id?: string | null
          current_flow_id?: string | null
          current_page_url?: string | null
          data_collected?: boolean | null
          detected_intent?: string | null
          evolution_instance_id?: string | null
          first_response_at?: string | null
          flow_completed?: boolean | null
          flow_completed_at?: string | null
          flow_source?: string | null
          flow_variables?: Json | null
          id?: string
          last_message_at?: string | null
          lead_created_at?: string | null
          lead_id?: string | null
          meeting_event_id?: string | null
          meeting_metadata?: Json | null
          meeting_scheduled_at?: string | null
          metadata?: Json | null
          needs_human?: boolean
          orchestrator_context?: string | null
          orchestrator_question_count?: number
          orchestrator_state?: string
          organization_id?: string
          product_id?: string | null
          referrer_url?: string | null
          sector_id?: string | null
          status?: Database["public"]["Enums"]["webchat_conversation_status"]
          unread_count_agents?: number | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_avatar_url?: string | null
          visitor_email?: string | null
          visitor_id?: string
          visitor_ip?: string | null
          visitor_name?: string | null
          visitor_phone?: string | null
          visitor_phone_normalized?: string | null
          visitor_user_agent?: string | null
          visitor_whatsapp?: string | null
          welcome_sent_at?: string | null
          widget_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webchat_conversations_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_conversations_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_conversations_current_agent_id_fkey"
            columns: ["current_agent_id"]
            isOneToOne: false
            referencedRelation: "product_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_conversations_evolution_instance_id_fkey"
            columns: ["evolution_instance_id"]
            isOneToOne: false
            referencedRelation: "evolution_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_conversations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_conversations_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_conversations_widget_id_fkey"
            columns: ["widget_id"]
            isOneToOne: false
            referencedRelation: "webchat_widgets"
            referencedColumns: ["id"]
          },
        ]
      }
      webchat_messages: {
        Row: {
          buttons: Json | null
          content: string
          content_type: string | null
          conversation_id: string
          created_at: string | null
          direction: string
          edited_at: string | null
          forwarded_from_message_id: string | null
          id: string
          is_deleted: boolean | null
          is_starred: boolean | null
          message_type: string | null
          metadata: Json | null
          original_content: string | null
          reply_to_message_id: string | null
          sender_id: string | null
          sender_type: string
          status: string | null
          video_url: string | null
        }
        Insert: {
          buttons?: Json | null
          content: string
          content_type?: string | null
          conversation_id: string
          created_at?: string | null
          direction: string
          edited_at?: string | null
          forwarded_from_message_id?: string | null
          id?: string
          is_deleted?: boolean | null
          is_starred?: boolean | null
          message_type?: string | null
          metadata?: Json | null
          original_content?: string | null
          reply_to_message_id?: string | null
          sender_id?: string | null
          sender_type: string
          status?: string | null
          video_url?: string | null
        }
        Update: {
          buttons?: Json | null
          content?: string
          content_type?: string | null
          conversation_id?: string
          created_at?: string | null
          direction?: string
          edited_at?: string | null
          forwarded_from_message_id?: string | null
          id?: string
          is_deleted?: boolean | null
          is_starred?: boolean | null
          message_type?: string | null
          metadata?: Json | null
          original_content?: string | null
          reply_to_message_id?: string | null
          sender_id?: string | null
          sender_type?: string
          status?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webchat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "webchat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_messages_forwarded_from_message_id_fkey"
            columns: ["forwarded_from_message_id"]
            isOneToOne: false
            referencedRelation: "webchat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "webchat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      webchat_widgets: {
        Row: {
          auto_open_delay: number | null
          avatar_url: string | null
          business_hours: Json | null
          collect_email: boolean | null
          collect_name: boolean | null
          collect_phone: boolean | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          offline_message: string | null
          organization_id: string
          placeholder_text: string | null
          position: string | null
          primary_color: string | null
          product_id: string | null
          secondary_color: string | null
          updated_at: string | null
          welcome_message: string | null
        }
        Insert: {
          auto_open_delay?: number | null
          avatar_url?: string | null
          business_hours?: Json | null
          collect_email?: boolean | null
          collect_name?: boolean | null
          collect_phone?: boolean | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          offline_message?: string | null
          organization_id: string
          placeholder_text?: string | null
          position?: string | null
          primary_color?: string | null
          product_id?: string | null
          secondary_color?: string | null
          updated_at?: string | null
          welcome_message?: string | null
        }
        Update: {
          auto_open_delay?: number | null
          avatar_url?: string | null
          business_hours?: Json | null
          collect_email?: boolean | null
          collect_name?: boolean | null
          collect_phone?: boolean | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          offline_message?: string | null
          organization_id?: string
          placeholder_text?: string | null
          position?: string | null
          primary_color?: string | null
          product_id?: string | null
          secondary_color?: string | null
          updated_at?: string | null
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webchat_widgets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webchat_widgets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_health: {
        Row: {
          connection_id: string | null
          created_at: string | null
          error: string | null
          flow_started: boolean | null
          id: string
          message_id: string | null
          message_type: string | null
          phone: string | null
          pixel_sent: boolean | null
          processed: boolean | null
          raw_payload: Json | null
          webhook_received: boolean | null
        }
        Insert: {
          connection_id?: string | null
          created_at?: string | null
          error?: string | null
          flow_started?: boolean | null
          id?: string
          message_id?: string | null
          message_type?: string | null
          phone?: string | null
          pixel_sent?: boolean | null
          processed?: boolean | null
          raw_payload?: Json | null
          webhook_received?: boolean | null
        }
        Update: {
          connection_id?: string | null
          created_at?: string | null
          error?: string | null
          flow_started?: boolean | null
          id?: string
          message_id?: string | null
          message_type?: string | null
          phone?: string | null
          pixel_sent?: boolean | null
          processed?: boolean | null
          raw_payload?: Json | null
          webhook_received?: boolean | null
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          chatid: string | null
          conversation_id: string | null
          created_at: string | null
          error_message: string | null
          event_type: string | null
          from_me: boolean | null
          id: string
          instance_name: string | null
          lead_id: string | null
          message_type: string | null
          messageid: string | null
          organization_id: string | null
          owner: string | null
          parsed_fields: Json | null
          phone: string | null
          processed_at: string | null
          processing_status: string | null
          processing_time_ms: number | null
          raw_payload: Json
          request_headers: Json | null
          request_id: string | null
          request_ip: string | null
          request_method: string | null
          status: string | null
          webhook_id: string | null
        }
        Insert: {
          chatid?: string | null
          conversation_id?: string | null
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string
          instance_name?: string | null
          lead_id?: string | null
          message_type?: string | null
          messageid?: string | null
          organization_id?: string | null
          owner?: string | null
          parsed_fields?: Json | null
          phone?: string | null
          processed_at?: string | null
          processing_status?: string | null
          processing_time_ms?: number | null
          raw_payload: Json
          request_headers?: Json | null
          request_id?: string | null
          request_ip?: string | null
          request_method?: string | null
          status?: string | null
          webhook_id?: string | null
        }
        Update: {
          chatid?: string | null
          conversation_id?: string | null
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string
          instance_name?: string | null
          lead_id?: string | null
          message_type?: string | null
          messageid?: string | null
          organization_id?: string | null
          owner?: string | null
          parsed_fields?: Json | null
          phone?: string | null
          processed_at?: string | null
          processing_status?: string | null
          processing_time_ms?: number | null
          raw_payload?: Json
          request_headers?: Json | null
          request_id?: string | null
          request_ip?: string | null
          request_method?: string | null
          status?: string | null
          webhook_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_logs_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_sample_requests: {
        Row: {
          created_at: string | null
          extracted_fields: Json
          id: string
          is_default: boolean | null
          name: string | null
          request_body: Json
          webhook_id: string
        }
        Insert: {
          created_at?: string | null
          extracted_fields: Json
          id?: string
          is_default?: boolean | null
          name?: string | null
          request_body: Json
          webhook_id: string
        }
        Update: {
          created_at?: string | null
          extracted_fields?: Json
          id?: string
          is_default?: boolean | null
          name?: string | null
          request_body?: Json
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_sample_requests_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          actions: Json | null
          allowed_ips: string[] | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          identification_config: Json | null
          is_active: boolean | null
          is_test_mode: boolean | null
          last_request_at: string | null
          name: string
          organization_id: string
          product_id: string | null
          requests_count: number | null
          requests_this_month: number | null
          secret_key: string | null
          slug: string
          squad_id: string | null
          updated_at: string | null
        }
        Insert: {
          actions?: Json | null
          allowed_ips?: string[] | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          identification_config?: Json | null
          is_active?: boolean | null
          is_test_mode?: boolean | null
          last_request_at?: string | null
          name: string
          organization_id: string
          product_id?: string | null
          requests_count?: number | null
          requests_this_month?: number | null
          secret_key?: string | null
          slug: string
          squad_id?: string | null
          updated_at?: string | null
        }
        Update: {
          actions?: Json | null
          allowed_ips?: string[] | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          identification_config?: Json | null
          is_active?: boolean | null
          is_test_mode?: boolean | null
          last_request_at?: string | null
          name?: string
          organization_id?: string
          product_id?: string | null
          requests_count?: number | null
          requests_this_month?: number | null
          secret_key?: string | null
          slug?: string
          squad_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhooks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhooks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_booking_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhooks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhooks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhooks_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "sales_squads"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_active_chats: {
        Row: {
          id: string
          instance_id: string | null
          last_activity_at: string | null
          last_presence_at: string | null
          remote_jid: string
        }
        Insert: {
          id?: string
          instance_id?: string | null
          last_activity_at?: string | null
          last_presence_at?: string | null
          remote_jid: string
        }
        Update: {
          id?: string
          instance_id?: string | null
          last_activity_at?: string | null
          last_presence_at?: string | null
          remote_jid?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_active_chats_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "evolution_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_message_retries: {
        Row: {
          ack_status: number | null
          content: string | null
          created_at: string | null
          id: string
          instance_id: string
          last_error: string | null
          last_status: string | null
          message_id: string
          next_retry_at: string | null
          organization_id: string
          remote_jid: string
          retry_count: number | null
          updated_at: string | null
        }
        Insert: {
          ack_status?: number | null
          content?: string | null
          created_at?: string | null
          id?: string
          instance_id: string
          last_error?: string | null
          last_status?: string | null
          message_id: string
          next_retry_at?: string | null
          organization_id: string
          remote_jid: string
          retry_count?: number | null
          updated_at?: string | null
        }
        Update: {
          ack_status?: number | null
          content?: string | null
          created_at?: string | null
          id?: string
          instance_id?: string
          last_error?: string | null
          last_status?: string | null
          message_id?: string
          next_retry_at?: string | null
          organization_id?: string
          remote_jid?: string
          retry_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_message_retries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      platform_branding_public: {
        Row: {
          accent_color: string | null
          base_font_size: number | null
          border_radius: number | null
          browser_title: string | null
          created_at: string | null
          default_language: string | null
          default_theme: string | null
          favicon_url: string | null
          font_family: string | null
          font_url: string | null
          footer_text: string | null
          gradient_custom: Json | null
          gradient_style: string | null
          hide_widget_branding: boolean | null
          id: string | null
          login_bg_image_url: string | null
          login_bg_layout: string | null
          login_headline: string | null
          login_logo_position: string | null
          login_stats_enabled: boolean | null
          login_subheadline: string | null
          logo_dark_url: string | null
          logo_url: string | null
          meta_description: string | null
          og_image_url: string | null
          platform_name: string | null
          powered_by_text: string | null
          primary_color: string | null
          privacy_url: string | null
          support_email: string | null
          terms_url: string | null
          twitter_handle: string | null
          updated_at: string | null
          widget_accent_color: string | null
        }
        Insert: {
          accent_color?: string | null
          base_font_size?: number | null
          border_radius?: number | null
          browser_title?: string | null
          created_at?: string | null
          default_language?: string | null
          default_theme?: string | null
          favicon_url?: string | null
          font_family?: string | null
          font_url?: string | null
          footer_text?: string | null
          gradient_custom?: Json | null
          gradient_style?: string | null
          hide_widget_branding?: boolean | null
          id?: string | null
          login_bg_image_url?: string | null
          login_bg_layout?: string | null
          login_headline?: string | null
          login_logo_position?: string | null
          login_stats_enabled?: boolean | null
          login_subheadline?: string | null
          logo_dark_url?: string | null
          logo_url?: string | null
          meta_description?: string | null
          og_image_url?: string | null
          platform_name?: string | null
          powered_by_text?: string | null
          primary_color?: string | null
          privacy_url?: string | null
          support_email?: string | null
          terms_url?: string | null
          twitter_handle?: string | null
          updated_at?: string | null
          widget_accent_color?: string | null
        }
        Update: {
          accent_color?: string | null
          base_font_size?: number | null
          border_radius?: number | null
          browser_title?: string | null
          created_at?: string | null
          default_language?: string | null
          default_theme?: string | null
          favicon_url?: string | null
          font_family?: string | null
          font_url?: string | null
          footer_text?: string | null
          gradient_custom?: Json | null
          gradient_style?: string | null
          hide_widget_branding?: boolean | null
          id?: string | null
          login_bg_image_url?: string | null
          login_bg_layout?: string | null
          login_headline?: string | null
          login_logo_position?: string | null
          login_stats_enabled?: boolean | null
          login_subheadline?: string | null
          logo_dark_url?: string | null
          logo_url?: string | null
          meta_description?: string | null
          og_image_url?: string | null
          platform_name?: string | null
          powered_by_text?: string | null
          primary_color?: string | null
          privacy_url?: string | null
          support_email?: string | null
          terms_url?: string | null
          twitter_handle?: string | null
          updated_at?: string | null
          widget_accent_color?: string | null
        }
        Relationships: []
      }
      public_booking_profiles: {
        Row: {
          avatar_url: string | null
          booking_bio: string | null
          booking_slug: string | null
          full_name: string | null
          id: string | null
        }
        Insert: {
          avatar_url?: string | null
          booking_bio?: string | null
          booking_slug?: string | null
          full_name?: string | null
          id?: string | null
        }
        Update: {
          avatar_url?: string | null
          booking_bio?: string | null
          booking_slug?: string | null
          full_name?: string | null
          id?: string | null
        }
        Relationships: []
      }
      v_agent_quality_30d: {
        Row: {
          agent_id: string | null
          avg_accuracy: number | null
          avg_clarity: number | null
          avg_conversion_potential: number | null
          avg_objectivity: number | null
          avg_overall: number | null
          avg_tone: number | null
          evaluations: number | null
          organization_id: string | null
        }
        Relationships: []
      }
      webhook_stats: {
        Row: {
          last_failure_at: string | null
          success_rate: number | null
          total_flow_started: number | null
          total_lost: number | null
          total_pixel_sent: number | null
          total_processed: number | null
          total_received: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_invitation: {
        Args: { invitation_token: string; user_id: string }
        Returns: boolean
      }
      apply_tag_automations: {
        Args: {
          p_event_type: string
          p_lead_id: string
          p_organization_id?: string
          p_product_id?: string
        }
        Returns: {
          action: string
          tag_id: string
        }[]
      }
      calculate_commission: {
        Args: {
          p_deal_id: string
          p_deal_value: number
          p_organization_id: string
          p_product_id: string
          p_seller_id: string
        }
        Returns: number
      }
      check_webhook_health_discrepancies: {
        Args: never
        Returns: {
          created_at: string
          message_id: string
          phone: string
          status: string
        }[]
      }
      claim_first_super_admin: { Args: never; Returns: boolean }
      cleanup_old_logs: { Args: never; Returns: undefined }
      create_product_tag_package: {
        Args: {
          p_organization_id: string
          p_product_id: string
          p_product_label: string
        }
        Returns: Json
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      delete_lead_cascade: { Args: { _lead_ids: string[] }; Returns: Json }
      delete_product_safe: {
        Args: { p_product_id: string }
        Returns: undefined
      }
      delete_team_member: { Args: { p_user_id: string }; Returns: undefined }
      distribute_lead: {
        Args: {
          p_lead_id: string
          p_organization_id: string
          p_product_id?: string
          p_squad_id: string
        }
        Returns: string
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      evaluate_routing_rules: {
        Args: {
          p_channel?: string
          p_deal_value?: number
          p_event?: string
          p_lead_id?: string
          p_organization_id: string
          p_product_id?: string
          p_stage_id?: string
          p_tag_ids?: string[]
        }
        Returns: {
          agent_id: string
          display_name: string
          role: string
          rule_id: string
          specialist_id: string
        }[]
      }
      get_booking_by_token: {
        Args: { p_token: string }
        Returns: {
          additional_info: Json
          calendar_event_id: string
          cancellation_reason: string
          confirmation_token: string
          created_at: string
          end_time: string
          event_type_id: string
          guest_email: string
          guest_name: string
          guest_phone: string
          host_user_id: string
          id: string
          organization_id: string
          start_time: string
          status: string
          timezone: string
        }[]
      }
      get_organization_effective_limits: {
        Args: { p_org_id: string }
        Returns: Json
      }
      get_product_performance: {
        Args: { p_from?: string; p_org_id: string; p_to?: string }
        Returns: Json
      }
      get_user_organization: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_sector_access: {
        Args: { _sector_id: string; _user_id: string }
        Returns: boolean
      }
      inbox_count_conversations: {
        Args: {
          p_assigned_user_ids?: string[]
          p_channel?: string
          p_include_no_product?: boolean
          p_include_no_sector?: boolean
          p_include_unassigned?: boolean
          p_product_ids?: string[]
          p_search?: string
          p_sector_ids?: string[]
          p_tag_ids?: string[]
          p_user_id: string
        }
        Returns: {
          attending: number
          resolved: number
          waiting: number
        }[]
      }
      inbox_list_conversations: {
        Args: {
          p_assigned_user_ids?: string[]
          p_channel?: string
          p_cursor_last_message_at?: string
          p_include_no_product?: boolean
          p_include_no_sector?: boolean
          p_include_unassigned?: boolean
          p_limit?: number
          p_product_ids?: string[]
          p_search?: string
          p_sector_ids?: string[]
          p_tab?: string
          p_tag_ids?: string[]
          p_user_id: string
        }
        Returns: {
          accepted_at: string
          accepted_by: string
          assigned_user_avatar: string
          assigned_user_id: string
          assigned_user_name: string
          channel: string
          closed_at: string
          created_at: string
          current_agent_avatar: string
          current_agent_id: string
          current_agent_name: string
          effective_product_id: string
          effective_product_name: string
          evolution_instance_id: string
          id: string
          last_message_at: string
          lead_email: string
          lead_id: string
          lead_name: string
          lead_origin: string
          lead_phone: string
          lead_product_id: string
          needs_human: boolean
          organization_id: string
          product_id: string
          sector_color: string
          sector_id: string
          sector_name: string
          status: string
          unread_count_agents: number
          updated_at: string
          visitor_avatar_url: string
          visitor_email: string
          visitor_id: string
          visitor_name: string
          visitor_phone: string
          visitor_whatsapp: string
          widget_id: string
          widget_name: string
          widget_primary_color: string
          widget_product_id: string
        }[]
      }
      increment_form_submissions_count: {
        Args: { p_form_id: string }
        Returns: undefined
      }
      increment_form_views: { Args: { p_form_id: string }; Returns: undefined }
      increment_funnel_leads: {
        Args: { p_channel: string; p_funnel_id: string }
        Returns: undefined
      }
      increment_funnel_views: {
        Args: { p_channel: string; p_funnel_id: string }
        Returns: undefined
      }
      increment_webhook_requests: {
        Args: { p_webhook_id: string }
        Returns: undefined
      }
      initialize_user_permissions: {
        Args: { p_organization_id: string; p_role?: string; p_user_id: string }
        Returns: undefined
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_system_initialized: { Args: never; Returns: boolean }
      is_within_business_hours: { Args: { p_org_id: string }; Returns: boolean }
      mark_funnel_completed_on_lead: {
        Args: { p_funnel_id: string; p_lead_id: string }
        Returns: undefined
      }
      mark_super_admin_password_changed: { Args: never; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      normalize_phone_br: { Args: { p: string }; Returns: string }
      pick_prompt_variant: {
        Args: { p_experiment_id: string; p_seed: string }
        Returns: {
          label: string
          prompt_mode: string
          prompt_override: string
          variant_id: string
        }[]
      }
      process_pending_queue: {
        Args: { p_user_id: string }
        Returns: {
          assigned_lead_id: string
          assigned_squad_id: string
        }[]
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      record_variant_impression: {
        Args: { p_variant_id: string }
        Returns: undefined
      }
      record_variant_score: {
        Args: { p_score: number; p_variant_id: string }
        Returns: undefined
      }
      release_bot_lock: { Args: { p_conv: string }; Returns: undefined }
      remove_lifecycle_tags_on_event: {
        Args: {
          p_event_type: string
          p_lead_id: string
          p_organization_id?: string
          p_product_id?: string
        }
        Returns: {
          action: string
          tag_id: string
        }[]
      }
      reset_monthly_webhook_requests: { Args: never; Returns: undefined }
      search_catalog_smart: {
        Args: {
          p_attribute_filters?: Json
          p_limit?: number
          p_organization_id: string
          p_price_max?: number
          p_price_min?: number
          p_product_id?: string
          p_query?: string
          p_tags?: string[]
        }
        Returns: {
          attributes: Json
          currency: string
          description: string
          documents: Json
          id: string
          images: Json
          match_score: number
          match_strategy: string
          price: number
          tags: string[]
          thumbnail_url: string
          title: string
          url: string
          videos: Json
        }[]
      }
      search_lead_memory: {
        Args: {
          p_lead_id: string
          p_match_count?: number
          p_min_similarity?: number
          p_query_embedding: string
        }
        Returns: {
          content: string
          created_at: string
          id: string
          importance_score: number
          metadata: Json
          role: string
          similarity: number
          source: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      try_acquire_conversation_lock: {
        Args: { p_conv: string; p_ttl_ms?: number }
        Returns: boolean
      }
      try_lock_bot: {
        Args: { p_conv: string; p_ttl_seconds?: number }
        Returns: boolean
      }
      user_belongs_to_organization: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      user_in_sector_organization: {
        Args: { _sector_id: string; _user_id: string }
        Returns: boolean
      }
      user_sector_ids: { Args: { _user_id: string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "manager" | "seller" | "super_admin"
      interaction_channel:
        | "whatsapp"
        | "email"
        | "phone"
        | "instagram"
        | "telegram"
        | "other"
      lead_temperature: "hot" | "warm" | "cold"
      notification_type:
        | "cadence"
        | "urgency"
        | "opportunity"
        | "audit"
        | "system"
      product_status: "draft" | "review" | "published" | "archived"
      sector_rotation_strategy: "round_robin" | "least_busy" | "random"
      support_ticket_priority: "low" | "normal" | "high" | "urgent"
      support_ticket_status: "open" | "in_progress" | "resolved" | "closed"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status: "pending" | "in_progress" | "completed" | "overdue"
      webchat_conversation_status:
        | "bot_active"
        | "waiting_human"
        | "human_active"
        | "closed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "manager", "seller", "super_admin"],
      interaction_channel: [
        "whatsapp",
        "email",
        "phone",
        "instagram",
        "telegram",
        "other",
      ],
      lead_temperature: ["hot", "warm", "cold"],
      notification_type: [
        "cadence",
        "urgency",
        "opportunity",
        "audit",
        "system",
      ],
      product_status: ["draft", "review", "published", "archived"],
      sector_rotation_strategy: ["round_robin", "least_busy", "random"],
      support_ticket_priority: ["low", "normal", "high", "urgent"],
      support_ticket_status: ["open", "in_progress", "resolved", "closed"],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["pending", "in_progress", "completed", "overdue"],
      webchat_conversation_status: [
        "bot_active",
        "waiting_human",
        "human_active",
        "closed",
      ],
    },
  },
} as const
