import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { api } from '../lib/api';

export default function Login({ register }: { register?: boolean }) {
  const nav = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>(register ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      if (mode === 'register') {
        if (!name || !email || !password || password !== confirm) { setError('All fields required and passwords must match'); setLoading(false); return; }
        const res = await api('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, phone, password, confirmPassword: confirm }) });
        if (res.success) { setMode('login'); setError('Account created. Please sign in.'); setLoading(false); return; }
      } else {
        const res = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
        if (res.success && res.data?.token) { localStorage.setItem('token', res.data.token); localStorage.setItem('tenantId', res.data.tenantId || ''); nav('/dashboard'); }
      }
    } catch (e: any) { setError(e.message || 'Something went wrong'); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <a href="/" className="flex items-center gap-2.5 font-bold text-xl tracking-tight text-brand-900 mb-10"><div className="w-8 h-8 rounded-lg bg-brand-900 text-white flex items-center justify-center"><ShieldCheck size={18} strokeWidth={2.5} /></div> ServiceOS</a>
        <div className="bg-white rounded-3xl border border-slate-200/60 shadow-xl shadow-slate-200/50 p-8 md:p-10">
          <h1 className="font-serif text-3xl mb-2">{mode === 'login' ? 'Welcome back' : 'Create account'}</h1>
          <p className="text-slate-500 mb-8">{mode === 'login' ? 'Sign in to manage your business.' : 'Start with a free ServiceOS account.'}</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">Full name</label>
                  <input id="name" type="text" required value={name} onChange={e => setName(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none transition" placeholder="Zain Ullah" />
                </div>
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                  <input id="phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none transition" placeholder="+92 300 1234567" />
                </div>
              </>
            )}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none transition" placeholder="you@example.com" />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <div className="relative">
                <input id="password" type={showPass ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none transition pr-10" placeholder="••••••••" />
                <button type="button" onClick={() => setShowPass(s => !s)} className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"><span>{showPass ? <EyeOff size={18} /> : <Eye size={18} />}</span></button>
              </div>
            </div>
            {mode === 'register' && (
              <div>
                <label htmlFor="confirm" className="block text-sm font-medium text-slate-700 mb-1">Confirm password</label>
                <input id="confirm" type="password" required value={confirm} onChange={e => setConfirm(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-brand-200 focus:border-brand-400 outline-none transition" placeholder="••••••••" />
              </div>
            )}
            {error && <div className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{error}</div>}
            <button disabled={loading} type="submit" className="w-full py-3 rounded-xl bg-brand-900 text-white font-semibold hover:bg-brand-800 transition shadow-lg shadow-brand-900/20 flex items-center justify-center gap-2">{loading ? 'Working...' : (mode === 'login' ? 'Sign in' : 'Create account')} <ArrowRight size={18} /></button>
          </form>
          <div className="mt-6 text-center text-sm text-slate-500">
            {mode === 'login' ? (
              <>Don't have an account? <button onClick={() => { setMode('register'); setError(''); }} className="text-brand-700 font-medium hover:underline">Register</button></>
            ) : (
              <>Already registered? <button onClick={() => { setMode('login'); setError(''); }} className="text-brand-700 font-medium hover:underline">Sign in</button></>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
