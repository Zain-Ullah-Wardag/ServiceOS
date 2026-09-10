import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Scissors, Stethoscope, Microscope, Sparkles, BarChart3, Zap, Lock, Clock, Users } from 'lucide-react';

export default function Landing() {
  const nav = useNavigate();
  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-paper/80 backdrop-blur-md border-b border-black/5">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5 font-bold text-xl tracking-tight text-brand-900"><div className="w-8 h-8 rounded-lg bg-brand-900 text-white flex items-center justify-center"><ShieldCheck size={18} strokeWidth={2.5} /></div> ServiceOS</a>
          <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
            <a href="#industries" className="hover:text-brand-800 px-3 py-1.5 rounded-full hover:bg-brand-50 transition">Industries</a>
            <a href="#features" className="hover:text-brand-800 px-3 py-1.5 rounded-full hover:bg-brand-50 transition">Features</a>
            <button onClick={() => nav('/login')} className="px-4 py-2 rounded-full bg-brand-900 text-white hover:bg-brand-800 transition shadow-lg shadow-brand-900/20">Sign in</button>
          </div>
        </div>
      </nav>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-brand-950 text-white">
          <div className="absolute inset-0 opacity-20"><svg className="w-full h-full" viewBox="0 0 1440 700" preserveAspectRatio="none"><path fill="none" stroke="#5a8bc7" strokeWidth="1.2" d="M0 300 Q360 100 720 300 T1440 300 V700 H0 Z" /><path fill="none" stroke="#8fb3dc" strokeWidth="1" d="M0 400 Q360 200 720 400 T1440 400 V700 H0 Z" /></svg></div>
          <div className="max-w-6xl mx-auto px-6 pt-28 pb-24 relative">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/10 px-3.5 py-1.5 text-sm font-medium text-brand-200 mb-8"><Sparkles size={14} /> AI Enabled Multi-Tenant SaaS</div>
              <h1 className="font-serif text-6xl md:text-7xl leading-[1.05] tracking-tight mb-7">A digital operating system <span className="italic text-brand-300">for service organizations.</span></h1>
              <p className="text-xl md:text-2xl text-brand-200/90 leading-relaxed mb-10 max-w-2xl">One platform. Many businesses. Strict isolation. Industry-specific workflows for tailoring, clinics, and laboratories.</p>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => nav('/register')} className="px-8 py-3.5 rounded-full bg-white text-brand-900 font-semibold text-base shadow-xl shadow-black/20 hover:scale-[1.03] transition">Start free</button>
                <a href="#industries" className="px-8 py-3.5 rounded-full bg-white/10 text-white font-semibold text-base border border-white/10 hover:bg-white/15 transition">Explore industries</a>
              </div>
            </div>
          </div>
        </section>

        {/* Industries */}
        <section id="industries" className="max-w-6xl mx-auto px-6 py-24">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="font-serif text-4xl md:text-5xl tracking-tight mb-4">Built for your industry</h2>
            <p className="text-slate-500 text-lg">Same core architecture. Different configurations. No separate apps needed.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: Scissors, title: 'Tailoring', desc: 'Measurements, garments, production stages, delivery tracking, and worker assignment.' },
              { icon: Stethoscope, title: 'Clinic', desc: 'Patients, doctors, appointments, consultations, prescriptions, billing.' },
              { icon: Microscope, title: 'Laboratory', desc: 'Test catalog, samples, technician assignment, results, verification, reports.' },
            ].map((c) => (
              <a key={c.title} href="#" className="group p-8 rounded-3xl bg-white border border-slate-200/60 shadow-sm hover:shadow-xl hover:-translate-y-1 transition">
                <div className="w-12 h-12 rounded-2xl bg-brand-900 text-white flex items-center justify-center mb-6 shadow-lg shadow-brand-900/20"><c.icon size={22} /></div>
                <h3 className="font-semibold text-xl mb-2">{c.title}</h3>
                <p className="text-slate-500 leading-relaxed">{c.desc}</p>
              </a>
            ))}
          </div>
        </section>

        {/* Features */}
        <section id="features" className="bg-warm">
          <div className="max-w-6xl mx-auto px-6 py-24">
            <div className="grid lg:grid-cols-2 gap-20 items-start">
              <div>
                <h2 className="font-serif text-4xl md:text-5xl tracking-tight mb-6">Everything your business needs.</h2>
                <p className="text-slate-500 text-lg leading-relaxed mb-10">From customer management to AI-powered insights, ServiceOS provides the complete digital backbone for service organizations.</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  {[
                    { icon: Users, label: 'Customer management', desc: 'Profiles, history, orders, and notes.' },
                    { icon: Clock, label: 'Bookings & orders', desc: 'Scheduling, conflicts, workflow tracking.' },
                    { icon: Zap, label: 'Staff & roles', desc: 'Invite, assign, schedule, and track workload.' },
                    { icon: BarChart3, label: 'Analytics', desc: 'Revenue, orders, staff load, and growth.' },
                    { icon: Lock, label: 'Tenant isolation', desc: 'Strict data separation by design.' },
                    { icon: Sparkles, label: 'AI assistant', desc: 'Ask questions about your business.' },
                  ].map((f) => (
                    <div key={f.label} className="p-5 rounded-2xl bg-white border border-slate-200/60 shadow-sm">
                      <f.icon size={20} className="text-brand-600 mb-3" />
                      <h4 className="font-semibold mb-1">{f.label}</h4>
                      <p className="text-sm text-slate-500">{f.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-3xl overflow-hidden shadow-2xl shadow-brand-900/10 border border-slate-200/50 bg-brand-950 text-white">
                <img src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=80" alt="Dashboard" className="w-full h-72 object-cover opacity-80" />
                <div className="p-8">
                  <h3 className="font-serif text-3xl mb-3">AI Business Insights</h3>
                  <p className="text-brand-200/90 leading-relaxed mb-6">"Your tailoring orders increased by 32% this month." Ask anything about your business — the AI only accesses your tenant data.</p>
                  <div className="flex gap-2 flex-wrap">
                    {['Sales this month', 'Most popular service', 'Orders at risk', 'Unpaid invoices'].map(t => <span key={t} className="px-3 py-1 rounded-full bg-white/10 text-sm font-medium">{t}</span>)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="max-w-6xl mx-auto px-6 py-24">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="font-serif text-4xl md:text-5xl tracking-tight mb-4">Simple, transparent pricing.</h2>
            <p className="text-slate-500 text-lg">Start free. Upgrade when your business grows. All prices are demonstration values.</p>
          </div>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { name: 'Free', price: 'PKR 0', desc: 'For new businesses getting started.', features: ['1 staff', '50 customers', '50 orders/month', 'Basic dashboard', 'Customers & services'] },
              { name: 'Starter', price: 'PKR 1,499', desc: 'For growing service businesses.', features: ['3 staff', '500 customers', '500 orders/month', 'Invoices & payments', 'Basic analytics', 'Notifications'], highlight: true },
              { name: 'Pro', price: 'PKR 3,499', desc: 'For serious operations.', features: ['10 staff', 'Unlimited customers', '2,000 orders/month', 'AI assistant', 'Advanced analytics', 'Forecasting'] },
              { name: 'Business', price: 'PKR 7,999', desc: 'For larger organizations.', features: ['Unlimited staff', 'Unlimited orders', 'Advanced AI', 'Custom workflows', 'API access', 'Priority support'] },
            ].map((p) => (
              <div key={p.name} className={`rounded-3xl border p-8 flex flex-col ${p.highlight ? 'bg-brand-900 text-white border-brand-900 shadow-2xl shadow-brand-900/20' : 'bg-white border-slate-200/60 shadow-sm'}`}>
                <h3 className="font-semibold text-xl mb-1">{p.name}</h3>
                <div className="text-3xl font-extrabold mb-2 tracking-tight">{p.price}<span className={`text-sm font-medium ml-1 ${p.highlight ? 'text-brand-300' : 'text-slate-400'}`}>/mo</span></div>
                <p className={`text-sm mb-6 ${p.highlight ? 'text-brand-200' : 'text-slate-500'}`}>{p.desc}</p>
                <ul className="space-y-3 mb-8 flex-1">
                  {p.features.map(f => (
                    <li key={f} className="flex items-center gap-2.5 text-sm"><div className={`w-4 h-4 rounded-full flex items-center justify-center ${p.highlight ? 'bg-brand-400 text-brand-900' : 'bg-brand-100 text-brand-700'}`}><span className="text-[10px] font-bold">✓</span></div> <span className={p.highlight ? 'text-brand-50' : 'text-slate-700'}>{f}</span></li>
                  ))}
                </ul>
                <button onClick={() => nav('/register')} className={`w-full py-3 rounded-xl font-semibold text-sm transition ${p.highlight ? 'bg-white text-brand-900 hover:bg-brand-50' : 'bg-brand-900 text-white hover:bg-brand-800'}`}>Get started</button>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-5xl mx-auto px-6 pb-24">
          <div className="rounded-[2.5rem] bg-brand-900 text-white px-10 py-16 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-80 h-80 bg-brand-700 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 opacity-60" />
            <h2 className="font-serif text-4xl md:text-5xl tracking-tight mb-5 relative">Ready to digitize your business?</h2>
            <p className="text-brand-200 text-lg max-w-xl mx-auto mb-8 relative">Register, select your industry, and start managing customers, orders, and payments — all in one place.</p>
            <div className="flex flex-wrap justify-center gap-3 relative">
              <button onClick={() => nav('/register')} className="px-8 py-3.5 rounded-full bg-white text-brand-900 font-semibold shadow-xl hover:scale-[1.03] transition">Create free account</button>
              <a href="#industries" className="px-8 py-3.5 rounded-full bg-white/10 text-white font-semibold border border-white/10 hover:bg-white/15 transition">See industries</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200/60 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-12 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-400">
          <div className="font-bold text-brand-900">ServiceOS</div>
          <div>AI Enabled Multi-Tenant SaaS Platform for Service Organizations</div>
          <div>Version 1.0 — FYP Demonstration</div>
        </div>
      </footer>
    </div>
  );
}
