'use client';
import { useState, useEffect } from 'react';
import { Search, Plus, MapPin, Users, Loader2, Save, X, BookOpen, Edit2, Trash2, Key, Shield, Mail, Lock } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import type { Area, Employee } from '@/types';

export default function EmpleadosPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isAreaModalOpen, setIsAreaModalOpen] = useState(false);
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);

  // User Access States
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
  const [isCreatingAccess, setIsCreatingAccess] = useState(false);
  const [accessForm, setAccessForm] = useState({ email: '', password: '', role: 'USER' });
  const [accessMessage, setAccessMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [bannedUsers, setBannedUsers] = useState<Set<string>>(new Set());

  // Form states
  const [newArea, setNewArea] = useState({ name: '', description: '' });
  const [newEmployee, setNewEmployee] = useState({ code: '', first_name: '', last_name: '', position: '', area_id: '' });
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchBannedStatus = async (employeeList: Employee[]) => {
    const userIds = employeeList
      .filter(e => e.user_id)
      .map(e => e.user_id as string);

    if (userIds.length === 0) {
      setBannedUsers(new Set());
      return;
    }

    try {
      const res = await fetch('/api/admin/get-banned-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds })
      });
      const data = await res.json();
      if (data?.bannedIds) {
        setBannedUsers(new Set(data.bannedIds));
      }
    } catch (err) {
      console.error('Error fetching banned status:', err);
    }
  };

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
    if (employeesData) {
      setEmployees(employeesData);
      await fetchBannedStatus(employeesData);
    }
    
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

  const openEditModal = (emp: Employee) => {
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
  const activeAccessCount = employees.filter(emp => emp.user_id && !bannedUsers.has(emp.user_id as string)).length;

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
          <div className="bg-primary border-b-2 border-white/20 p-4 flex items-center gap-2">
            <Users size={18} className="text-white" />
            <h3 className="text-sm font-bold text-white uppercase tracking-widest">Personal Activo ({activeAccessCount})</h3>
          </div>
          <div className="overflow-x-auto scrollbar-hide">
            <table className="w-full text-left border-collapse table-fixed min-w-[1000px] lg:min-w-full">
              <thead>
                <tr className="bg-gray-50 text-[9px] font-bold text-primary/70 uppercase tracking-tighter border-b border-gray-100">
                  <th className="py-2 px-6 w-[120px]">Código</th>
                  <th className="py-2 px-6 w-[250px]">Nombre Completo</th>
                  <th className="py-2 px-6 w-[180px]">Cargo</th>
                  <th className="py-2 px-6 w-[200px]">Área Asignada</th>
                  <th className="py-2 px-6 w-[140px] text-center sticky right-0 bg-gray-50 border-l border-gray-100 z-10">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredEmployees.map((emp) => {
                  const isBanned = emp.user_id ? bannedUsers.has(emp.user_id) : false;
                  const hasAccess = !!emp.user_id;
                  return (
                  <tr key={emp.id} className="hover:bg-blue-50/20 transition-colors group">
                    <td className="py-2 px-6 text-xs font-mono text-gray-400 truncate">{emp.code}</td>
                    <td className="py-2 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px] uppercase shrink-0">
                           {(emp.first_name?.[0] || '')}{(emp.last_name?.[0] || '')}
                        </div>
                        <span className="text-xs font-semibold text-primary truncate block">{emp.first_name} {emp.last_name}</span>
                      </div>
                    </td>
                    <td className="py-2 px-6 text-xs text-gray-600 truncate block">{emp.position || '---'}</td>
                    <td className="py-2 px-6">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-gray-50 text-gray-600 text-[10px] font-bold tracking-tight border border-gray-200 uppercase">
                        <MapPin size={10} />
                        {emp.areas?.name || emp.area_name || 'N/A'}
                      </span>
                    </td>
                    <td className="py-2 px-6 text-center sticky right-0 bg-white group-hover:bg-blue-50/20 transition-colors border-l border-gray-100 shadow-[ -5px_0_10px_-5px_rgba(0,0,0,0.05) ] z-10">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => {
                            setSelectedEmployee(emp);
                            setAccessForm({ email: '', password: '', role: 'USER' });
                            setAccessMessage(null);
                            setIsAccessModalOpen(true);
                          }} 
                          className={`p-1 transition-colors ${
                            !hasAccess
                              ? 'text-gray-400 hover:text-orange-500'
                              : isBanned
                                ? 'text-red-400 hover:text-red-600'
                                : 'text-green-500 hover:text-green-700'
                          }`} 
                          title={
                            !hasAccess ? 'Crear Acceso'
                            : isBanned ? 'Acceso Desactivado — Click para gestionar'
                            : 'Acceso Activo — Click para gestionar'
                          }
                        >
                          <Key size={14} fill={hasAccess && !isBanned ? 'currentColor' : 'none'} />
                        </button>
                        <button onClick={() => openEditModal(emp)} className="p-1 text-gray-400 hover:text-primary transition-colors" title="Editar">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => handleDeleteEmployee(emp.id, `${emp.first_name} ${emp.last_name}`)} className="p-1 text-gray-400 hover:text-red-600 transition-colors" title="Eliminar">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
                })}
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

      {/* Modal de Acceso */}
      {isAccessModalOpen && selectedEmployee && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md shadow-2xl border border-gray-100 animate-in zoom-in duration-300">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="text-sm font-bold text-primary uppercase tracking-widest flex items-center gap-2">
                  <Shield size={16} /> {selectedEmployee.user_id ? 'Gestionar Acceso' : 'Crear Acceso al Sistema'}
                </h3>
                <p className="text-[10px] text-gray-500 mt-1 uppercase font-medium">Empleado: {selectedEmployee.first_name} {selectedEmployee.last_name}</p>
              </div>
              <button onClick={() => setIsAccessModalOpen(false)} className="text-gray-400 hover:text-primary transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-8 space-y-6">
              {accessMessage && (
                <div className={`p-3 text-xs font-bold uppercase tracking-wider border ${
                  accessMessage.type === 'success' ? 'bg-green-50 border-green-100 text-green-600' : 'bg-red-50 border-red-100 text-red-600'
                }`}>
                  {accessMessage.text}
                </div>
              )}

              {selectedEmployee.user_id && (
                <div className="bg-gray-50 border border-gray-100 p-4 space-y-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    Estado del Acceso
                  </p>
                  <div className="flex items-center justify-between">
                    {bannedUsers.has(selectedEmployee.user_id) ? (
                      <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-1 border text-red-500 border-red-200 bg-red-50">
                        ● Desactivado
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-1 border text-green-600 border-green-200 bg-green-50">
                        ● Activo
                      </span>
                    )}

                    <button
                      onClick={async () => {
                        const isBanned = bannedUsers.has(selectedEmployee.user_id!);
                        const action = isBanned ? 'enable' : 'disable';
                        const confirmMsg = isBanned
                          ? `¿Reactivar el acceso de ${selectedEmployee.first_name} ${selectedEmployee.last_name}?`
                          : `¿Desactivar el acceso de ${selectedEmployee.first_name} ${selectedEmployee.last_name}? No podrá iniciar sesión.`;

                        if (!confirm(confirmMsg)) return;

                        setIsCreatingAccess(true);
                        setAccessMessage(null);
                        try {
                          const res = await fetch('/api/admin/toggle-access', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              userId: selectedEmployee.user_id,
                              action
                            })
                          });
                          const data = await res.json();
                          if (data.error) throw new Error(data.error);

                          setAccessMessage({
                            type: 'success',
                            text: isBanned ? 'Acceso reactivado correctamente.' : 'Acceso desactivado correctamente.'
                          });
                          await fetchData();
                        } catch (err: any) {
                          setAccessMessage({ type: 'error', text: err.message });
                        } finally {
                          setIsCreatingAccess(false);
                        }
                      }}
                      disabled={isCreatingAccess}
                      className={`text-xs font-bold uppercase tracking-widest px-4 py-2 border transition-colors disabled:opacity-50 ${
                        bannedUsers.has(selectedEmployee.user_id)
                          ? 'bg-green-600 text-white hover:bg-green-700 border-transparent'
                          : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                      }`}
                    >
                      {isCreatingAccess ? 'Procesando...'
                        : bannedUsers.has(selectedEmployee.user_id)
                          ? 'Reactivar Acceso'
                          : 'Desactivar Acceso'}
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">
                  {selectedEmployee.user_id ? 'Actualizar Credenciales' : 'Credenciales de Acceso'}
                </p>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <Mail size={12} /> Correo Electrónico
                  </label>
                  <input 
                    type="email"
                    value={accessForm.email}
                    onChange={(e) => setAccessForm({...accessForm, email: e.target.value})}
                    placeholder="ejemplo@empresa.com"
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-100 focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <Lock size={12} /> Contraseña
                  </label>
                  <input 
                    type="password"
                    value={accessForm.password}
                    onChange={(e) => setAccessForm({...accessForm, password: e.target.value})}
                    placeholder="••••••••"
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-100 focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <Shield size={12} /> Rol del Usuario
                  </label>
                  <select 
                    value={accessForm.role}
                    onChange={(e) => setAccessForm({...accessForm, role: e.target.value})}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-100 focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition-all text-primary"
                  >
                    <option value="ADMIN">ADMINISTRADOR (Todo)</option>
                    <option value="ALMACEN">ALMACÉN (Inventario/Compras)</option>
                    <option value="USER">USUARIO (Solo Requisas)</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  onClick={async () => {
                    setIsCreatingAccess(true);
                    setAccessMessage(null);
                    try {
                      const response = await fetch('/api/admin/create-access', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          ...accessForm,
                          employeeId: selectedEmployee.id,
                          first_name: selectedEmployee.first_name,
                          last_name: selectedEmployee.last_name
                        })
                      });
                      const data = await response.json();
                      if (data.error) throw new Error(data.error);
                      
                      setAccessMessage({ type: 'success', text: 'Acceso creado exitosamente.' });
                      fetchData();
                      setTimeout(() => setIsAccessModalOpen(false), 2000);
                    } catch (err: any) {
                      setAccessMessage({ type: 'error', text: err.message });
                    } finally {
                      setIsCreatingAccess(false);
                    }
                  }}
                  disabled={isCreatingAccess || !accessForm.email || !accessForm.password}
                  className="flex-1 bg-primary text-white py-3 text-xs font-bold uppercase tracking-widest hover:bg-primary-dark transition-colors disabled:opacity-50"
                >
                  {isCreatingAccess ? 'Procesando...' : (selectedEmployee.user_id ? 'Actualizar Credenciales' : 'Crear Acceso')}
                </button>
                <button 
                  onClick={() => setIsAccessModalOpen(false)}
                  className="px-6 py-3 text-xs font-bold uppercase tracking-widest text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: NUEVA ÁREA --- */}
      {isAreaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white max-w-md w-full shadow-2xl overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-200">
            <div className="bg-primary border-b-2 border-white/20 p-5 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <MapPin className="text-white" size={24} />
                <h2 className="text-xl font-light text-white tracking-tight">Crear Área</h2>
              </div>
              <button onClick={() => setIsAreaModalOpen(false)} className="text-white/60 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors border border-white/10">
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
                  className="w-full border-b border-gray-300 py-2 focus:outline-none focus:border-primary transition-colors text-primary bg-transparent font-medium" 
                  placeholder="Ej. Producción, Logística..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Descripción (Opcional)</label>
                <textarea 
                  rows={2}
                  value={newArea.description}
                  onChange={e => setNewArea({...newArea, description: e.target.value})}
                  className="w-full border border-gray-300 rounded-sm p-3 focus:outline-none focus:border-primary transition-colors text-gray-600 bg-transparent text-sm resize-none" 
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white max-xl w-full shadow-2xl overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-200">
            <div className="bg-primary border-b-2 border-white/20 p-5 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Users className="text-white" size={24} />
                <h2 className="text-xl font-light text-white tracking-tight">{editingEmployee ? 'Editar Empleado' : 'Registrar Empleado'}</h2>
              </div>
              <button onClick={closeEmployeeModal} className="text-white/60 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors border border-white/10">
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
                    className="w-full border-b border-gray-300 py-2 focus:outline-none focus:border-primary transition-colors text-primary bg-transparent font-mono text-sm uppercase" 
                    placeholder="Ej. EMP-001"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Cargo Organizacional</label>
                  <input 
                    type="text" 
                    value={newEmployee.position}
                    onChange={e => setNewEmployee({...newEmployee, position: e.target.value})}
                    className="w-full border-b border-gray-300 py-2 focus:outline-none focus:border-primary transition-colors text-primary bg-transparent font-medium" 
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
                    className="w-full border-b border-gray-300 py-2 focus:outline-none focus:border-primary transition-colors text-primary bg-transparent font-medium" 
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
                    className="w-full border-b border-gray-300 py-2 focus:outline-none focus:border-primary transition-colors text-primary bg-transparent font-medium" 
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
