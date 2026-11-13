export type UserRole = 'CONTROL_ROOM' | 'HOSPITAL_STAFF' | 'AMBULANCE_DISPATCHER';

export type BedType = 'ICU' | 'VENTILATOR' | 'GENERAL';

export type BedStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED';

export type EmergencyPriority = 'CRITICAL' | 'HIGH' | 'NORMAL';

export type HospitalStatus = 'OPERATIONAL' | 'SURGE' | 'OFFLINE';

export type AmbulanceStatus = 'AVAILABLE' | 'DISPATCHED' | 'EN_ROUTE' | 'AT_HOSPITAL' | 'OFFLINE';

export type ReservationStatus = 'ACTIVE' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';

export type TransferStatus =
  | 'REQUESTED'
  | 'PENDING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'IN_TRANSIT'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED';

export type EmergencyRequestStatus =
  | 'OPEN'
  | 'RESERVED'
  | 'ADMITTED'
  | 'TRANSFERRED'
  | 'CANCELLED';

export type QueueName =
  | 'bed_tracking_queue'
  | 'notification_queue'
  | 'audit_queue'
  | 'transfer_saga_queue';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  hospital_id: string | null;
  ambulance_id: string | null;
}

export interface BedRecord {
  id: string;
  hospital_id: string;
  bed_type: BedType;
  status: BedStatus;
  patient_id: string | null;
  patient_name?: string | null;
  updated_at: string;
}

export interface HospitalBedSummary {
  bed_type: BedType;
  total_beds: number;
  available_beds: number;
  occupied_beds: number;
  reserved_beds: number;
}

export interface Hospital {
  id: string;
  name: string;
  code: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string;
  status: HospitalStatus;
  beds: HospitalBedSummary[];
  total_capacity: number;
  available_total: number;
  occupied_total: number;
  reserved_total: number;
  distance_km?: number;
  suitability_score?: number;
}

export interface Patient {
  id: string;
  mrn: string;
  name: string;
  age: number;
  condition: string;
  priority: EmergencyPriority;
  status: 'IN_AMBULANCE' | 'RESERVED' | 'ADMITTED' | 'IN_TRANSFER' | 'DISCHARGED';
  hospital_id: string | null;
  bed_id: string | null;
  bed_type: BedType | null;
  last_sequence_number: number;
  updated_at: string;
}

export interface Ambulance {
  id: string;
  call_sign: string;
  crew_lead: string;
  latitude: number;
  longitude: number;
  status: AmbulanceStatus;
  assigned_request_id: string | null;
  target_hospital_id: string | null;
  updated_at: string;
}

export interface BedReservation {
  id: string;
  hospital_id: string;
  hospital_name?: string;
  bed_id: string;
  bed_type: BedType;
  patient_id: string;
  patient_name?: string;
  ambulance_id: string | null;
  ambulance_call_sign?: string | null;
  request_id: string | null;
  transfer_id: string | null;
  priority: EmergencyPriority;
  status: ReservationStatus;
  created_at: string;
  expires_at: string;
  confirmed_at: string | null;
}

export interface EmergencyRequest {
  id: string;
  patient_id: string;
  patient_name: string;
  condition: string;
  priority: EmergencyPriority;
  required_bed_type: BedType;
  ambulance_id: string;
  ambulance_call_sign?: string;
  latitude: number;
  longitude: number;
  location_label: string;
  status: EmergencyRequestStatus;
  assigned_hospital_id: string | null;
  assigned_hospital_name?: string | null;
  reservation_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TransferRequest {
  id: string;
  patient_id: string;
  patient_name: string;
  patient_condition: string;
  from_hospital_id: string;
  from_hospital_name: string;
  to_hospital_id: string;
  to_hospital_name: string;
  required_bed_type: BedType;
  priority: EmergencyPriority;
  reason: string;
  status: TransferStatus;
  reservation_id: string | null;
  bed_id: string | null;
  saga_step: string;
  compensation_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  event_id: string;
  event_type: string;
  actor: string;
  hospital_id: string | null;
  hospital_name?: string | null;
  patient_id: string | null;
  bed_id?: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface BrokerEvent {
  id: string;
  event_type: string;
  queue_name: QueueName;
  priority: number;
  patient_id?: string | null;
  hospital_id?: string | null;
  bed_id?: string | null;
  sequence_number?: number | null;
  payload: Record<string, unknown>;
  status: 'PENDING' | 'PROCESSING' | 'ACKED' | 'RETRYING' | 'DEAD_LETTERED';
  retry_count: number;
  max_retries: number;
  next_retry_at: string | null;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface AppInstanceStatus {
  id: string;
  name: string;
  virtual_port: number;
  status: 'ACTIVE' | 'STOPPED';
  requests_handled: number;
  started_at: string;
  last_heartbeat: string;
}

export interface SystemMetrics {
  redis: {
    connected: boolean;
    active_locks: number;
    active_reservations: number;
    rate_limit_hits: number;
    avg_lookup_ms: number;
    p95_lookup_ms: number;
  };
  rabbitmq: {
    connected: boolean;
    consumer_paused: boolean;
    events_per_sec: number;
    total_published: number;
    total_acked: number;
    queue_depths: Record<QueueName, number>;
    pending_messages: number;
    consumer_lag_ms: number;
    consumer_failures: number;
    retry_count: number;
    dlq_count: number;
    outbox_pending: number;
    duplicate_events_prevented: number;
    out_of_order_blocked: number;
    fail_consumer_mode: boolean;
  };
  instances: AppInstanceStatus[];
  ws_clients: number;
  throughput_history: Array<{
    time: string;
    events_per_sec: number;
    search_ms: number;
    queue_depth: number;
  }>;
}

export interface DashboardSnapshot {
  hospitals: Hospital[];
  ambulances: Ambulance[];
  reservations: BedReservation[];
  requests: EmergencyRequest[];
  transfers: TransferRequest[];
  patients: Patient[];
  auditLogs: AuditLog[];
  metrics: SystemMetrics;
  activeInstance: string;
  networkTotals: {
    total_hospitals: number;
    total_beds: number;
    available_beds: number;
    occupied_beds: number;
    reserved_beds: number;
    icu_available: number;
    ventilator_available: number;
    general_available: number;
  };
}

export interface SimulationResult {
  scenario: string;
  title: string;
  expected_result: string;
  actual_result: string;
  passed: boolean;
  duration_ms: number;
  total_requests: number;
  successful_reservations: number;
  rejected_reservations: number;
  duplicate_requests_prevented: number;
  events_processed: number;
  failed_events: number;
  retried_events: number;
  dead_lettered_events: number;
  summary: string;
  details: string[];
  event_logs: string[];
  timestamp: string;
}
