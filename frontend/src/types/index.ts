export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'technician' | 'employee';
  sector: string;
  avatar_url?: string;
  is_active: boolean;
  online_status: 'disponivel' | 'ocupado' | 'em_atendimento' | 'offline';
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
