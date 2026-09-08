import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrench, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';

export default function Production() {
  const nav = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await api('/tailoring/orders');
      if (res.success) setOrders(res.data || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (id: string, status: string) => {
    try {
      await api(`/tailoring/orders/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) });
      load();
    } catch (e: any) { alert(e.message || 'Update failed'); }
  };

  const stages = ['received', 'measurement', 'cutting', 'stitching', 'finishing', 'quality_check', 'ready', 'delivered'];

  return (
    <div className="min-h-screen bg-paper p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <button onClick={() => nav('/dashboard')} className="text-sm text-brand-700 hover:underline mb-4 flex items-center gap-1"><ArrowLeft size={16}/> Back</button>
        <h1 className="font-serif text-3xl tracking-tight flex items-center gap-3 mb-6"><Wrench size={28}/> Production</h1>

        <div className="grid md:grid-cols-4 gap-3 mb-6">
          {stages.map(s => (
            <div key={s} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">{s}</div>
              <div className="text-2xl font-extrabold mt-1">{orders.filter((o:any)=> o.status === s).length}</div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-medium"><tr><th className="px-4 py-3">Order</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Garment</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Staff</th><th className="px-4 py-3">Delivery</th><th className="px-4 py-3">Actions</th></tr></thead>
            <tbody>
              {orders.map((o: any) => (
                <tr key={o.id} className="border-t border-slate-100 hover:bg-warm">
                  <td className="px-4 py-3 font-medium">{o.order?.orderNumber || '-'}</td>
                  <td className="px-4 py-3">{o.customer?.name || '-'}</td>
                  <td className="px-4 py-3">{o.garment?.name || '-'}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${o.status === 'ready' || o.status === 'delivered' ? 'bg-emerald-50 text-emerald-700' : o.status === 'quality_check' ? 'bg-amber-50 text-amber-700' : 'bg-brand-50 text-brand-700'}`}>{o.status}</span></td>
                  <td className="px-4 py-3">{o.staff?.user?.name || '-'}</td>
                  <td className="px-4 py-3">{o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString() : '-'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => updateStatus(o.id, 'ready')} className="text-emerald-600 hover:text-emerald-800 text-xs font-medium mr-2">Ready</button>
                    <button onClick={() => updateStatus(o.id, 'delivered')} className="text-brand-600 hover:text-brand-800 text-xs font-medium">Delivered</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
