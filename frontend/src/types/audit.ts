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
  order_by?: 'created_at' | 'duracion_ms' | 'status_code' | 'method' | 'path' | 'action' | 'usuario_email' | 'municipio_id';
  order_dir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface AuditGroupedRow {
  path: string;
  count: number;
  p50_ms: number;
  p95_ms: number;
  max_ms: number;
  errors: number;
  last_seen: string;
}

export interface AuditGroupedPage {
  items: AuditGroupedRow[];
  total: number;
}

export interface AuditGroupedFilters {
  municipio_id?: number;
  desde?: string;
  hasta?: string;
  method?: string[];
  order_by?: 'count' | 'p50_ms' | 'p95_ms' | 'max_ms' | 'errors' | 'last_seen' | 'path';
  order_dir?: 'asc' | 'desc';
  limit?: number;
}

export interface ConsolaResumen {
  total_municipios: number;
  total_usuarios: number;
  total_reclamos: number;
  total_solicitudes: number;
  requests_24h: number;
  errors_24h: number;
  error_rate_24h: number;
  p50_ms_24h: number;
  p95_ms_24h: number;
  top_municipios: Array<{ municipio_id: number; municipio_nombre: string; count: number }>;
  slowest_endpoints: Array<{ path: string; p95_ms: number; count: number }>;
  recent_errors: Array<{ created_at: string; method: string; path: string; status_code: number; municipio_nombre: string | null }>;
}
