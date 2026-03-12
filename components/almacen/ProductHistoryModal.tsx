import { X, Calendar, User, Building } from 'lucide-react';

interface ProductHistoryModalProps {
  product: any | null;
  onClose: () => void;
}

export default function ProductHistoryModal({ product, onClose }: ProductHistoryModalProps) {
  if (!product) return null;

  // Dummy requisition history
  const history = [
    { reqId: 'REQ-2023-112', area: 'Ventas', date: '10 Nov 2026', requester: 'María López', quantity: 2 },
    { reqId: 'REQ-2023-085', area: 'Contabilidad', date: '05 Nov 2026', requester: 'Juan Pérez', quantity: 5 },
    { reqId: 'REQ-2023-042', area: 'Recursos Humanos', date: '28 Oct 2026', requester: 'Ana Gómez', quantity: 10 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary-dark/40 backdrop-blur-sm transition-opacity p-4">
      <div className="w-full max-w-3xl bg-background border border-gray-200 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        
        <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-start bg-white">
          <div>
            <h2 className="text-xl font-light text-primary tracking-tight">Historial de Requisiciones</h2>
            <p className="text-sm font-bold text-gray-500 mt-1 uppercase tracking-widest">{product.code} - <span className="text-primary">{product.name}</span></p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 transition-colors p-1">
            <X size={24} strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-8 bg-gray-50/50">
          {history.length > 0 ? (
            <div className="bg-white border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-left whitespace-nowrap">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    <th className="px-6 py-4">Requisa ID</th>
                    <th className="px-6 py-4">Área</th>
                    <th className="px-6 py-4">Solicitante</th>
                    <th className="px-6 py-4">Fecha</th>
                    <th className="px-6 py-4 text-right">Cant. Solicitada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {history.map((record, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/80 transition-colors group">
                      <td className="px-6 py-4 text-sm font-semibold text-primary">{record.reqId}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 group-hover:text-primary transition-colors">
                        <div className="flex items-center gap-2">
                           <Building size={14} className="text-gray-400" />
                          {record.area}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                           <User size={14} className="text-gray-400" />
                          {record.requester}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                         <div className="flex items-center gap-2">
                           <Calendar size={14} className="text-gray-400" />
                           {record.date}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-bold text-primary">
                        {record.quantity} <span className="text-xs text-gray-400 font-normal">un.</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 bg-white border border-gray-100">
              <p className="text-gray-500 text-sm">Este artículo no ha sido solicitado en ninguna requisa aún.</p>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-100 bg-white flex justify-end">
          <button 
            onClick={onClose} 
            className="px-6 py-2.5 bg-primary text-background text-xs font-bold uppercase tracking-widest hover:bg-primary-dark transition-colors shadow-sm"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
}
