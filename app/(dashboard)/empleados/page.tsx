'use client';
import { useState, useEffect } from 'react';
import { Search, Plus, MapPin, Users, Loader2, Save, X, BookOpen, Edit2, Trash2 } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';

export default function EmpleadosPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [employees, setEmployees] = useState<any[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isAreaModalOpen, setIsAreaModalOpen] = useState(false);
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);

  // Form states
  const [newArea, setNewArea] = useState({ name: '', description: '' });
  const [newEmployee, setNewEmployee] = useState({ code: '', first_name: '', last_name: '', position: '', area_id: '' });
  const [editingEmployee, setEditingEmployee] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    // Fetch areas
    const { data: areasData } = await supabase.from('areas').select('*').order('name');
    if (areasData) setAreas(areasData);

    // Fetch employees with area info
    const { data: employeesData } = await supabase
      .from('employees')
      .select(`
        *,
        area_name,
        areas ( name )
      `)
      .order('first_name');
    if (employeesData) setEmployees(employeesData);
    
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateArea = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const { error } = await supabase.from('areas').insert([newArea]);
    setIsSubmitting(false);

    if (error) {
      alert('Error creando área: ' + error.message);
    } else {
      setNewArea({ name: '', description: '' });
      setIsAreaModalOpen(false);
      fetchData();
    }
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // We insert assigning the correct area_id. We map area_name automatically via trigger or manually here if needed.
    // The previous design used area_name in employees, let's keep it strictly in sync if necessary, or just rely on the join.
    // For backward compatibility with requisitions, we might still want to populate area_name.
    const selectedArea = areas.find(a => a.id === newEmployee.area_id);
    
    const payload = {
      ...newEmployee,
      area_name: selectedArea?.name || null 
    };

    const { error } = await supabase.from('employees').insert([payload]);
    setIsSubmitting(false);

    if (error) {
      alert('Error registrando empleado: ' + error.message);
    } else {
      closeEmployeeModal();
      fetchData();
    }
  };

  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;
    setIsSubmitting(true);
    
    const selectedArea = areas.find(a => a.id === newEmployee.area_id);
    const payload = {
      code: newEmployee.code,
      first_name: newEmployee.first_name,
      last_name: newEmployee.last_name,
      position: newEmployee.position,
      area_id: newEmployee.area_id,
      area_name: selectedArea?.name || null 
    };

    const { error } = await supabase.from('employees').update(payload).eq('id', editingEmployee.id);
    setIsSubmitting(false);

    if (error) {
      alert('Error actualizando empleado: ' + error.message);
    } else {
      closeEmployeeModal();
      fetchData();
    }
  };

  const handleDeleteEmployee = async (id: string, name: string) => {
    if (confirm(`¿Estás seguro de eliminar permanentemente a ${name}?`)) {
      setIsLoading(true);
      const { error } = await supabase.from('employees').delete().eq('id', id);
      if (error) {
        alert('Error al eliminar empleado: ' + error.message);
        setIsLoading(false);
      } else {
        fetchData();
      }
    }
  };

  const openEditModal = (emp: any) => {
    setEditingEmployee(emp);
    setNewEmployee({
      code: emp.code || '',
      first_name: emp.first_name || '',
      last_name: emp.last_name || '',
      position: emp.position || '',
      area_id: emp.area_id || ''
    });
    setIsEmployeeModalOpen(true);
  };

  const closeEmployeeModal = () => {
    setEditingEmployee(null);
    setNewEmployee({ code: '', first_name: '', last_name: '', position: '', area_id: '' });
    setIsEmployeeModalOpen(false);
  };

  const filteredEmployees = employees.filter(emp => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const areaName = emp.areas?.name || emp.area_name || '';
    return (
      (emp.first_name || '').toLowerCase().includes(q) ||
      (emp.last_name || '').toLowerCase().includes(q) ||
      (emp.code || '').toLowerCase().includes(q) ||
      areaName.toLowerCase().includes(q) ||
      (emp.position || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-light text-primary tracking-tight">Empleados</h1>
          <p className="text-gray-500 mt-2 text-sm">Gestión de personal y áreas de la empresa.</p>
        </div>
        <div className="flex gap-3 w-full sm:w-auto">
          <button 
            onClick={() => setIsAreaModalOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white text-gray-700 border border-gray-200 px-5 py-3 text-sm font-semibold hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
          >
            <MapPin size={18} strokeWidth={2} />
            Nueva Área
          </button>
          <button 
            onClick={() => setIsEmployeeModalOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-primary text-background px-5 py-3 text-sm font-semibold hover:bg-primary-dark transition-all shadow-sm border border-transparent"
          >
            <Plus size={18} strokeWidth={2.5} />
            Nuevo Empleado
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white border border-gray-100 shadow-sm p-3 flex items-center group focus-within:border-gray-300 transition-colors">
        <div className="pl-4 pr-3 flex items-center pointer-events-none">
          <Search className="text-gray-400 group-focus-within:text-primary transition-colors" size={20} strokeWidth={1.5} />
        </div>
        <input
          type="text"
          placeholder="Buscar empleado por nombre, código, cargo o área..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full py-2 bg-transparent text-sm focus:outline-none placeholder-gray-400 text-primary"
        />
      </div>

      {/* Main Content Grid */}
      <div className="relative min-h-[400px]">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-transparent backdrop-blur-[1px] z-20">
             <Loader2 size={32} className="animate-spin text-primary" />
          </div>
        )}

        {/* Employees Table Layout */}
        <div className="bg-white border border-gray-100 shadow-sm overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-100 p-4 flex items-center gap-2">
            <Users size={18} className="text-gray-500" />
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-widest">Personal Activo ({filteredEmployees.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead>
                <tr className="bg-white text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100">
                  <th className="px-6 py-4">Código</th>
                  <th className="px-6 py-4">Nombre Completo</th>
                  <th className="px-6 py-4">Cargo</th>
                  <th className="px-6 py-4">Área Asignada</th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 text-sm font-mono text-gray-500">{emp.code}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs uppercase">
                           {(emp.first_name?.[0] || '')}{(emp.last_name?.[0] || '')}
                        </div>
                        <span className="text-sm font-semibold text-primary">{emp.first_name} {emp.last_name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{emp.position || '---'}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-gray-100 text-gray-700 text-xs font-semibold tracking-wide border border-gray-200">
                        <MapPin size={12} />
                        {emp.areas?.name || emp.area_name || 'Sin área oficial'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEditModal(emp)} className="p-2 text-gray-400 hover:text-primary bg-gray-50 hover:bg-primary/5 rounded transition-colors" title="Editar Empleado">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleDeleteEmployee(emp.id, `${emp.first_name} ${emp.last_name}`)} className="p-2 text-gray-400 hover:text-red-600 bg-gray-50 hover:bg-red-50 rounded transition-colors" title="Eliminar Empleado">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredEmployees.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400 text-sm">
                      No se encontraron empleados. Usa el botón "Nuevo Empleado" para registrar personal.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* --- MODAL: NUEVA ÁREA --- */}
      {isAreaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary-dark/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white max-w-md w-full shadow-2xl overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-200">
            <div className="bg-gray-50 border-b border-gray-100 p-5 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <MapPin className="text-primary" size={24} />
                <h2 className="text-xl font-light text-primary tracking-tight">Crear Área</h2>
              </div>
              <button onClick={() => setIsAreaModalOpen(false)} className="text-gray-400 hover:text-red-500 bg-white hover:bg-red-50 p-2 rounded-full transition-colors border border-transparent hover:border-red-100">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleCreateArea} className="p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Nombre del Área</label>
                <input 
                  type="text" 
                  required
                  value={newArea.name}
                  onChange={e => setNewArea({...newArea, name: e.target.value})}
                  className="w-full border-b border-gray-300 py-2 focus:outline-none focus:border-primary transition-colors text-primary font-medium" 
                  placeholder="Ej. Producción, Logística..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Descripción (Opcional)</label>
                <textarea 
                  rows={2}
                  value={newArea.description}
                  onChange={e => setNewArea({...newArea, description: e.target.value})}
                  className="w-full border border-gray-300 rounded-sm p-3 focus:outline-none focus:border-primary transition-colors text-gray-600 text-sm resize-none" 
                  placeholder="Breve detalle de las funciones del área..."
                />
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsAreaModalOpen(false)}
                  className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:bg-gray-100 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold bg-primary text-background hover:bg-primary-dark transition-colors shadow-sm disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Guardar Área
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: NUEVO EMPLEADO --- */}
      {isEmployeeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary-dark/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white max-w-xl w-full shadow-2xl overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-200">
            <div className="bg-gray-50 border-b border-gray-100 p-5 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Users className="text-primary" size={24} />
                <h2 className="text-xl font-light text-primary tracking-tight">{editingEmployee ? 'Editar Empleado' : 'Registrar Empleado'}</h2>
              </div>
              <button onClick={closeEmployeeModal} className="text-gray-400 hover:text-red-500 bg-white hover:bg-red-50 p-2 rounded-full transition-colors border border-transparent hover:border-red-100">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={editingEmployee ? handleUpdateEmployee : handleCreateEmployee} className="p-6 space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Código de Empleado (*) </label>
                  <input 
                    type="text" 
                    required
                    value={newEmployee.code}
                    onChange={e => setNewEmployee({...newEmployee, code: e.target.value})}
                    className="w-full border-b border-gray-300 py-2 focus:outline-none focus:border-primary transition-colors text-primary font-mono text-sm uppercase" 
                    placeholder="Ej. EMP-001"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Cargo Organizacional</label>
                  <input 
                    type="text" 
                    value={newEmployee.position}
                    onChange={e => setNewEmployee({...newEmployee, position: e.target.value})}
                    className="w-full border-b border-gray-300 py-2 focus:outline-none focus:border-primary transition-colors text-primary font-medium" 
                    placeholder="Ej. Gerente de Bodega"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Nombres (*)</label>
                  <input 
                    type="text" 
                    required
                    value={newEmployee.first_name}
                    onChange={e => setNewEmployee({...newEmployee, first_name: e.target.value})}
                    className="w-full border-b border-gray-300 py-2 focus:outline-none focus:border-primary transition-colors text-primary font-medium" 
                    placeholder="Ej. Carlos Roberto"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Apellidos (*)</label>
                  <input 
                    type="text" 
                    required
                    value={newEmployee.last_name}
                    onChange={e => setNewEmployee({...newEmployee, last_name: e.target.value})}
                    className="w-full border-b border-gray-300 py-2 focus:outline-none focus:border-primary transition-colors text-primary font-medium" 
                    placeholder="Ej. Martínez"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Área Asignada (*)</label>
                <select 
                  required
                  value={newEmployee.area_id}
                  onChange={e => setNewEmployee({...newEmployee, area_id: e.target.value})}
                  className="w-full border-b border-gray-300 py-2 focus:outline-none focus:border-primary transition-colors text-primary bg-transparent text-sm"
                >
                  <option value="" disabled>-- Selecciona un área --</option>
                  {areas.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                {areas.length === 0 && (
                  <p className="text-xs text-yellow-600 mt-1 flex items-center gap-1"><BookOpen size={12}/> Primero debes registrar un Área.</p>
                )}
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-gray-100">
                <button 
                  type="button" 
                  onClick={closeEmployeeModal}
                  className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:bg-gray-100 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmitting || areas.length === 0}
                  className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold bg-primary text-background hover:bg-primary-dark transition-colors shadow-sm disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {editingEmployee ? 'Guardar Cambios' : 'Registrar Empleado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
