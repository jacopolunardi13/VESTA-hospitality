// Generato manualmente da supabase/schema.sql (0001) + supabase/migrations/0002_enum_en_seed_constraints.sql
// Equivalente a: supabase gen types typescript --project-id <id> > src/lib/supabase/database.types.ts
// Aggiornare dopo ogni migrazione applicata al progetto remoto.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
      }

      org_members: {
        Row: {
          id: string
          org_id: string
          user_id: string
          role: 'owner' | 'manager' | 'staff'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          user_id: string
          role?: 'owner' | 'manager' | 'staff'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          user_id?: string
          role?: 'owner' | 'manager' | 'staff'
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: 'org_members_org_id_fkey'; columns: ['org_id']; referencedRelation: 'organizations'; referencedColumns: ['id'] },
          { foreignKeyName: 'org_members_user_id_fkey'; columns: ['user_id']; referencedRelation: 'users'; referencedColumns: ['id'] },
        ]
      }

      properties: {
        Row: {
          id: string
          org_id: string
          name: string
          address: string | null
          city: string | null
          timezone: string
          default_language: string
          settings: Json
          supervision_mode: boolean
          knowledge_learning_mode: 'manual' | 'assisted' | 'automatic'
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          address?: string | null
          city?: string | null
          timezone?: string
          default_language?: string
          settings?: Json
          supervision_mode?: boolean
          knowledge_learning_mode?: 'manual' | 'assisted' | 'automatic'
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          name?: string
          address?: string | null
          city?: string | null
          timezone?: string
          default_language?: string
          settings?: Json
          supervision_mode?: boolean
          knowledge_learning_mode?: 'manual' | 'assisted' | 'automatic'
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          { foreignKeyName: 'properties_org_id_fkey'; columns: ['org_id']; referencedRelation: 'organizations'; referencedColumns: ['id'] },
        ]
      }

      rooms: {
        Row: {
          id: string
          org_id: string
          property_id: string
          name: string
          max_guests: number
          description: string | null
          sort_order: number
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          property_id: string
          name: string
          max_guests: number
          description?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          property_id?: string
          name?: string
          max_guests?: number
          description?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          { foreignKeyName: 'rooms_org_id_fkey'; columns: ['org_id']; referencedRelation: 'organizations'; referencedColumns: ['id'] },
          { foreignKeyName: 'rooms_property_id_fkey'; columns: ['property_id']; referencedRelation: 'properties'; referencedColumns: ['id'] },
        ]
      }

      rate_calendar: {
        Row: {
          id: string
          org_id: string
          property_id: string
          room_id: string
          date: string
          price_cents: number | null
          currency: string
          available: 0 | 1
          min_stay: number
          closed_arrival: boolean
          closed_departure: boolean
          source: 'manual' | 'csv' | 'ical' | 'api'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          property_id: string
          room_id: string
          date: string
          price_cents?: number | null
          currency?: string
          available?: 0 | 1
          min_stay?: number
          closed_arrival?: boolean
          closed_departure?: boolean
          source?: 'manual' | 'csv' | 'ical' | 'api'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          property_id?: string
          room_id?: string
          date?: string
          price_cents?: number | null
          currency?: string
          available?: 0 | 1
          min_stay?: number
          closed_arrival?: boolean
          closed_departure?: boolean
          source?: 'manual' | 'csv' | 'ical' | 'api'
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: 'rate_calendar_room_id_fkey'; columns: ['room_id']; referencedRelation: 'rooms'; referencedColumns: ['id'] },
        ]
      }

      ical_feeds: {
        Row: {
          id: string
          org_id: string
          property_id: string
          room_id: string
          url: string
          last_sync_at: string | null
          last_status: string | null
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          property_id: string
          room_id: string
          url: string
          last_sync_at?: string | null
          last_status?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          property_id?: string
          room_id?: string
          url?: string
          last_sync_at?: string | null
          last_status?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: 'ical_feeds_room_id_fkey'; columns: ['room_id']; referencedRelation: 'rooms'; referencedColumns: ['id'] },
        ]
      }

      knowledge_assets: {
        Row: {
          id: string
          org_id: string
          property_id: string
          type: 'faq' | 'brochure' | 'pdf' | 'procedura' | 'policy' | 'correzione'
          origin: 'import' | 'manual' | 'correction' | 'gap'
          title: string
          content: string | null
          file_path: string | null
          languages: string[]
          tags: string[]
          usable_by_concierge: boolean
          attachable: boolean
          priority: number
          supersedes_asset_id: string | null
          current_version: number
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          property_id: string
          type: 'faq' | 'brochure' | 'pdf' | 'procedura' | 'policy' | 'correzione'
          origin?: 'import' | 'manual' | 'correction' | 'gap'
          title: string
          content?: string | null
          file_path?: string | null
          languages?: string[]
          tags?: string[]
          usable_by_concierge?: boolean
          attachable?: boolean
          priority?: number
          supersedes_asset_id?: string | null
          current_version?: number
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          property_id?: string
          type?: 'faq' | 'brochure' | 'pdf' | 'procedura' | 'policy' | 'correzione'
          origin?: 'import' | 'manual' | 'correction' | 'gap'
          title?: string
          content?: string | null
          file_path?: string | null
          languages?: string[]
          tags?: string[]
          usable_by_concierge?: boolean
          attachable?: boolean
          priority?: number
          supersedes_asset_id?: string | null
          current_version?: number
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          { foreignKeyName: 'knowledge_assets_supersedes_asset_id_fkey'; columns: ['supersedes_asset_id']; referencedRelation: 'knowledge_assets'; referencedColumns: ['id'] },
        ]
      }

      knowledge_asset_versions: {
        Row: {
          id: string
          org_id: string
          asset_id: string
          version: number
          title: string
          content: string | null
          edited_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          asset_id: string
          version: number
          title: string
          content?: string | null
          edited_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          asset_id?: string
          version?: number
          title?: string
          content?: string | null
          edited_by?: string | null
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: 'knowledge_asset_versions_asset_id_fkey'; columns: ['asset_id']; referencedRelation: 'knowledge_assets'; referencedColumns: ['id'] },
        ]
      }

      knowledge_embeddings: {
        Row: {
          id: string
          org_id: string
          property_id: string
          asset_id: string
          chunk_index: number
          chunk_text: string
          provider: string
          model: string
          dim: number
          embedding: string  // pgvector returned as string representation
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          property_id: string
          asset_id: string
          chunk_index?: number
          chunk_text: string
          provider: string
          model: string
          dim: number
          embedding: string
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          property_id?: string
          asset_id?: string
          chunk_index?: number
          chunk_text?: string
          provider?: string
          model?: string
          dim?: number
          embedding?: string
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: 'knowledge_embeddings_asset_id_fkey'; columns: ['asset_id']; referencedRelation: 'knowledge_assets'; referencedColumns: ['id'] },
        ]
      }

      conversations: {
        Row: {
          id: string
          org_id: string
          property_id: string
          source: ConversationSource
          source_category: 'direct' | 'ota' | 'social' | 'manual'  // generated column
          source_detail: string | null
          guest_name: string | null
          guest_contact: string | null
          language: string
          status: 'open' | 'pending_staff' | 'closed'
          booking_request_id: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          property_id: string
          source?: ConversationSource
          source_detail?: string | null
          guest_name?: string | null
          guest_contact?: string | null
          language?: string
          status?: 'open' | 'pending_staff' | 'closed'
          booking_request_id?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          property_id?: string
          source?: ConversationSource
          source_detail?: string | null
          guest_name?: string | null
          guest_contact?: string | null
          language?: string
          status?: 'open' | 'pending_staff' | 'closed'
          booking_request_id?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          { foreignKeyName: 'conversations_property_id_fkey'; columns: ['property_id']; referencedRelation: 'properties'; referencedColumns: ['id'] },
          { foreignKeyName: 'conversations_booking_request_fk'; columns: ['booking_request_id']; referencedRelation: 'booking_requests'; referencedColumns: ['id'] },
        ]
      }

      messages: {
        Row: {
          id: string
          org_id: string
          property_id: string
          conversation_id: string
          direction: 'in' | 'out'
          sender: 'guest' | 'ai' | 'staff'
          content: string
          ai_call_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          property_id: string
          conversation_id: string
          direction: 'in' | 'out'
          sender: 'guest' | 'ai' | 'staff'
          content: string
          ai_call_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          property_id?: string
          conversation_id?: string
          direction?: 'in' | 'out'
          sender?: 'guest' | 'ai' | 'staff'
          content?: string
          ai_call_id?: string | null
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: 'messages_conversation_id_fkey'; columns: ['conversation_id']; referencedRelation: 'conversations'; referencedColumns: ['id'] },
          { foreignKeyName: 'messages_ai_call_fk'; columns: ['ai_call_id']; referencedRelation: 'ai_calls'; referencedColumns: ['id'] },
        ]
      }

      booking_requests: {
        Row: {
          id: string
          org_id: string
          property_id: string
          conversation_id: string | null
          source: ConversationSource
          source_category: 'direct' | 'ota' | 'social' | 'manual'  // generated column
          source_detail: string | null
          guest_name: string | null
          guest_contact: string | null
          language: string
          check_in: string | null
          check_out: string | null
          adults: number | null
          children: Json
          special_requests: string | null
          status: BookingStatus
          priority: 'high' | 'medium' | 'low'
          lead_score: number
          data_reliability: 'high' | 'medium' | 'low' | null
          gross_total_cents: number | null
          discount_pct: number | null
          offer_total_cents: number | null
          city_tax_cents: number | null
          currency: string
          price_source: 'csv' | 'manual' | 'ical' | 'api' | 'ota_stimato' | null
          ai_classification: Json | null
          proposal_sent_at: string | null
          interested_at: string | null
          hold_expires_at: string | null
          payment_received_at: string | null
          offer_expires_at: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          property_id: string
          conversation_id?: string | null
          source?: ConversationSource
          source_detail?: string | null
          guest_name?: string | null
          guest_contact?: string | null
          language?: string
          check_in?: string | null
          check_out?: string | null
          adults?: number | null
          children?: Json
          special_requests?: string | null
          status?: BookingStatus
          priority?: 'high' | 'medium' | 'low'
          lead_score?: number
          data_reliability?: 'high' | 'medium' | 'low' | null
          gross_total_cents?: number | null
          discount_pct?: number | null
          offer_total_cents?: number | null
          city_tax_cents?: number | null
          currency?: string
          price_source?: 'csv' | 'manual' | 'ical' | 'api' | 'ota_stimato' | null
          ai_classification?: Json | null
          proposal_sent_at?: string | null
          interested_at?: string | null
          hold_expires_at?: string | null
          payment_received_at?: string | null
          offer_expires_at?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          property_id?: string
          conversation_id?: string | null
          source?: ConversationSource
          source_detail?: string | null
          guest_name?: string | null
          guest_contact?: string | null
          language?: string
          check_in?: string | null
          check_out?: string | null
          adults?: number | null
          children?: Json
          special_requests?: string | null
          status?: BookingStatus
          priority?: 'high' | 'medium' | 'low'
          lead_score?: number
          data_reliability?: 'high' | 'medium' | 'low' | null
          gross_total_cents?: number | null
          discount_pct?: number | null
          offer_total_cents?: number | null
          city_tax_cents?: number | null
          currency?: string
          price_source?: 'csv' | 'manual' | 'ical' | 'api' | 'ota_stimato' | null
          ai_classification?: Json | null
          proposal_sent_at?: string | null
          interested_at?: string | null
          hold_expires_at?: string | null
          payment_received_at?: string | null
          offer_expires_at?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          { foreignKeyName: 'booking_requests_property_id_fkey'; columns: ['property_id']; referencedRelation: 'properties'; referencedColumns: ['id'] },
          { foreignKeyName: 'booking_requests_conversation_id_fkey'; columns: ['conversation_id']; referencedRelation: 'conversations'; referencedColumns: ['id'] },
        ]
      }

      booking_request_items: {
        Row: {
          id: string
          org_id: string
          booking_request_id: string
          room_id: string
          date: string
          price_cents: number
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          booking_request_id: string
          room_id: string
          date: string
          price_cents: number
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          booking_request_id?: string
          room_id?: string
          date?: string
          price_cents?: number
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: 'booking_request_items_booking_request_id_fkey'; columns: ['booking_request_id']; referencedRelation: 'booking_requests'; referencedColumns: ['id'] },
          { foreignKeyName: 'booking_request_items_room_id_fkey'; columns: ['room_id']; referencedRelation: 'rooms'; referencedColumns: ['id'] },
        ]
      }

      booking_request_events: {
        Row: {
          id: string
          org_id: string
          booking_request_id: string
          from_status: string | null
          to_status: string
          actor: 'system' | 'staff' | 'guest'
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          booking_request_id: string
          from_status?: string | null
          to_status: string
          actor: 'system' | 'staff' | 'guest'
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          booking_request_id?: string
          from_status?: string | null
          to_status?: string
          actor?: 'system' | 'staff' | 'guest'
          note?: string | null
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: 'booking_request_events_booking_request_id_fkey'; columns: ['booking_request_id']; referencedRelation: 'booking_requests'; referencedColumns: ['id'] },
        ]
      }

      scoring_events: {
        Row: {
          id: string
          org_id: string
          booking_request_id: string
          event: string
          delta: number
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          booking_request_id: string
          event: string
          delta: number
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          booking_request_id?: string
          event?: string
          delta?: number
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: 'scoring_events_booking_request_id_fkey'; columns: ['booking_request_id']; referencedRelation: 'booking_requests'; referencedColumns: ['id'] },
        ]
      }

      templates: {
        Row: {
          id: string
          org_id: string | null
          property_id: string | null
          code: string
          channel: 'email' | 'whatsapp' | 'web'
          language: string
          ota_safe: boolean
          subject: string | null
          body: string
          active: boolean
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          org_id?: string | null
          property_id?: string | null
          code: string
          channel: 'email' | 'whatsapp' | 'web'
          language?: string
          ota_safe?: boolean
          subject?: string | null
          body: string
          active?: boolean
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          org_id?: string | null
          property_id?: string | null
          code?: string
          channel?: 'email' | 'whatsapp' | 'web'
          language?: string
          ota_safe?: boolean
          subject?: string | null
          body?: string
          active?: boolean
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
      }

      followup_rules: {
        Row: {
          id: string
          org_id: string
          property_id: string
          trigger_status: string
          delay_minutes: number
          template_code: string
          conditions: Json
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          property_id: string
          trigger_status: string
          delay_minutes?: number
          template_code: string
          conditions?: Json
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          property_id?: string
          trigger_status?: string
          delay_minutes?: number
          template_code?: string
          conditions?: Json
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: 'followup_rules_property_id_fkey'; columns: ['property_id']; referencedRelation: 'properties'; referencedColumns: ['id'] },
        ]
      }

      followup_jobs: {
        Row: {
          id: string
          org_id: string
          property_id: string
          booking_request_id: string
          rule_id: string | null
          due_at: string
          status: 'pending' | 'done' | 'cancelled' | 'failed'
          executed_at: string | null
          result: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          property_id: string
          booking_request_id: string
          rule_id?: string | null
          due_at: string
          status?: 'pending' | 'done' | 'cancelled' | 'failed'
          executed_at?: string | null
          result?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          property_id?: string
          booking_request_id?: string
          rule_id?: string | null
          due_at?: string
          status?: 'pending' | 'done' | 'cancelled' | 'failed'
          executed_at?: string | null
          result?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: 'followup_jobs_booking_request_id_fkey'; columns: ['booking_request_id']; referencedRelation: 'booking_requests'; referencedColumns: ['id'] },
          { foreignKeyName: 'followup_jobs_rule_id_fkey'; columns: ['rule_id']; referencedRelation: 'followup_rules'; referencedColumns: ['id'] },
        ]
      }

      ai_calls: {
        Row: {
          id: string
          org_id: string | null
          property_id: string | null
          function: 'classify' | 'extract' | 'generate_reply' | 'select_template' | 'distill_kb'
          provider: string
          model: string
          input_tokens: number | null
          output_tokens: number | null
          latency_ms: number | null
          success: boolean
          error: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id?: string | null
          property_id?: string | null
          function: 'classify' | 'extract' | 'generate_reply' | 'select_template' | 'distill_kb'
          provider: string
          model: string
          input_tokens?: number | null
          output_tokens?: number | null
          latency_ms?: number | null
          success?: boolean
          error?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string | null
          property_id?: string | null
          function?: 'classify' | 'extract' | 'generate_reply' | 'select_template' | 'distill_kb'
          provider?: string
          model?: string
          input_tokens?: number | null
          output_tokens?: number | null
          latency_ms?: number | null
          success?: boolean
          error?: string | null
          created_at?: string
        }
        Relationships: []
      }

      kb_suggestions: {
        Row: {
          id: string
          org_id: string
          property_id: string
          message_id: string | null
          kind: 'correction' | 'gap'
          original_text: string | null
          corrected_text: string | null
          suggested_question: string | null
          suggested_answer: string | null
          language: string
          conflict_asset_id: string | null
          similarity: number | null
          status: 'proposed' | 'in_review' | 'published' | 'rejected'
          created_by: string | null
          approved_by: string | null
          auto_approved: boolean
          published_asset_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          property_id: string
          message_id?: string | null
          kind: 'correction' | 'gap'
          original_text?: string | null
          corrected_text?: string | null
          suggested_question?: string | null
          suggested_answer?: string | null
          language?: string
          conflict_asset_id?: string | null
          similarity?: number | null
          status?: 'proposed' | 'in_review' | 'published' | 'rejected'
          created_by?: string | null
          approved_by?: string | null
          auto_approved?: boolean
          published_asset_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          property_id?: string
          message_id?: string | null
          kind?: 'correction' | 'gap'
          original_text?: string | null
          corrected_text?: string | null
          suggested_question?: string | null
          suggested_answer?: string | null
          language?: string
          conflict_asset_id?: string | null
          similarity?: number | null
          status?: 'proposed' | 'in_review' | 'published' | 'rejected'
          created_by?: string | null
          approved_by?: string | null
          auto_approved?: boolean
          published_asset_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: 'kb_suggestions_message_id_fkey'; columns: ['message_id']; referencedRelation: 'messages'; referencedColumns: ['id'] },
          { foreignKeyName: 'kb_suggestions_conflict_asset_id_fkey'; columns: ['conflict_asset_id']; referencedRelation: 'knowledge_assets'; referencedColumns: ['id'] },
          { foreignKeyName: 'kb_suggestions_published_asset_id_fkey'; columns: ['published_asset_id']; referencedRelation: 'knowledge_assets'; referencedColumns: ['id'] },
        ]
      }
    }

    Views: Record<string, never>

    Functions: {
      user_in_org: {
        Args: { p_org: string }
        Returns: boolean
      }
      enroll_user_in_org: {
        Args: { p_org_id: string; p_user_id: string; p_role?: string }
        Returns: void
      }
      transition_booking_request: {
        Args: {
          p_request_id: string
          p_org_id: string
          p_to_status: string
          p_actor: string
          p_note?: string | null
          p_gross_total_cents?: number | null
          p_discount_pct?: number | null
          p_offer_total_cents?: number | null
          p_city_tax_cents?: number | null
          p_price_source?: string | null
          p_data_reliability?: string | null
        }
        Returns: {
          ok: boolean
          from?: string
          to?: string
          error?: string
        }
      }
    }

    Enums: Record<string, never>

    CompositeTypes: Record<string, never>
  }
}

// ---------------------------------------------------------------------------
// Tipi helper — usati in tutto il frontend
// ---------------------------------------------------------------------------

export type BookingStatus =
  | 'received'
  | 'proposal_sent'
  | 'interested'
  | 'to_verify'
  | 'availability_blocked'
  | 'awaiting_payment'
  | 'confirmed'
  | 'expired'
  | 'rejected'
  | 'cancelled'

export type ConversationSource =
  | 'website_chat'
  | 'website_form'
  | 'whatsapp'
  | 'email'
  | 'booking_message'
  | 'expedia_message'
  | 'airbnb_message'
  | 'ota_other'
  | 'google_business'
  | 'instagram_dm'
  | 'facebook_messenger'
  | 'direct_phone'
  | 'walk_in'
  | 'manual'

// Scorciatoie per i Row type delle tabelle più usate
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
