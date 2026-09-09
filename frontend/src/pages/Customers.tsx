import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Edit2, Trash2, Search, ArrowLeft, Phone, Mail, FileText } from 'lucide-react';
import { api } from '../lib/api';

export default function Customers() {
  const nav = useNavigate();
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', notes: '' });
  const [editId, setEditId] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string,string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await api('/customers?limit=50');
      if (res.success) setCustomers(res.data || []);
    } catch { /* silent */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, [search]);

  const handleSave = async () => {
    try {
      if (editId) {
        await api(`/customers/${editId}`, { method: 'PATCH', body: JSON.stringify(form) });
      } else {
        await api('/customers', { method: 'POST', body: JSON.stringify(form) });
      }
      setForm({ name: '', phone: '', email: '', address: '', notes: '' });
      setEditId(null);
      setShowForm(false);
      load();
    } catch (e: any) { setFormErrors(prev => ({ ...prev, submit: e.message || 'Error' })); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete customer?')) return;
    try { await api(`/customers/${id}`, { method: 'DELETE' }); load(); } catch (e: any) { setFormErrors(prev => ({ ...prev, submit: e.message || 'Error' })); }
  };

  return (
    <div className="min-h-screen bg-paper p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <button onClick={() => nav('/dashboard')} className="text-sm text-brand-700 hover:underline mb-4 flex items-center gap-1"><ArrowLeft size={16}/> Back to dashboard</button>
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-serif text-3xl tracking-tight flex items-center gap-3"><Users size={28}/> Customers</h1>
          <button onClick={() => { setShowForm(!showForm); setEditId(null); setForm({ name: '', phone: '', email: '', address: '', notes: '' }); }} className="flex items-center gap-2 px-4 py-2 bg-brand-900 text-white rounded-xl font-medium hover:bg-brand-800 transition"><Plus size={18}/> Add Customer</button>
        </div>

        {showForm && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
            <h3 className="font-semibold mb-4">{editId ? 'Edit Customer' : 'New Customer'}</h3>
            <div className="grid md:grid-cols-3 gap-3">
              <input placeholder="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" />
              <input placeholder="Phone *" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" />
              <input placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" />
              <input placeholder="Address" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" />
              <textarea placeholder="Notes" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 md:col-span-2" />
            </div>
            {formErrors.submit && <p className="text-sm text-red-600 mb-2">{formErrors.submit}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={handleSave} className="px-5 py-2 bg-brand-900 text-white rounded-xl font-medium">Save</button>
              <button onClick={() => setShowForm(false)} className="px-5 py-2 bg-slate-100 text-slate-600 rounded-xl">Cancel</button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-medium">
              <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr>
            </thead>
            <tbody>
              {customers.map((c: any) => (
                <tr key={c.id} className="border-t border-slate-100 hover:bg-warm">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-slate-500">{c.phone}</td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-xs font-semibold">{c.status}</span></td>
                  <td className="px-4 py-3 flex gap-2">
                    <button onClick={() => { setForm({ name: c.name, phone: c.phone || '', email: c.email || '', address: c.address || '', notes: c.notes || '' }); setEditId(c.id); setShowForm(true); }} className="text-brand-600 hover:text-brand-800"><Edit2 size={16}/></button>
                    <button onClick={() => handleDelete(c.id)} className="text-red-500 hover:text-red-700"><Trash2 size={16}/></button>
                  </td>
                </tr>
              ))}
              {customers.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No customers found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
