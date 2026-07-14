export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      attendance_logs: {
        Row: {
          batch_id: string
          check_in: string | null
          confidence_score: number | null
          created_at: string
          date: string
          id: string
          notes: string | null
          status: string
          student_id: string
          tenant_id: string
          updated_at: string
          verification_mode: string
          verified_by: string | null
        }
        Insert: {
          batch_id: string
          check_in?: string | null
          confidence_score?: number | null
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          status: string
          student_id: string
          tenant_id: string
          updated_at?: string
          verification_mode: string
          verified_by?: string | null
        }
        Update: {
          batch_id?: string
          check_in?: string | null
          confidence_score?: number | null
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          status?: string
          student_id?: string
          tenant_id?: string
          updated_at?: string
          verification_mode?: string
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_logs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          description: string
          id: string
          ip_address: string | null
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          description: string
          id?: string
          ip_address?: string | null
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          description?: string
          id?: string
          ip_address?: string | null
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      batches: {
        Row: {
          class_id: string
          created_at: string
          days_of_week: number[]
          end_time: string
          id: string
          is_active: boolean
          max_capacity: number
          name: string
          start_time: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          days_of_week: number[]
          end_time: string
          id?: string
          is_active?: boolean
          max_capacity?: number
          name: string
          start_time: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          days_of_week?: number[]
          end_time?: string
          id?: string
          is_active?: boolean
          max_capacity?: number
          name?: string
          start_time?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batches_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          display_order: number
          icon: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          display_order?: number
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
        }
        Relationships: []
      }
      classes: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_attendance: {
        Row: {
          check_in: string | null
          check_out: string | null
          coach_id: string
          confidence_score: number | null
          created_at: string
          date: string
          geo_lat: number | null
          geo_lng: number | null
          id: string
          method: string | null
          notes: string | null
          status: string
          tenant_id: string
          updated_at: string
          verified_by: string | null
        }
        Insert: {
          check_in?: string | null
          check_out?: string | null
          coach_id: string
          confidence_score?: number | null
          created_at?: string
          date?: string
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string
          method?: string | null
          notes?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          verified_by?: string | null
        }
        Update: {
          check_in?: string | null
          check_out?: string | null
          coach_id?: string
          confidence_score?: number | null
          created_at?: string
          date?: string
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string
          method?: string | null
          notes?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_attendance_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_attendance_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_attendance_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_audit_logs: {
        Row: {
          action_type: string
          actor_id: string | null
          coach_id: string
          created_at: string
          description: string
          device_info: string | null
          id: string
          ip_address: string | null
          meta_data: Json | null
          tenant_id: string
        }
        Insert: {
          action_type: string
          actor_id?: string | null
          coach_id: string
          created_at?: string
          description: string
          device_info?: string | null
          id?: string
          ip_address?: string | null
          meta_data?: Json | null
          tenant_id: string
        }
        Update: {
          action_type?: string
          actor_id?: string | null
          coach_id?: string
          created_at?: string
          description?: string
          device_info?: string | null
          id?: string
          ip_address?: string | null
          meta_data?: Json | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_audit_logs_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_availability: {
        Row: {
          coach_id: string
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_recurring: boolean
          start_time: string
          tenant_id: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_recurring?: boolean
          start_time: string
          tenant_id: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_recurring?: boolean
          start_time?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_availability_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_availability_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_batch_assignments: {
        Row: {
          approved_by: string | null
          assigned_days: number[] | null
          batch_id: string
          coach_id: string
          created_at: string
          id: string
          requested_by: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          assigned_days?: number[] | null
          batch_id: string
          coach_id: string
          created_at?: string
          id?: string
          requested_by?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          assigned_days?: number[] | null
          batch_id?: string
          coach_id?: string
          created_at?: string
          id?: string
          requested_by?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_batch_assignments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_batch_assignments_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_batch_assignments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_batch_assignments_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_batch_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_categories: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          is_primary: boolean
          subcategory_id: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          subcategory_id: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          subcategory_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_categories_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_categories_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_documents: {
        Row: {
          coach_id: string
          created_at: string
          document_name: string
          document_type: string
          expiry_date: string | null
          file_url: string
          id: string
          rejection_reason: string | null
          tenant_id: string
          updated_at: string
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          coach_id: string
          created_at?: string
          document_name: string
          document_type: string
          expiry_date?: string | null
          file_url: string
          id?: string
          rejection_reason?: string | null
          tenant_id: string
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          coach_id?: string
          created_at?: string
          document_name?: string
          document_type?: string
          expiry_date?: string | null
          file_url?: string
          id?: string
          rejection_reason?: string | null
          tenant_id?: string
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_documents_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_face_data: {
        Row: {
          coach_id: string
          confidence_score: number | null
          created_at: string
          embedding: string
          id: string
          label: string
          photo_url: string
          tenant_id: string
        }
        Insert: {
          coach_id: string
          confidence_score?: number | null
          created_at?: string
          embedding: string
          id?: string
          label: string
          photo_url: string
          tenant_id: string
        }
        Update: {
          coach_id?: string
          confidence_score?: number | null
          created_at?: string
          embedding?: string
          id?: string
          label?: string
          photo_url?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_face_data_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_face_data_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_financial_settings: {
        Row: {
          bank_account_holder_name: string | null
          bank_account_number: string | null
          bank_ifsc_code: string | null
          bank_name: string | null
          coach_id: string
          created_at: string
          fixed_salary: number | null
          pan_number: string | null
          per_class_rate: number | null
          revenue_share_pct: number | null
          salary_type: string
          tenant_id: string
          updated_at: string
          upi_id: string | null
        }
        Insert: {
          bank_account_holder_name?: string | null
          bank_account_number?: string | null
          bank_ifsc_code?: string | null
          bank_name?: string | null
          coach_id: string
          created_at?: string
          fixed_salary?: number | null
          pan_number?: string | null
          per_class_rate?: number | null
          revenue_share_pct?: number | null
          salary_type?: string
          tenant_id: string
          updated_at?: string
          upi_id?: string | null
        }
        Update: {
          bank_account_holder_name?: string | null
          bank_account_number?: string | null
          bank_ifsc_code?: string | null
          bank_name?: string | null
          coach_id?: string
          created_at?: string
          fixed_salary?: number | null
          pan_number?: string | null
          per_class_rate?: number | null
          revenue_share_pct?: number | null
          salary_type?: string
          tenant_id?: string
          updated_at?: string
          upi_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_financial_settings_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: true
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_financial_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_leaves: {
        Row: {
          admin_comment: string | null
          approved_by: string | null
          coach_id: string
          created_at: string
          end_date: string
          id: string
          leave_type: string
          reason: string
          start_date: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          admin_comment?: string | null
          approved_by?: string | null
          coach_id: string
          created_at?: string
          end_date: string
          id?: string
          leave_type?: string
          reason: string
          start_date: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          admin_comment?: string | null
          approved_by?: string | null
          coach_id?: string
          created_at?: string
          end_date?: string
          id?: string
          leave_type?: string
          reason?: string
          start_date?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_leaves_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_leaves_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_leaves_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_notes: {
        Row: {
          author_id: string
          coach_id: string
          created_at: string
          id: string
          note: string
          tenant_id: string
        }
        Insert: {
          author_id: string
          coach_id: string
          created_at?: string
          id?: string
          note: string
          tenant_id: string
        }
        Update: {
          author_id?: string
          coach_id?: string
          created_at?: string
          id?: string
          note?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_notes_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_payouts: {
        Row: {
          base_salary_earned: number | null
          class_rate_earned: number | null
          class_sessions_conducted: number | null
          coach_id: string
          created_at: string
          deductions: number | null
          id: string
          incentives: number | null
          net_payout: number
          paid_at: string | null
          period_end: string
          period_start: string
          revenue_share_earned: number | null
          status: string
          tenant_id: string
          transaction_reference: string | null
          updated_at: string
        }
        Insert: {
          base_salary_earned?: number | null
          class_rate_earned?: number | null
          class_sessions_conducted?: number | null
          coach_id: string
          created_at?: string
          deductions?: number | null
          id?: string
          incentives?: number | null
          net_payout: number
          paid_at?: string | null
          period_end: string
          period_start: string
          revenue_share_earned?: number | null
          status?: string
          tenant_id: string
          transaction_reference?: string | null
          updated_at?: string
        }
        Update: {
          base_salary_earned?: number | null
          class_rate_earned?: number | null
          class_sessions_conducted?: number | null
          coach_id?: string
          created_at?: string
          deductions?: number | null
          id?: string
          incentives?: number | null
          net_payout?: number
          paid_at?: string | null
          period_end?: string
          period_start?: string
          revenue_share_earned?: number | null
          status?: string
          tenant_id?: string
          transaction_reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_payouts_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_payouts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_pricing_policies: {
        Row: {
          coach_id: string
          created_at: string
          enabled: boolean
          id: string
          is_default: boolean
          policy_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          is_default?: boolean
          policy_type: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          is_default?: boolean
          policy_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_pricing_policies_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_pricing_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_pricing_rules: {
        Row: {
          absence_fee_amount: number | null
          amount: number
          auto_renew: boolean | null
          billing_cycle: string | null
          cancellation_window_hours: number | null
          class_count: number | null
          created_at: string
          currency: string
          id: string
          late_arrival_fee_amount: number | null
          late_arrival_threshold_minutes: number | null
          late_fee_amount: number | null
          late_fee_grace_days: number | null
          min_booking_count: number | null
          policy_id: string
          sort_order: number
          trial_type: string | null
          updated_at: string
        }
        Insert: {
          absence_fee_amount?: number | null
          amount?: number
          auto_renew?: boolean | null
          billing_cycle?: string | null
          cancellation_window_hours?: number | null
          class_count?: number | null
          created_at?: string
          currency?: string
          id?: string
          late_arrival_fee_amount?: number | null
          late_arrival_threshold_minutes?: number | null
          late_fee_amount?: number | null
          late_fee_grace_days?: number | null
          min_booking_count?: number | null
          policy_id: string
          sort_order?: number
          trial_type?: string | null
          updated_at?: string
        }
        Update: {
          absence_fee_amount?: number | null
          amount?: number
          auto_renew?: boolean | null
          billing_cycle?: string | null
          cancellation_window_hours?: number | null
          class_count?: number | null
          created_at?: string
          currency?: string
          id?: string
          late_arrival_fee_amount?: number | null
          late_arrival_threshold_minutes?: number | null
          late_fee_amount?: number | null
          late_fee_grace_days?: number | null
          min_booking_count?: number | null
          policy_id?: string
          sort_order?: number
          trial_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_pricing_rules_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "coach_pricing_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_pricing_settings: {
        Row: {
          allow_student_overrides: boolean
          coach_id: string
          created_at: string
          default_policy_type: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          allow_student_overrides?: boolean
          coach_id: string
          created_at?: string
          default_policy_type?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          allow_student_overrides?: boolean
          coach_id?: string
          created_at?: string
          default_policy_type?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_pricing_settings_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: true
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_pricing_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_reviews: {
        Row: {
          attendance: number
          coach_id: string
          comments: string | null
          communication: number
          created_at: string
          discipline: number
          id: string
          overall_rating: number
          professionalism: number
          rated_by: string | null
          review_period: string
          student_feedback: number
          teaching_quality: number
          tenant_id: string
        }
        Insert: {
          attendance: number
          coach_id: string
          comments?: string | null
          communication: number
          created_at?: string
          discipline: number
          id?: string
          overall_rating: number
          professionalism: number
          rated_by?: string | null
          review_period: string
          student_feedback: number
          teaching_quality: number
          tenant_id: string
        }
        Update: {
          attendance?: number
          coach_id?: string
          comments?: string | null
          communication?: number
          created_at?: string
          discipline?: number
          id?: string
          overall_rating?: number
          professionalism?: number
          rated_by?: string | null
          review_period?: string
          student_feedback?: number
          teaching_quality?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_reviews_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_reviews_rated_by_fkey"
            columns: ["rated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_service_areas: {
        Row: {
          area_id: string
          coach_id: string
          created_at: string
          id: string
        }
        Insert: {
          area_id: string
          coach_id: string
          created_at?: string
          id?: string
        }
        Update: {
          area_id?: string
          coach_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_service_areas_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "service_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_service_areas_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_service_communities: {
        Row: {
          coach_id: string
          community_id: string
          created_at: string
          id: string
        }
        Insert: {
          coach_id: string
          community_id: string
          created_at?: string
          id?: string
        }
        Update: {
          coach_id?: string
          community_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_service_communities_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_service_communities_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "service_communities"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_student_pricing_overrides: {
        Row: {
          class_count: number | null
          coach_id: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          override_amount: number
          override_type: string
          reason: string | null
          student_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          class_count?: number | null
          coach_id: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          override_amount: number
          override_type: string
          reason?: string | null
          student_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          class_count?: number | null
          coach_id?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          override_amount?: number
          override_type?: string
          reason?: string | null
          student_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_student_pricing_overrides_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_student_pricing_overrides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_student_pricing_overrides_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_student_pricing_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_tags: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          tag_id: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          tag_id: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_tags_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      coaches: {
        Row: {
          account_status: string
          achievements: string[]
          address: string | null
          age_groups: string[]
          area: string | null
          avg_rating: number | null
          bio: string | null
          certifications_summary: string | null
          city: string | null
          class_types: string[]
          conversion_rate: number | null
          country: string | null
          created_at: string
          date_of_birth: string | null
          department: string | null
          designation: string | null
          document_request_at: string | null
          document_request_note: string | null
          emergency_contact_address: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          employee_id: string | null
          employee_type: string | null
          experience_years: number
          gallery_urls: string[]
          gender: string | null
          id: string
          joining_date: string
          languages_known: string[]
          public_profile_slug: string | null
          qualification: string | null
          retention_rate: number | null
          satisfaction_score: number | null
          service_types: string[]
          skill_levels: string[]
          state: string | null
          status_reason: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          account_status?: string
          achievements?: string[]
          address?: string | null
          age_groups?: string[]
          area?: string | null
          avg_rating?: number | null
          bio?: string | null
          certifications_summary?: string | null
          city?: string | null
          class_types?: string[]
          conversion_rate?: number | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          department?: string | null
          designation?: string | null
          document_request_at?: string | null
          document_request_note?: string | null
          emergency_contact_address?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          employee_id?: string | null
          employee_type?: string | null
          experience_years: number
          gallery_urls?: string[]
          gender?: string | null
          id: string
          joining_date?: string
          languages_known?: string[]
          public_profile_slug?: string | null
          qualification?: string | null
          retention_rate?: number | null
          satisfaction_score?: number | null
          service_types?: string[]
          skill_levels?: string[]
          state?: string | null
          status_reason?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          account_status?: string
          achievements?: string[]
          address?: string | null
          age_groups?: string[]
          area?: string | null
          avg_rating?: number | null
          bio?: string | null
          certifications_summary?: string | null
          city?: string | null
          class_types?: string[]
          conversion_rate?: number | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          department?: string | null
          designation?: string | null
          document_request_at?: string | null
          document_request_note?: string | null
          emergency_contact_address?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          employee_id?: string | null
          employee_type?: string | null
          experience_years?: number
          gallery_urls?: string[]
          gender?: string | null
          id?: string
          joining_date?: string
          languages_known?: string[]
          public_profile_slug?: string | null
          qualification?: string | null
          retention_rate?: number | null
          satisfaction_score?: number | null
          service_types?: string[]
          skill_levels?: string[]
          state?: string | null
          status_reason?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaches_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fines: {
        Row: {
          amount: number
          attendance_log_id: string | null
          created_at: string
          id: string
          issued_date: string
          paid_date: string | null
          payment_method: string | null
          payment_proof_url: string | null
          reason: string
          rejection_reason: string | null
          status: string
          student_id: string
          tenant_id: string
          transaction_id: string | null
          updated_at: string
          waive_reason: string | null
          waived_by: string | null
        }
        Insert: {
          amount: number
          attendance_log_id?: string | null
          created_at?: string
          id?: string
          issued_date?: string
          paid_date?: string | null
          payment_method?: string | null
          payment_proof_url?: string | null
          reason: string
          rejection_reason?: string | null
          status?: string
          student_id: string
          tenant_id: string
          transaction_id?: string | null
          updated_at?: string
          waive_reason?: string | null
          waived_by?: string | null
        }
        Update: {
          amount?: number
          attendance_log_id?: string | null
          created_at?: string
          id?: string
          issued_date?: string
          paid_date?: string | null
          payment_method?: string | null
          payment_proof_url?: string | null
          reason?: string
          rejection_reason?: string | null
          status?: string
          student_id?: string
          tenant_id?: string
          transaction_id?: string | null
          updated_at?: string
          waive_reason?: string | null
          waived_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fines_attendance_log_id_fkey"
            columns: ["attendance_log_id"]
            isOneToOne: false
            referencedRelation: "attendance_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fines_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fines_waived_by_fkey"
            columns: ["waived_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      group_attendance_photos: {
        Row: {
          batch_id: string
          created_at: string
          date: string
          id: string
          photo_url: string
          tenant_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          date: string
          id?: string
          photo_url: string
          tenant_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          date?: string
          id?: string
          photo_url?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_attendance_photos_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_attendance_photos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_student_map: {
        Row: {
          parent_id: string
          relationship: string
          student_id: string
        }
        Insert: {
          parent_id: string
          relationship?: string
          student_id: string
        }
        Update: {
          parent_id?: string
          relationship?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_student_map_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_student_map_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      parents: {
        Row: {
          created_at: string
          id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parents_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          created_at: string
          id: string
          module: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          module: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          module?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          permission_id: string
          role_id: string
        }
        Insert: {
          permission_id: string
          role_id: string
        }
        Update: {
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          id: string
          is_system: boolean
          name: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_system?: boolean
          name: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_system?: boolean
          name?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_areas: {
        Row: {
          city: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          lat: number | null
          lng: number | null
          name: string
          slug: string
        }
        Insert: {
          city?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          name: string
          slug: string
        }
        Update: {
          city?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          name?: string
          slug?: string
        }
        Relationships: []
      }
      service_communities: {
        Row: {
          area_id: string
          created_at: string
          created_by_coach_id: string | null
          formatted_address: string | null
          google_place_id: string | null
          id: string
          is_active: boolean
          lat: number | null
          lng: number | null
          name: string
        }
        Insert: {
          area_id: string
          created_at?: string
          created_by_coach_id?: string | null
          formatted_address?: string | null
          google_place_id?: string | null
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          name: string
        }
        Update: {
          area_id?: string
          created_at?: string
          created_by_coach_id?: string | null
          formatted_address?: string | null
          google_place_id?: string | null
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_communities_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "service_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_communities_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      student_face_samples: {
        Row: {
          created_at: string
          embedding: string
          id: string
          label: string | null
          photo_url: string
          student_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          embedding: string
          id?: string
          label?: string | null
          photo_url: string
          student_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          embedding?: string
          id?: string
          label?: string | null
          photo_url?: string
          student_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_face_samples_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_face_samples_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      student_join_requests: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          remark: string | null
          status: string
          student_id: string
          tenant_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          remark?: string | null
          status?: string
          student_id: string
          tenant_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          remark?: string | null
          status?: string
          student_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_join_requests_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_join_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_join_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      student_removals: {
        Row: {
          batch_id: string
          id: string
          remark: string | null
          removed_at: string
          student_id: string
          tenant_id: string
        }
        Insert: {
          batch_id: string
          id?: string
          remark?: string | null
          removed_at?: string
          student_id: string
          tenant_id: string
        }
        Update: {
          batch_id?: string
          id?: string
          remark?: string | null
          removed_at?: string
          student_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_removals_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_removals_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_removals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          address: string | null
          batch_id: string | null
          created_at: string
          date_of_birth: string
          emergency_contact: string | null
          id: string
          joining_date: string
          status: string
          student_custom_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          batch_id?: string | null
          created_at?: string
          date_of_birth: string
          emergency_contact?: string | null
          id: string
          joining_date?: string
          status?: string
          student_custom_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          batch_id?: string | null
          created_at?: string
          date_of_birth?: string
          emergency_contact?: string | null
          id?: string
          joining_date?: string
          status?: string
          student_custom_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subcategories: {
        Row: {
          category_id: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          name: string
          slug: string
        }
        Insert: {
          category_id: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          slug: string
        }
        Update: {
          category_id?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string
          display_order: number
          id: string
          name: string
          slug: string
          subcategory_id: string | null
          tag_type: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          name: string
          slug: string
          subcategory_id?: string | null
          tag_type: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          slug?: string
          subcategory_id?: string | null
          tag_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          absent_fine_rule_1: number
          absent_fine_rule_1_days: number
          absent_fine_rule_2: number
          auto_fine_enabled: boolean
          currency: string
          grace_period_minutes: number
          holidays: string[]
          late_threshold_minutes: number
          tenant_id: string
          updated_at: string
          weekends: number[]
        }
        Insert: {
          absent_fine_rule_1?: number
          absent_fine_rule_1_days?: number
          absent_fine_rule_2?: number
          auto_fine_enabled?: boolean
          currency?: string
          grace_period_minutes?: number
          holidays?: string[]
          late_threshold_minutes?: number
          tenant_id: string
          updated_at?: string
          weekends?: number[]
        }
        Update: {
          absent_fine_rule_1?: number
          absent_fine_rule_1_days?: number
          absent_fine_rule_2?: number
          auto_fine_enabled?: boolean
          currency?: string
          grace_period_minutes?: number
          holidays?: string[]
          late_threshold_minutes?: number
          tenant_id?: string
          updated_at?: string
          weekends?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: string | null
          city: string | null
          country: string | null
          created_at: string
          domain: string | null
          email: string | null
          id: string
          logo_url: string | null
          name: string
          slug: string
          state: string | null
          subscription_status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          domain?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          state?: string | null
          subscription_status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          domain?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          state?: string | null
          subscription_status?: string
          updated_at?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          alternate_phone: string | null
          available_roles: string[]
          avatar_url: string | null
          created_at: string
          email: string
          expo_push_token: string | null
          first_name: string
          id: string
          is_active: boolean
          last_login: string | null
          last_name: string
          login_device: string | null
          notification_preferences: Json | null
          phone: string | null
          role: string
          role_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          alternate_phone?: string | null
          available_roles?: string[]
          avatar_url?: string | null
          created_at?: string
          email: string
          expo_push_token?: string | null
          first_name: string
          id: string
          is_active?: boolean
          last_login?: string | null
          last_name: string
          login_device?: string | null
          notification_preferences?: Json | null
          phone?: string | null
          role: string
          role_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          alternate_phone?: string | null
          available_roles?: string[]
          avatar_url?: string | null
          created_at?: string
          email?: string
          expo_push_token?: string | null
          first_name?: string
          id?: string
          is_active?: boolean
          last_login?: string | null
          last_name?: string
          login_device?: string | null
          notification_preferences?: Json | null
          phone?: string | null
          role?: string
          role_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_tenant_id: { Args: never; Returns: string }
      auth_user_role: { Args: never; Returns: string }
      match_face_embedding: {
        Args: {
          input_embedding: string
          match_count: number
          match_threshold: number
          p_tenant_id: string
        }
        Returns: {
          batch_id: string
          similarity: number
          student_id: string
          student_name: string
        }[]
      }
      student_tenant_id: { Args: { p_student_id: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

