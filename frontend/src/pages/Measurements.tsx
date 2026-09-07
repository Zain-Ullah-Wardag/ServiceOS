import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ruler, Plus, ArrowLeft, User } from 'lucide-react';
import { api } from '../lib/api';

export default function Measurements() {
  const nav = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customerId: '', garmentId: '', fields: '{}' });

  useEffect(() => {
    api('/tailoring/measurements').then(r => { if (r.success) setItems(r.data || []); }).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    try {
      const payload = { ...form, fields: form.fields ? JSON.parse(form.fields) : {} };
      await api('/tailoring/measurements', { method: 'POST', body: JSON.stringify(payload) });
      setShowForm(false); setForm({ customerId: '', garmentId: '', fields: '{}' });
      const r = await api('/tailoring/measurements');
      if (r.success) setItems(r.data || []);
    } catch (e: any) { alert(e.message || 'Error'); }
  };

  return (
    <div className="min-h-screen bg-paper p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <button onClick={() => nav('/dashboard')} className="text-sm text-brand-700 hover:underline mb-4 flex items-center gap-1"><ArrowLeft size={16}/> Back</button>
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-serif text-3xl tracking-tight flex items-center gap-3"><Ruler size={28}/> Measurements</h1>
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 bg-brand-900 text-white rounded-xl font-medium"><Plus size={18}/> New Measurement</button>
        </div>

        {showForm && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
            <h3 className="font-semibold mb-3">New Measurement</h3>
            <div className="grid md:grid-cols-3 gap-3">
              <input placeholder="Customer ID" value={form.customerId} onChange={e => setForm({ ...form, customerId: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" />
              <input placeholder="Garment ID (optional)" value={form.garmentId} onChange={e => setForm({ ...form, garmentId: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" />
              <textarea placeholder="Fields JSON" rows={2} value={form.fields} onChange={e => setForm({ ...form, fields: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 md:col-span-3" />
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={handleSave} className="px-4 py-2 bg-brand-900 text-white rounded-lg font-medium">Save</button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-slate-100 rounded-lg">Cancel</button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Garment</th><th className="px-4 py-3">Fields</th><th className="px-4 py-3">Date</th></tr></thead>
            <tbody>
              {items.map((m: any) => (
                <tr key={m.id} className="border-t border-slate-100 hover:bg-warm">
                  <td className="px-4 py-3">{m.customer?.name || '-'}</td>
                  <td className="px-4 py-3">{m.garment?.name || '-'}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{JSON.stringify(m.fields || {})}</td>
                  <td className="px-4 py-3">{new Date(m.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
