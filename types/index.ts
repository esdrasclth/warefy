export type UserRole = 'ADMIN' | 'ALMACEN' | 'USER';

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

export interface AreaBudget {
  id: string;
  area_id: string;
  monthly_budget: number;
  created_at?: string;
  updated_at?: string;
  areas?: Area;
}
