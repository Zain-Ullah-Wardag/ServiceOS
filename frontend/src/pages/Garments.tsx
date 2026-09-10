import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shirt, Plus, ArrowLeft, CheckCircle } from 'lucide-react';
import { api } from '../lib/api';

export default function Garments() {
  const nav = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string|null>(null);
  const [form, setForm] = useState({ customerId: '', name: '', category: '', description: '', status: 'pending' });

  const load = async () => {
    try { const res = await api('/tailoring/garments'); if (res.success) setItems(res.data || []); } catch {}
  };
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    try {
      const url = editId ? `/tailoring/garments/${editId}` : '/tailoring/garments';
      const method = editId ? 'PATCH' : 'POST';
      await api(url, { method, body: JSON.stringify(form) });
      setShowForm(false); setForm({ customerId: '', name: '', category: '', description: '', status: 'pending' });
      load();
    } catch (e: any) { alert(e.message || 'Error'); }
  };

  return (
    <div className="min-h-screen bg-paper p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <button onClick={() => nav('/dashboard')} className="text-sm text-brand-700 hover:underline mb-4 flex items-center gap-1"><ArrowLeft size={16}/> Back</button>
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-serif text-3xl tracking-tight flex items-center gap-3"><Shirt size={28}/> Garments</h1>
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 bg-brand-900 text-white rounded-xl font-medium"><Plus size={18}/> Add Garment</button>
        </div>
        {showForm && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
            <h3 className="font-semibold mb-3">New Garment</h3>
            <div className="grid md:grid-cols-3 gap-3">
              <input placeholder="Customer ID *" value={form.customerId} onChange={e => setForm({ ...form, customerId: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" />
              <input placeholder="Garment name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" />
              <input placeholder="Category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" />
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={handleSave} className="px-4 py-2 bg-brand-900 text-white rounded-lg font-medium">Save</button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-slate-100 rounded-lg">Cancel</button>
            </div>
          </div>
        )}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Customer</th></tr></thead>
            <tbody>
              {items.map((g: any) => (
                <tr key={g.id} className="border-t border-slate-100 hover:bg-warm">
                  <td className="px-4 py-3 font-medium">{g.name}</td>
                  <td className="px-4 py-3 text-slate-500">{g.category || '-'}</td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-xs font-semibold">{g.status}</span></td>
                  <td className="px-4 py-3">{g.customer?.name || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
