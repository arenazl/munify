export interface AuditLogItem {
  id: number;
  created_at: string;
  usuario_id?: number | null;
  usuario_email?: string | null;
  usuario_rol?: string | null;
  municipio_id?: number | null;
  municipio_nombre?: string | null;
  method: string;
  path: string;
  status_code: number;
  duracion_ms: number;
  action?: string | null;
  entity_type?: string | null;
  entity_id?: number | null;
  ip_address?: string | null;
}

export interface AuditLogDetail extends AuditLogItem {
  query_params?: unknown;
  request_body?: unknown;
  response_summary?: unknown;
  error_message?: string | null;
  user_agent?: string | null;
}

export interface AuditLogPage {
  items: AuditLogItem[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

export interface AuditStats {
  total_requests: number;
  error_count: number;
  error_rate: number;
  p50_ms: number;
  p95_ms: number;
  top_endpoints: Array<{ path: string; count: number }>;
  slowest_endpoints: Array<{ path: string; p95_ms: number }>;
  requests_by_status: Record<string, number>;
}

export interface AuditFilters {
  municipio_id?: number;
  usuario_id?: number;
  usuario_email?: string;
  method?: string[];
  path?: string;
  action?: string[];
  status_code_min?: number;
  status_code_max?: number;
  duracion_min_ms?: number;
  duracion_max_ms?: number;
  desde?: string;
  hasta?: string;
  q?: string;
  order_by?: 'created_at' | 'duracion_ms' | 'status_code';
  order_dir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}
