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
      announcements: {
        Row: {
          audience: string
          body: string
          created_at: string
          created_by: string | null
          id: string
          published_at: string | null
          title: string
        }
        Insert: {
          audience?: string
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          title: string
        }
        Update: {
          audience?: string
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_events: {
        Row: {
          branch_id: string
          class_session_id: string
          confidence: number | null
          enrollment_id: string
          id: string
          method: string
          organization_id: string
          recorded_at: string
          recorded_by: string | null
          status: string
          superseded_by: string | null
        }
        Insert: {
          branch_id: string
          class_session_id: string
          confidence?: number | null
          enrollment_id: string
          id?: string
          method: string
          organization_id: string
          recorded_at?: string
          recorded_by?: string | null
          status: string
          superseded_by?: string | null
        }
        Update: {
          branch_id?: string
          class_session_id?: string
          confidence?: number | null
          enrollment_id?: string
          id?: string
          method?: string
          organization_id?: string
          recorded_at?: string
          recorded_by?: string | null
          status?: string
          superseded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_events_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_events_class_session_id_fkey"
            columns: ["class_session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_events_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_events_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_events_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "attendance_events"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_review_queue: {
        Row: {
          branch_id: string
          candidate_enrollment_id: string | null
          class_session_id: string
          confidence: number
          created_at: string
          id: string
          organization_id: string
          resolved_at: string | null
          resolved_by: string | null
          source_path: string | null
          status: string
        }
        Insert: {
          branch_id: string
          candidate_enrollment_id?: string | null
          class_session_id: string
          confidence: number
          created_at?: string
          id?: string
          organization_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          source_path?: string | null
          status?: string
        }
        Update: {
          branch_id?: string
          candidate_enrollment_id?: string | null
          class_session_id?: string
          confidence?: number
          created_at?: string
          id?: string
          organization_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          source_path?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_review_queue_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_review_queue_candidate_enrollment_id_fkey"
            columns: ["candidate_enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_review_queue_class_session_id_fkey"
            columns: ["class_session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_review_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_review_queue_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_session_id: string | null
          actor_user_id: string | null
          detail: Json | null
          id: string
          occurred_at: string
          organization_id: string | null
          support_grant_id: string | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_session_id?: string | null
          actor_user_id?: string | null
          detail?: Json | null
          id?: string
          occurred_at?: string
          organization_id?: string | null
          support_grant_id?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_session_id?: string | null
          actor_user_id?: string | null
          detail?: Json | null
          id?: string
          occurred_at?: string
          organization_id?: string | null
          support_grant_id?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_support_grant_id_fkey"
            columns: ["support_grant_id"]
            isOneToOne: false
            referencedRelation: "support_access_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_methods: {
        Row: {
          created_at: string
          guardian_enabled_by: string | null
          id: string
          last_used_at: string | null
          provider: string
          provider_uid: string
          user_id: string
          verified_at: string | null
          verified_identifier: string | null
        }
        Insert: {
          created_at?: string
          guardian_enabled_by?: string | null
          id?: string
          last_used_at?: string | null
          provider: string
          provider_uid: string
          user_id: string
          verified_at?: string | null
          verified_identifier?: string | null
        }
        Update: {
          created_at?: string
          guardian_enabled_by?: string | null
          id?: string
          last_used_at?: string | null
          provider?: string
          provider_uid?: string
          user_id?: string
          verified_at?: string | null
          verified_identifier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auth_methods_guardian_enabled_by_fkey"
            columns: ["guardian_enabled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auth_methods_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_enrollments: {
        Row: {
          batch_id: string
          enrollment_id: string
          joined_on: string
          left_on: string | null
          status: string
        }
        Insert: {
          batch_id: string
          enrollment_id: string
          joined_on?: string
          left_on?: string | null
          status?: string
        }
        Update: {
          batch_id?: string
          enrollment_id?: string
          joined_on?: string
          left_on?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_enrollments_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_enrollments_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      batches: {
        Row: {
          branch_id: string
          capacity: number | null
          created_at: string
          default_fee_policy_id: string | null
          grace_minutes: number
          id: string
          mode: string
          name: string
          organization_id: string
          program_id: string | null
          schedule: Json
          status: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          capacity?: number | null
          created_at?: string
          default_fee_policy_id?: string | null
          grace_minutes?: number
          id?: string
          mode?: string
          name: string
          organization_id: string
          program_id?: string | null
          schedule: Json
          status?: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          capacity?: number | null
          created_at?: string
          default_fee_policy_id?: string | null
          grace_minutes?: number
          id?: string
          mode?: string
          name?: string
          organization_id?: string
          program_id?: string | null
          schedule?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_default_fee_policy_id_fkey"
            columns: ["default_fee_policy_id"]
            isOneToOne: false
            referencedRelation: "fee_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          created_at: string
          geo: Json | null
          id: string
          name: string
          organization_id: string
          status: string
        }
        Insert: {
          created_at?: string
          geo?: Json | null
          id?: string
          name?: string
          organization_id: string
          status?: string
        }
        Update: {
          created_at?: string
          geo?: Json | null
          id?: string
          name?: string
          organization_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      charges: {
        Row: {
          amount_minor: number
          branch_id: string
          created_at: string
          currency: string
          description: string
          due_on: string
          enrollment_id: string
          fee_policy_id: string | null
          id: string
          kind: string
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount_minor: number
          branch_id: string
          created_at?: string
          currency: string
          description: string
          due_on: string
          enrollment_id: string
          fee_policy_id?: string | null
          id?: string
          kind: string
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          branch_id?: string
          created_at?: string
          currency?: string
          description?: string
          due_on?: string
          enrollment_id?: string
          fee_policy_id?: string | null
          id?: string
          kind?: string
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "charges_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_fee_policy_id_fkey"
            columns: ["fee_policy_id"]
            isOneToOne: false
            referencedRelation: "fee_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      class_sessions: {
        Row: {
          batch_id: string
          branch_id: string
          created_at: string
          ends_at: string
          id: string
          organization_id: string
          session_date: string
          starts_at: string
          status: string
        }
        Insert: {
          batch_id: string
          branch_id: string
          created_at?: string
          ends_at: string
          id?: string
          organization_id: string
          session_date: string
          starts_at: string
          status?: string
        }
        Update: {
          batch_id?: string
          branch_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          organization_id?: string
          session_date?: string
          starts_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_sessions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_sessions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_assignments: {
        Row: {
          batch_id: string
          days: number[] | null
          membership_id: string
          role: string
        }
        Insert: {
          batch_id: string
          days?: number[] | null
          membership_id: string
          role?: string
        }
        Update: {
          batch_id?: string
          days?: number[] | null
          membership_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_assignments_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_assignments_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      consents: {
        Row: {
          evidence: Json | null
          granted_at: string
          granted_by: string
          id: string
          kind: string
          organization_id: string | null
          subject_user_id: string
          withdrawn_at: string | null
        }
        Insert: {
          evidence?: Json | null
          granted_at?: string
          granted_by: string
          id?: string
          kind: string
          organization_id?: string | null
          subject_user_id: string
          withdrawn_at?: string | null
        }
        Update: {
          evidence?: Json | null
          granted_at?: string
          granted_by?: string
          id?: string
          kind?: string
          organization_id?: string | null
          subject_user_id?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consents_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consents_subject_user_id_fkey"
            columns: ["subject_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          branch_id: string
          created_at: string
          ended_on: string | null
          id: string
          organization_id: string
          profile: Json
          roll_number: string | null
          started_on: string
          status: string
          student_user_id: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          ended_on?: string | null
          id?: string
          organization_id: string
          profile?: Json
          roll_number?: string | null
          started_on: string
          status?: string
          student_user_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          ended_on?: string | null
          id?: string
          organization_id?: string
          profile?: Json
          roll_number?: string | null
          started_on?: string
          status?: string
          student_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_user_id_fkey"
            columns: ["student_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      face_enrollments: {
        Row: {
          consent_id: string
          created_at: string
          deleted_at: string | null
          embedding: string | null
          enrollment_id: string | null
          id: string
          membership_id: string | null
          organization_id: string
          quality_score: number | null
          source_path: string | null
        }
        Insert: {
          consent_id: string
          created_at?: string
          deleted_at?: string | null
          embedding?: string | null
          enrollment_id?: string | null
          id?: string
          membership_id?: string | null
          organization_id: string
          quality_score?: number | null
          source_path?: string | null
        }
        Update: {
          consent_id?: string
          created_at?: string
          deleted_at?: string | null
          embedding?: string | null
          enrollment_id?: string | null
          id?: string
          membership_id?: string | null
          organization_id?: string
          quality_score?: number | null
          source_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "face_enrollments_consent_id_fkey"
            columns: ["consent_id"]
            isOneToOne: false
            referencedRelation: "consents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "face_enrollments_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "face_enrollments_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "face_enrollments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          default_on: boolean
          description: string | null
          key: string
        }
        Insert: {
          default_on?: boolean
          description?: string | null
          key: string
        }
        Update: {
          default_on?: boolean
          description?: string | null
          key?: string
        }
        Relationships: []
      }
      fee_policies: {
        Row: {
          amount_minor: number
          created_at: string
          currency: string
          fine_policy: Json | null
          id: string
          kind: string
          name: string
          organization_id: string
          status: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          currency?: string
          fine_policy?: Json | null
          id?: string
          kind: string
          name: string
          organization_id: string
          status?: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          currency?: string
          fine_policy?: Json | null
          id?: string
          kind?: string
          name?: string
          organization_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_policies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_areas: {
        Row: {
          city_key: string
          key: string
          label: string
        }
        Insert: {
          city_key: string
          key: string
          label: string
        }
        Update: {
          city_key?: string
          key?: string
          label?: string
        }
        Relationships: [
          {
            foreignKeyName: "geo_areas_city_key_fkey"
            columns: ["city_key"]
            isOneToOne: false
            referencedRelation: "geo_cities"
            referencedColumns: ["key"]
          },
        ]
      }
      geo_cities: {
        Row: {
          key: string
          label: string
          state: string | null
        }
        Insert: {
          key: string
          label: string
          state?: string | null
        }
        Update: {
          key?: string
          label?: string
          state?: string | null
        }
        Relationships: []
      }
      guardianships: {
        Row: {
          consent_authority: boolean
          created_at: string
          guardian_user_id: string
          id: string
          relationship: string
          status: string
          ward_user_id: string
        }
        Insert: {
          consent_authority?: boolean
          created_at?: string
          guardian_user_id: string
          id?: string
          relationship: string
          status?: string
          ward_user_id: string
        }
        Update: {
          consent_authority?: boolean
          created_at?: string
          guardian_user_id?: string
          id?: string
          relationship?: string
          status?: string
          ward_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardianships_guardian_user_id_fkey"
            columns: ["guardian_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardianships_ward_user_id_fkey"
            columns: ["ward_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          label: string
          on_date: string
          organization_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          label: string
          on_date: string
          organization_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          label?: string
          on_date?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "holidays_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holidays_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          branch_id: string | null
          created_at: string
          email: string | null
          expires_at: string
          id: string
          invited_by: string
          organization_id: string
          phone: string | null
          revoked_at: string | null
          role_keys: string[]
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          branch_id?: string | null
          created_at?: string
          email?: string | null
          expires_at: string
          id?: string
          invited_by: string
          organization_id: string
          phone?: string | null
          revoked_at?: string | null
          role_keys: string[]
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          branch_id?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          invited_by?: string
          organization_id?: string
          phone?: string | null
          revoked_at?: string | null
          role_keys?: string[]
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          failed_at: string | null
          id: string
          idempotency_key: string | null
          kind: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload: Json
          run_at: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          failed_at?: string | null
          id?: string
          idempotency_key?: string | null
          kind: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          run_at?: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          failed_at?: string | null
          id?: string
          idempotency_key?: string | null
          kind?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          run_at?: string
        }
        Relationships: []
      }
      join_requests: {
        Row: {
          branch_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          organization_id: string
          requested_role: string
          requester_user_id: string
          status: string
          subject_user_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          organization_id: string
          requested_role?: string
          requester_user_id: string
          status?: string
          subject_user_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          organization_id?: string
          requested_role?: string
          requester_user_id?: string
          status?: string
          subject_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "join_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_requester_user_id_fkey"
            columns: ["requester_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_subject_user_id_fkey"
            columns: ["subject_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          contact_name: string
          contact_phone: string
          created_at: string
          id: string
          listing_id: string
          message: string | null
          organization_id: string
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          contact_name: string
          contact_phone: string
          created_at?: string
          id?: string
          listing_id: string
          message?: string | null
          organization_id: string
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          contact_name?: string
          contact_phone?: string
          created_at?: string
          id?: string
          listing_id?: string
          message?: string | null
          organization_id?: string
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          branch_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          ends_on: string
          id: string
          kind: string
          organization_id: string
          reason: string | null
          staff_profile_id: string
          starts_on: string
          status: string
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          ends_on: string
          id?: string
          kind?: string
          organization_id: string
          reason?: string | null
          staff_profile_id: string
          starts_on: string
          status?: string
          user_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          ends_on?: string
          id?: string
          kind?: string
          organization_id?: string
          reason?: string | null
          staff_profile_id?: string
          starts_on?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_accounts: {
        Row: {
          created_at: string
          currency: string
          id: string
          kind: string
          organization_id: string | null
          owner_user_id: string | null
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          kind: string
          organization_id?: string | null
          owner_user_id?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          kind?: string
          organization_id?: string | null
          owner_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_accounts_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          account_id: string
          amount_minor: number
          currency: string
          entry_group: string
          id: string
          occurred_at: string
          organization_id: string | null
          ref_id: string
          ref_type: string
        }
        Insert: {
          account_id: string
          amount_minor: number
          currency: string
          entry_group: string
          id?: string
          occurred_at?: string
          organization_id?: string | null
          ref_id: string
          ref_type: string
        }
        Update: {
          account_id?: string
          amount_minor?: number
          currency?: string
          entry_group?: string
          id?: string
          occurred_at?: string
          organization_id?: string | null
          ref_id?: string
          ref_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          area_keys: string[] | null
          city_key: string
          content_language: string
          created_at: string
          description: string | null
          featured_until: string | null
          headline: string | null
          id: string
          media_paths: string[] | null
          organization_id: string
          price_display: Json | null
          published_at: string | null
          slug: string
          sport_keys: string[]
          status: string
          updated_at: string
        }
        Insert: {
          area_keys?: string[] | null
          city_key: string
          content_language?: string
          created_at?: string
          description?: string | null
          featured_until?: string | null
          headline?: string | null
          id?: string
          media_paths?: string[] | null
          organization_id: string
          price_display?: Json | null
          published_at?: string | null
          slug: string
          sport_keys?: string[]
          status?: string
          updated_at?: string
        }
        Update: {
          area_keys?: string[] | null
          city_key?: string
          content_language?: string
          created_at?: string
          description?: string | null
          featured_until?: string | null
          headline?: string | null
          id?: string
          media_paths?: string[] | null
          organization_id?: string
          price_display?: Json | null
          published_at?: string | null
          slug?: string
          sport_keys?: string[]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_city_key_fkey"
            columns: ["city_key"]
            isOneToOne: false
            referencedRelation: "geo_cities"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "listings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          membership_id: string
          role_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          membership_id: string
          role_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          membership_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_roles_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          invited_by: string | null
          joined_at: string | null
          organization_id: string
          status: string
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          organization_id: string
          status?: string
          user_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          organization_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_definitions: {
        Row: {
          created_at: string
          direction: string | null
          id: string
          key: string
          label: string
          organization_id: string | null
          sport_key: string | null
          unit: string | null
        }
        Insert: {
          created_at?: string
          direction?: string | null
          id?: string
          key: string
          label: string
          organization_id?: string | null
          sport_key?: string | null
          unit?: string | null
        }
        Update: {
          created_at?: string
          direction?: string | null
          id?: string
          key?: string
          label?: string
          organization_id?: string | null
          sport_key?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "metric_definitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          channel: string
          created_at: string
          error: string | null
          id: string
          language: string
          organization_id: string
          provider_ref: string | null
          recipient_user_id: string
          ref_id: string | null
          ref_type: string | null
          status: string
          template_key: string
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          error?: string | null
          id?: string
          language: string
          organization_id: string
          provider_ref?: string | null
          recipient_user_id: string
          ref_id?: string | null
          ref_type?: string | null
          status: string
          template_key: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          language?: string
          organization_id?: string
          provider_ref?: string | null
          recipient_user_id?: string
          ref_id?: string | null
          ref_type?: string | null
          status?: string
          template_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          channel: string
          enabled: boolean
          kind: string
          user_id: string
        }
        Insert: {
          channel: string
          enabled?: boolean
          kind: string
          user_id: string
        }
        Update: {
          channel?: string
          enabled?: boolean
          kind?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          approved_at: string | null
          body: string
          channel: string
          created_at: string
          id: string
          key: string
          language: string
          organization_id: string | null
          updated_at: string
          variables: Json
        }
        Insert: {
          approved_at?: string | null
          body: string
          channel: string
          created_at?: string
          id?: string
          key: string
          language: string
          organization_id?: string | null
          updated_at?: string
          variables?: Json
        }
        Update: {
          approved_at?: string | null
          body?: string
          channel?: string
          created_at?: string
          id?: string
          key?: string
          language?: string
          organization_id?: string | null
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "notification_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_bank_accounts: {
        Row: {
          account_holder_name: string
          account_last4: string
          bank_name: string
          created_at: string
          gateway_token: string | null
          id: string
          organization_id: string
        }
        Insert: {
          account_holder_name: string
          account_last4: string
          bank_name: string
          created_at?: string
          gateway_token?: string | null
          id?: string
          organization_id: string
        }
        Update: {
          account_holder_name?: string
          account_last4?: string
          bank_name?: string
          created_at?: string
          gateway_token?: string | null
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_bank_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_branding: {
        Row: {
          colors: Json | null
          display_name: string | null
          logo_path: string | null
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          colors?: Json | null
          display_name?: string | null
          logo_path?: string | null
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          colors?: Json | null
          display_name?: string | null
          logo_path?: string | null
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_branding_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_domains: {
        Row: {
          created_at: string
          hostname: string
          id: string
          organization_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          hostname: string
          id?: string
          organization_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          hostname?: string
          id?: string
          organization_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_domains_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_feature_flags: {
        Row: {
          enabled: boolean
          flag_key: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          enabled: boolean
          flag_key: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          flag_key?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_feature_flags_flag_key_fkey"
            columns: ["flag_key"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "org_feature_flags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          country_code: string
          created_at: string
          created_by: string | null
          default_currency: string
          id: string
          name: string
          org_type: string
          settings: Json
          slug: string
          status: string
          timezone: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          country_code?: string
          created_at?: string
          created_by?: string | null
          default_currency?: string
          id?: string
          name: string
          org_type: string
          settings?: Json
          slug: string
          status?: string
          timezone?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          country_code?: string
          created_at?: string
          created_by?: string | null
          default_currency?: string
          id?: string
          name?: string
          org_type?: string
          settings?: Json
          slug?: string
          status?: string
          timezone?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          amount_minor: number
          charge_id: string
          payment_id: string
        }
        Insert: {
          amount_minor: number
          charge_id: string
          payment_id: string
        }
        Update: {
          amount_minor?: number
          charge_id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_minor: number
          created_at: string
          currency: string
          gateway_ref: string | null
          id: string
          method: string
          organization_id: string
          payer_user_id: string
          proof_path: string | null
          rejection_reason: string | null
          status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          amount_minor: number
          created_at?: string
          currency: string
          gateway_ref?: string | null
          id?: string
          method: string
          organization_id: string
          payer_user_id: string
          proof_path?: string | null
          rejection_reason?: string | null
          status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          amount_minor?: number
          created_at?: string
          currency?: string
          gateway_ref?: string | null
          id?: string
          method?: string
          organization_id?: string
          payer_user_id?: string
          proof_path?: string | null
          rejection_reason?: string | null
          status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_payer_user_id_fkey"
            columns: ["payer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_settings: {
        Row: {
          amount_minor: number | null
          branch_id: string | null
          commission_pct: number | null
          created_at: string
          currency: string
          id: string
          notes: string | null
          organization_id: string
          pay_type: string
          staff_profile_id: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          amount_minor?: number | null
          branch_id?: string | null
          commission_pct?: number | null
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          organization_id: string
          pay_type?: string
          staff_profile_id: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          amount_minor?: number | null
          branch_id?: string | null
          commission_pct?: number | null
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          organization_id?: string
          pay_type?: string
          staff_profile_id?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_settings_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: true
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount_minor: number
          bank_account_id: string | null
          created_at: string
          currency: string
          gateway_ref: string | null
          id: string
          organization_id: string
          period_end: string | null
          period_start: string | null
          status: string
        }
        Insert: {
          amount_minor: number
          bank_account_id?: string | null
          created_at?: string
          currency?: string
          gateway_ref?: string | null
          id?: string
          organization_id: string
          period_end?: string | null
          period_start?: string | null
          status?: string
        }
        Update: {
          amount_minor?: number
          bank_account_id?: string | null
          created_at?: string
          currency?: string
          gateway_ref?: string | null
          id?: string
          organization_id?: string
          period_end?: string | null
          period_start?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "org_bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          key: string
        }
        Insert: {
          key: string
        }
        Update: {
          key?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          created_at: string
          id: string
          key: string
          name: string
          pricing: Json
          status: string
          strategy: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          name: string
          pricing?: Json
          status?: string
          strategy: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          name?: string
          pricing?: Json
          status?: string
          strategy?: string
        }
        Relationships: []
      }
      platform_role_assignments: {
        Row: {
          granted_at: string
          granted_by: string | null
          role_id: string
          seed: boolean
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          role_id: string
          seed?: boolean
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          role_id?: string
          seed?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_role_assignments_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_role_assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_role_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          organization_id: string
          sport_key: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          organization_id: string
          sport_key?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          sport_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      progress_entries: {
        Row: {
          branch_id: string
          created_at: string
          enrollment_id: string
          id: string
          metric_key: string
          note: string | null
          organization_id: string
          recorded_by: string
          recorded_on: string
          student_user_id: string
          value: number
        }
        Insert: {
          branch_id: string
          created_at?: string
          enrollment_id: string
          id?: string
          metric_key: string
          note?: string | null
          organization_id: string
          recorded_by: string
          recorded_on: string
          student_user_id: string
          value: number
        }
        Update: {
          branch_id?: string
          created_at?: string
          enrollment_id?: string
          id?: string
          metric_key?: string
          note?: string | null
          organization_id?: string
          recorded_by?: string
          recorded_on?: string
          student_user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "progress_entries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_entries_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_entries_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_entries_student_user_id_fkey"
            columns: ["student_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          code: string
          completed_at: string | null
          created_at: string
          id: string
          referred_org_id: string | null
          referrer_user_id: string
          reward_amount_minor: number | null
          reward_config: Json
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          completed_at?: string | null
          created_at?: string
          id?: string
          referred_org_id?: string | null
          referrer_user_id: string
          reward_amount_minor?: number | null
          reward_config?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          referred_org_id?: string | null
          referrer_user_id?: string
          reward_amount_minor?: number | null
          reward_config?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_org_id_fkey"
            columns: ["referred_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_user_id_fkey"
            columns: ["referrer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          author_user_id: string
          body: string | null
          created_at: string
          enrollment_id: string
          id: string
          listing_id: string
          org_response: string | null
          organization_id: string
          rating: number
          status: string
          updated_at: string
        }
        Insert: {
          author_user_id: string
          body?: string | null
          created_at?: string
          enrollment_id: string
          id?: string
          listing_id: string
          org_response?: string | null
          organization_id: string
          rating: number
          status?: string
          updated_at?: string
        }
        Update: {
          author_user_id?: string
          body?: string | null
          created_at?: string
          enrollment_id?: string
          id?: string
          listing_id?: string
          org_response?: string | null
          organization_id?: string
          rating?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_key: string
          role_id: string
        }
        Insert: {
          permission_key: string
          role_id: string
        }
        Update: {
          permission_key?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
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
          id: string
          key: string
          organization_id: string | null
          scope: string
        }
        Insert: {
          id?: string
          key: string
          organization_id?: string | null
          scope: string
        }
        Update: {
          id?: string
          key?: string
          organization_id?: string | null
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          active_org_id: string | null
          created_at: string
          device_label: string | null
          expires_at: string
          family_id: string
          id: string
          ip_created: unknown
          last_seen_at: string | null
          mfa_verified_at: string | null
          platform: string | null
          refresh_hash: string
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          active_org_id?: string | null
          created_at?: string
          device_label?: string | null
          expires_at: string
          family_id: string
          id?: string
          ip_created?: unknown
          last_seen_at?: string | null
          mfa_verified_at?: string | null
          platform?: string | null
          refresh_hash: string
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          active_org_id?: string | null
          created_at?: string
          device_label?: string | null
          expires_at?: string
          family_id?: string
          id?: string
          ip_created?: unknown
          last_seen_at?: string | null
          mfa_verified_at?: string | null
          platform?: string | null
          refresh_hash?: string
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_attendance_events: {
        Row: {
          branch_id: string
          confidence: number | null
          geo: Json | null
          id: string
          kind: string
          membership_id: string
          method: string
          organization_id: string
          recorded_at: string
          recorded_by: string | null
        }
        Insert: {
          branch_id: string
          confidence?: number | null
          geo?: Json | null
          id?: string
          kind: string
          membership_id: string
          method: string
          organization_id: string
          recorded_at?: string
          recorded_by?: string | null
        }
        Update: {
          branch_id?: string
          confidence?: number | null
          geo?: Json | null
          id?: string
          kind?: string
          membership_id?: string
          method?: string
          organization_id?: string
          recorded_at?: string
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_attendance_events_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_attendance_events_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_attendance_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_attendance_events_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_availability: {
        Row: {
          branch_id: string | null
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          organization_id: string
          staff_profile_id: string
          start_time: string
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          organization_id: string
          staff_profile_id: string
          start_time: string
          user_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          organization_id?: string
          staff_profile_id?: string
          start_time?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_availability_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_availability_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_availability_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_availability_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_documents: {
        Row: {
          branch_id: string | null
          created_at: string
          doc_type: string
          id: string
          organization_id: string
          review_note: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          staff_profile_id: string
          storage_path: string
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          doc_type: string
          id?: string
          organization_id: string
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_profile_id: string
          storage_path: string
          user_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          doc_type?: string
          id?: string
          organization_id?: string
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_profile_id?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_documents_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_documents_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_documents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_profiles: {
        Row: {
          branch_id: string | null
          created_at: string
          designation: string | null
          employment_type: string
          id: string
          membership_id: string
          notes: string | null
          onboarded_by: string | null
          organization_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          designation?: string | null
          employment_type?: string
          id?: string
          membership_id: string
          notes?: string | null
          onboarded_by?: string | null
          organization_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          designation?: string | null
          employment_type?: string
          id?: string
          membership_id?: string
          notes?: string | null
          onboarded_by?: string | null
          organization_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_profiles_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: true
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_profiles_onboarded_by_fkey"
            columns: ["onboarded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          negotiated_overrides: Json | null
          organization_id: string
          plan_id: string
          status: string
          trial_ends_at: string | null
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          negotiated_overrides?: Json | null
          organization_id: string
          plan_id: string
          status: string
          trial_ends_at?: string | null
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          negotiated_overrides?: Json | null
          organization_id?: string
          plan_id?: string
          status?: string
          trial_ends_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      support_access_grants: {
        Row: {
          created_at: string
          expires_at: string
          granted_by: string
          grantee_user_id: string
          id: string
          organization_id: string
          reason: string
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          granted_by: string
          grantee_user_id: string
          id?: string
          organization_id: string
          reason: string
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          granted_by?: string
          grantee_user_id?: string
          id?: string
          organization_id?: string
          reason?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_access_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_access_grants_grantee_user_id_fkey"
            columns: ["grantee_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_access_grants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      taxonomy_sports: {
        Row: {
          category: string | null
          key: string
          label: string
        }
        Insert: {
          category?: string | null
          key: string
          label: string
        }
        Update: {
          category?: string | null
          key?: string
          label?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          avatar_path: string | null
          created_at: string
          deleted_at: string | null
          display_name: string
          dob: string | null
          id: string
          locale: string
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name: string
          dob?: string | null
          id?: string
          locale?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          dob?: string | null
          id?: string
          locale?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_org_listings: { Args: { p_org: string }; Returns: undefined }
      current_org: { Args: never; Returns: string }
      current_user_id: { Args: never; Returns: string }
      get_or_create_ledger_account: {
        Args: { p_kind: string; p_org: string }
        Returns: string
      }
      get_or_create_platform_ledger_account: {
        Args: { p_kind: string }
        Returns: string
      }
      get_or_create_user_ledger_account: {
        Args: { p_kind: string; p_user: string }
        Returns: string
      }
      has_consent_authority: {
        Args: { p_ward_user_id: string }
        Returns: boolean
      }
      has_perm: { Args: { perm: string }; Returns: boolean }
      has_perm_branch: { Args: { b: string; perm: string }; Returns: boolean }
      has_platform_perm: { Args: { perm: string }; Returns: boolean }
      is_batch_participant: { Args: { p_batch_id: string }; Returns: boolean }
      is_guardian_of: { Args: { p_ward_user_id: string }; Returns: boolean }
      is_my_ward: {
        Args: { p_organization_id: string; p_ward_user_id: string }
        Returns: boolean
      }
      is_org_owner: {
        Args: { p_org: string; p_user: string }
        Returns: boolean
      }
      match_face: {
        Args: {
          p_batch_id: string
          p_embedding: string
          p_match_count?: number
        }
        Returns: {
          enrollment_id: string
          similarity: number
        }[]
      }
      my_batch_ids: { Args: never; Returns: string[] }
      my_branch_scope: { Args: { org: string }; Returns: string }
      post_ledger_entries: { Args: { p_entries: Json }; Returns: string }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      support_grant_active: { Args: { org: string }; Returns: boolean }
      write_audit_log: {
        Args: {
          p_action: string
          p_detail?: Json
          p_org?: string
          p_support_grant_id?: string
          p_target_id: string
          p_target_type: string
        }
        Returns: string
      }
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

