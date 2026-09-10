import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';

export default function Staff() {
  const nav = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ userId: '', jobTitle: '', department: '', skills: '', status: 'active' });
  const [loadError, setLoadError] = useState('');
  const [eligibleUsers, setEligibleUsers] = useState<any[]>([]);

  useEffect(() => {
    api('/tenant-users').then(r => { if (r?.success) setEligibleUsers(r.data || []); });
  }, []);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const r = await api('/staff');
      if (r?.success) setItems(r.data || []);
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load staff');
    }
    setLoading(false);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!editId && !form.userId) e.userId = 'Select user';
    if (!form.jobTitle) e.jobTitle = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (editId) {
        await api(`/staff/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            jobTitle: form.jobTitle,
            department: form.department,
            skills: form.skills || undefined,
            status: form.status,
          }),
        });
      } else {
        await api('/staff', {
          method: 'POST',
          body: JSON.stringify({
            ...form,
            skills: form.skills || undefined,
          }),
        });
      }
      setShowForm(false);
      setEditId(null);
      setForm({ userId: '', jobTitle: '', department: '', skills: '', status: 'active' });
      await load();
    } catch (err: any) {
      setErrors(prev => ({ ...prev, submit: err?.message || 'Failed' }));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (s: any) => {
    setEditId(s.id);
    setForm({
      userId: s.user?.id || s.userId || '',
      jobTitle: s.jobTitle || '',
      department: s.department || '',
      skills: s.skills || '',
      status: s.status || 'active',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this staff record?')) {
      try {
        await api(`/staff/${id}`, { method: 'DELETE' });
        await load();
      } catch (e: any) {
        setLoadError(e?.message || 'Delete failed');
      }
    }
  };

  return (
    <div className="min-h-screen bg-paper p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <button onClick={() => nav('/dashboard')} className="text-sm text-brand-700 hover:underline mb-4 flex items-center gap-1"><ArrowLeft size={16}/> Back</button>
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-serif text-3xl flex items-center gap-3"><Users size={28}/> Staff</h1>
          <button onClick={() => { setShowForm(true); setEditId(null); setForm({ userId: '', jobTitle: '', department: '', skills: '', status: 'active' }); setErrors({}); }} className="flex items-center gap-2 px-4 py-2 bg-brand-900 text-white rounded-xl font-medium"><Plus size={18}/> Add Staff</button>
        </div>
        {showForm && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
            <h3 className="font-semibold mb-3">{editId ? 'Edit Staff' : 'Add Staff'}</h3>
            <div className="grid md:grid-cols-3 gap-3 mb-3">
              <select
                disabled={!!editId}
                value={form.userId}
                onChange={e => setForm({ ...form, userId: e.target.value })}
                className={`w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 ${editId ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <option value="">Select user</option>
                {eligibleUsers.map((u: any) => (
                  <option key={u.id} value={u.id}>{u.name || u.email || u.id}</option>
                ))}
              </select>
              <input placeholder="Job Title *" value={form.jobTitle} onChange={e => setForm({ ...form, jobTitle: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" />
              <input placeholder="Department" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" />
              <input placeholder="Skills" value={form.skills} onChange={e => setForm({ ...form, skills: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 md:col-span-3" />
            </div>
            {errors.submit && <p className="text-sm text-red-600 mb-2">{errors.submit}</p>}
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-brand-900 text-white rounded-lg font-medium text-sm">{saving ? 'Saving...' : editId ? 'Update Staff' : 'Save Staff'}</button>
              <button onClick={() => { setShowForm(false); setEditId(null); setForm({ userId: '', jobTitle: '', department: '', skills: '', status: 'active' }); }} className="px-4 py-2 bg-slate-100 rounded-lg font-medium text-sm">Cancel</button>
            </div>
          </div>
        )}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase"><tr><th className="text-left px-4 py-3">Name</th><th className="text-left px-4 py-3">Job</th><th className="text-left px-4 py-3">Department</th><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((s: any) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">{s.user?.name || s.user?.email || '-'}</td>
                  <td className="px-4 py-3">{s.jobTitle || '-'}</td>
                  <td className="px-4 py-3">{s.department || '-'}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>{s.status || 'active'}</span></td>
                  <td className="px-4 py-3"><button onClick={() => handleEdit(s)} className="text-brand-700 text-xs mr-2">Edit</button> <button onClick={() => handleDelete(s.id)} className="text-red-600 text-xs">Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loadError && <p className="text-sm text-red-600 mb-2">{loadError}</p>}
      </div>
    </div>
  );
}
