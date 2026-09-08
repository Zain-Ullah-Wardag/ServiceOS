import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ruler, Plus, ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';

export default function Measurements() {
  const nav = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [garments, setGarments] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    customerId: '', garmentId: '',
    neck: '', chest: '', waist: '', shoulder: '', sleeve: '', shirtLength: '', trouserLength: '', bottom: '', notes: '',
  });

  useEffect(() => {
    api('/tailoring/measurements').then(r => { if (r?.success) setItems(r.data || []); }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (showForm) {
      api('/customers').then(r => { if (r?.success) setCustomers(r.data || []); });
      api('/tailoring/garments').then(r => { if (r?.success) setGarments(r.data || []); });
    }
  }, [showForm]);

  const handleChange = (k: string, v: string) => {
    setForm(prev => ({ ...prev, [k]: v }));
    if (errors[k]) setErrors(prev => { const n = { ...prev }; delete n[k]; return n; });
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.customerId) errs.customerId = 'Select a customer';
    const fields = ['neck','chest','waist','shoulder','sleeve','shirtLength','trouserLength','bottom'];
    let hasValue = false;
    for (const f of fields) {
      const v = (form as any)[f];
      if (v !== '' && v !== undefined && v !== null) {
        const n = parseFloat(v);
        if (isNaN(n)) errs[f] = 'Valid number required';
        else if (n < 0) errs[f] = 'Cannot be negative';
        else hasValue = true;
      }
    }
    if (!hasValue) errs.fields = 'Enter at least one measurement';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const fieldsObj: Record<string, number> = {};
      for (const k of ['neck','chest','waist','shoulder','sleeve','shirtLength','trouserLength','bottom']) {
        const v = (form as any)[k];
        if (v !== '' && v !== undefined && v !== null) fieldsObj[k] = parseFloat(v);
      }
      const payload: any = { customerId: form.customerId, fields: fieldsObj, notes: form.notes || undefined };
      if (form.garmentId) payload.garmentId = form.garmentId;
      const res = await api('/tailoring/measurements', { method: 'POST', body: JSON.stringify(payload) });
      if (!res?.success) throw new Error(res?.error?.message || 'Failed');
      setShowForm(false);
      setForm({ customerId: '', garmentId: '', neck: '', chest: '', waist: '', shoulder: '', sleeve: '', shirtLength: '', trouserLength: '', bottom: '', notes: '' });
      setErrors({});
      const r = await api('/tailoring/measurements');
      if (r?.success) setItems(r.data || []);
    } catch (e: any) {
      setErrors(prev => ({ ...prev, submit: e.message || 'Save failed' }));
    } finally { setSaving(false); }
  };

  const formatFields = (fields: any) => {
    if (!fields || typeof fields !== 'object') return '—';
    return Object.entries(fields).map(([k,v]) => `${k}: ${v}`).join(', ');
  };

  return (
    <div className="min-h-screen bg-paper p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <button onClick={() => nav('/dashboard')} className="text-sm text-brand-700 hover:underline mb-4 flex items-center gap-1"><ArrowLeft size={16}/> Back to Dashboard</button>
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-serif text-3xl tracking-tight flex items-center gap-3"><Ruler size={28}/> Measurements</h1>
          <button onClick={() => { setShowForm(!showForm); if (showForm) setErrors({}); }} className="flex items-center gap-2 px-4 py-2 bg-brand-900 text-white rounded-xl font-medium"><Plus size={18}/> {showForm ? 'Cancel' : 'New Measurement'}</button>
        </div>
        {showForm && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
            <h3 className="font-semibold mb-3">New Measurement</h3>
            <div className="grid md:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Customer</label>
                <select value={form.customerId} onChange={e => handleChange('customerId', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50">
                  <option value="">Select customer</option>
                  {customers.map((c:any) => <option key={c.id} value={c.id}>{c.name || c.email || c.id}</option>)}
                </select>
                {errors.customerId && <p className="text-xs text-red-600 mt-1">{errors.customerId}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Garment (optional)</label>
                <select value={form.garmentId} onChange={e => handleChange('garmentId', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50">
                  <option value="">Select garment</option>
                  {garments.map((g:any) => <option key={g.id} value={g.id}>{g.name || g.id}</option>)}
                </select>
              </div>
            </div>
            <div className="grid md:grid-cols-4 gap-3 mb-3">
              {[
                {key:'neck',label:'Neck (in)'},{key:'chest',label:'Chest (in)'},{key:'waist',label:'Waist (in)'},{key:'shoulder',label:'Shoulder (in)'},
                {key:'sleeve',label:'Sleeve (in)'},{key:'shirtLength',label:'Shirt Length (in)'},{key:'trouserLength',label:'Trouser Length (in)'},{key:'bottom',label:'Bottom (in)'},
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{f.label}</label>
                  <input type="number" step="0.1" min="0" value={(form as any)[f.key]} onChange={e => handleChange(f.key, e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm" placeholder="0.0" />
                  {errors[f.key] && <p className="text-xs text-red-600 mt-0.5">{errors[f.key]}</p>}
                </div>
              ))}
            </div>
            <div className="mb-3">
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Notes</label>
              <textarea rows={2} value={form.notes} onChange={e => handleChange('notes', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm" placeholder="Additional notes..." />
            </div>
            {errors.submit && <p className="text-sm text-red-600 mb-2">{errors.submit}</p>}
            {errors.fields && <p className="text-sm text-red-600 mb-2">{errors.fields}</p>}
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-brand-900 text-white rounded-lg font-medium text-sm hover:bg-brand-800 disabled:opacity-50">{saving ? 'Saving...' : 'Save Measurement'}</button>
              <button onClick={() => { setShowForm(false); setErrors({}); }} className="px-4 py-2 bg-slate-100 rounded-lg font-medium text-sm">Cancel</button>
            </div>
          </div>
        )}
        {loading ? (
          <div className="text-center py-12 text-slate-400">Loading measurements...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-slate-400">No measurements yet.</div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr><th className="text-left px-4 py-3">Customer</th><th className="text-left px-4 py-3">Garment</th><th className="text-left px-4 py-3">Measurements</th><th className="text-left px-4 py-3">Notes</th><th className="text-left px-4 py-3">Date</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((m: any, idx: number) => (
                  <tr key={m.id || idx} className="hover:bg-slate-50">
                    <td className="px-4 py-3">{m.customer?.name || '-'}</td>
                    <td className="px-4 py-3">{m.garment?.name || '-'}</td>
                    <td className="px-4 py-3 font-mono text-xs">{formatFields(m.fields)}</td>
                    <td className="px-4 py-3 text-slate-600">{m.notes || '-'}</td>
                    <td className="px-4 py-3 text-slate-400">{m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
