export type UserRole = 'ADMIN' | 'ALMACEN' | 'USER' | 'APROBADOR';

export interface Area {
  id: string;
  name: string;
  description?: string;
  created_at?: string;
}

export interface Employee {
  id: string;
  code: string;
  first_name: string;
  last_name: string;
  area_name?: string;
  position?: string;
  area_id?: string;
  user_id?: string;
  created_at?: string;
  areas?: Area;
  managed_areas?: Area[];
}

export interface UserProfile {
  id: string;
  role: UserRole;
  employee_id?: string;
  created_at?: string;
  updated_at?: string;
  employees?: Employee;
}

export interface Category {
  id: string;
  name: string;
  created_at?: string;
}

export interface Unit {
  id: string;
  name: string;
  abbreviation?: string;
  created_at?: string;
}

export interface InventoryItem {
  id: string;
  code: string;
  name: string;
  description?: string;
  quantity: number;
  committed_quantity: number;
  min_stock: number;
  max_stock: number;
  price: number;
  status: 'ACTIVE' | 'INACTIVE';
  category_id?: string;
  unit_id?: string;
  image_url?: string | null;
  origin?: 'LOCAL' | 'INTERNACIONAL';
  lead_time_days?: number;
  min_order_qty?: number;
  package_unit_id?: string | null;
  units_per_package?: number | null;
  package_unit?: { name: string } | null;
  is_assignable?: boolean;
  created_at?: string;
  updated_at?: string;
  categories?: Category;
  units?: Unit;
  // Campos calculados en el frontend
  pending_oc?: number;
  avg_consumption?: number;
}

export interface RequisitionItem {
  id: string;
  requisition_id?: string;
  inventory_item_id?: string;
  quantity: number;
  unit_cost?: number;
  delivered_quantity?: number;
  created_at?: string;
  inventory_items?: InventoryItem;
}

export type RequisitionStatus = 'PENDIENTE' | 'PENDIENTE DE APROBACION' | 'ENTREGADA' | 'CANCELADA';

export interface Requisition {
  id: string;
  consecutive?: number;
  user_id?: string;
  budget_id?: string;
  area_id?: string;
  status: RequisitionStatus;
  total_cost: number;
  requester_name?: string;
  requester_code?: string;
  area_name?: string;
  approver_name?: string;
  approver_code?: string;
  approver_signature_url?: string;
  approved_at?: string;
  delivered_at?: string;
  comments?: string;
  created_at?: string;
  updated_at?: string;
  requisition_items?: RequisitionItem[];
}

export interface Supplier {
  id: string;
  name: string;
  tax_id?: string;
  email?: string;
  phone?: string;
  address?: string;
  created_at?: string;
}

export interface PurchaseItem {
  id: string;
  purchase_id?: string;
  inventory_item_id?: string;
  quantity: number;
  unit_cost: number;
  received_quantity?: number;
  created_at?: string;
  inventory_items?: InventoryItem;
}

export type PurchaseStatus = 'PENDIENTE' | 'RECIBIDA' | 'CANCELADA';

export interface Purchase {
  id: string;
  consecutive: number;
  requisition_id?: string;
  supplier_id?: string;
  status: PurchaseStatus;
  total_cost: number;
  comments?: string;
  manual_requisition_number?: string;
  created_at?: string;
  suppliers?: Supplier;
  requisitions?: Pick<Requisition, 'consecutive'>;
  purchase_items?: PurchaseItem[];
}

export interface Budget {
  id: string;
  area_name?: string;
  total_budget: number;
  spent_budget: number;
  created_at?: string;
  updated_at?: string;
}

export type ToolAssignmentStatus = 'ACTIVA' | 'DEVUELTA' | 'TRANSFERIDA' | 'DANADA' | 'EXTRAVIADA';
export type ToolAssignmentType = 'NUEVA' | 'REEMPLAZO_DANO' | 'REEMPLAZO_EXTRAVIO' | 'CAMBIO_ASIGNACION';

export interface ToolAssignment {
  id: string;
  consecutive?: number;
  inventory_item_id: string;
  employee_id: string;
  assigned_date: string;
  serial_number?: string | null;
  item_state: 'NUEVO' | 'USADO';
  condition_notes?: string | null;
  assignment_type: ToolAssignmentType;
  previous_assignment_id?: string | null;
  status: ToolAssignmentStatus;
  return_date?: string | null;
  return_notes?: string | null;
  notes?: string | null;
  assigned_by_name?: string | null;
  unit_cost?: number;
  area_name?: string | null;
  created_at?: string;
  updated_at?: string;
  inventory_items?: InventoryItem;
  employees?: Employee;
}

export interface AreaBudget {
  id: string;
  area_id: string;
  monthly_budget: number;
  created_at?: string;
  updated_at?: string;
  areas?: Area;
}
