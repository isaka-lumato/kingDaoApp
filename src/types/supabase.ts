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
      audit_log: {
        Row: {
          actor_email: string | null
          actor_id: string | null
          column_name: string
          id: number
          new_value: Json | null
          occurred_at: string
          old_value: Json | null
          row_id: string | null
          table_name: string
        }
        Insert: {
          actor_email?: string | null
          actor_id?: string | null
          column_name: string
          id?: number
          new_value?: Json | null
          occurred_at?: string
          old_value?: Json | null
          row_id?: string | null
          table_name: string
        }
        Update: {
          actor_email?: string | null
          actor_id?: string | null
          column_name?: string
          id?: number
          new_value?: Json | null
          occurred_at?: string
          old_value?: Json | null
          row_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          contact_email: string | null
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          sub_label: string | null
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          sub_label?: string | null
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          sub_label?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      consignments: {
        Row: {
          amount: number | null
          arrival_date: string | null
          assessment_status: Database["public"]["Enums"]["assessment_status"]
          bl_number: string | null
          client_id: string
          container_count: number
          container_type: Database["public"]["Enums"]["container_type"]
          created_at: string
          current_status: string | null
          deleted_at: string | null
          duty_status: Database["public"]["Enums"]["duty_status"]
          goods_description: string | null
          guta_pair_id: string | null
          icd_id: string | null
          id: string
          in_ref: string | null
          inspection_file_status: Database["public"]["Enums"]["inspection_file_status"]
          is_failed: boolean
          is_refund_pending: boolean
          is_shared: boolean
          is_waiting_registration: boolean
          manifest_comp_status: Database["public"]["Enums"]["manifest_comp_status"]
          manifest_status: Database["public"]["Enums"]["manifest_status"]
          ref_no: string
          release_date: string | null
          release_status: Database["public"]["Enums"]["release_status"]
          remarks: string | null
          serial_no: number | null
          shared_with_consignment_id: string | null
          shipping_batch_status: Database["public"]["Enums"]["shipping_batch_status"]
          tanesws_status: Database["public"]["Enums"]["tanesws_status"]
          tansad_no: string | null
          tbs_debit_status: Database["public"]["Enums"]["tbs_debit_status"]
          tbs_loading_status: Database["public"]["Enums"]["tbs_loading_status"]
          updated_at: string
          updated_by: string | null
          vessel_name: string | null
          year: number
        }
        Insert: {
          amount?: number | null
          arrival_date?: string | null
          assessment_status?: Database["public"]["Enums"]["assessment_status"]
          bl_number?: string | null
          client_id: string
          container_count?: number
          container_type: Database["public"]["Enums"]["container_type"]
          created_at?: string
          current_status?: string | null
          deleted_at?: string | null
          duty_status?: Database["public"]["Enums"]["duty_status"]
          goods_description?: string | null
          guta_pair_id?: string | null
          icd_id?: string | null
          id?: string
          in_ref?: string | null
          inspection_file_status?: Database["public"]["Enums"]["inspection_file_status"]
          is_failed?: boolean
          is_refund_pending?: boolean
          is_shared?: boolean
          is_waiting_registration?: boolean
          manifest_comp_status?: Database["public"]["Enums"]["manifest_comp_status"]
          manifest_status?: Database["public"]["Enums"]["manifest_status"]
          ref_no: string
          release_date?: string | null
          release_status?: Database["public"]["Enums"]["release_status"]
          remarks?: string | null
          serial_no?: number | null
          shared_with_consignment_id?: string | null
          shipping_batch_status?: Database["public"]["Enums"]["shipping_batch_status"]
          tanesws_status?: Database["public"]["Enums"]["tanesws_status"]
          tansad_no?: string | null
          tbs_debit_status?: Database["public"]["Enums"]["tbs_debit_status"]
          tbs_loading_status?: Database["public"]["Enums"]["tbs_loading_status"]
          updated_at?: string
          updated_by?: string | null
          vessel_name?: string | null
          year: number
        }
        Update: {
          amount?: number | null
          arrival_date?: string | null
          assessment_status?: Database["public"]["Enums"]["assessment_status"]
          bl_number?: string | null
          client_id?: string
          container_count?: number
          container_type?: Database["public"]["Enums"]["container_type"]
          created_at?: string
          current_status?: string | null
          deleted_at?: string | null
          duty_status?: Database["public"]["Enums"]["duty_status"]
          goods_description?: string | null
          guta_pair_id?: string | null
          icd_id?: string | null
          id?: string
          in_ref?: string | null
          inspection_file_status?: Database["public"]["Enums"]["inspection_file_status"]
          is_failed?: boolean
          is_refund_pending?: boolean
          is_shared?: boolean
          is_waiting_registration?: boolean
          manifest_comp_status?: Database["public"]["Enums"]["manifest_comp_status"]
          manifest_status?: Database["public"]["Enums"]["manifest_status"]
          ref_no?: string
          release_date?: string | null
          release_status?: Database["public"]["Enums"]["release_status"]
          remarks?: string | null
          serial_no?: number | null
          shared_with_consignment_id?: string | null
          shipping_batch_status?: Database["public"]["Enums"]["shipping_batch_status"]
          tanesws_status?: Database["public"]["Enums"]["tanesws_status"]
          tansad_no?: string | null
          tbs_debit_status?: Database["public"]["Enums"]["tbs_debit_status"]
          tbs_loading_status?: Database["public"]["Enums"]["tbs_loading_status"]
          updated_at?: string
          updated_by?: string | null
          vessel_name?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "consignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_volume"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "consignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_turnaround_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "consignments_guta_pair_fk"
            columns: ["guta_pair_id"]
            isOneToOne: false
            referencedRelation: "consignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignments_guta_pair_fk"
            columns: ["guta_pair_id"]
            isOneToOne: false
            referencedRelation: "v_pending_refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignments_guta_pair_fk"
            columns: ["guta_pair_id"]
            isOneToOne: false
            referencedRelation: "v_stuck_stages"
            referencedColumns: ["consignment_id"]
          },
          {
            foreignKeyName: "consignments_icd_id_fkey"
            columns: ["icd_id"]
            isOneToOne: false
            referencedRelation: "icds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignments_icd_id_fkey"
            columns: ["icd_id"]
            isOneToOne: false
            referencedRelation: "v_turnaround_by_icd"
            referencedColumns: ["icd_id"]
          },
          {
            foreignKeyName: "consignments_shared_with_fk"
            columns: ["shared_with_consignment_id"]
            isOneToOne: false
            referencedRelation: "consignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignments_shared_with_fk"
            columns: ["shared_with_consignment_id"]
            isOneToOne: false
            referencedRelation: "v_pending_refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignments_shared_with_fk"
            columns: ["shared_with_consignment_id"]
            isOneToOne: false
            referencedRelation: "v_stuck_stages"
            referencedColumns: ["consignment_id"]
          },
        ]
      }
      efd_record_consignments: {
        Row: {
          consignment_id: string
          efd_record_id: string
          linked_at: string
          linked_by: string | null
        }
        Insert: {
          consignment_id: string
          efd_record_id: string
          linked_at?: string
          linked_by?: string | null
        }
        Update: {
          consignment_id?: string
          efd_record_id?: string
          linked_at?: string
          linked_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "efd_record_consignments_consignment_id_fkey"
            columns: ["consignment_id"]
            isOneToOne: false
            referencedRelation: "consignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efd_record_consignments_consignment_id_fkey"
            columns: ["consignment_id"]
            isOneToOne: false
            referencedRelation: "v_pending_refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efd_record_consignments_consignment_id_fkey"
            columns: ["consignment_id"]
            isOneToOne: false
            referencedRelation: "v_stuck_stages"
            referencedColumns: ["consignment_id"]
          },
          {
            foreignKeyName: "efd_record_consignments_efd_record_id_fkey"
            columns: ["efd_record_id"]
            isOneToOne: false
            referencedRelation: "efd_records"
            referencedColumns: ["id"]
          },
        ]
      }
      efd_records: {
        Row: {
          created_at: string
          created_by: string | null
          efd_code: string
          efd_time: string | null
          id: string
          is_private: boolean
          is_shared: boolean
          is_transit: boolean
          notes: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          efd_code: string
          efd_time?: string | null
          id?: string
          is_private?: boolean
          is_shared?: boolean
          is_transit?: boolean
          notes?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          efd_code?: string
          efd_time?: string | null
          id?: string
          is_private?: boolean
          is_shared?: boolean
          is_transit?: boolean
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      guta_pairs: {
        Row: {
          batch_code: string
          confirmed_at: string | null
          detected_at: string
          frames_consignment_id: string
          id: string
          is_confirmed: boolean
          parts_consignment_id: string
        }
        Insert: {
          batch_code: string
          confirmed_at?: string | null
          detected_at?: string
          frames_consignment_id: string
          id?: string
          is_confirmed?: boolean
          parts_consignment_id: string
        }
        Update: {
          batch_code?: string
          confirmed_at?: string | null
          detected_at?: string
          frames_consignment_id?: string
          id?: string
          is_confirmed?: boolean
          parts_consignment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guta_pairs_frames_consignment_id_fkey"
            columns: ["frames_consignment_id"]
            isOneToOne: true
            referencedRelation: "consignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guta_pairs_frames_consignment_id_fkey"
            columns: ["frames_consignment_id"]
            isOneToOne: true
            referencedRelation: "v_pending_refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guta_pairs_frames_consignment_id_fkey"
            columns: ["frames_consignment_id"]
            isOneToOne: true
            referencedRelation: "v_stuck_stages"
            referencedColumns: ["consignment_id"]
          },
          {
            foreignKeyName: "guta_pairs_parts_consignment_id_fkey"
            columns: ["parts_consignment_id"]
            isOneToOne: true
            referencedRelation: "consignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guta_pairs_parts_consignment_id_fkey"
            columns: ["parts_consignment_id"]
            isOneToOne: true
            referencedRelation: "v_pending_refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guta_pairs_parts_consignment_id_fkey"
            columns: ["parts_consignment_id"]
            isOneToOne: true
            referencedRelation: "v_stuck_stages"
            referencedColumns: ["consignment_id"]
          },
        ]
      }
      icds: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          location: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      import_jobs: {
        Row: {
          committed_at: string | null
          created_at: string
          errors_count: number
          filename: string | null
          id: string
          inserted_count: number
          parsed_count: number
          payload: Json | null
          status: string
          user_id: string | null
          warnings_count: number
        }
        Insert: {
          committed_at?: string | null
          created_at?: string
          errors_count?: number
          filename?: string | null
          id?: string
          inserted_count?: number
          parsed_count?: number
          payload?: Json | null
          status: string
          user_id?: string | null
          warnings_count?: number
        }
        Update: {
          committed_at?: string | null
          created_at?: string
          errors_count?: number
          filename?: string | null
          id?: string
          inserted_count?: number
          parsed_count?: number
          payload?: Json | null
          status?: string
          user_id?: string | null
          warnings_count?: number
        }
        Relationships: []
      }
      role_column_permissions: {
        Row: {
          can_read: boolean
          can_write: boolean
          column_name: string
          role_id: string
          table_name: string
        }
        Insert: {
          can_read?: boolean
          can_write?: boolean
          column_name: string
          role_id: string
          table_name: string
        }
        Update: {
          can_read?: boolean
          can_write?: boolean
          column_name?: string
          role_id?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_column_permissions_role_id_fkey"
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
          description: string | null
          id: string
          is_system: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          alert_email_enabled: boolean
          id: number
          stuck_threshold_hours: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alert_email_enabled?: boolean
          id?: number
          stuck_threshold_hours?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alert_email_enabled?: boolean
          id?: number
          stuck_threshold_hours?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      stage_history: {
        Row: {
          actor_email: string | null
          actor_id: string | null
          consignment_id: string
          from_value: string | null
          id: number
          is_forced: boolean
          occurred_at: string
          reason: string | null
          stage: Database["public"]["Enums"]["pipeline_stage"]
          to_value: string
        }
        Insert: {
          actor_email?: string | null
          actor_id?: string | null
          consignment_id: string
          from_value?: string | null
          id?: number
          is_forced?: boolean
          occurred_at?: string
          reason?: string | null
          stage: Database["public"]["Enums"]["pipeline_stage"]
          to_value: string
        }
        Update: {
          actor_email?: string | null
          actor_id?: string | null
          consignment_id?: string
          from_value?: string | null
          id?: number
          is_forced?: boolean
          occurred_at?: string
          reason?: string | null
          stage?: Database["public"]["Enums"]["pipeline_stage"]
          to_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_history_consignment_id_fkey"
            columns: ["consignment_id"]
            isOneToOne: false
            referencedRelation: "consignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_history_consignment_id_fkey"
            columns: ["consignment_id"]
            isOneToOne: false
            referencedRelation: "v_pending_refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_history_consignment_id_fkey"
            columns: ["consignment_id"]
            isOneToOne: false
            referencedRelation: "v_stuck_stages"
            referencedColumns: ["consignment_id"]
          },
        ]
      }
      stuck_alerts: {
        Row: {
          alerted_at: string
          consignment_id: string
          resolved_at: string | null
          stage: Database["public"]["Enums"]["pipeline_stage"]
        }
        Insert: {
          alerted_at?: string
          consignment_id: string
          resolved_at?: string | null
          stage: Database["public"]["Enums"]["pipeline_stage"]
        }
        Update: {
          alerted_at?: string
          consignment_id?: string
          resolved_at?: string | null
          stage?: Database["public"]["Enums"]["pipeline_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "stuck_alerts_consignment_id_fkey"
            columns: ["consignment_id"]
            isOneToOne: false
            referencedRelation: "consignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stuck_alerts_consignment_id_fkey"
            columns: ["consignment_id"]
            isOneToOne: false
            referencedRelation: "v_pending_refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stuck_alerts_consignment_id_fkey"
            columns: ["consignment_id"]
            isOneToOne: false
            referencedRelation: "v_stuck_stages"
            referencedColumns: ["consignment_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          role_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          role_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      vessels: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_client_volume: {
        Row: {
          active_count: number | null
          client_id: string | null
          client_name: string | null
          job_count: number | null
          released_count: number | null
          sub_label: string | null
          total_containers: number | null
          total_revenue: number | null
          year: number | null
        }
        Relationships: []
      }
      v_in_ref_batches: {
        Row: {
          all_released: boolean | null
          client_id: string | null
          client_name: string | null
          consignment_count: number | null
          earliest_arrival: string | null
          efd_code: string | null
          in_ref: string | null
          latest_arrival: string | null
          total_amount: number | null
          total_containers: number | null
          year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "consignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_volume"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "consignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_turnaround_by_client"
            referencedColumns: ["client_id"]
          },
        ]
      }
      v_pending_refunds: {
        Row: {
          amount: number | null
          client_name: string | null
          created_at: string | null
          id: string | null
          ref_no: string | null
          release_date: string | null
          remarks: string | null
          year: number | null
        }
        Relationships: []
      }
      v_pipeline_funnel: {
        Row: {
          assessment_action: number | null
          duty_action: number | null
          inspection_action: number | null
          manifest_action: number | null
          manifest_comp_action: number | null
          ready_to_release: number | null
          released: number | null
          shipping_action: number | null
          tanesws_action: number | null
          tbs_debit_action: number | null
          tbs_loading_action: number | null
          total_active: number | null
          year: number | null
        }
        Relationships: []
      }
      v_revenue_monthly: {
        Row: {
          consignment_count: number | null
          month: string | null
          month_label: string | null
          total_amount: number | null
          year: number | null
        }
        Relationships: []
      }
      v_stuck_stages: {
        Row: {
          arrival_date: string | null
          client_name: string | null
          consignment_id: string | null
          elapsed: string | null
          hours_stuck: number | null
          ref_no: string | null
          stage: Database["public"]["Enums"]["pipeline_stage"] | null
          stuck_since: string | null
          stuck_value: string | null
          vessel_name: string | null
          year: number | null
        }
        Relationships: []
      }
      v_turnaround_by_client: {
        Row: {
          avg_days: number | null
          client_id: string | null
          client_name: string | null
          max_days: number | null
          min_days: number | null
          released_count: number | null
          sub_label: string | null
          year: number | null
        }
        Relationships: []
      }
      v_turnaround_by_icd: {
        Row: {
          avg_days: number | null
          icd_id: string | null
          icd_name: string | null
          released_count: number | null
          year: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      advance_stage: {
        Args: {
          p_id: string
          p_new_value: string
          p_reason?: string
          p_stage: Database["public"]["Enums"]["pipeline_stage"]
        }
        Returns: {
          amount: number | null
          arrival_date: string | null
          assessment_status: Database["public"]["Enums"]["assessment_status"]
          bl_number: string | null
          client_id: string
          container_count: number
          container_type: Database["public"]["Enums"]["container_type"]
          created_at: string
          current_status: string | null
          deleted_at: string | null
          duty_status: Database["public"]["Enums"]["duty_status"]
          goods_description: string | null
          guta_pair_id: string | null
          icd_id: string | null
          id: string
          in_ref: string | null
          inspection_file_status: Database["public"]["Enums"]["inspection_file_status"]
          is_failed: boolean
          is_refund_pending: boolean
          is_shared: boolean
          is_waiting_registration: boolean
          manifest_comp_status: Database["public"]["Enums"]["manifest_comp_status"]
          manifest_status: Database["public"]["Enums"]["manifest_status"]
          ref_no: string
          release_date: string | null
          release_status: Database["public"]["Enums"]["release_status"]
          remarks: string | null
          serial_no: number | null
          shared_with_consignment_id: string | null
          shipping_batch_status: Database["public"]["Enums"]["shipping_batch_status"]
          tanesws_status: Database["public"]["Enums"]["tanesws_status"]
          tansad_no: string | null
          tbs_debit_status: Database["public"]["Enums"]["tbs_debit_status"]
          tbs_loading_status: Database["public"]["Enums"]["tbs_loading_status"]
          updated_at: string
          updated_by: string | null
          vessel_name: string | null
          year: number
        }
        SetofOptions: {
          from: "*"
          to: "consignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      can_user_read: {
        Args: { p_column: string; p_table: string }
        Returns: boolean
      }
      can_user_write: {
        Args: { p_column: string; p_table: string }
        Returns: boolean
      }
      claim_new_stuck_alerts: {
        Args: never
        Returns: {
          client_name: string
          consignment_id: string
          hours_stuck: number
          ref_no: string
          stage: Database["public"]["Enums"]["pipeline_stage"]
          stuck_since: string
          stuck_value: string
          vessel_name: string
          year: number
        }[]
      }
      force_set_stage: {
        Args: {
          p_id: string
          p_new_value: string
          p_reason: string
          p_stage: Database["public"]["Enums"]["pipeline_stage"]
        }
        Returns: {
          amount: number | null
          arrival_date: string | null
          assessment_status: Database["public"]["Enums"]["assessment_status"]
          bl_number: string | null
          client_id: string
          container_count: number
          container_type: Database["public"]["Enums"]["container_type"]
          created_at: string
          current_status: string | null
          deleted_at: string | null
          duty_status: Database["public"]["Enums"]["duty_status"]
          goods_description: string | null
          guta_pair_id: string | null
          icd_id: string | null
          id: string
          in_ref: string | null
          inspection_file_status: Database["public"]["Enums"]["inspection_file_status"]
          is_failed: boolean
          is_refund_pending: boolean
          is_shared: boolean
          is_waiting_registration: boolean
          manifest_comp_status: Database["public"]["Enums"]["manifest_comp_status"]
          manifest_status: Database["public"]["Enums"]["manifest_status"]
          ref_no: string
          release_date: string | null
          release_status: Database["public"]["Enums"]["release_status"]
          remarks: string | null
          serial_no: number | null
          shared_with_consignment_id: string | null
          shipping_batch_status: Database["public"]["Enums"]["shipping_batch_status"]
          tanesws_status: Database["public"]["Enums"]["tanesws_status"]
          tansad_no: string | null
          tbs_debit_status: Database["public"]["Enums"]["tbs_debit_status"]
          tbs_loading_status: Database["public"]["Enums"]["tbs_loading_status"]
          updated_at: string
          updated_by: string | null
          vessel_name: string | null
          year: number
        }
        SetofOptions: {
          from: "*"
          to: "consignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_admin: { Args: never; Returns: boolean }
      reset_resolved_stuck_alerts: { Args: never; Returns: number }
      seed_operator_consignment_perms: { Args: never; Returns: undefined }
      seed_viewer_consignment_perms: { Args: never; Returns: undefined }
    }
    Enums: {
      assessment_status: "Waiting" | "Action" | "Closed"
      container_type: "40FT" | "20FT" | "CAR" | "COIL"
      duty_status: "Waiting" | "Action" | "Paid"
      inspection_file_status: "Waiting" | "Action" | "Done" | "SHARED"
      manifest_comp_status: "Waiting" | "Action" | "Done"
      manifest_status: "Waiting" | "Action" | "Uploaded"
      pipeline_stage:
        | "manifest"
        | "shipping_batch"
        | "tanesws"
        | "assessment"
        | "tbs_loading"
        | "tbs_debit"
        | "manifest_comp"
        | "duty"
        | "inspection_file"
        | "release"
      release_status: "Waiting" | "Released"
      shipping_batch_status:
        | "Waiting"
        | "Action"
        | "PREPARED"
        | "W/CARRY IN"
        | "CARRY IN END"
        | "Done"
      tanesws_status: "Waiting" | "Action" | "Done"
      tbs_debit_status: "Waiting" | "Action" | "Paid" | "SHARED"
      tbs_loading_status: "Waiting" | "Action" | "Done"
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
      assessment_status: ["Waiting", "Action", "Closed"],
      container_type: ["40FT", "20FT", "CAR", "COIL"],
      duty_status: ["Waiting", "Action", "Paid"],
      inspection_file_status: ["Waiting", "Action", "Done", "SHARED"],
      manifest_comp_status: ["Waiting", "Action", "Done"],
      manifest_status: ["Waiting", "Action", "Uploaded"],
      pipeline_stage: [
        "manifest",
        "shipping_batch",
        "tanesws",
        "assessment",
        "tbs_loading",
        "tbs_debit",
        "manifest_comp",
        "duty",
        "inspection_file",
        "release",
      ],
      release_status: ["Waiting", "Released"],
      shipping_batch_status: [
        "Waiting",
        "Action",
        "PREPARED",
        "W/CARRY IN",
        "CARRY IN END",
        "Done",
      ],
      tanesws_status: ["Waiting", "Action", "Done"],
      tbs_debit_status: ["Waiting", "Action", "Paid", "SHARED"],
      tbs_loading_status: ["Waiting", "Action", "Done"],
    },
  },
} as const
