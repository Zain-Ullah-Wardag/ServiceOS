import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, CheckCircle, Plus, Star } from 'lucide-react';
import { api } from '../lib/api';

const STEPS = ['Customer', 'Service', 'Measurement', 'Garment', 'Details', 'Review'];

export default function OrderWizard() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [customers, setCustomers] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [measurements, setMeasurements] = useState<any[]>([]);
  
  const [garments, setGarments] = useState<any[]>([]);
  
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [selCustomer, setSelCustomer] = useState('');
  const [newCustomerForm, setNewCustomerForm] = useState({ name: '', phone: '', email: '', notes: '' });
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [selServices, setSelServices] = useState<string[]>([]);
  const [selMeasurement, setSelMeasurement] = useState('');
  const [selGarment, setSelGarment] = useState('');
  const [selStaff, setSelStaff] = useState('');
  const [delivery, setDelivery] = useState('');
  const [priority, setPriority] = useState('normal');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    api('/customers').then(r => { if (r?.success) setCustomers(r.data || []); });
    api('/services').then(r => { if (r?.success) setServices(r.data || []); });
    api('/tailoring/measurements').then(r => { if (r?.success) setMeasurements(r.data || []); });
    api('/tailoring/garments').then(r => { if (r?.success) setGarments(r.data || []); });
    api('/staff').then(r => { if (r?.success) setStaff(r.data || []); });
  }, []);

  const total = services.filter(s => selServices.includes(s.id)).reduce((a, s) => a + (Number(s.price) || 0), 0);

  const handleCreateCustomer = async () => {
    try {
      const res = await api('/customers', { method: 'POST', body: JSON.stringify(newCustomerForm) });
      if (res?.success) {
        setCustomers(prev => [...prev, res.data]);
        setSelCustomer(res.data.id);
        setShowNewCustomer(false);
        setNewCustomerForm({ name: '', phone: '', email: '', notes: '' });
      } else throw new Error(res?.error?.message || 'Failed');
    } catch (e: any) { setError(e.message || 'Customer creation failed'); }
  };

  const handleCreate = async () => {
    if (!selCustomer) { setError('Select a customer'); return; }
    if (selServices.length === 0) { setError('Select at least one service'); return; }
    setLoading(true); setError('');
    try {
      const orderRes = await api('/orders', { method: 'POST', body: JSON.stringify({
        customerId: selCustomer,
        items: selServices.map((sid: string) => {
          const svc = services.find(s => s.id === sid);
          return { serviceId: sid, quantity: 1, price: Number(svc?.price || 0) };
        }),
        priority: priority || 'normal',
        notes: notes || undefined,
      }) });
      if (!orderRes?.success) throw new Error(orderRes?.error?.message || 'Order creation failed');
      const orderId = orderRes.data.id;
      const payload: any = {
        orderId: orderId,
        customerId: selCustomer,
        status: 'received',
        priority: priority || 'normal',
        notes: notes || undefined,
      };
      if (delivery) payload.deliveryDate = delivery;
      if (selGarment) payload.garmentId = selGarment;
      if (selStaff) payload.staffId = selStaff;
      if (selMeasurement) payload.measurementId = selMeasurement;
      const tailRes = await api('/tailoring/orders', { method: 'POST', body: JSON.stringify(payload) });
      if (!tailRes?.success) throw new Error(tailRes?.error?.message || 'Tailoring order failed');
      setSuccess(true);
      setTimeout(() => nav('/dashboard/orders'), 1200);
    } catch (e: any) { setError(e.message || 'Create failed'); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-paper p-6 md:p-10">
      <div className="max-w-5xl mx-auto">
        <button onClick={() => nav('/dashboard')} className="text-sm text-brand-700 hover:underline mb-4 flex items-center gap-1"><ArrowLeft size={16}/> Back to Dashboard</button>
        <h1 className="font-serif text-3xl mb-6 flex items-center gap-3"><Star size={28} className="text-brand-700"/> New Tailoring Order</h1>
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {STEPS.map((s, i) => (
            <button key={s} onClick={() => setStep(i)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition ${i <= step ? 'bg-brand-900 text-white' : 'bg-white text-slate-400 border border-slate-200'}`}>
              <span className="w-6 h-6 rounded-full bg-white/20 text-xs flex items-center justify-center">{i+1}</span> {s}
            </button>
          ))}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-10 shadow-sm">
          {success ? (
            <div className="text-center py-12"><CheckCircle size={48} className="text-green-600 mx-auto mb-4"/><h2 className="font-serif text-2xl mb-2">Order Created</h2><p className="text-slate-500">Redirecting to orders...</p></div>
          ) : (
            <>
              {step === 0 && (
                <div>
                  <h3 className="font-semibold mb-3">Customer</h3>
                  <select value={selCustomer} onChange={e => setSelCustomer(e.target.value)} className="w-full md:w-1/2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50"><option value="">Select existing customer</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                  {!showNewCustomer && <button onClick={() => setShowNewCustomer(true)} className="mt-2 text-sm text-brand-700 font-medium flex items-center gap-1"><Plus size={14}/> Create New Customer</button>}
                  {showNewCustomer && (
                    <div className="mt-3 bg-slate-50 rounded-xl p-4 border border-slate-200">
                      <h4 className="font-semibold mb-2 text-sm">New Customer (walk-in)</h4>
                      <div className="grid md:grid-cols-2 gap-3">
                        <input placeholder="Name *" value={newCustomerForm.name} onChange={e => setNewCustomerForm({...newCustomerForm, name: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"/>
                        <input placeholder="Phone *" value={newCustomerForm.phone} onChange={e => setNewCustomerForm({...newCustomerForm, phone: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"/>
                        <input placeholder="Email" value={newCustomerForm.email} onChange={e => setNewCustomerForm({...newCustomerForm, email: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"/>
                        <textarea placeholder="Notes" rows={2} value={newCustomerForm.notes} onChange={e => setNewCustomerForm({...newCustomerForm, notes: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"/>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button onClick={handleCreateCustomer} className="px-4 py-2 bg-brand-900 text-white rounded-lg text-sm font-medium">Create & Select</button>
                        <button onClick={() => setShowNewCustomer(false)} className="px-4 py-2 bg-slate-100 rounded-lg text-sm">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {step === 1 && (
                <div>
                  <h3 className="font-semibold mb-3">Services</h3>
                  <div className="grid md:grid-cols-2 gap-3">{services.filter(s => s.status === 'active').map(s => (
                    <label key={s.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${selServices.includes(s.id) ? 'border-brand-900 bg-brand-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                      <input type="checkbox" checked={selServices.includes(s.id)} onChange={e => { if (e.target.checked) setSelServices(prev => [...prev, s.id]); else setSelServices(prev => prev.filter(id => id !== s.id)); }} className="w-4 h-4"/>
                      <div><div className="font-medium">{s.name}</div><div className="text-xs text-slate-500">PKR {s.price} • {s.duration} min</div></div>
                    </label>
                  ))}</div>
                </div>
              )}
              {step === 2 && (
                <div>
                  <h3 className="font-semibold mb-3">Measurements</h3>
                  <select value={selMeasurement} onChange={e => setSelMeasurement(e.target.value)} className="w-full md:w-1/2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50"><option value="">Select previous measurement (optional)</option>{measurements.map(m => <option key={m.id} value={m.id}>{m.customer?.name || 'Measurement'} — {m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '-'}</option>)}</select>
                  <p className="text-xs text-slate-400 mt-2">Measurement is linked via customer; new measurements can be added in Measurements module.</p>
                </div>
              )}
              {step === 3 && (
                <div>
                  <h3 className="font-semibold mb-3">Garment / Design</h3>
                  <select value={selGarment} onChange={e => setSelGarment(e.target.value)} className="w-full md:w-1/2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50"><option value="">Select existing garment (optional)</option>{(selCustomer ? garments.filter((g:any) => g.customerId === selCustomer || g.customer?.id === selCustomer) : garments).map(g => <option key={g.id} value={g.id}>{g.name || g.id}</option>)}</select>
                </div>
              )}
              {step === 4 && (
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Assigned Staff</label>
                    <select value={selStaff} onChange={e => setSelStaff(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50"><option value="">Select staff (optional)</option>{staff.map(s => <option key={s.id} value={s.id}>{s.user?.name || s.id}</option>)}</select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Expected Delivery (YYYY-MM-DD)</label>
                    <input type="date" value={delivery} onChange={e => setDelivery(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50"/>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Priority</label>
                    <select value={priority} onChange={e => setPriority(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select>
                  </div>
                </div>
              )}
              {step === 5 && (
                <div>
                  <h3 className="font-semibold mb-4">Review Order</h3>
                  <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div className="bg-slate-50 rounded-xl p-4"><div className="font-semibold mb-2">Customer</div><div>{customers.find(c => c.id === selCustomer)?.name || '-'}</div></div>
                    <div className="bg-slate-50 rounded-xl p-4"><div className="font-semibold mb-2">Services</div><div>{selServices.map(id => services.find(s => s.id === id)?.name).join(', ') || '-'}</div></div>
                    <div className="bg-slate-50 rounded-xl p-4"><div className="font-semibold mb-2">Measurements</div><div>{measurements.find(m => m.id === selMeasurement)?.customer?.name || 'Latest / new'}</div></div>
                    <div className="bg-slate-50 rounded-xl p-4"><div className="font-semibold mb-2">Garment</div><div>{garments.find(g => g.id === selGarment)?.name || '-'}</div></div>
                    <div className="bg-slate-50 rounded-xl p-4"><div className="font-semibold mb-2">Staff / Delivery / Priority</div><div>{staff.find(s => s.id === selStaff)?.user?.name || '-'} • {delivery || '-'} • {priority}</div></div>
                    <div className="bg-slate-50 rounded-xl p-4"><div className="font-semibold mb-2">Price</div><div className="text-xl font-serif font-bold">PKR {total}</div></div>
                  </div>
                  <div className="mt-4"><label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Notes</label><textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm"/></div>
                </div>
              )}
              {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
              <div className="flex justify-between items-center mt-6">
                <button disabled={step === 0} onClick={() => setStep(step - 1)} className="px-4 py-2 bg-slate-100 rounded-lg text-sm font-medium disabled:opacity-30">Back</button>
                {step < STEPS.length - 1 ? (
                  <button onClick={() => setStep(step + 1)} className="px-6 py-2 bg-brand-900 text-white rounded-xl font-medium">Next <ChevronRight size={16} className="inline"/></button>
                ) : (
                  <button onClick={handleCreate} disabled={loading} className="px-6 py-2 bg-green-700 text-white rounded-xl font-medium">{loading ? 'Creating...' : 'Create Order'}</button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
