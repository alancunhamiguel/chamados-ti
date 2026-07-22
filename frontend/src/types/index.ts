export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'technician' | 'employee';
  sector: string;
  avatar_url?: string;
  is_active: boolean;
  created_at: string;
}

export type TicketStatus = 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Ticket {
  id: string;
  ticket_number: number;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  sector_id: string;
  category?: string;
  created_by: string;
  assigned_to?: string;
  sla_deadline?: string;
  resolved_at?: string;
  closed_at?: string;
  created_at: string;
  updated_at: string;
  creator?: User;
  assignee?: User;
  sector?: Sector;
}

export interface Sector {
  id: string;
  name: string;
}

export interface Comment {
  id: string;
  ticket_id: string;
  user_id: string;
  message: string;
  is_internal: boolean;
  created_at: string;
  user?: User;
}

export interface Attachment {
  id: string;
  ticket_id: string;
  original_filename: string;
  file_size: number;
  mime_type?: string;
  uploaded_by: string;
  created_at: string;
}

export interface HistoryEntry {
  id: string;
  ticket_id: string;
  user_id: string;
  action: string;
  old_value?: string;
  new_value?: string;
  description?: string;
  created_at: string;
  user_name?: string;
}

export interface DashboardStats {
  total_tickets: number;
  open_tickets: number;
  in_progress_tickets: number;
  resolved_tickets: number;
  closed_tickets: number;
  avg_resolution_hours?: number;
  sla_breach_count: number;
}

export interface TicketListResponse {
  tickets: Ticket[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}
