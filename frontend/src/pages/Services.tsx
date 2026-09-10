import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrench, Plus, ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';

export default function Services() {
  const nav = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', price: '', duration: '', requiresBooking: false, requiresDelivery: false, status: 'active' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api('/services');
      if (res?.success) setItems(res.data || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name) e.name = 'Required';
    if (!form.price || isNaN(Number(form.price))) e.price = 'Valid price';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const url = editId ? `/services/${editId}` : '/services';
      const method = editId ? 'PATCH' : 'POST';
      const res = await api(url, { method, body: JSON.stringify({ ...form, price: Number(form.price), duration: Number(form.duration) || 30 }) });
      if (res?.success) {
        setShowForm(false);
        setEditId(null);
        setForm({ name: '', description: '', price: '', duration: '', requiresBooking: false, requiresDelivery: false, status: 'active' });
        await load();
      } else throw new Error(res?.error?.message || 'Failed');
    } catch (err: any) {
      setErrors(prev => ({ ...prev, submit: err.message || 'Failed' }));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item: any) => {
    setEditId(item.id);
    setForm({
      name: item.name || '',
      description: item.description || '',
      price: String(item.price || ''),
      duration: String(item.duration || ''),
      requiresBooking: item.requiresBooking || false,
      requiresDelivery: item.requiresDelivery || false,
      status: item.status || 'active'
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this service?')) {
      await api(`/services/${id}`, { method: 'DELETE' });
      await load();
    }
  };

  return (
    <div className="min-h-screen bg-paper p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <button onClick={() => nav('/dashboard')} className="text-sm text-brand-700 hover:underline mb-4 flex items-center gap-1"><ArrowLeft size={16}/> Back</button>
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-serif text-3xl flex items-center gap-3"><Wrench size={28}/> Services</h1>
          <button onClick={() => { setShowForm(true); setEditId(null); setForm({ name: '', description: '', price: '', duration: '', requiresBooking: false, requiresDelivery: false, status: 'active' }); setErrors({}); }} className="flex items-center gap-2 px-4 py-2 bg-brand-900 text-white rounded-xl font-medium"><Plus size={18}/> Add Service</button>
        </div>
        {showForm && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
            <h3 className="font-semibold mb-3">{editId ? 'Edit Service' : 'New Service'}</h3>
            <div className="grid md:grid-cols-3 gap-3 mb-3">
              <input placeholder="Name *" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" />
              <input placeholder="Price (PKR) *" value={form.price} onChange={e => setForm({...form, price: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" />
              <input placeholder="Duration (min)" value={form.duration} onChange={e => setForm({...form, duration: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" />
              <input placeholder="Description" value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 md:col-span-3" />
            </div>
            <div className="flex gap-3 mb-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.requiresBooking} onChange={e => setForm({...form, requiresBooking: e.target.checked})} /> Requires booking</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.requiresDelivery} onChange={e => setForm({...form, requiresDelivery: e.target.checked})} /> Requires delivery</label>
            </div>
            {errors.submit && <p className="text-sm text-red-600 mb-2">{errors.submit}</p>}
            <div className="flex gap-2"><button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-brand-900 text-white rounded-lg font-medium text-sm">{saving ? 'Saving...' : editId ? 'Update Service' : 'Save Service'}</button><button onClick={() => { setShowForm(false); setEditId(null); setForm({ name: '', price: '', duration: '', description: '', requiresBooking: false, requiresDelivery: false, status: 'active' }); }} className="px-4 py-2 bg-slate-100 rounded-lg font-medium text-sm">Cancel</button></div>
          </div>
        )}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500"><tr><th className="text-left px-4 py-3">Name</th><th className="text-left px-4 py-3">Price</th><th className="text-left px-4 py-3">Duration</th><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((s: any) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3">PKR {s.price}</td>
                  <td className="px-4 py-3">{s.duration} min</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>{s.status}</span></td>
                  <td className="px-4 py-3"><button onClick={() => handleEdit(s)} className="text-brand-700 text-xs mr-2">Edit</button> <button onClick={() => handleDelete(s.id)} className="text-red-600 text-xs">Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
