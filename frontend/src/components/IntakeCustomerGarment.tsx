import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { createdRecord, customerGarments, duplicateCustomer, garmentCategories, searchCustomers, selectCustomerGarment, type IntakeCustomer, type IntakeGarment } from '../lib/intake';

const input = 'min-w-0 w-full mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm';
const button = 'rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-brand-800 disabled:opacity-50';
const blankCustomer = { name: '', phone: '', email: '', address: '' };
const blankGarment = { name: '', category: 'Kurta', description: '' };

/** Separate quick-save forms: final order submission only references their real IDs. */
export default function IntakeCustomerGarment({ busy, onBusyChange, onCustomer, onGarment }: {
  busy: boolean; onBusyChange: (busy: boolean) => void;
  onCustomer: (customer: IntakeCustomer | null) => void;
  onGarment: (garment: IntakeGarment | null) => void;
}) {
  const [customers, setCustomers] = useState<IntakeCustomer[]>([]);
  const [customer, setCustomer] = useState<IntakeCustomer | null>(null);
  const [garments, setGarments] = useState<IntakeGarment[]>([]);
  const [garment, setGarment] = useState<IntakeGarment | null>(null);
  const [query, setQuery] = useState('');
  const [register, setRegister] = useState(false);
  const [addGarment, setAddGarment] = useState(false);
  const [customerDraft, setCustomerDraft] = useState(blankCustomer);
  const [garmentDraft, setGarmentDraft] = useState(blankGarment);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingGarments, setLoadingGarments] = useState(false);
  const [customerError, setCustomerError] = useState('');
  const [garmentError, setGarmentError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [duplicate, setDuplicate] = useState<IntakeCustomer | null>(null);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [garmentAttempt, setGarmentAttempt] = useState(0);
  const lock = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (saveError) errorRef.current?.focus(); }, [saveError]);
  const garmentCallback = useRef(onGarment);
  garmentCallback.current = onGarment;

  useEffect(() => {
    const controller = new AbortController();
    setLoadingCustomers(true); setCustomerError('');
    api('/customers', { signal: controller.signal }).then(response => {
      if (!response.success || !Array.isArray(response.data)) throw new Error(response.error?.message || 'Unable to load customers.');
      if (!controller.signal.aborted) setCustomers(response.data);
    }).catch(error => { if (!controller.signal.aborted) setCustomerError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoadingCustomers(false); });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (!customer) return;
    const controller = new AbortController();
    setLoadingGarments(true); setGarmentError('');
    // This existing endpoint has no customer query parameter. Never display other owners' records.
    api('/tailoring/garments', { signal: controller.signal }).then(response => {
      if (!response.success || !Array.isArray(response.data)) throw new Error(response.error?.message || 'Unable to load garments.');
      if (controller.signal.aborted) return;
      const owned = customerGarments(response.data, customer.id);
      setGarments(owned);
      const selected = selectCustomerGarment(owned, customer.id);
      setGarment(selected); garmentCallback.current(selected);
    }).catch(error => { if (!controller.signal.aborted) setGarmentError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoadingGarments(false); });
    return () => controller.abort();
  }, [customer, garmentAttempt]);

  function chooseCustomer(next: IntakeCustomer | null) {
    setCustomer(next); setGarment(null); setGarments([]); setLoadingGarments(!!next);
    setRegister(false); setAddGarment(false); setSaveError(''); setDuplicate(null);
    setCustomerDraft(blankCustomer); setGarmentDraft(blankGarment);
    onCustomer(next); onGarment(null);
  }
  function chooseGarment(next: IntakeGarment | null) { setGarment(next); onGarment(next); }
  async function quickSave(event: React.FormEvent, kind: 'customer' | 'garment') {
    event.preventDefault();
    if (lock.current || busy) return;
    lock.current = true; setSaving(true); onBusyChange(true); setSaveError(''); setDuplicate(null);
    try {
      if (kind === 'customer') {
        const fresh = await api('/customers');
        if (!fresh.success || !Array.isArray(fresh.data)) throw new Error(fresh.error?.message || 'Unable to check existing customers. Please retry.');
        setCustomers(fresh.data);
        const match = duplicateCustomer(fresh.data, customerDraft.phone, customerDraft.email);
        if (match) { setDuplicate(match); throw new Error('A customer with this phone or email already exists. Select their record instead.'); }
        const saved = createdRecord<IntakeCustomer>(await api('/customers', { method: 'POST', body: JSON.stringify({ name: customerDraft.name.trim(), phone: customerDraft.phone.trim(), email: customerDraft.email.trim() || undefined, address: customerDraft.address.trim() || undefined }) }));
        setCustomers(previous => [saved, ...previous.filter(row => row.id !== saved.id)]);
        chooseCustomer(saved);
      } else {
        if (!customer) throw new Error('Select a customer first.');
        const saved = createdRecord<IntakeGarment>(await api('/tailoring/garments', { method: 'POST', body: JSON.stringify({ customerId: customer.id, name: garmentDraft.name.trim(), category: garmentDraft.category, description: garmentDraft.description.trim() || undefined }) }));
        if (saved.customerId !== customer.id) throw new Error('Saved garment ownership could not be verified. Reload garments before retrying.');
        setGarments(previous => [saved, ...previous.filter(row => row.id !== saved.id)]);
        chooseGarment(saved); setAddGarment(false); setGarmentDraft(blankGarment);
      }
    } catch (error) { setSaveError(error instanceof Error ? error.message : 'Unable to save.'); }
    finally { lock.current = false; setSaving(false); onBusyChange(false); }
  }
  const matches = searchCustomers(customers, query);
  const inactive = (row: IntakeCustomer) => !!row.status && row.status !== 'active';
  return <div className="space-y-6 mb-6">
    <section aria-labelledby="intake-customer-title"><h3 id="intake-customer-title" className="font-semibold text-sm mb-3"><span className="text-brand-500 mr-2">01</span> Customer</h3>
      {customer ? <div className="flex justify-between gap-3 rounded-xl bg-brand-50 p-3"><div className="min-w-0"><p className="font-semibold">{customer.name}</p><p className="text-sm text-slate-600">{customer.phone}</p></div><button type="button" disabled={busy || saving} onClick={() => chooseCustomer(null)} className={button}>Change customer</button></div> : <>
        <label className="block text-sm font-medium">Search by name or phone<input type="search" value={query} disabled={busy || saving} onChange={event => setQuery(event.target.value)} placeholder="Name or phone number" className={input} /></label>
        {loadingCustomers && <p role="status" className="text-sm mt-3 text-slate-500">Loading customers for search…</p>}
        {customerError && <div role="alert" className="text-sm text-red-700 mt-3">{customerError}<button type="button" onClick={() => setAttempt(value => value + 1)} className={button}>Retry customers</button></div>}
        {!loadingCustomers && !customerError && <>
          <section aria-labelledby="intake-matches-title" className="my-4">
            <h4 id="intake-matches-title" className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Matches</h4>
            <div className="max-h-64 overflow-y-auto space-y-2 p-1 -m-1">
              {matches.map(row => <button key={row.id} type="button" disabled={busy || saving || inactive(row)} aria-label={`Select customer ${row.name} ${row.phone}`} onClick={() => chooseCustomer(row)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-brand-400 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50">
                <span className="min-w-0"><span className="block break-words text-sm font-semibold text-slate-800">{row.name}</span><span className="mt-1 block break-words text-sm text-slate-500">{row.phone}{inactive(row) && ' · Inactive'}</span></span>
                <ChevronRight size={20} aria-hidden="true" className="shrink-0 text-slate-400" />
              </button>)}
              {!matches.length && <p className="text-sm text-slate-500 py-3">No matching customers. Register them below.</p>}
            </div>
          </section>
          {!register && <button type="button" disabled={busy || saving} onClick={() => { setRegister(true); setSaveError(''); }} className={button}>+ Register New Customer</button>}
        </>}
        {register && <form onSubmit={event => void quickSave(event, 'customer')} className="mt-4 space-y-3 rounded-xl border border-slate-200 p-4">
          <h4 className="font-semibold text-sm">Register New Customer</h4><p className="text-xs text-slate-500">Saved immediately as a customer record, even if you cancel this order later.</p>
          <fieldset disabled={busy || saving} className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm">Name *<input required maxLength={200} value={customerDraft.name} onChange={e => setCustomerDraft({ ...customerDraft, name: e.target.value })} className={input} /></label>
            <label className="text-sm">Phone *<input required type="tel" maxLength={50} value={customerDraft.phone} onChange={e => setCustomerDraft({ ...customerDraft, phone: e.target.value })} className={input} /></label>
            <label className="text-sm">Email<input type="email" value={customerDraft.email} onChange={e => setCustomerDraft({ ...customerDraft, email: e.target.value })} className={input} /></label>
            <label className="text-sm">Address<input value={customerDraft.address} onChange={e => setCustomerDraft({ ...customerDraft, address: e.target.value })} className={input} /></label>
          </fieldset>
          {saveError && <p ref={errorRef} tabIndex={-1} role="alert" className="text-sm text-red-700">{saveError}</p>}
          {duplicate && <button type="button" disabled={busy || saving || inactive(duplicate)} onClick={() => chooseCustomer(duplicate)} className={button}>{inactive(duplicate) ? 'Existing customer is inactive — manage their record in Customers' : `Select existing customer: ${duplicate.name}`}</button>}
          <div className="sticky bottom-0 flex flex-wrap gap-2 bg-white py-3"><button disabled={busy || saving} className={button}>{saving ? 'Registering…' : 'Save Customer'}</button><button type="button" disabled={busy || saving} onClick={() => { setRegister(false); setSaveError(''); }} className={button}>Cancel registration</button></div>
        </form>}
      </>}
    </section>
    {customer && <section aria-labelledby="intake-garment-title" className="border-t border-slate-100 pt-5"><h3 id="intake-garment-title" className="font-semibold text-sm mb-3"><span className="text-brand-500 mr-2">02</span> Garment</h3>
      {loadingGarments ? <p role="status" className="text-sm text-slate-500">Loading this customer’s garments…</p> : garmentError ? <div role="alert" className="text-sm text-red-700">{garmentError}<button type="button" onClick={() => setGarmentAttempt(value => value + 1)} className={button}>Retry garments</button></div> : <>
        {!!garments.length && <label className="block text-sm">Garment *<select value={garment?.id || ''} disabled={busy || saving} onChange={e => { chooseGarment(garments.find(row => row.id === e.target.value) || null); setAddGarment(false); setGarmentDraft(blankGarment); setSaveError(''); }} className={input}><option value="">Select garment</option>{garments.map(row => <option key={row.id} value={row.id}>{row.name}{row.category ? ` · ${row.category}` : ''}</option>)}</select></label>}
        {!garments.length && <p className="text-sm text-slate-500">No garments yet. Add the garment for this order here.</p>}
        {!addGarment && <button type="button" disabled={busy || saving} onClick={() => { setAddGarment(true); setSaveError(''); chooseGarment(null); }} className={`${button} mt-3`}>+ Add New Garment</button>}
        {addGarment && <form onSubmit={event => void quickSave(event, 'garment')} className="mt-4 space-y-3 rounded-xl border border-slate-200 p-4"><h4 className="font-semibold text-sm">Add New Garment</h4><p className="text-xs text-slate-500">Saved to this customer immediately. Category describes the garment; the service still determines the default measurement template.</p>
          <fieldset disabled={busy || saving} className="space-y-3">
            <label className="block text-sm">Garment name *<input required value={garmentDraft.name} onChange={e => setGarmentDraft({ ...garmentDraft, name: e.target.value })} className={input} /></label>
            <label className="block text-sm">Category<select value={garmentDraft.category} onChange={e => setGarmentDraft({ ...garmentDraft, category: e.target.value })} className={input}>{garmentCategories.map(category => <option key={category}>{category}</option>)}</select></label>
            <label className="block text-sm">Description<textarea value={garmentDraft.description} onChange={e => setGarmentDraft({ ...garmentDraft, description: e.target.value })} className={input} /></label>
          </fieldset>
          {saveError && <p ref={errorRef} tabIndex={-1} role="alert" className="text-sm text-red-700">{saveError}</p>}
          <div className="sticky bottom-0 flex flex-wrap gap-2 bg-white py-3"><button disabled={busy || saving} className={button}>{saving ? 'Saving garment…' : 'Save Garment'}</button><button type="button" disabled={busy || saving} onClick={() => { setAddGarment(false); setSaveError(''); chooseGarment(selectCustomerGarment(garments, customer.id)); }} className={button}>Cancel garment</button></div>
        </form>}
      </>}
    </section>}
  </div>;
}
