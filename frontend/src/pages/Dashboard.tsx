import { useEffect, useMemo, useRef, useState } from 'react';
import OrderWizard from './OrderWizard';

import {
  Link,
  useLocation,
  useNavigate,
} from 'react-router-dom';

import {
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Lock,
  Scissors,
  Users,
  CalendarDays,
  Package,
  CreditCard,
  BarChart3,
  Sparkles,
  Menu,
  X,
  CheckCircle,
  AlertCircle,
  Settings,
  FileText,
  Ruler,
  LogOut,
  RefreshCw,
} from 'lucide-react';

import { api } from '../lib/api';
import { LatestRequestGate } from '../lib/latestRequest';
import WorkflowDrawer from '../components/WorkflowDrawer';
import IntakeCustomerGarment from '../components/IntakeCustomerGarment';
import { createdRecord, intakeLineTotal, intakeOrderPayload, type IntakeCustomer, type IntakeGarment } from '../lib/intake';
import { emptyProductionFilters, filterProductionOrders, paginateProductionOrders, productionStages, type ProductionFilters } from '../lib/productionView';

/* =========================================================
   TYPES
========================================================= */

type NavItem = {
  label: string;
  icon: any;
  path: string;
  key: string;
};

type Tenant = {
  id?: string;
  name?: string;
  businessType?: string;
  status?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  currency?: string | null;
};

/* =========================================================
   HELPERS
========================================================= */

function formatStatus(value?: string | null) {
  if (!value) return '-';

  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatMoney(value: any, currency = 'PKR') {
  const number = Number(value || 0);

  return `${currency} ${number.toLocaleString()}`;
}

function formatDate(value?: string | null) {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleDateString();
}

/* =========================================================
   DASHBOARD
========================================================= */

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileOpen, setMobileOpen] = useState(false);

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [stats, setStats] = useState<any>({});
  const [recentOrders, setRecentOrders] = useState<any[]>([]);

  const [sectionData, setSectionData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectionError, setSectionError] = useState('');

  /* =======================================================
     NAVIGATION
  ======================================================= */

  const navItems: NavItem[] = [
    {
      label: 'Dashboard',
      icon: BarChart3,
      path: '/dashboard',
      key: 'dashboard',
    },

    {
      label: 'Customers',
      icon: Users,
      path: '/dashboard/customers',
      key: 'customers',
    },

    {
      label: 'Services',
      icon: Package,
      path: '/dashboard/services',
      key: 'services',
    },

    {
      label: 'Bookings',
      icon: CalendarDays,
      path: '/dashboard/bookings',
      key: 'bookings',
    },

    {
      label: 'Orders',
      icon: Package,
      path: '/dashboard/orders',
      key: 'orders',
    },

    {
      label: 'Measurements',
      icon: Ruler,
      path: '/dashboard/measurements',
      key: 'measurements',
    },

    {
      label: 'Garments',
      icon: Scissors,
      path: '/dashboard/garments',
      key: 'garments',
    },

    {
      label: 'Production',
      icon: CheckCircle,
      path: '/dashboard/production',
      key: 'production',
    },

    {
      label: 'Staff',
      icon: Users,
      path: '/dashboard/staff',
      key: 'staff',
    },

    {
      label: 'Invoices',
      icon: FileText,
      path: '/dashboard/invoices',
      key: 'invoices',
    },

    {
      label: 'Payments',
      icon: CreditCard,
      path: '/dashboard/payments',
      key: 'payments',
    },

    {
      label: 'AI Assistant',
      icon: Sparkles,
      path: '/dashboard/ai',
      key: 'ai',
    },

    {
      label: 'Settings',
      icon: Settings,
      path: '/dashboard/settings',
      key: 'settings',
    },
  ];

  /* =======================================================
     DETERMINE ACTIVE SECTION
  ======================================================= */

  const activeSection = useMemo(() => {
    const path = location.pathname.replace(/\/+$/, '');

    if (path === '/dashboard') {
      return 'dashboard';
    }

    const last = path.split('/').pop() || 'dashboard';
    if (last === 'new' && path.includes('/orders')) return 'orders';
    return last;
  }, [location.pathname]);

  const sectionRequests = useRef(new LatestRequestGate());
  const activeSectionRef = useRef(activeSection);
  activeSectionRef.current = activeSection;

  const currentNavItem =
    navItems.find((item) => item.key === activeSection) ||
    navItems[0];

  /* =======================================================
     LOAD TENANT
  ======================================================= */

  useEffect(() => {
    async function loadTenant() {
      try {
        const response = await api('/tenants/current');

        if (response?.success) {
          setTenant(response.data);
        }
      } catch (error) {
        console.error('Tenant load error:', error);
      }
    }

    loadTenant();
  }, []);

  /* =======================================================
     LOAD ACTIVE MODULE
  ======================================================= */

  useEffect(() => {
    void loadCurrentSection();
    return () => sectionRequests.current.invalidate();
  }, [activeSection]);

  async function loadCurrentSection() {
    // A mutation finishing after navigation must not refresh the old section.
    if (activeSectionRef.current !== activeSection) return;
    const request = sectionRequests.current.begin();
    try {
      setLoading(true);
      setSectionError('');
      setSectionData([]);

      /* ---------------------------------------------------
         DASHBOARD
      --------------------------------------------------- */

      if (activeSection === 'dashboard') {
        const [statsResponse, ordersResponse] =
          await Promise.all([
            api('/analytics/dashboard'),
            api('/orders'),
          ]);

        if (!sectionRequests.current.isCurrent(request)) return;
        if (statsResponse?.success) {
          setStats(statsResponse.data || {});
        }

        if (ordersResponse?.success) {
          setRecentOrders(
            Array.isArray(ordersResponse.data)
              ? ordersResponse.data.slice(0, 5)
              : [],
          );
        }

        return;
      }

      /* ---------------------------------------------------
         MODULE ENDPOINTS
      --------------------------------------------------- */

      const endpoints: Record<string, string> = {
        customers: '/customers',
        services: '/services',
        bookings: '/bookings',
        orders: '/orders',

        measurements:
          '/tailoring/measurements',

        garments:
          '/tailoring/garments',

        production:
          '/tailoring/orders',

        staff: '/staff',
        invoices: '/invoices',
        payments: '/payments',
      };

      const endpoint = endpoints[activeSection];

      if (!endpoint) {
        return;
      }

      const response = await api(endpoint, activeSection === 'production' ? { cache: 'no-store' } : {});
      if (!sectionRequests.current.isCurrent(request)) return;

      if (!response?.success) {
        throw new Error(
          response?.error?.message ||
            `Unable to load ${activeSection}.`,
        );
      }

      setSectionData(
        Array.isArray(response.data)
          ? response.data
          : [],
      );
    } catch (error) {
      if (!sectionRequests.current.isCurrent(request)) return;
      console.error(
        `${activeSection} load error:`,
        error,
      );

      setSectionError(
        error instanceof Error
          ? error.message
          : `Unable to load ${activeSection}.`,
      );
    } finally {
      if (sectionRequests.current.isCurrent(request)) setLoading(false);
    }
  }

  /* =======================================================
     SIGN OUT
  ======================================================= */

  function signOut() {
    localStorage.clear();
    navigate('/login');
  }

  /* =======================================================
     BUSINESS INITIALS
  ======================================================= */

  const initials = useMemo(() => {
    const name = tenant?.name || 'Business';

    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }, [tenant]);

  /* =======================================================
     MAIN RENDER
  ======================================================= */

  return (
    <div className="min-h-screen bg-paper flex">

      {/* ===================================================
          SIDEBAR
      ==================================================== */}

      <aside
        className={`fixed lg:sticky top-0 z-40 w-72 shrink-0 h-screen bg-brand-950 text-white flex flex-col overflow-y-auto transition-transform duration-300 ${
          mobileOpen
            ? 'translate-x-0'
            : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Tenant header */}

        <div className="p-6 flex items-center gap-3 border-b border-white/10">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-900/30">
            <Scissors size={20} />
          </div>

          <div className="min-w-0">
            <div className="font-bold text-lg leading-none truncate">
              {tenant?.name || 'Business'}
            </div>

            <div className="text-xs text-brand-300 mt-1">
              {tenant?.businessType
                ? formatStatus(
                    tenant.businessType,
                  )
                : 'Service Organization'}

              {' • '}

              {formatStatus(
                tenant?.status || 'active',
              )}
            </div>
          </div>

          <button
            type="button"
            className="ml-auto lg:hidden text-white/70"
            onClick={() =>
              setMobileOpen(false)
            }
          >
            <X size={22} />
          </button>
        </div>

        {/* Navigation */}

        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;

            const active =
              activeSection === item.key;

            return (
              <Link
                key={item.key}
                to={item.path}
                onClick={() =>
                  setMobileOpen(false)
                }
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                  active
                    ? 'bg-white/15 text-white'
                    : 'text-brand-100 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon size={17} />

                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Sign out */}

        <div className="p-4 border-t border-white/10">
          <button
            type="button"
            onClick={signOut}
            className="w-full py-2.5 px-3 rounded-xl bg-white/10 text-sm font-medium hover:bg-white/15 transition flex items-center justify-center gap-2"
          >
            <LogOut size={16} />

            Sign out
          </button>
        </div>
      </aside>

      {/* ===================================================
          MOBILE OVERLAY
      ==================================================== */}

      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 lg:hidden"
          onClick={() =>
            setMobileOpen(false)
          }
        />
      )}

      {/* ===================================================
          MAIN AREA
      ==================================================== */}

      <main className="flex-1 min-w-0">

        {/* Header */}

        <header className="sticky top-0 z-20 bg-paper/80 backdrop-blur-md border-b border-slate-200/60 px-6 md:px-10 h-16 flex items-center gap-4">

          <button
            type="button"
            className="lg:hidden text-brand-900"
            onClick={() =>
              setMobileOpen(true)
            }
          >
            <Menu size={24} />
          </button>

          <h1 className="min-w-0 truncate font-serif text-2xl md:text-3xl tracking-tight">
            {currentNavItem.label}
          </h1>

          <div className="ml-auto flex items-center gap-3 text-sm font-medium text-slate-500">
            <span className="hidden sm:inline max-w-48 truncate">
              {tenant?.name || 'Business'}
            </span>

            <span className="w-8 h-8 rounded-full bg-brand-900 text-white flex items-center justify-center text-xs font-bold">
              {initials}
            </span>
          </div>
        </header>

        {/* Content */}

        <div className="px-6 md:px-10 py-10 max-w-7xl mx-auto">

          {activeSection === 'dashboard' && (
            <DashboardHome
              stats={stats}
              orders={recentOrders}
              tenant={tenant}
            />
          )}

          {activeSection === 'customers' && (
            <CustomersModule
              rows={sectionData}
              loading={loading}
              error={sectionError}
              refresh={loadCurrentSection}
            />
          )}

          {activeSection === 'services' && (
            <ServicesModule
              rows={sectionData}
              loading={loading}
              error={sectionError}
              currency={
                tenant?.currency || 'PKR'
              }
              refresh={loadCurrentSection}
            />
          )}

          {activeSection === 'bookings' && (
            <BookingsModule
              rows={sectionData}
              loading={loading}
              error={sectionError}
              refresh={loadCurrentSection}
            />
          )}

          {activeSection === 'orders' && (
            location.pathname.includes('/orders/new') ? <OrderWizard /> : <OrdersModule
              rows={sectionData}
              loading={loading}
              error={sectionError}
              currency={
                tenant?.currency || 'PKR'
              }
              refresh={loadCurrentSection}
            />
          )}

          {activeSection === 'measurements' && (
            <MeasurementsModule
              rows={sectionData}
              loading={loading}
              error={sectionError}
              refresh={loadCurrentSection}
            />
          )}

          {activeSection === 'garments' && (
            <GarmentsModule
              rows={sectionData}
              loading={loading}
              error={sectionError}
              refresh={loadCurrentSection}
            />
          )}

          {activeSection === 'production' && (
            <ProductionModule
              currency={tenant?.currency || 'PKR'}
              rows={sectionData}
              loading={loading}
              error={sectionError}
              refresh={loadCurrentSection}
            />
          )}

          {activeSection === 'staff' && (
            <StaffModule
              rows={sectionData}
              loading={loading}
              error={sectionError}
              refresh={loadCurrentSection}
            />
          )}

          {activeSection === 'invoices' && (
            <InvoicesModule
              rows={sectionData}
              loading={loading}
              error={sectionError}
              currency={
                tenant?.currency || 'PKR'
              }
              refresh={loadCurrentSection}
            />
          )}

          {activeSection === 'payments' && (
            <PaymentsModule
              rows={sectionData}
              loading={loading}
              error={sectionError}
              currency={
                tenant?.currency || 'PKR'
              }
              refresh={loadCurrentSection}
            />
          )}

          {activeSection === 'ai' && (
            <AIAssistantModule />
          )}

          {activeSection === 'settings' && (
            <SettingsModule
              tenant={tenant}
            />
          )}

        </div>
      </main>
    </div>
  );
}

/* =========================================================
   COMMON MODULE WRAPPER
========================================================= */

function ModuleWrapper({
  title,
  description,
  loading,
  error,
  refresh,
  count,
  children,
}: {
  title: string;
  description: string;
  loading: boolean;
  error: string;
  refresh: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">

        <div>
          <h2 className="font-serif text-3xl">
            {title}
          </h2>

          <p className="text-slate-500 mt-1">
            {description}
          </p>
        </div>

        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold hover:bg-slate-50"
        >
          <RefreshCw size={16} />

          Refresh
        </button>
      </div>

      {loading && (
        <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center text-slate-500">
          Loading...
        </div>
      )}

      {!loading && error && (
        <div className="bg-red-50 rounded-2xl border border-red-200 p-5 text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {count !== undefined && <div className="text-sm text-slate-500">
            {count} record
            {count === 1 ? '' : 's'}
          </div>}

          {children}
        </>
      )}
    </div>
  );
}

/* =========================================================
   DASHBOARD HOME
========================================================= */

function DashboardHome({
  stats,
  orders,
  tenant,
}: any) {
  return (
    <div className="space-y-12">

      {/* KPIs */}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">

        {[
          {
            label: 'Customers',
            value: stats.customers || 0,
            sub: 'Registered',
          },

          {
            label: 'Orders',
            value: stats.orders || 0,
            sub: 'Total orders',
          },

          {
            label: 'Revenue',
            value: formatMoney(
              stats.revenue,
              tenant?.currency || 'PKR',
            ),
            sub: 'Paid invoices',
          },

          {
            label: 'Business',
            value:
              tenant?.name || 'ServiceOS',
            sub: formatStatus(
              tenant?.businessType ||
                'service',
            ),
          },
        ].map((item) => (
          <div
            key={item.label}
            className="p-6 rounded-3xl bg-white border border-slate-200/60 shadow-sm"
          >
            <div className="text-sm font-medium text-slate-400 mb-1">
              {item.label}
            </div>

            <div className="text-3xl font-extrabold tracking-tight truncate">
              {item.value}
            </div>

            <div className="text-xs text-slate-400 mt-1">
              {item.sub}
            </div>
          </div>
        ))}

      </div>

      {/* Recent orders */}

      <div className="grid lg:grid-cols-3 gap-8">

        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden">

          <div className="p-6 border-b border-slate-100 flex items-center justify-between">

            <h2 className="font-semibold text-xl">
              Recent Orders
            </h2>

            <Link
              to="/dashboard/orders"
              className="text-sm text-brand-700 font-medium hover:underline"
            >
              View all orders
            </Link>

          </div>

          <div className="p-6">

            <div className="space-y-3">

              {orders.map((order: any) => (
                <div
                  key={order.id}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-warm border border-slate-200/50"
                >
                  <div className="w-10 h-10 rounded-xl bg-brand-900 text-white flex items-center justify-center font-extrabold text-sm">
                    {order.orderNumber
                      ?.slice(-3)}
                  </div>

                  <div className="flex-1 min-w-0">

                    <div className="font-semibold text-sm truncate">
                      {order.orderNumber}
                    </div>

                    <div className="text-xs text-slate-400">
                      {order.customer?.name ||
                        'Guest'}

                      {' • '}

                      {formatStatus(
                        order.status,
                      )}
                    </div>

                  </div>

                  <div className="text-xs font-medium text-brand-700 bg-brand-50 px-2.5 py-1 rounded-lg">
                    {order.items?.[0]
                      ?.service?.name ||
                      'Order'}
                  </div>
                </div>
              ))}

              {orders.length === 0 && (
                <div className="text-slate-400 text-sm py-6 text-center">
                  No orders yet.
                </div>
              )}

            </div>
          </div>
        </div>

        {/* AI placeholder */}

        <div className="bg-brand-900 text-white rounded-3xl p-8 shadow-2xl shadow-brand-900/20">

          <h2 className="font-serif text-3xl mb-2">
            AI Assistant
          </h2>

          <p className="text-brand-200 text-sm mb-6">
            AI integration is not implemented yet.
            This panel is currently a preview.
          </p>

          <Link
            to="/dashboard/ai"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-semibold"
          >
            Open AI Assistant

            <Sparkles size={16} />
          </Link>
        </div>

      </div>
    </div>
  );
}

/* =========================================================
   CUSTOMERS
========================================================= */

function CustomersModule({
  rows,
  loading,
  error,
  refresh,
}: any) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', notes: '', status: 'active' });
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string,string>>({});

  const resetForm = () => setForm({ name: '', phone: '', email: '', address: '', notes: '', status: 'active' });

  const handleSave = async () => {
    setFormErrors({});
    setSaving(true);
    try {
      const url = editId ? `/customers/${editId}` : '/customers';
      const method = editId ? 'PATCH' : 'POST';
      const res = await api(url, { method, body: JSON.stringify({ ...form }) });
      if (!res?.success) throw new Error(res?.error?.message || 'Failed');
      setShowForm(false); setEditId(null); resetForm(); await refresh();
    } catch (e: any) { setFormErrors({ submit: e.message || 'Failed' }); }
    finally { setSaving(false); }
  };

  const handleEdit = (r: any) => { setEditId(r.id); setForm({ name: r.name || '', phone: r.phone || '', email: r.email || '', address: r.address || '', notes: r.notes || '', status: r.status || 'active' }); setShowForm(true); };
  const handleDelete = async (id: string) => { if (confirm('Delete this customer?')) { await api(`/customers/${id}`, { method: 'DELETE' }); await refresh(); } };

  return (
    <ModuleWrapper title="Customers" description="Customers registered under this tenant." loading={loading} error={error} refresh={refresh} count={rows.length}>
      <div className="mb-4"><button onClick={() => { setShowForm(true); setEditId(null); resetForm(); setFormErrors({}); }} className="px-4 py-2 bg-brand-900 text-white rounded-xl font-medium text-sm">+ Add Customer</button></div>
      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-5 shadow-sm">
          <h3 className="font-semibold mb-3">{editId ? 'Edit Customer' : 'New Customer'}</h3>
          <div className="grid md:grid-cols-2 gap-3 mb-3">
            <input placeholder="Name *" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" />
            <input placeholder="Phone" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" />
            <input placeholder="Email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" />
            <input placeholder="Address" value={form.address} onChange={e=>setForm({...form,address:e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" />
            <input placeholder="Notes" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 md:col-span-2" />
          </div>
          {formErrors.submit && <p className="text-sm text-red-600 mb-2">{formErrors.submit}</p>}
          <div className="flex gap-2"><button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-brand-900 text-white rounded-lg text-sm font-medium">{saving ? 'Saving...' : editId ? 'Update' : 'Save'}</button><button onClick={()=>{setShowForm(false); setEditId(null); resetForm();}} className="px-4 py-2 bg-slate-100 rounded-lg text-sm font-medium">Cancel</button></div>
        </div>
      )}
      <DataTable
        headers={['Name','Phone','Email','Status','Actions']}
        rows={rows.map((row: any) => [
          row.name,
          row.phone || '-',
          row.email || '-',
          formatStatus(row.status),
          <><button onClick={()=>handleEdit(row)} className="text-brand-700 text-xs mr-2">Edit</button><button onClick={()=>handleDelete(row.id)} className="text-red-600 text-xs">Delete</button></>,
        ])}
      />
    </ModuleWrapper>
  );
}

/* =========================================================
   SERVICES
========================================================= */

function ServicesModule({
  rows,
  loading,
  error,
  refresh,
  currency,
}: any) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', price: '', duration: '', requiresBooking: false, requiresDelivery: false, status: 'active' });
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string,string>>({});
  const resetForm = () => setForm({ name: '', description: '', price: '', duration: '', requiresBooking: false, requiresDelivery: false, status: 'active' });
  const handleSave = async () => {
    setFormErrors({}); setSaving(true);
    try {
      const url = editId ? `/services/${editId}` : '/services';
      const method = editId ? 'PATCH' : 'POST';
      const res = await api(url, { method, body: JSON.stringify({ ...form, price: Number(form.price), duration: Number(form.duration) || 30 }) });
      if (!res?.success) throw new Error(res?.error?.message || 'Failed');
      setShowForm(false); setEditId(null); resetForm(); await refresh();
    } catch (e: any) { setFormErrors({ submit: e.message || 'Failed' }); }
    finally { setSaving(false); }
  };
  const handleEdit = (r: any) => { setEditId(r.id); setForm({ name: r.name || '', description: r.description || '', price: String(r.price || ''), duration: String(r.duration || ''), requiresBooking: r.requiresBooking || false, requiresDelivery: r.requiresDelivery || false, status: r.status || 'active' }); setShowForm(true); };
  const handleDelete = async (id: string) => { if (confirm('Deactivate this service?')) { await api(`/services/${id}`, { method: 'DELETE' }); await refresh(); } };
  return (
    <ModuleWrapper title="Services" description="Services currently offered by your business." loading={loading} error={error} refresh={refresh} count={rows.length}>
      <div className="mb-4"><button onClick={() => { setShowForm(true); setEditId(null); resetForm(); setFormErrors({}); }} className="px-4 py-2 bg-brand-900 text-white rounded-xl font-medium text-sm">+ Add Service</button></div>
      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-5 shadow-sm">
          <h3 className="font-semibold mb-3">{editId ? 'Edit Service' : 'New Service'}</h3>
          <div className="grid md:grid-cols-3 gap-3 mb-3">
            <input placeholder="Name *" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" />
            <input placeholder="Price (PKR) *" value={form.price} onChange={e=>setForm({...form,price:e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" />
            <input placeholder="Duration (min)" value={form.duration} onChange={e=>setForm({...form,duration:e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" />
            <input placeholder="Description" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 md:col-span-3" />
          </div>
          <div className="flex gap-3 mb-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.requiresBooking} onChange={e=>setForm({...form,requiresBooking:e.target.checked})} /> Booking required</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.requiresDelivery} onChange={e=>setForm({...form,requiresDelivery:e.target.checked})} /> Delivery required</label>
          </div>
          {formErrors.submit && <p className="text-sm text-red-600 mb-2">{formErrors.submit}</p>}
          <div className="flex gap-2"><button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-brand-900 text-white rounded-lg font-medium text-sm">{saving ? 'Saving...' : editId ? 'Update Service' : 'Save Service'}</button><button onClick={()=>{setShowForm(false); setEditId(null); resetForm();}} className="px-4 py-2 bg-slate-100 rounded-lg font-medium text-sm">Cancel</button></div>
        </div>
      )}
      <DataTable
        headers={['Service','Price','Duration','Status','Actions']}
        rows={rows.map((row: any) => [
          row.name,
          formatMoney(row.price, currency),
          row.duration ? `${row.duration} min` : '-',
          formatStatus(row.status),
          <><button onClick={()=>handleEdit(row)} className="text-brand-700 text-xs mr-2">Edit</button><button onClick={()=>handleDelete(row.id)} className="text-red-600 text-xs">Deactivate</button></>,
        ])}
      />
    </ModuleWrapper>
  );
}

/* =========================================================
   BOOKINGS
========================================================= */

function BookingsModule({
  rows,
  loading,
  error,
  refresh,
}: any) {
  return (
    <ModuleWrapper
      title="Bookings"
      description="Appointments and service bookings."
      loading={loading}
      error={error}
      refresh={refresh}
      count={rows.length}
    >
      <DataTable
        headers={[
          'Customer',
          'Service',
          'Date',
          'Status',
        ]}
        rows={rows.map((row: any) => [
          row.customer?.name || '-',
          row.service?.name || '-',
          formatDate(
            row.bookingDate,
          ),
          formatStatus(row.status),
        ])}
      />
    </ModuleWrapper>
  );
}

/* =========================================================
   ORDERS
========================================================= */

function OrdersModule({
  rows,
  loading,
  error,
  refresh,
  currency,
}: any) {
  return (
    <ModuleWrapper
      title="Orders"
      description="Orders belonging to the current tenant."
      loading={loading}
      error={error}
      refresh={refresh}
      count={rows.length}
    >
      <DataTable
        headers={[
          'Order',
          'Customer',
          'Service',
          'Total',
          'Status',
        ]}
        rows={rows.map((row: any) => {
          const total =
            row.items?.reduce(
              (
                sum: number,
                item: any,
              ) =>
                sum +
                Number(item.total || 0),
              0,
            ) || 0;

          return [
            row.orderNumber,
            row.customer?.name ||
              'Guest',
            row.items?.[0]?.service
              ?.name || '-',
            formatMoney(
              total,
              currency,
            ),
            formatStatus(row.status),
          ];
        })}
      />
    </ModuleWrapper>
  );
}

/* =========================================================
   MEASUREMENTS
========================================================= */

function MeasurementsModule({
  rows,
  loading,
  error,
  refresh,
}: any) {
  const [showForm, setShowForm] = useState(false);
  const [fieldsConfig, setFieldsConfig] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [garments, setGarments] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [measures, setMeasures] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [garmentId, setGarmentId] = useState('');

  useEffect(() => {
    if (!showForm) return;
    api('/tailoring/measurement-fields').then((r: any) => { if (r?.success) setFieldsConfig(r.data || []); });
    api('/customers').then((r: any) => { if (r?.success) setCustomers(r.data || []); });
    api('/tailoring/garments').then((r: any) => { if (r?.success) setGarments(r.data || []); });
  }, [showForm]);

  useEffect(() => {
    if (showForm && fieldsConfig.length > 0) {
      const init: Record<string, string> = {};
      for (const f of fieldsConfig) init[f.name] = '';
      setMeasures(init);
      setNotes('');
      setCustomerId('');
      setGarmentId('');
      setFormErrors({});
    }
  }, [showForm, fieldsConfig]);

  const handleMeasureChange = (key: string, value: string) => {
    setMeasures(prev => ({ ...prev, [key]: value }));
    if (formErrors[key]) setFormErrors(prev => { const n={...prev}; delete n[key]; return n; });
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!customerId) errs.customerId = 'Select a customer';
    if (fieldsConfig.length === 0) errs.fields = 'No measurement fields configured';
    let hasValue = false;
    for (const f of fieldsConfig) {
      const raw = measures[f.name] || '';
      if (f.type === 'number' || f.type === 'integer') {
        if (raw === '') errs[f.name] = 'Required';
        else {
          const n = parseFloat(raw);
          if (isNaN(n)) errs[f.name] = 'Valid number required';
          else if (n < 0) errs[f.name] = 'Cannot be negative';
          else hasValue = true;
        }
      } else {
        if (raw === '') errs[f.name] = 'Required';
        else hasValue = true;
      }
    }
    if (!hasValue) errs.fields = 'Enter at least one measurement';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const fieldsObj: Record<string, any> = {};
      for (const f of fieldsConfig) {
        const raw = measures[f.name] || '';
        if (f.type === 'number' || f.type === 'integer') {
          fieldsObj[f.name] = parseFloat(raw);
        } else {
          fieldsObj[f.name] = raw;
        }
      }
      const payload: any = { customerId, fields: fieldsObj, notes: notes || undefined };
      if (garmentId) payload.garmentId = garmentId;
      const res = await api('/tailoring/measurements', { method: 'POST', body: JSON.stringify(payload) });
      if (!res?.success) throw new Error(res?.error?.message || 'Save failed');
      setShowForm(false);
      setMeasures({});
      setNotes('');
      setCustomerId('');
      setGarmentId('');
      refresh();
    } catch (e: any) {
      setFormErrors(prev => ({ ...prev, submit: e.message || 'Save failed' }));
    } finally { setSaving(false); }
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
    <ModuleWrapper
      title="Measurements"
      description="All customer measurements, including order-linked and legacy/manual records."
      loading={loading}
      error={error}
      refresh={refresh}
      count={rows.length}
    >
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600">
        For order-linked tailoring measurements, open a confirmed order in <Link to="/dashboard/production" className="text-brand-700 font-semibold underline">Production</Link>. The manual form below uses the legacy standalone measurement flow and does not advance an order.
      </div>
      <div className="flex justify-end mb-4">
        <button onClick={() => { setShowForm(!showForm); if (showForm) setFormErrors({}); }} className="flex items-center gap-2 px-4 py-2 bg-brand-900 text-white rounded-xl text-sm font-medium hover:bg-brand-800 transition">
          {showForm ? 'Cancel' : 'New Manual Measurement'}
        </button>
      </div>
      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
          <h3 className="font-serif text-xl mb-4">New Manual Measurement (Legacy)</h3>
          <div className="grid md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Customer</label>
              <select value={customerId} onChange={e => { setCustomerId(e.target.value); if (formErrors.customerId) setFormErrors(prev => { const n={...prev}; delete n.customerId; return n; }); }} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50">
                <option value="">Select customer</option>
                {customers.map((c: any) => <option key={c.id} value={c.id}>{c.name || c.email || c.id}</option>)}
              </select>
              {formErrors.customerId && <p className="text-xs text-red-600 mt-1">{formErrors.customerId}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Garment (optional)</label>
              <select value={garmentId} onChange={e => setGarmentId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50">
                <option value="">Select garment</option>
                {garments.map((g: any) => <option key={g.id} value={g.id}>{g.name || g.id}</option>)}
              </select>
            </div>
          </div>
          <div className="grid md:grid-cols-4 gap-3 mb-3">
            {fieldsConfig.map((f: any) => (
              <div key={f.name}>
                <label className="block text-xs font-medium text-slate-600 mb-1">{f.label || f.name}</label>
                <input
                  type={f.type === 'number' || f.type === 'integer' ? 'number' : 'text'}
                  step={f.type === 'number' ? '0.1' : undefined}
                  min={f.type === 'number' || f.type === 'integer' ? '0' : undefined}
                  value={measures[f.name] || ''}
                  onChange={e => handleMeasureChange(f.name, e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm"
                  placeholder=""
                />
                {formErrors[f.name] && <p className="text-xs text-red-600 mt-0.5">{formErrors[f.name]}</p>}
              </div>
            ))}
          </div>
          <div className="mb-3">
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Notes</label>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm" placeholder="Additional notes..." />
          </div>
          {formErrors.submit && <p className="text-sm text-red-600 mb-2">{formErrors.submit}</p>}
          {formErrors.fields && <p className="text-sm text-red-600 mb-2">{formErrors.fields}</p>}
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-brand-900 text-white rounded-lg font-medium text-sm hover:bg-brand-800 disabled:opacity-50">{saving ? 'Saving...' : 'Save Measurement'}</button>
            <button onClick={() => { setShowForm(false); setFormErrors({}); }} className="px-4 py-2 bg-slate-100 rounded-lg font-medium text-sm">Cancel</button>
          </div>
        </div>
      )}
      <DataTable
        headers={['Customer', 'Garment', 'Measurements', 'Notes', 'Created']}
        rows={rows.map((row: any) => [
          row.customer?.name || '-',
          row.garment?.name || '-',
          row.fields ? formatFields(row.fields) : '-',
          row.notes || '-',
          formatDate(row.createdAt) || '-',
        ])}
      />
    </ModuleWrapper>
  );
}

function GarmentsModule({
  rows,
  loading,
  error,
  refresh,
}: any) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ customerId: '', name: '', category: '', description: '', status: 'pending' });
  const [customers, setCustomers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string,string>>({});
  useEffect(() => { api('/customers').then(r => { if (r?.success) setCustomers(r.data || []); }); }, []);
  const resetForm = () => setForm({ customerId: '', name: '', category: '', description: '', status: 'pending' });
  const handleSave = async () => {
    setFormErrors({}); setSaving(true);
    try {
      const url = editId ? `/tailoring/garments/${editId}` : '/tailoring/garments';
      const method = editId ? 'PATCH' : 'POST';
      const res = await api(url, { method, body: JSON.stringify({ ...form, customerId: form.customerId || undefined }) });
      if (!res?.success) throw new Error(res?.error?.message || (res?.error?.code === 'REFERENCED' ? res.error.message : 'Failed'));
      setShowForm(false); setEditId(null); resetForm(); await refresh();
    } catch (e: any) { setFormErrors({ submit: e.message || 'Failed' }); }
    finally { setSaving(false); }
  };
  const handleEdit = (r: any) => { setEditId(r.id); setForm({ customerId: r.customerId || '', name: r.name || '', category: r.category || '', description: r.description || '', status: r.status || 'pending' }); setShowForm(true); };
  const handleDelete = async (id: string) => { if (confirm('Delete this garment?')) { try { await api(`/tailoring/garments/${id}`, { method: 'DELETE' }); await refresh(); } catch (e: any) { if (e.response?.status === 409 || e.message?.includes('REFERENCED')) alert('Garment is referenced and cannot be deleted.'); else alert('Delete failed.'); } } };
  return (
    <ModuleWrapper title="Garments" description="Tailoring garments and their current status." loading={loading} error={error} refresh={refresh} count={rows.length}>
      <div className="mb-4"><button onClick={() => { setShowForm(true); setEditId(null); resetForm(); setFormErrors({}); }} className="px-4 py-2 bg-brand-900 text-white rounded-xl font-medium text-sm">+ Add Garment</button></div>
      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-5 shadow-sm">
          <h3 className="font-semibold mb-3">{editId ? 'Edit Garment' : 'New Garment'}</h3>
          <div className="grid md:grid-cols-3 gap-3 mb-3">
            <select value={form.customerId} onChange={e=>setForm({...form,customerId:e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50"><option value="">Select customer</option>{customers.map((c:any)=><option key={c.id} value={c.id}>{c.name||c.phone||c.id}</option>)}</select>
            <input placeholder="Name *" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" />
            <label className="text-sm font-medium">Category<select aria-label="Garment category" value={form.category} onChange={e=>setForm({...form,category:e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50">
              <option value="">Select category</option>
              {form.category && !['Kurta', 'Shalwar Kameez', '2-Piece Suit', 'Other'].includes(form.category) && <option value={form.category}>{form.category} (existing)</option>}
              {['Kurta', 'Shalwar Kameez', '2-Piece Suit', 'Other'].map(category => <option key={category} value={category}>{category}</option>)}
            </select></label>
            <input placeholder="Description" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 md:col-span-3" />
          </div>
          <div className="mb-3"><label className="text-sm">Status</label><select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50"><option>pending</option><option>measured</option><option>cutting</option><option>stitching</option><option>finishing</option><option>quality_check</option><option>ready</option><option>delivered</option></select></div>
          {formErrors.submit && <p className="text-sm text-red-600 mb-2">{formErrors.submit}</p>}
          <div className="flex gap-2"><button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-brand-900 text-white rounded-lg font-medium text-sm">{saving ? 'Saving...' : editId ? 'Update Garment' : 'Save Garment'}</button><button onClick={()=>{setShowForm(false); setEditId(null); resetForm();}} className="px-4 py-2 bg-slate-100 rounded-lg font-medium text-sm">Cancel</button></div>
        </div>
      )}
      <DataTable
        headers={['Garment','Customer','Category','Status','Actions']}
        rows={rows.map((row: any) => [
          row.name,
          row.customer?.name || '-',
          row.category || '-',
          formatStatus(row.status),
          <><button onClick={()=>handleEdit(row)} className="text-brand-700 text-xs mr-2">Edit</button><button onClick={()=>handleDelete(row.id)} className="text-red-600 text-xs">Delete</button></>,
        ])}
      />
    </ModuleWrapper>
  );
}

/* =========================================================
   PRODUCTION
========================================================= */

type ProductionOrder = {
  id: string;
  measurementId?: string | null;
  status: string;
  staffId?: string | null;
  deliveryDate?: string | null;
  priority?: string;
  notes?: string | null;
  customer?: { name: string };
  garment?: { name: string } | null;
  staff?: { user?: { name: string }; status?: string } | null;
  order?: {
    orderNumber: string;
    expectedDate?: string | null;
    priority?: string;
    notes?: string | null;
    items?: { quantity?: number; unitPrice?: string | number; total: string | number; service?: { name: string } }[];
  };
};

type ProductionTemplate = {
  source: 'garment' | 'service' | 'fallback' | 'snapshot';
  template: { id: string; name: string; defaultUnit: string };
  fields: { id: string; name: string; label: string; unit?: string | null; section?: string | null; required: boolean; sortOrder: number }[];
};

type ProductionAction = {
  kind: 'confirm' | 'staff' | 'measurement' | 'viewMeasurement' | 'editMeasurement' | 'status' | 'qc';
  title: string;
  status?: string;
  returnTo?: 'stitching' | 'finishing';
};

type NewTailoringItem = { key: number; serviceId: string; quantity: string; unitPrice: string };

function NewTailoringOrderForm({ currency, onClose, onCreated, onBusyChange }: {
  currency: string;
  onClose: () => void;
  onCreated: (id: string) => Promise<void>;
  onBusyChange: (busy: boolean) => void;
}) {
  const [customers, setCustomers] = useState<IntakeCustomer[]>([]);
  const [services, setServices] = useState<{ id: string; name: string; price: string | number; status?: string | null }[]>([]);
  const [garments, setGarments] = useState<IntakeGarment[]>([]);
  const [intakeSaving, setIntakeSaving] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [garmentId, setGarmentId] = useState('');
  const [items, setItems] = useState<NewTailoringItem[]>([{ key: 0, serviceId: '', quantity: '1', unitPrice: '' }]);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [priority, setPriority] = useState('normal');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const nextKey = useRef(1);
  const saveLock = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (submitError) errorRef.current?.focus(); }, [submitError]);

  useEffect(() => { panelRef.current?.focus(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setLoadError('');
      try {
        const response = await api('/services', { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!response?.success || !Array.isArray(response.data)) throw new Error(response?.error?.message || 'Unable to load services.');
        const active = (row: { status?: string | null }) => !row.status || row.status === 'active';
        setServices(response.data.filter(active));
      } catch (e) {
        if (!controller.signal.aborted) setLoadError(e instanceof Error ? e.message : 'Unable to load order form data.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [loadAttempt]);

  const customerGarments = garments.filter(garment => garment.customerId === customerId);
  function updateItem(key: number, change: Partial<NewTailoringItem>) {
    setItems(previous => previous.map(item => item.key === key ? { ...item, ...change } : item));
  }
  const lineTotal = intakeLineTotal;
  const totals = items.map(lineTotal);
  const total = totals.every(value => value !== null) ? totals.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saveLock.current || intakeSaving || loading || loadError) return;
    setSubmitError('');
    if (!customers.some(customer => customer.id === customerId)) { setSubmitError('Select a customer.'); return; }
    if (!customerGarments.some(garment => garment.id === garmentId)) { setSubmitError('Select a garment belonging to this customer.'); return; }
    if (!items.length) { setSubmitError('Add at least one service item.'); return; }
    for (const [index, item] of items.entries()) {
      if (!services.some(service => service.id === item.serviceId) || lineTotal(item) === null) {
        setSubmitError(`Item ${index + 1}: select a service, a positive whole-number quantity and a non-negative unit price.`); return;
      }
    }
    if (total === null || !Number.isFinite(total)) { setSubmitError('Enter valid item amounts.'); return; }
    saveLock.current = true;
    setSaving(true);
    onBusyChange(true);
    try {
      const response = await api('/tailoring/orders', { method: 'POST', body: JSON.stringify(intakeOrderPayload({ customerId, garmentId, priority, deliveryDate, notes, items })) });
      const saved = createdRecord<{ id: string }>(response);
      // Stay in this drawer; resolve the new order from the authoritative list refresh.
      await onCreated(saved.id);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Unable to create tailoring order.');
    } finally {
      saveLock.current = false;
      setSaving(false);
      onBusyChange(false);
    }
  }

  const inputClass = 'min-w-0 w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm disabled:opacity-50';
  const buttonClass = 'px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed';
  return (
    <div ref={panelRef} tabIndex={-1} role="region" aria-labelledby="new-tailoring-title" aria-busy={loading || saving} className="min-w-0 outline-none">
      <p id="new-tailoring-title" className="mb-6 text-sm text-slate-500">Find or register your customer, add their garment, then create an order. No need to leave this drawer.</p>
      <IntakeCustomerGarment busy={saving} onBusyChange={value => { setIntakeSaving(value); onBusyChange(value); }}
        onCustomer={customer => { setCustomers(customer ? [customer] : []); setCustomerId(customer?.id || ''); setGarmentId(''); setGarments([]); setSubmitError(''); }}
        onGarment={garment => { setGarments(garment ? [garment] : []); setGarmentId(garment?.id || ''); setSubmitError(''); }} />
      {!garmentId && <div className="bg-white py-3 border-t border-slate-100"><p className="text-xs text-slate-500 mb-2">Select a customer and garment to continue to services, delivery and review.</p><button type="button" disabled={intakeSaving || saving} onClick={onClose} className={buttonClass}>Cancel intake</button></div>}
      {loading && <p role="status" className="text-sm text-slate-500">Loading active services…</p>}
      {loadError && <div role="alert" className="p-3 rounded-lg bg-red-50 text-red-700 text-sm"><p>{loadError}</p><button type="button" disabled={loading} onClick={() => setLoadAttempt(attempt => attempt + 1)} className={`${buttonClass} mt-2`}>Retry Loading</button></div>}
      {garmentId && !loading && !loadError && <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={saving || intakeSaving} className="space-y-6">
          <section aria-labelledby="new-order-services-heading" className="space-y-3 border-t border-slate-100 pt-5">
            <h3 id="new-order-services-heading" className="font-semibold text-sm"><span className="text-brand-500 mr-2">03</span> Services</h3>
            {!services.length && <p className="text-sm text-slate-500">No active services available. Add a service in the Services section.</p>}
            {items.map((item, index) => <div key={item.key} className="grid grid-cols-2 gap-3 border-b border-slate-100 py-4 items-end">
              <div className="col-span-2 min-w-0"><label htmlFor={`new-service-${item.key}`} className="block text-sm font-medium mb-1">Service {index + 1} *</label>
                <select id={`new-service-${item.key}`} required value={item.serviceId} onChange={e => {
                  const service = services.find(candidate => candidate.id === e.target.value);
                  updateItem(item.key, { serviceId: e.target.value, quantity: '1', unitPrice: service ? String(service.price) : '' });
                }} className={inputClass}><option value="">Select service</option>{services.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}</select>
              </div>
              <div><label htmlFor={`new-quantity-${item.key}`} className="block text-sm font-medium mb-1">Quantity {index + 1} *</label><input id={`new-quantity-${item.key}`} type="number" required min="1" step="1" value={item.quantity} onChange={e => updateItem(item.key, { quantity: e.target.value })} className={inputClass} /></div>
              <div><label htmlFor={`new-price-${item.key}`} className="block text-sm font-medium mb-1">Unit Price {index + 1} ({currency}) *</label><input id={`new-price-${item.key}`} type="number" required min="0" step="any" value={item.unitPrice} onChange={e => updateItem(item.key, { unitPrice: e.target.value })} className={inputClass} /></div>
              <div className="text-sm py-2"><span className="block text-slate-500">Line Total</span><output aria-label={`Line total ${index + 1}`} className="font-semibold">{lineTotal(item) === null ? '—' : formatMoney(lineTotal(item), currency)}</output></div>
              <button type="button" aria-label={`Remove item ${index + 1}`} disabled={items.length === 1} onClick={() => setItems(previous => previous.filter(candidate => candidate.key !== item.key))} className={buttonClass}>Remove</button>
            </div>)}
            <div className="flex flex-wrap justify-between items-center gap-3">
              <button type="button" onClick={() => setItems(previous => [...previous, { key: nextKey.current++, serviceId: '', quantity: '1', unitPrice: '' }])} className={buttonClass}>+ Add Another Service</button>
              <p className="text-sm font-semibold">Total: <output aria-label="Order total">{total !== null && Number.isFinite(total) ? formatMoney(total, currency) : '—'}</output></p>
            </div>
            <p className="text-xs text-slate-500">Totals are recalculated by the server when the order is created.</p>
          </section>
          <section aria-labelledby="new-order-delivery-heading" className="border-t border-slate-100 pt-5"><h3 id="new-order-delivery-heading" className="font-semibold text-sm mb-4"><span className="text-brand-500 mr-2">04</span> Delivery &amp; Priority</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label htmlFor="new-tailoring-date" className="block text-sm font-medium mb-1">Delivery Date</label><input id="new-tailoring-date" type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className={inputClass} /></div>
            <div><label htmlFor="new-tailoring-priority" className="block text-sm font-medium mb-1">Priority</label><select id="new-tailoring-priority" value={priority} onChange={e => setPriority(e.target.value)} className={inputClass}>{['low', 'normal', 'high', 'urgent'].map(value => <option key={value} value={value}>{formatStatus(value)}</option>)}</select></div>
          </div>
          <div className="mt-4"><label htmlFor="new-tailoring-notes" className="block text-sm font-medium mb-1">Notes (optional)</label><textarea id="new-tailoring-notes" rows={3} value={notes} onChange={e => setNotes(e.target.value)} className={inputClass} /></div>
          </section>
          <section aria-labelledby="new-order-review-heading" className="border-t border-slate-100 pt-5">
            <h3 id="new-order-review-heading" className="font-semibold text-sm mb-3"><span className="text-brand-500 mr-2">05</span> Review</h3>
            <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate-500">Customer</dt><dd>{customers.find(customer => customer.id === customerId)?.name || 'Not selected'}<p className="text-xs text-slate-500 mt-1">{customers.find(customer => customer.id === customerId)?.phone}</p></dd></div><div><dt className="text-xs text-slate-500">Garment</dt><dd>{customerGarments.find(garment => garment.id === garmentId)?.name || 'Not selected'}<p className="text-xs text-slate-500 mt-1">Category: {customerGarments.find(garment => garment.id === garmentId)?.category || 'Not specified'}</p></dd></div><div><dt className="text-xs text-slate-500">Delivery</dt><dd>{deliveryDate ? formatDate(deliveryDate) : 'Set when confirming'}</dd></div><div><dt className="text-xs text-slate-500">Priority</dt><dd>{formatStatus(priority)}</dd></div></dl>
            <ul className="mt-4 divide-y divide-slate-100">{items.map(item => <li key={item.key} className="flex justify-between gap-4 py-2 text-sm"><span>{services.find(service => service.id === item.serviceId)?.name || 'Select a service'} × {item.quantity || '—'}</span><span className="font-medium">{lineTotal(item) === null ? '—' : formatMoney(lineTotal(item), currency)}</span></li>)}</ul>
            <div className="flex justify-between border-t border-slate-200 pt-3 text-sm font-semibold"><span>Order total</span><span>{total !== null && Number.isFinite(total) ? formatMoney(total, currency) : '—'}</span></div>
          </section>
        </fieldset>
        {submitError && <p ref={errorRef} tabIndex={-1} role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{submitError}</p>}
        <div className="sticky bottom-0 z-10 -mx-5 sm:-mx-6 px-5 sm:px-6 py-4 bg-white border-t border-slate-200 flex flex-wrap gap-2">
          <button type="submit" disabled={saving || intakeSaving || !customerId || !garmentId || !services.length} className="px-4 py-2 bg-brand-900 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">{saving ? 'Creating…' : 'Create Order'}</button>
          <button type="button" disabled={saving || intakeSaving} onClick={onClose} className={buttonClass}>Cancel</button>
        </div>
      </form>}
    </div>
  );
}

function productionTotal(row: ProductionOrder, currency: string) {
  return row.order?.items ? formatMoney(row.order.items.reduce((sum, item) => sum + Number(item.total || 0), 0), currency) : '—';
}

function ProductionStatus({ status }: { status: string }) {
  const color = status === 'cancelled' ? 'bg-red-50 text-red-700' : ['ready', 'delivered'].includes(status) ? 'bg-emerald-50 text-emerald-700' : status === 'quality_check' ? 'bg-amber-50 text-amber-800' : status === 'received' ? 'bg-slate-100 text-slate-600' : 'bg-brand-50 text-brand-700';
  return <span className={`inline-block rounded-lg px-2 py-1 text-xs font-semibold leading-snug ${color}`}>{formatStatus(status)}</span>;
}

function ProductionStepper({ status }: { status: string }) {
  const current = productionStages.findIndex(stage => stage === status);
  if (status === 'cancelled') return <p className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">Cancelled · terminal state. This order is view-only.</p>;
  return <ol aria-label="Order progress" className="grid grid-cols-3 gap-x-3 gap-y-4">{productionStages.map((stage, index) => <li key={stage} aria-current={index === current ? 'step' : undefined} className={`flex items-start gap-2 text-xs ${index === current ? 'text-brand-900 font-bold' : index < current ? 'text-emerald-700' : 'text-slate-500'}`}>
    <span aria-hidden="true" className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-xs ${index === current ? 'bg-brand-900 text-white' : index < current ? 'bg-emerald-50' : 'bg-slate-100 text-slate-600'}`}>{index < current ? <CheckCircle size={13} /> : index + 1}</span><span className="pt-0.5">{formatStatus(stage)}<span className="sr-only">{index === current ? ', current' : index < current ? ', completed' : ', upcoming'}</span></span>
  </li>)}</ol>;
}

function ProductionModule({ rows, loading, error, refresh, currency }: {
  rows: ProductionOrder[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  currency: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createSaving, setCreateSaving] = useState(false);
  const [filters, setFilters] = useState<ProductionFilters>({ ...emptyProductionFilters });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [panel, setPanel] = useState<{ row: ProductionOrder; action: ProductionAction } | null>(null);
  const [template, setTemplate] = useState<ProductionTemplate | null>(null);
  const [measurementEditable, setMeasurementEditable] = useState(false);
  const [staff, setStaff] = useState<{ id: string; user?: { name: string }; jobTitle: string; status: string }[]>([]);
  const [staffId, setStaffId] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [priority, setPriority] = useState('normal');
  const [notes, setNotes] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const requestLock = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const busy = preparing || saving;

  useEffect(() => { if (panel) panelRef.current?.focus(); }, [panel]);

  function closePanel() {
    if (requestLock.current) return;
    setPanel(null);
    setTemplate(null);
    setValues({});
    setActionError('');
    setNotes('');
  }

  async function openPanel(row: ProductionOrder, action: ProductionAction) {
    if (requestLock.current || showNewOrder) return;
    requestLock.current = true;
    setPanel({ row, action });
    setNotice('');
    setActionError('');
    setTemplate(null);
    setMeasurementEditable(false);
    setValues({});
    setStaff([]);
    setStaffId(row.staffId || '');
    setDeliveryDate((row.deliveryDate || row.order?.expectedDate || '').slice(0, 10));
    setPriority(row.priority || row.order?.priority || 'normal');
    setNotes(action.kind === 'confirm' ? row.notes ?? row.order?.notes ?? '' : '');
    setPreparing(true);
    try {
      if (action.kind === 'measurement') {
        const response = await api(`/tailoring/orders/${row.id}/measurement-template`);
        if (!response?.success) throw new Error(response?.error?.message || 'Unable to load measurement template.');
        setTemplate(response.data);
      } else if (action.kind === 'viewMeasurement' || action.kind === 'editMeasurement') {
        const response = await api(`/tailoring/orders/${row.id}/measurement`, { cache: 'no-store' });
        if (!response?.success) throw new Error(response?.error?.message || 'Unable to load measurement.');
        const data = response.data;
        const definitions: ProductionTemplate['fields'] = data.fields || [];
        const stored: Record<string, unknown> = data.measurement.fields || {};
        // Preserve numeric custom keys already stored in the snapshot.
        const custom = Object.keys(stored).filter(name => !definitions.some(field => field.name === name)).map((name, index) => ({ id: `custom-${name}`, name, label: name, required: false, sortOrder: Math.max(0, ...definitions.map(field => field.sortOrder)) + index + 1, section: 'Custom measurements' }));
        setTemplate({ source: 'snapshot', template: { id: data.template?.id || '', name: data.template?.name || 'Legacy measurement', defaultUnit: data.measurement.unit }, fields: [...definitions, ...custom] });
        setValues(Object.fromEntries(Object.entries(stored).map(([name, value]) => [name, value == null ? '' : String(value)])));
        setMeasurementEditable(data.editable);
        if (action.kind === 'editMeasurement' && !data.editable) setActionError('This measurement is locked. Editing is only available in Measurement before Cutting.');
      } else if (action.kind === 'staff') {
        const response = await api('/staff');
        if (!response?.success) throw new Error(response?.error?.message || 'Unable to load staff.');
        setStaff((response.data || []).filter((person: { status: string }) => person.status === 'active'));
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Unable to prepare this action.');
    } finally {
      requestLock.current = false;
      setPreparing(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!panel || requestLock.current || panel.action.kind === 'viewMeasurement') return;
    const { row, action } = panel;
    setActionError('');
    let endpoint: string = action.kind;
    let method = 'PATCH';
    let body: Record<string, unknown>;
    if (action.kind === 'measurement' || action.kind === 'editMeasurement') {
      if (!template) return;
      if (action.kind === 'editMeasurement' && !measurementEditable) { setActionError('This measurement is locked.'); return; }
      const fields: Record<string, number> = {};
      for (const field of template.fields) {
        const raw = (values[field.name] ?? '').trim();
        if (!raw) {
          if (field.required) { setActionError(`${field.label || field.name} is required.`); return; }
          continue; // Empty optional inputs must not become zero.
        }
        const value = Number(raw);
        if (!Number.isFinite(value)) { setActionError(`${field.label || field.name} must be a finite number.`); return; }
        fields[field.name] = value;
      }
      endpoint = action.kind === 'editMeasurement' ? 'measurement' : 'measurements';
      method = action.kind === 'editMeasurement' ? 'PATCH' : 'POST';
      body = { fields };
    } else if (action.kind === 'confirm') {
      if (!deliveryDate && !row.deliveryDate && !row.order?.expectedDate) {
        setActionError('Delivery date is required.'); return;
      }
      body = { deliveryDate: deliveryDate || undefined, priority, notes };
    } else if (action.kind === 'staff') {
      if (staffId && !staff.some(person => person.id === staffId)) {
        setActionError('Choose active staff or Unassigned.'); return;
      }
      body = { staffId: staffId || null };
    } else if (action.kind === 'qc') {
      method = 'POST';
      body = { result: action.returnTo ? 'rework' : 'pass', returnTo: action.returnTo, notes: notes || undefined };
    } else {
      body = { status: action.status, notes: notes || undefined };
    }
    requestLock.current = true;
    setSaving(true);
    try {
      const response = await api(`/tailoring/orders/${row.id}/${endpoint}`, { method, body: JSON.stringify(body) });
      if (!response?.success) throw new Error(response?.error?.message || 'Unable to save this action.');
      setPanel(null);
      setTemplate(null);
      setValues({});
      setNotes('');
      setNotice(action.kind === 'measurement' ? 'Measurement saved. Refreshing production from the server.' : action.kind === 'editMeasurement' ? 'Measurement updated.' : 'Order updated.');
      // Measurements are fetched afresh when that dashboard section is opened.
      // The measurement endpoint already advances status; do not PATCH it again.
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Unable to save this action.');
    } finally {
      requestLock.current = false;
      setSaving(false);
    }
  }

  function actions(row: ProductionOrder): ProductionAction[] {
    switch (row.status) {
      case 'received': return [{ kind: 'confirm', title: 'Confirm Order' }];
      case 'confirmed': return [{ kind: 'measurement', title: 'Take Measurement' }];
      case 'measurement': return row.staffId ? [{ kind: 'status', title: 'Start Cutting', status: 'cutting' }] : [];
      case 'cutting': return [{ kind: 'status', title: 'Move to Stitching', status: 'stitching' }];
      case 'stitching': return [{ kind: 'status', title: 'Move to Finishing', status: 'finishing' }];
      case 'finishing': return [{ kind: 'status', title: 'Send to Quality Check', status: 'quality_check' }];
      case 'quality_check': return [
        { kind: 'qc', title: 'Pass QC' },
        { kind: 'qc', title: 'Send Back to Stitching', returnTo: 'stitching' },
        { kind: 'qc', title: 'Send Back to Finishing', returnTo: 'finishing' },
      ];
      case 'ready': return [{ kind: 'status', title: 'Mark Delivered', status: 'delivered' }];
      default: return [];
    }
  }

  // Keep backend ordering, including when sections are interleaved in sortOrder.
  const groups: { section: string; fields: ProductionTemplate['fields'] }[] = [];
  for (const field of [...(template?.fields || [])].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const section = field.section || 'Measurements';
    if (groups[groups.length - 1]?.section !== section) groups.push({ section, fields: [] });
    groups[groups.length - 1].fields.push(field);
  }
  const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm';
  const buttonClass = 'px-3 py-2 rounded-lg border border-slate-200 text-brand-700 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed';

  const selected = rows.find(row => row.id === selectedId);
  const filteredRows = filterProductionOrders(rows, filters);
  const pageRows = paginateProductionOrders(filteredRows, page, pageSize);
  const staffOptions = Array.from(new Map(rows.filter(row => row.staffId).map(row => [row.staffId!, { id: row.staffId!, name: row.staff?.user?.name || 'Assigned staff' }])).values());
  const hasFilters = Object.keys(emptyProductionFilters).some(key => filters[key as keyof ProductionFilters] !== emptyProductionFilters[key as keyof ProductionFilters]);
  const filterClass = 'min-w-0 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-200';
  function changeFilter(key: keyof ProductionFilters, value: string) { setFilters(previous => ({ ...previous, [key]: value })); setPage(1); }
  function clearFilters() { setFilters({ ...emptyProductionFilters }); setPage(1); }
  function viewOrder(id: string) { setSelectedId(id); setNotice(''); setActionError(''); setPanel(null); }
  function closeDrawer() {
    if (requestLock.current || createSaving) return;
    closePanel(); setSelectedId(null); setShowNewOrder(false);
  }

  return (
    <>
      <ModuleWrapper title="Production" description="A clear view of your work. Open an order to manage its next step." loading={loading} error={error} refresh={() => { if (!requestLock.current && !showNewOrder) void refresh(); }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm text-slate-500">{filteredRows.length} matching orders · {rows.filter(row => row.status === 'ready').length} ready for delivery</p>
          <button data-workflow-return-focus type="button" disabled={busy || !!selectedId || showNewOrder} onClick={() => { setNotice(''); setActionError(''); setShowNewOrder(true); }} className="inline-flex justify-center items-center gap-2 px-4 py-2.5 bg-brand-900 text-white rounded-xl text-sm font-semibold hover:bg-brand-800 disabled:opacity-50"><Plus size={16} /> New Customer Order</button>
        </div>
        {!selectedId && !showNewOrder && notice && <p role="status" className="p-3 rounded-xl bg-emerald-50 text-emerald-800 text-sm">{notice}</p>}
        <section aria-label="Production filters" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <label className="col-span-2 sm:col-span-1 min-w-0 text-xs font-semibold text-slate-500">Search orders<div className="relative mt-1"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input type="search" value={filters.search} onChange={e => changeFilter('search', e.target.value)} placeholder="Order, customer or garment" className={`${filterClass} pl-9`} /></div></label>
            <label className="min-w-0 text-xs font-semibold text-slate-500">Status<select value={filters.status} onChange={e => changeFilter('status', e.target.value)} className={`${filterClass} mt-1`}><option value="all">All statuses</option>{[...productionStages, 'cancelled'].map(status => <option key={status} value={status}>{formatStatus(status)}</option>)}</select></label>
            <label className="min-w-0 text-xs font-semibold text-slate-500">Assigned staff<select value={filters.staff} onChange={e => changeFilter('staff', e.target.value)} className={`${filterClass} mt-1`}><option value="all">All staff</option><option value="unassigned">Unassigned</option>{staffOptions.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
            <label className="min-w-0 text-xs font-semibold text-slate-500">Priority<select value={filters.priority} onChange={e => changeFilter('priority', e.target.value)} className={`${filterClass} mt-1`}><option value="all">All priorities</option>{['low', 'normal', 'high', 'urgent'].map(priority => <option key={priority} value={priority}>{formatStatus(priority)}</option>)}</select></label>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Quick status filters">
            {['all', ...productionStages.filter(stage => stage !== 'delivered')].map(status => <button key={status} type="button" aria-pressed={filters.status === status} onClick={() => changeFilter('status', status)} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${filters.status === status ? 'bg-brand-900 text-white border-brand-900' : 'bg-white text-slate-600 border-slate-200 hover:border-brand-400'}`}>
              {status === 'all' ? 'All' : status === 'quality_check' ? 'QC' : formatStatus(status)} <span className={filters.status === status ? 'ml-1 text-brand-200' : 'ml-1 text-slate-400'}>{status === 'all' ? rows.length : rows.filter(row => row.status === status).length}</span>
            </button>)}
            {hasFilters && <button type="button" onClick={clearFilters} className="text-xs font-medium text-brand-700 underline px-2">Clear filters</button>}
          </div>
        </section>
        {filteredRows.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><Package className="mx-auto mb-3 text-slate-400" size={28} /><h3 className="font-semibold">{rows.length ? 'No matching orders' : 'Your production queue is empty'}</h3><p className="text-sm text-slate-500 mt-1">{rows.length ? 'Try a different search or clear your filters.' : 'Create your first tailoring order to begin.'}</p>{hasFilters && <button onClick={clearFilters} className="mt-4 text-sm font-semibold text-brand-700 underline">Reset filters</button>}</div> : <>
          <div className="hidden md:block rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full table-fixed text-sm" aria-label="Tailoring production orders">
              <thead><tr className="border-b border-slate-200 text-xs text-slate-500 bg-slate-50">
                <th className="w-28 px-3 py-3 text-left font-semibold rounded-tl-2xl">Order</th><th className="px-3 py-3 text-left font-semibold">Customer / Garment</th><th className="w-24 px-3 py-3 text-left font-semibold">Due Date</th><th className="w-28 px-3 py-3 text-left font-semibold">Status</th><th className="hidden xl:table-cell w-28 px-3 py-3 text-left font-semibold">Assigned Staff</th><th className="hidden xl:table-cell w-24 px-3 py-3 text-right font-semibold">Total</th><th className="w-20 px-3 py-3 text-right font-semibold rounded-tr-2xl">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">{pageRows.rows.map(row => <tr key={row.id} className="hover:bg-slate-50/70">
                <td className="px-3 py-4"><p title={row.order?.orderNumber} className="truncate font-semibold text-brand-800">{row.order?.orderNumber || '—'}</p></td>
                <td className="px-3 py-4"><p className="truncate font-medium" title={row.customer?.name}>{row.customer?.name || '—'}</p><p className="truncate text-xs text-slate-500 mt-1" title={row.garment?.name}>{row.garment?.name || 'No garment'}</p></td>
                <td className="px-3 py-4 text-xs text-slate-600 break-words">{formatDate(row.deliveryDate || row.order?.expectedDate)}</td>
                <td className="px-3 py-4"><ProductionStatus status={row.status} /></td>
                <td className="hidden xl:table-cell px-3 py-4"><p className="truncate text-xs text-slate-600" title={row.staff?.user?.name}>{row.staff?.user?.name || (row.staffId ? 'Assigned staff' : 'Unassigned')}</p></td>
                <td className="hidden xl:table-cell px-3 py-4 text-right text-xs font-medium break-words">{productionTotal(row, currency)}</td>
                <td className="px-3 py-4 text-right"><button type="button" onClick={() => viewOrder(row.id)} aria-label={`View order ${row.order?.orderNumber || row.id}`} className="rounded-lg px-3 py-2 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-brand-500">View</button></td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="grid gap-3 md:hidden" aria-label="Production order cards">{pageRows.rows.map(row => <article key={row.id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex justify-between items-start gap-3"><h3 className="min-w-0 truncate font-semibold text-brand-800" title={row.order?.orderNumber}>{row.order?.orderNumber || 'Order'}</h3><ProductionStatus status={row.status} /></div>
            <p className="mt-3 font-medium break-words">{row.customer?.name || '—'}</p><p className="text-sm text-slate-500 break-words">{row.garment?.name || 'No garment'}</p>
            <dl className="grid grid-cols-2 gap-3 text-xs my-4"><div><dt className="text-slate-500">Due date</dt><dd className="mt-1 font-medium">{formatDate(row.deliveryDate || row.order?.expectedDate)}</dd></div><div><dt className="text-slate-500">Total</dt><dd className="mt-1 font-medium break-words">{productionTotal(row, currency)}</dd></div><div className="col-span-2"><dt className="text-slate-500">Assigned staff</dt><dd className="mt-1 break-words">{row.staff?.user?.name || (row.staffId ? 'Assigned staff' : 'Unassigned')}</dd></div></dl>
            <button type="button" onClick={() => viewOrder(row.id)} aria-label={`View order ${row.order?.orderNumber || row.id}`} className="w-full rounded-lg py-2.5 bg-brand-50 text-brand-800 text-sm font-semibold hover:bg-brand-100">View Order</button>
          </article>)}</div>
        </>}
        <nav aria-label="Production pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
          <p aria-live="polite">Showing {pageRows.start}–{pageRows.end} of {filteredRows.length}</p>
          <div className="flex flex-wrap items-center gap-3"><label className="text-xs">Per page <select aria-label="Orders per page" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} className="ml-1 rounded-lg border border-slate-200 bg-white px-2 py-2">{[10, 20, 50].map(size => <option key={size} value={size}>{size}</option>)}</select></label><button type="button" aria-label="Previous page" disabled={pageRows.page === 1} onClick={() => setPage(pageRows.page - 1)} className={buttonClass}><ChevronLeft size={16} /></button><span className="text-xs">{pageRows.page} / {pageRows.totalPages}</span><button type="button" aria-label="Next page" disabled={pageRows.page === pageRows.totalPages} onClick={() => setPage(pageRows.page + 1)} className={buttonClass}><ChevronRight size={16} /></button></div>
        </nav>
      </ModuleWrapper>
      <WorkflowDrawer open={!!selectedId || showNewOrder} title={showNewOrder ? 'New Customer Order' : panel?.action.title || selected?.order?.orderNumber || 'Order details'} subtitle={showNewOrder ? 'Create once. Follow every step in Production.' : selected ? `${selected.customer?.name || 'Customer'} · ${selected.garment?.name || 'No garment'}` : undefined} busy={busy || createSaving} onClose={closeDrawer}>
        {showNewOrder ? <NewTailoringOrderForm currency={currency} onBusyChange={setCreateSaving} onClose={closeDrawer} onCreated={async id => { setSelectedId(id); setShowNewOrder(false); setNotice('Order created. Review the recommended next step below.'); await refresh(); setCreateSaving(false); }} /> : <>
          {notice && <p role="status" className="mb-5 p-3 rounded-lg bg-emerald-50 text-emerald-800 text-sm">{notice}</p>}
          {loading ? <p role="status" className="py-12 text-center text-slate-500">Refreshing order from the server…</p> : error ? <div role="alert" className="space-y-3 p-4 rounded-xl bg-red-50 text-red-700"><p>{error}</p><button disabled={busy} type="button" onClick={() => void refresh()} className={buttonClass}>Retry refresh</button></div> : !selected ? <p className="py-8 text-slate-500">This order is no longer available. Close the drawer and refresh your list.</p> : panel ? (<div ref={panelRef} tabIndex={-1} role="region" aria-label={panel.action.title} aria-busy={busy} className="min-w-0 outline-none">
          <button type="button" onClick={closePanel} disabled={busy} className="inline-flex items-center gap-1 mb-5 text-sm font-medium text-brand-700 disabled:opacity-50"><ChevronLeft size={16} /> Back to order</button>
          {['viewMeasurement', 'editMeasurement', 'measurement'].includes(panel.action.kind) && <p className="text-sm text-slate-500 mb-4">{panel.action.kind === 'viewMeasurement' ? (panel.row.status === 'measurement' ? 'View mode · values are read-only.' : 'Locked snapshot · editing is only available during Measurement. View only.') : panel.action.kind === 'editMeasurement' ? 'Edit mode · update this order’s existing snapshot.' : 'New measurement · use the values from your fitting.'}</p>}
          {preparing && <p role="status" className="text-sm text-slate-500">Loading {panel.action.kind === 'staff' ? 'staff' : 'measurement data'}…</p>}
          {actionError && <p role="alert" className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{actionError}</p>}
          {!preparing && (
            <form onSubmit={submit} className="space-y-4">
              <fieldset disabled={busy || panel.action.kind === 'viewMeasurement' || (panel.action.kind === 'editMeasurement' && !measurementEditable)} className="space-y-4">
                {panel.action.kind === 'confirm' && <div className="grid sm:grid-cols-2 gap-4">
                  <label className="text-sm font-medium">Delivery Date<input type="date" value={deliveryDate} required={!panel.row.deliveryDate && !panel.row.order?.expectedDate} onChange={e => setDeliveryDate(e.target.value)} className={`${inputClass} mt-1`} /></label>
                  <label className="text-sm font-medium">Priority<select value={priority} onChange={e => setPriority(e.target.value)} className={`${inputClass} mt-1`}>{['low', 'normal', 'high', 'urgent'].map(value => <option key={value} value={value}>{formatStatus(value)}</option>)}</select></label>
                </div>}
                {panel.action.kind === 'staff' && <div>
                  <label className="text-sm font-medium">Assigned Staff<select value={staffId} onChange={e => setStaffId(e.target.value)} className={`${inputClass} mt-1`}>
                    <option value="">Unassigned</option>
                    {panel.row.staffId && !staff.some(person => person.id === panel.row.staffId) && <option value={panel.row.staffId} disabled>Current assignment unavailable — choose active staff or unassign</option>}
                    {staff.map(person => <option key={person.id} value={person.id}>{person.user?.name || person.jobTitle} · {person.jobTitle}</option>)}
                  </select></label>
                  {!staff.length && <p className="text-sm text-slate-500 mt-2">No active staff available. Manage staff in the Staff section.</p>}
                </div>}
                {['measurement', 'viewMeasurement', 'editMeasurement'].includes(panel.action.kind) && template && <>
                  <div className="bg-slate-50 rounded-xl p-4"><h4 className="font-semibold">{template.template.name}</h4><p className="text-sm text-slate-500">Unit: {template.template.defaultUnit} · Template source: {formatStatus(template.source)}</p></div>
                  {groups.map((group, index) => <fieldset key={`${group.section}-${index}`} className="border border-slate-200 rounded-xl p-4">
                    <legend className="px-2 font-semibold text-sm">{group.section}</legend>
                    <div className="grid sm:grid-cols-2 gap-4">{group.fields.map(field => <label key={field.id} className="text-sm font-medium">
                      {field.label || field.name} ({field.unit || template.template.defaultUnit}){field.required ? ' *' : ' (optional)'}
                      <input type={panel.action.kind === 'viewMeasurement' ? 'text' : 'number'} step="any" required={field.required} value={values[field.name] ?? ''} onChange={e => setValues(previous => ({ ...previous, [field.name]: e.target.value }))} className={`${inputClass} mt-1`} />
                    </label>)}</div>
                  </fieldset>)}
                  {!template.fields.length && <p className="text-sm text-slate-500">This template has no measurement fields configured.</p>}
                </>}
                {panel.action.kind === 'status' && <p className="text-sm text-slate-600">{panel.action.status === 'cancelled' ? 'Cancel this order? Cancellation is terminal and cannot be undone.' : `Move this order from ${formatStatus(panel.row.status)} to ${formatStatus(panel.action.status)}?`}</p>}
                {panel.action.kind === 'qc' && <p className="text-sm text-slate-600">{panel.action.returnTo ? `Return this order to ${formatStatus(panel.action.returnTo)} for rework.` : 'Pass quality check and mark this order Ready. Delivery is recorded separately.'}</p>}
                {['confirm', 'status', 'qc'].includes(panel.action.kind) && <label className="block text-sm font-medium">Notes (optional)<textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} className={`${inputClass} mt-1`} /></label>}
              </fieldset>
              <div className="sticky bottom-0 z-10 -mx-5 sm:-mx-6 -mb-6 px-5 sm:px-6 py-4 bg-white border-t border-slate-200 flex flex-wrap gap-2">
                {panel.action.kind !== 'viewMeasurement' && <button type="submit" disabled={busy || (['measurement', 'editMeasurement'].includes(panel.action.kind) && !template) || (panel.action.kind === 'editMeasurement' && !measurementEditable)} className="px-4 py-2 bg-brand-900 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">{saving ? 'Saving…' : ['measurement', 'editMeasurement'].includes(panel.action.kind) ? 'Save Measurement' : panel.action.kind === 'staff' ? 'Save Assignment' : panel.action.title}</button>}
                {actionError && ['staff', 'measurement', 'viewMeasurement', 'editMeasurement'].includes(panel.action.kind) && <button type="button" disabled={busy} onClick={() => openPanel(panel.row, panel.action)} className={buttonClass}>Reload {panel.action.kind === 'staff' ? 'Staff' : 'Measurement'}</button>}
                <button type="button" disabled={busy} onClick={closePanel} className={buttonClass}>{panel.action.kind === 'viewMeasurement' ? 'Back to order' : 'Cancel'}</button>
              </div>
            </form>
          )}
        </div>) : <div className="space-y-7">
            {!panel && actionError && <p role="alert" className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{actionError}</p>}
            <section aria-labelledby="order-overview"><h3 id="order-overview" className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-4">Overview</h3><dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-5 text-sm">
              <div><dt className="text-xs text-slate-500 mb-1">Status</dt><dd><ProductionStatus status={selected.status} /></dd></div><div><dt className="text-xs text-slate-500 mb-1">Due date</dt><dd>{formatDate(selected.deliveryDate || selected.order?.expectedDate)}</dd></div><div><dt className="text-xs text-slate-500 mb-1">Priority</dt><dd>{formatStatus(selected.priority || selected.order?.priority || 'normal')}</dd></div><div><dt className="text-xs text-slate-500 mb-1">Assigned staff</dt><dd>{selected.staff?.user?.name || (selected.staffId ? 'Assigned staff' : 'Unassigned')}</dd></div><div><dt className="text-xs text-slate-500 mb-1">Total</dt><dd className="font-semibold">{productionTotal(selected, currency)}</dd></div>
            </dl></section>
            <section aria-labelledby="order-workflow" className="border-t border-slate-100 pt-5"><h3 id="order-workflow" className="font-semibold text-sm mb-4">Workflow</h3><ProductionStepper status={selected.status} />
              <div className="mt-5 rounded-xl bg-brand-50 p-4"><p className="text-xs font-semibold text-brand-700 mb-3">{['delivered', 'cancelled'].includes(selected.status) ? 'Order complete · view only' : 'Recommended next step'}</p><div className="flex flex-wrap gap-2">
                {selected.status === 'measurement' && <button type="button" disabled={busy} onClick={() => openPanel(selected, { kind: 'staff', title: selected.staffId ? 'Change / Unassign Staff' : 'Assign Staff' })} className={buttonClass}>{selected.staffId ? 'Change Staff' : 'Assign Staff'}</button>}
                {actions(selected).map((action, index) => <button key={action.title} type="button" disabled={busy} onClick={() => openPanel(selected, action)} className={index === 0 ? 'px-4 py-2.5 rounded-lg bg-brand-900 text-white text-sm font-semibold hover:bg-brand-800 disabled:opacity-50' : buttonClass}>{action.title}</button>)}
              </div>
              </div>
              {selected.status === 'measurement' && !selected.staffId && <p className="mt-2 text-xs text-slate-500">Assign active staff before starting Cutting.</p>}
            </section>
            <section aria-labelledby="order-measurement" className="border-t border-slate-100 pt-5"><h3 id="order-measurement" className="font-semibold text-sm mb-2">Measurement</h3>
              {selected.measurementId ? <><p className="text-xs text-slate-500 break-all mb-3">Snapshot ID: {selected.measurementId}</p>{selected.status !== 'measurement' && <p className="flex items-center gap-2 text-xs text-slate-500 mb-3"><Lock size={14} /> Locked snapshot · view only</p>}<div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => openPanel(selected, { kind: 'viewMeasurement', title: 'View Measurement' })} className={buttonClass}>View Measurement</button>{selected.status === 'measurement' && <button type="button" disabled={busy} onClick={() => openPanel(selected, { kind: 'editMeasurement', title: 'Edit Measurement' })} className={buttonClass}>Edit Measurement</button>}</div></> : <p className="text-sm text-slate-500">No measurement linked to this order.{['received', 'confirmed'].includes(selected.status) && ' Take measurements after confirming the order.'}</p>}
            </section>
            <section aria-labelledby="order-services" className="border-t border-slate-100 pt-5"><h3 id="order-services" className="font-semibold text-sm mb-3">Services</h3><ul className="divide-y divide-slate-100">{selected.order?.items?.map((item, index) => <li key={index} className="flex justify-between gap-4 py-3 text-sm"><div className="min-w-0"><p className="font-medium break-words">{item.service?.name || 'Service'}</p><p className="text-xs text-slate-500 mt-1">{item.quantity ?? '—'} × {item.unitPrice != null ? formatMoney(item.unitPrice, currency) : '—'}</p></div><p className="shrink-0 font-medium">{formatMoney(item.total, currency)}</p></li>)}</ul>{!selected.order?.items?.length && <p className="text-sm text-slate-500">No service items available.</p>}</section>
            <section aria-labelledby="order-notes" className="border-t border-slate-100 pt-5"><h3 id="order-notes" className="font-semibold text-sm mb-2">Notes</h3><p className="whitespace-pre-wrap text-sm text-slate-600">{selected.notes || selected.order?.notes || 'No notes added.'}</p></section>
            {productionStages.some(stage => stage === selected.status) && !['delivered', 'cancelled'].includes(selected.status) && <section aria-labelledby="order-danger" className="border-t border-red-100 pt-5"><h3 id="order-danger" className="text-sm font-semibold text-red-700">Cancel order</h3><p className="text-xs text-slate-500 my-2">Cancellation is permanent. This order cannot return to production.</p><button type="button" disabled={busy} onClick={() => openPanel(selected, { kind: 'status', title: 'Cancel Order', status: 'cancelled' })} className="px-3 py-2 rounded-lg border border-red-200 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">Cancel Order</button></section>}
          </div>}
        </>}
      </WorkflowDrawer>
    </>
  );
}

/* =========================================================
   STAFF
========================================================= */

function StaffOnboardingForm({ onClose, onCreated }: { onClose: () => void; onCreated: (user: { id: string; name: string; email: string }) => Promise<void> }) {
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', roleId: '', jobTitle: '', department: '', skills: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    api('/staff/onboarding-roles', { signal: controller.signal }).then(response => {
      if (!controller.signal.aborted) setRoles(response.data || []);
    }).catch(e => { if (!controller.signal.aborted) setError(e.message || 'Unable to load roles.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current || loading) return;
    lock.current = true; setSaving(true); setError('');
    try {
      const response = await api('/staff/onboard', { method: 'POST', body: JSON.stringify(form) });
      if (!response?.success) throw new Error(response?.error?.message || 'Unable to create staff account.');
      setForm(previous => ({ ...previous, password: '' }));
      await onCreated(response.data.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create staff account.');
      setForm(previous => ({ ...previous, password: '' }));
    } finally { lock.current = false; setSaving(false); }
  }
  const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 mt-1';
  return <form onSubmit={submit} aria-label="Create new staff user" className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
    <h3 className="font-serif text-xl">Create New User &amp; Staff</h3>
    <p className="text-sm text-slate-500">Administrator access (staff.create and settings.manage) is required. Creates a new login, tenant membership and staff profile together. Existing accounts are never overwritten.</p>
    <p className="text-sm text-slate-500">There is no email invitation service configured. Set a strong initial password and share it privately with this person over a trusted channel. It is not saved in browser storage or returned by the API.</p>
    {loading && <p role="status">Loading assignable roles…</p>}
    {error && <p role="alert" className="text-sm text-red-700 bg-red-50 p-3 rounded-lg">{error}</p>}
    <fieldset disabled={loading || saving || !roles.length} className="grid md:grid-cols-2 gap-3">
      <label className="text-sm">Name *<input required minLength={2} maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputClass} /></label>
      <label className="text-sm">Email *<input required type="email" autoComplete="off" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputClass} /></label>
      <label className="text-sm">Initial Password *<input required type="password" autoComplete="new-password" minLength={12} maxLength={72} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className={inputClass} /><span className="text-xs text-slate-500">At least 12 characters, at most 72 UTF-8 bytes.</span></label>
      <label className="text-sm">Role *<select aria-label="New user role" required value={form.roleId} onChange={e => setForm({ ...form, roleId: e.target.value })} className={inputClass}><option value="">Select role</option>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
      <label className="text-sm">Job Title *<input required maxLength={100} value={form.jobTitle} onChange={e => setForm({ ...form, jobTitle: e.target.value })} className={inputClass} /></label>
      <label className="text-sm">Department<input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} className={inputClass} /></label>
      <label className="text-sm md:col-span-2">Skills<input value={form.skills} onChange={e => setForm({ ...form, skills: e.target.value })} className={inputClass} /></label>
    </fieldset>
    {!loading && !roles.length && <p className="text-sm text-slate-500">No assignable roles available. Ask your tenant administrator for help.</p>}
    <div className="flex gap-2">
      <button type="submit" disabled={loading || saving || !roles.length} className="px-4 py-2 bg-brand-900 text-white rounded-lg text-sm disabled:opacity-50">{saving ? 'Creating…' : 'Create User & Staff'}</button>
      {!roles.length && <button type="button" disabled={loading || saving} onClick={() => setAttempt(value => value + 1)} className="px-4 py-2 rounded-lg border text-sm">Retry Roles</button>}
      <button type="button" disabled={saving} onClick={onClose} className="px-4 py-2 rounded-lg border text-sm">Cancel</button>
    </div>
  </form>;
}

function StaffModule({
  rows,
  loading,
  error,
  refresh,
}: any) {
  const [showForm, setShowForm] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [notice, setNotice] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ userId: '', jobTitle: '', department: '', skills: '', status: 'active' });
  const [users, setUsers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string,string>>({});
  useEffect(() => { api('/tenant-users').then(r => { if (r?.success) setUsers(r.data || []); }).catch(e => setFormErrors({ submit: e.message || 'Unable to load users.' })); }, []);
  const resetForm = () => setForm({ userId: '', jobTitle: '', department: '', skills: '', status: 'active' });
  const handleSave = async () => {
    setFormErrors({}); setSaving(true);
    try {
      if (editId) {
        await api(`/staff/${editId}`, { method: 'PATCH', body: JSON.stringify({ jobTitle: form.jobTitle, department: form.department, skills: form.skills || undefined, status: form.status }) });
      } else {
        await api('/staff', { method: 'POST', body: JSON.stringify({ ...form, skills: form.skills || undefined }) });
      }
      setShowForm(false); setEditId(null); resetForm(); await refresh();
    } catch (e: any) { setFormErrors({ submit: e.message || 'Failed' }); }
    finally { setSaving(false); }
  };
  const handleEdit = (r: any) => { setEditId(r.id); setForm({ userId: r.user?.id || r.userId || '', jobTitle: r.jobTitle || '', department: r.department || '', skills: r.skills || '', status: r.status || 'active' }); setShowForm(true); };
  const handleDelete = async (id: string) => { if (confirm('Deactivate this staff?')) { await api(`/staff/${id}`, { method: 'DELETE' }); await refresh(); } };
  return (
    <ModuleWrapper title="Staff" description="Business staff and assigned roles." loading={loading} error={error} refresh={() => { if (!showOnboarding) void refresh(); }} count={rows.length}>
      <div className="mb-4 flex gap-2 flex-wrap"><button disabled={showOnboarding || saving} onClick={() => { setShowForm(true); setEditId(null); resetForm(); setFormErrors({}); }} className="px-4 py-2 bg-brand-900 text-white rounded-xl font-medium text-sm">Add Existing User as Staff</button><button disabled={saving || showOnboarding} onClick={() => { setShowForm(false); setShowOnboarding(true); setNotice(''); }} className="px-4 py-2 border border-brand-900 text-brand-900 rounded-xl text-sm font-medium disabled:opacity-50">Create New User &amp; Staff</button></div>
      {notice && <p role="status" className="p-3 bg-emerald-50 text-emerald-800 rounded-xl text-sm">{notice}</p>}
      {showOnboarding && <StaffOnboardingForm onClose={() => setShowOnboarding(false)} onCreated={async user => {
        setUsers(previous => [...previous, user]); setShowOnboarding(false); setNotice('User, tenant membership and staff profile created.'); await refresh();
      }} />}
      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-5 shadow-sm">
          <h3 className="font-semibold mb-3">{editId ? 'Edit Staff' : 'Add Existing User as Staff'}</h3>
          {!editId && <p className="text-sm text-slate-500 mb-3">Choose an existing tenant user below, or use Create New User to create their login and staff profile together.</p>}
          <div className="grid md:grid-cols-3 gap-3 mb-3">
            <select disabled={!!editId} value={form.userId} onChange={e=>setForm({...form,userId:e.target.value})} className={`w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 ${editId?'opacity-60':''}`}><option value="">Select user</option>{users.map((u:any)=><option key={u.id} value={u.id}>{u.name||u.email||u.id}</option>)}</select>
            <input placeholder="Job Title *" value={form.jobTitle} onChange={e=>setForm({...form,jobTitle:e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" />
            <input placeholder="Department" value={form.department} onChange={e=>setForm({...form,department:e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" />
            <input placeholder="Skills" value={form.skills} onChange={e=>setForm({...form,skills:e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 md:col-span-3" />
          </div>
          {formErrors.submit && <p className="text-sm text-red-600 mb-2">{formErrors.submit}</p>}
          <div className="flex gap-2"><button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-brand-900 text-white rounded-lg font-medium text-sm">{saving?'Saving...':editId?'Update Staff':'Save Staff'}</button><button onClick={()=>{setShowForm(false); setEditId(null); resetForm();}} className="px-4 py-2 bg-slate-100 rounded-lg font-medium text-sm">Cancel</button></div>
        </div>
      )}
      <DataTable
        headers={['Name','Job Title','Department','Status','Actions']}
        rows={rows.map((row: any) => [
          row.user?.name || '-',
          row.jobTitle || '-',
          row.department || '-',
          formatStatus(row.status),
          <><button disabled={showOnboarding} onClick={()=>handleEdit(row)} className="text-brand-700 text-xs mr-2">Edit</button><button disabled={showOnboarding} onClick={()=>handleDelete(row.id)} className="text-red-600 text-xs">Deactivate</button></>,
        ])}
      />
    </ModuleWrapper>
  );
}

/* =========================================================
   INVOICES
========================================================= */

function InvoicesModule({
  rows,
  loading,
  error,
  refresh,
  currency,
}: any) {
  return (
    <ModuleWrapper
      title="Invoices"
      description="Invoices generated for customers."
      loading={loading}
      error={error}
      refresh={refresh}
      count={rows.length}
    >
      <DataTable
        headers={[
          'Invoice',
          'Customer',
          'Total',
          'Balance',
          'Status',
        ]}
        rows={rows.map((row: any) => [
          row.invoiceNumber,
          row.customer?.name || '-',
          formatMoney(
            row.total,
            currency,
          ),
          formatMoney(
            row.balance,
            currency,
          ),
          formatStatus(row.status),
        ])}
      />
    </ModuleWrapper>
  );
}

/* =========================================================
   PAYMENTS
========================================================= */

function PaymentsModule({
  rows,
  loading,
  error,
  refresh,
  currency,
}: any) {
  return (
    <ModuleWrapper
      title="Payments"
      description="Payments recorded for invoices."
      loading={loading}
      error={error}
      refresh={refresh}
      count={rows.length}
    >
      <DataTable
        headers={[
          'Customer',
          'Invoice',
          'Amount',
          'Method',
          'Paid',
        ]}
        rows={rows.map((row: any) => [
          row.customer?.name || '-',

          row.invoice
            ?.invoiceNumber || '-',

          formatMoney(
            row.amount,
            currency,
          ),

          formatStatus(row.method),

          formatDate(row.paidAt),
        ])}
      />
    </ModuleWrapper>
  );
}

/* =========================================================
   AI ASSISTANT
========================================================= */

function AIAssistantModule() {
  return (
    <div className="max-w-3xl">

      <div className="bg-brand-900 text-white rounded-3xl p-8 md:p-10 shadow-xl">

        <Sparkles
          size={36}
          className="mb-5"
        />

        <h2 className="font-serif text-4xl mb-3">
          AI Assistant
        </h2>

        <p className="text-brand-200 leading-relaxed">
          The AI Assistant is currently a
          placeholder in ServiceOS. A real AI
          provider and tenant-aware AI service
          still need to be implemented.
        </p>

        <div className="mt-8 p-5 rounded-2xl bg-white/10">

          <div className="font-semibold mb-2">
            Phase status
          </div>

          <div className="text-sm text-brand-200">
            UI preview available. AI backend not
            yet connected.
          </div>

        </div>
      </div>
    </div>
  );
}

/* =========================================================
   SETTINGS
========================================================= */

function SettingsModule({
  tenant,
}: {
  tenant: Tenant | null;
}) {
  return (
    <div className="space-y-6">

      <div>
        <h2 className="font-serif text-3xl">
          Settings
        </h2>

        <p className="text-slate-500 mt-1">
          Current tenant information.
        </p>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 p-7 max-w-3xl">

        <div className="grid sm:grid-cols-2 gap-6">

          <Info
            label="Business Name"
            value={
              tenant?.name || '-'
            }
          />

          <Info
            label="Business Type"
            value={formatStatus(
              tenant?.businessType,
            )}
          />

          <Info
            label="Status"
            value={formatStatus(
              tenant?.status,
            )}
          />

          <Info
            label="Currency"
            value={
              tenant?.currency ||
              'PKR'
            }
          />

          <Info
            label="Phone"
            value={
              tenant?.phone || '-'
            }
          />

          <Info
            label="Email"
            value={
              tenant?.email || '-'
            }
          />

          <Info
            label="Address"
            value={
              tenant?.address || '-'
            }
          />

          <Info
            label="City"
            value={
              tenant?.city || '-'
            }
          />

        </div>
      </div>
    </div>
  );
}

/* =========================================================
   SIMPLE INFO
========================================================= */

function Info({
  label,
  value,
}: {
  label: string;
  value: any;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-1">
        {label}
      </div>

      <div className="font-medium text-slate-800">
        {value}
      </div>
    </div>
  );
}

/* =========================================================
   DATA TABLE
========================================================= */

function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: any[][];
}) {
  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center text-slate-400">
        No records found.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">

      <div className="overflow-x-auto">

        <table className="w-full text-sm">

          <thead className="bg-slate-50 border-b border-slate-200">

            <tr>
              {headers.map((header) => (
                <th
                  key={header}
                  className="text-left px-5 py-4 font-semibold text-slate-600 whitespace-nowrap"
                >
                  {header}
                </th>
              ))}
            </tr>

          </thead>

          <tbody className="divide-y divide-slate-100">

            {rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="hover:bg-slate-50/70 transition"
              >
                {row.map(
                  (cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="px-5 py-4 text-slate-700 whitespace-nowrap"
                    >
                      {cell ??
                        '-'}
                    </td>
                  ),
                )}
              </tr>
            ))}

          </tbody>

        </table>

      </div>
    </div>
  );
}