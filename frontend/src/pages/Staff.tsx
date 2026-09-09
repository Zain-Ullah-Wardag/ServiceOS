import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';

export default function Staff() {
  const nav = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ userId: '', jobTitle: '', department: '', skills: '' });
  const [errors, setErrors] = useState<Record<string,string>>({});
  const [saving, setSaving] = useState(false);
  const [eligibleUsers, setEligibleUsers] = useState<any[]>([]);

  useEffect(() => {
    api('/tenant-users').then(r => { if (r?.success) setEligibleUsers(r.data || []); });
  }, []);

  useEffect(() => { load(); }, []);
  const load = async () => { setLoading(true); try { const r = await api('/staff'); if (r?.success) setItems(r.data||[]); } catch {} setLoading(false); };

  const validate = () => { const e: Record<string,string>={}; if (!form.userId) e.userId='Select user'; if (!form.jobTitle) e.jobTitle='Required'; setErrors(e); return Object.keys(e).length===0; };
  const handleSave = async () => { if (!validate()) return; setSaving(true); try { const res = await api('/staff', { method: 'POST', body: JSON.stringify({ ...form, skills: form.skills || undefined }) }); if (res?.success) { setShowForm(false); setForm({ userId:'', jobTitle:'', department:'', skills:'' }); load(); } else throw new Error(res?.error?.message||'Failed'); } catch (err:any){ setErrors(prev=>({...prev,submit:err.message||'Failed'})); } finally { setSaving(false); } };

  return (
    <div className="min-h-screen bg-paper p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <button onClick={() => nav('/dashboard')} className="text-sm text-brand-700 hover:underline mb-4 flex items-center gap-1"><ArrowLeft size={16}/> Back</button>
        <div className="flex items-center justify-between mb-6"><h1 className="font-serif text-3xl flex items-center gap-3"><Users size={28}/> Staff</h1><button onClick={() => { setShowForm(!showForm); setErrors({}); }} className="flex items-center gap-2 px-4 py-2 bg-brand-900 text-white rounded-xl font-medium"><Plus size={18}/> Add Staff</button></div>
        {showForm && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
            <h3 className="font-semibold mb-3">New Staff</h3>
            <div className="grid md:grid-cols-3 gap-3 mb-3">
              <select value={form.userId} onChange={e=>setForm({...form,userId:e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50"><option value="">Select user</option>{eligibleUsers.map((u:any)=> <option key={u.id} value={u.id}>{u.name || u.email || u.id}</option>)}</select>
              <input placeholder="Job Title *" value={form.jobTitle} onChange={e=>setForm({...form,jobTitle:e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50"/>
              <input placeholder="Department" value={form.department} onChange={e=>setForm({...form,department:e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50"/>
              <input placeholder="Skills" value={form.skills} onChange={e=>setForm({...form,skills:e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 md:col-span-3"/>
            </div>
            {errors.submit && <p className="text-sm text-red-600 mb-2">{errors.submit}</p>}
            <div className="flex gap-2"><button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-brand-900 text-white rounded-lg font-medium text-sm">{saving?'Saving...':'Save'}</button><button onClick={()=>setShowForm(false)} className="px-4 py-2 bg-slate-100 rounded-lg font-medium text-sm">Cancel</button></div>
          </div>
        )}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-slate-50 text-xs uppercase"><tr><th className="text-left px-4 py-3">Name</th><th className="text-left px-4 py-3">Job</th><th className="text-left px-4 py-3">Department</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{items.map((s:any)=><tr key={s.id} className="hover:bg-slate-50"><td className="px-4 py-3">{s.user?.name||'-'}</td><td className="px-4 py-3">{s.jobTitle||'-'}</td><td className="px-4 py-3">{s.department||'-'}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="text-xs text-slate-400 mt-3">Note: Edit/delete endpoints not yet implemented; only list and create are available.</p>
      </div>
    </div>
  );
}
