// Generated from the Supabase schema (Supabase MCP generate_typescript_types).
// Regenerate after every migration; do not edit by hand.

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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_events: {
        Row: {
          actor_id: string | null
          actor_type: Database["public"]["Enums"]["actor_type"]
          case_id: string | null
          created_at: string
          event_summary: string
          event_type: string
          id: string
          merchant_id: string
          metadata_json: Json
          origin: Database["public"]["Enums"]["data_origin"]
        }
        Insert: {
          actor_id?: string | null
          actor_type: Database["public"]["Enums"]["actor_type"]
          case_id?: string | null
          created_at?: string
          event_summary: string
          event_type: string
          id?: string
          merchant_id: string
          metadata_json?: Json
          origin: Database["public"]["Enums"]["data_origin"]
        }
        Update: {
          actor_id?: string | null
          actor_type?: Database["public"]["Enums"]["actor_type"]
          case_id?: string | null
          created_at?: string
          event_summary?: string
          event_type?: string
          id?: string
          merchant_id?: string
          metadata_json?: Json
          origin?: Database["public"]["Enums"]["data_origin"]
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_merchant_id_case_id_fkey"
            columns: ["merchant_id", "case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["merchant_id", "id"]
          },
          {
            foreignKeyName: "audit_events_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          case_number: string
          claimed_issue: string
          created_at: string
          created_by: string | null
          currency_code: string
          customer_display_name: string
          customer_email: string | null
          customer_message: string
          id: string
          merchant_id: string
          order_id: string
          origin: Database["public"]["Enums"]["data_origin"]
          priority: Database["public"]["Enums"]["case_priority"]
          request_category: Database["public"]["Enums"]["request_category"]
          requested_amount_minor: number | null
          status: Database["public"]["Enums"]["case_status"]
          supporting_details: string | null
          updated_at: string
        }
        Insert: {
          case_number?: string
          claimed_issue: string
          created_at?: string
          created_by?: string | null
          currency_code: string
          customer_display_name: string
          customer_email?: string | null
          customer_message: string
          id?: string
          merchant_id: string
          order_id: string
          origin: Database["public"]["Enums"]["data_origin"]
          priority?: Database["public"]["Enums"]["case_priority"]
          request_category: Database["public"]["Enums"]["request_category"]
          requested_amount_minor?: number | null
          status?: Database["public"]["Enums"]["case_status"]
          supporting_details?: string | null
          updated_at?: string
        }
        Update: {
          case_number?: string
          claimed_issue?: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          customer_display_name?: string
          customer_email?: string | null
          customer_message?: string
          id?: string
          merchant_id?: string
          order_id?: string
          origin?: Database["public"]["Enums"]["data_origin"]
          priority?: Database["public"]["Enums"]["case_priority"]
          request_category?: Database["public"]["Enums"]["request_category"]
          requested_amount_minor?: number | null
          status?: Database["public"]["Enums"]["case_status"]
          supporting_details?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cases_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_merchant_id_order_id_fkey"
            columns: ["merchant_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["merchant_id", "id"]
          },
        ]
      }
      investigations: {
        Row: {
          case_id: string
          created_at: string
          created_by: string | null
          eligibility_result: Json
          id: string
          input_context_hash: string
          merchant_id: string
          model_id: string
          model_provider: string
          policy_version_snapshot: Json
          prompt_version: string
          recommendation_json: Json
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by?: string | null
          eligibility_result: Json
          id?: string
          input_context_hash: string
          merchant_id: string
          model_id: string
          model_provider: string
          policy_version_snapshot: Json
          prompt_version: string
          recommendation_json: Json
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string | null
          eligibility_result?: Json
          id?: string
          input_context_hash?: string
          merchant_id?: string
          model_id?: string
          model_provider?: string
          policy_version_snapshot?: Json
          prompt_version?: string
          recommendation_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "investigations_merchant_id_case_id_fkey"
            columns: ["merchant_id", "case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["merchant_id", "id"]
          },
        ]
      }
      merchant_members: {
        Row: {
          created_at: string
          id: string
          merchant_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          merchant_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          merchant_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_members_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchants: {
        Row: {
          created_at: string
          default_currency: string
          id: string
          is_demo: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_currency?: string
          id?: string
          is_demo?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_currency?: string
          id?: string
          is_demo?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          captured_at: string | null
          created_at: string
          currency_code: string
          description: string
          external_order_reference: string
          id: string
          merchant_id: string
          origin: Database["public"]["Enums"]["data_origin"]
          original_amount_minor: number
          payment_state: Database["public"]["Enums"]["order_payment_state"]
          paypal_capture_id: string | null
          paypal_order_id: string | null
          updated_at: string
        }
        Insert: {
          captured_at?: string | null
          created_at?: string
          currency_code: string
          description: string
          external_order_reference: string
          id?: string
          merchant_id: string
          origin: Database["public"]["Enums"]["data_origin"]
          original_amount_minor: number
          payment_state: Database["public"]["Enums"]["order_payment_state"]
          paypal_capture_id?: string | null
          paypal_order_id?: string | null
          updated_at?: string
        }
        Update: {
          captured_at?: string | null
          created_at?: string
          currency_code?: string
          description?: string
          external_order_reference?: string
          id?: string
          merchant_id?: string
          origin?: Database["public"]["Enums"]["data_origin"]
          original_amount_minor?: number
          payment_state?: Database["public"]["Enums"]["order_payment_state"]
          paypal_capture_id?: string | null
          paypal_order_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_clauses: {
        Row: {
          clause_key: string
          clause_type: Database["public"]["Enums"]["clause_type"]
          content: string
          created_at: string
          id: string
          merchant_id: string
          policy_id: string
          position: number
          title: string
        }
        Insert: {
          clause_key: string
          clause_type: Database["public"]["Enums"]["clause_type"]
          content: string
          created_at?: string
          id?: string
          merchant_id: string
          policy_id: string
          position?: number
          title: string
        }
        Update: {
          clause_key?: string
          clause_type?: Database["public"]["Enums"]["clause_type"]
          content?: string
          created_at?: string
          id?: string
          merchant_id?: string
          policy_id?: string
          position?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "policy_clauses_merchant_id_policy_id_fkey"
            columns: ["merchant_id", "policy_id"]
            isOneToOne: false
            referencedRelation: "return_policies"
            referencedColumns: ["merchant_id", "id"]
          },
        ]
      }
      refund_attempts: {
        Row: {
          approved_amount_minor: number
          approved_at: string
          approved_by: string | null
          capture_id: string | null
          case_id: string
          created_at: string
          currency_code: string
          error_code: string | null
          id: string
          idempotency_key: string
          investigation_id: string | null
          merchant_id: string
          order_id: string
          origin: Database["public"]["Enums"]["data_origin"]
          paypal_debug_id: string | null
          paypal_refund_id: string | null
          request_hash: string
          response_code: number | null
          response_summary: Json | null
          status: Database["public"]["Enums"]["refund_attempt_status"]
          updated_at: string
        }
        Insert: {
          approved_amount_minor: number
          approved_at: string
          approved_by?: string | null
          capture_id?: string | null
          case_id: string
          created_at?: string
          currency_code: string
          error_code?: string | null
          id?: string
          idempotency_key: string
          investigation_id?: string | null
          merchant_id: string
          order_id: string
          origin: Database["public"]["Enums"]["data_origin"]
          paypal_debug_id?: string | null
          paypal_refund_id?: string | null
          request_hash: string
          response_code?: number | null
          response_summary?: Json | null
          status?: Database["public"]["Enums"]["refund_attempt_status"]
          updated_at?: string
        }
        Update: {
          approved_amount_minor?: number
          approved_at?: string
          approved_by?: string | null
          capture_id?: string | null
          case_id?: string
          created_at?: string
          currency_code?: string
          error_code?: string | null
          id?: string
          idempotency_key?: string
          investigation_id?: string | null
          merchant_id?: string
          order_id?: string
          origin?: Database["public"]["Enums"]["data_origin"]
          paypal_debug_id?: string | null
          paypal_refund_id?: string | null
          request_hash?: string
          response_code?: number | null
          response_summary?: Json | null
          status?: Database["public"]["Enums"]["refund_attempt_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_attempts_merchant_id_case_id_fkey"
            columns: ["merchant_id", "case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["merchant_id", "id"]
          },
          {
            foreignKeyName: "refund_attempts_merchant_id_investigation_id_fkey"
            columns: ["merchant_id", "investigation_id"]
            isOneToOne: false
            referencedRelation: "investigations"
            referencedColumns: ["merchant_id", "id"]
          },
          {
            foreignKeyName: "refund_attempts_merchant_id_order_id_fkey"
            columns: ["merchant_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["merchant_id", "id"]
          },
        ]
      }
      return_policies: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          description: string | null
          effective_from: string
          effective_until: string | null
          id: string
          is_active: boolean
          merchant_id: string
          name: string
          return_window_days: number | null
          updated_at: string
          version: number
        }
        Insert: {
          content?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          effective_from: string
          effective_until?: string | null
          id?: string
          is_active?: boolean
          merchant_id: string
          name: string
          return_window_days?: number | null
          updated_at?: string
          version: number
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          effective_from?: string
          effective_until?: string | null
          id?: string
          is_active?: boolean
          merchant_id?: string
          name?: string
          return_window_days?: number | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "return_policies_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      actor_type: "user" | "system" | "ai"
      case_priority: "low" | "normal" | "high" | "urgent"
      case_status:
        | "NEW"
        | "INVESTIGATING"
        | "NEEDS_EVIDENCE"
        | "NEEDS_REVIEW"
        | "READY_FOR_APPROVAL"
        | "REFUND_PENDING"
        | "REFUNDED"
        | "NOT_ELIGIBLE"
        | "REFUND_FAILED"
        | "RECOVERY_REQUIRED"
      clause_type:
        | "return_window"
        | "full_refund"
        | "partial_refund"
        | "exclusion"
        | "evidence_requirement"
        | "manual_review"
        | "general"
      data_origin: "seed" | "app"
      member_role: "owner" | "admin" | "reviewer" | "support"
      order_payment_state:
        | "AWAITING_CAPTURE"
        | "CAPTURE_PENDING"
        | "CAPTURED"
        | "CAPTURE_DECLINED"
        | "PARTIALLY_REFUNDED"
        | "REFUNDED"
      refund_attempt_status:
        | "REQUESTED"
        | "PENDING"
        | "COMPLETED"
        | "FAILED"
        | "RECOVERY_REQUIRED"
      request_category:
        | "damaged_item"
        | "not_as_described"
        | "not_received"
        | "wrong_item"
        | "missing_parts"
        | "changed_mind"
        | "other"
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
      actor_type: ["user", "system", "ai"],
      case_priority: ["low", "normal", "high", "urgent"],
      case_status: [
        "NEW",
        "INVESTIGATING",
        "NEEDS_EVIDENCE",
        "NEEDS_REVIEW",
        "READY_FOR_APPROVAL",
        "REFUND_PENDING",
        "REFUNDED",
        "NOT_ELIGIBLE",
        "REFUND_FAILED",
        "RECOVERY_REQUIRED",
      ],
      clause_type: [
        "return_window",
        "full_refund",
        "partial_refund",
        "exclusion",
        "evidence_requirement",
        "manual_review",
        "general",
      ],
      data_origin: ["seed", "app"],
      member_role: ["owner", "admin", "reviewer", "support"],
      order_payment_state: [
        "AWAITING_CAPTURE",
        "CAPTURE_PENDING",
        "CAPTURED",
        "CAPTURE_DECLINED",
        "PARTIALLY_REFUNDED",
        "REFUNDED",
      ],
      refund_attempt_status: [
        "REQUESTED",
        "PENDING",
        "COMPLETED",
        "FAILED",
        "RECOVERY_REQUIRED",
      ],
      request_category: [
        "damaged_item",
        "not_as_described",
        "not_received",
        "wrong_item",
        "missing_parts",
        "changed_mind",
        "other",
      ],
    },
  },
} as const
