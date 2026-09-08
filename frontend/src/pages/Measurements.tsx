import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ruler, Plus, ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';

export default function Measurements() {
  const nav = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [fieldsConfig, setFieldsConfig] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [garments, setGarments] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [measures, setMeasures] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [garmentId, setGarmentId] = useState('');

  useEffect(() => {
    api('/tailoring/measurements').then(r => { if (r?.success) setItems(r.data || []); }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (showForm) {
      api('/tailoring/measurement-fields').then(r => { if (r?.success) setFieldsConfig(r.data || []); });
      api('/customers').then(r => { if (r?.success) setCustomers(r.data || []); });
      api('/tailoring/garments').then(r => { if (r?.success) setGarments(r.data || []); });
    }
  }, [showForm]);

  useEffect(() => {
    if (showForm && fieldsConfig.length > 0) {
      const init: Record<string, string> = {};
      for (const f of fieldsConfig) init[f.name] = '';
      setMeasures(init);
      setNotes(''); setCustomerId(''); setGarmentId(''); setErrors({});
    }
  }, [showForm, fieldsConfig]);

  const handleChange = (k: string, v: string) => {
    setMeasures(prev => ({ ...prev, [k]: v }));
    if (errors[k]) setErrors(prev => { const n = { ...prev }; delete n[k]; return n; });
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!customerId) errs.customerId = 'Select a customer';
    if (fieldsConfig.length === 0) errs.fields = 'No fields configured';
    let hasValue = false;
    for (const f of fieldsConfig) {
      const raw = measures[f.name] || '';
      if (f.type === 'number' || f.type === 'integer') {
        if (raw === '') errs[f.name] = 'Required';
        else { const n = parseFloat(raw); if (isNaN(n)) errs[f.name] = 'Valid number'; else if (n < 0) errs[f.name] = 'Not negative'; else hasValue = true; }
      } else {
        if (raw === '') errs[f.name] = 'Required'; else hasValue = true;
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
      const fieldsObj: Record<string, any> = {};
      for (const f of fieldsConfig) {
        const raw = measures[f.name] || '';
        fieldsObj[f.name] = (f.type === 'number' || f.type === 'integer') ? parseFloat(raw) : raw;
      }
      const payload: any = { customerId, fields: fieldsObj, notes: notes || undefined };
      if (garmentId) payload.garmentId = garmentId;
      const res = await api('/tailoring/measurements', { method: 'POST', body: JSON.stringify(payload) });
      if (!res?.success) throw new Error(res?.error?.message || 'Failed');
      setShowForm(false);
      setMeasures({}); setNotes(''); setCustomerId(''); setGarmentId(''); setErrors({});
      const r = await api('/tailoring/measurements');
      if (r?.success) setItems(r.data || []);
    } catch (e: any) { setErrors(prev => ({ ...prev, submit: e.message || 'Save failed' })); }
    finally { setSaving(false); }
  };

  const formatFields = (fields: any) => {
    if (!fields || typeof fields !== 'object') return '—';
    if (fieldsConfig.length > 0) {
      return fieldsConfig.map((f: any) => {
        const val = fields[f.name];
        if (val === undefined || val === null || val === '') return null;
        return f.label ? `${f.label}: ${val}` : `${f.name}: ${val}`;
      }).filter(Boolean).join('  |  ');
    }
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
                <select value={customerId} onChange={e => { setCustomerId(e.target.value); if (errors.customerId) setErrors(prev => { const n={...prev}; delete n.customerId; return n; }); }} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50"><option value="">Select customer</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name||c.email||c.id}</option>)}</select>
                {errors.customerId && <p className="text-xs text-red-600 mt-1">{errors.customerId}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Garment (optional)</label>
                <select value={garmentId} onChange={e => setGarmentId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50"><option value="">Select garment</option>{garments.map(g => <option key={g.id} value={g.id}>{g.name||g.id}</option>)}</select>
              </div>
            </div>
            <div className="grid md:grid-cols-4 gap-3 mb-3">
              {fieldsConfig.map(f => (
                <div key={f.name}>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{f.label || f.name}</label>
                  <input type={f.type === 'number' || f.type === 'integer' ? 'number' : 'text'} step={f.type === 'number' ? '0.1' : undefined} min={f.type !== 'text' ? '0' : undefined} value={measures[f.name]||''} onChange={e => handleChange(f.name, e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm" />
                  {errors[f.name] && <p className="text-xs text-red-600 mt-0.5">{errors[f.name]}</p>}
                </div>
              ))}
            </div>
            <div className="mb-3">
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Notes</label>
              <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm" />
            </div>
            {errors.submit && <p className="text-sm text-red-600 mb-2">{errors.submit}</p>}
            {errors.fields && <p className="text-sm text-red-600 mb-2">{errors.fields}</p>}
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-brand-900 text-white rounded-lg font-medium text-sm hover:bg-brand-800 disabled:opacity-50">{saving ? 'Saving...' : 'Save Measurement'}</button>
              <button onClick={() => { setShowForm(false); setErrors({}); }} className="px-4 py-2 bg-slate-100 rounded-lg font-medium text-sm">Cancel</button>
            </div>
          </div>
        )}
        {loading ? <div className="text-center py-12 text-slate-400">Loading measurements...</div> : items.length === 0 ? <div className="text-center py-12 text-slate-400">No measurements yet.</div> : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm"><thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide"><tr><th className="text-left px-4 py-3">Customer</th><th className="text-left px-4 py-3">Garment</th><th className="text-left px-4 py-3">Measurements</th><th className="text-left px-4 py-3">Notes</th><th className="text-left px-4 py-3">Date</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{items.map((m:any, idx:number) => <tr key={m.id||idx} className="hover:bg-slate-50"><td className="px-4 py-3">{m.customer?.name||'-'}</td><td className="px-4 py-3">{m.garment?.name||'-'}</td><td className="px-4 py-3 font-mono text-xs">{formatFields(m.fields)}</td><td className="px-4 py-3 text-slate-600">{m.notes||'-'}</td><td className="px-4 py-3 text-slate-400">{m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '-'}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
