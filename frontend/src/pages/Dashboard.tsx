import { useEffect, useMemo, useState } from 'react';
import OrderWizard from './OrderWizard';

import {
  Link,
  useLocation,
  useNavigate,
} from 'react-router-dom';

import {
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
    loadCurrentSection();
  }, [activeSection]);

  async function loadCurrentSection() {
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

      const response = await api(endpoint);

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
      setLoading(false);
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
        className={`fixed lg:sticky top-0 z-40 w-72 h-screen bg-brand-950 text-white flex flex-col overflow-y-auto transition-transform duration-300 ${
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

          <h1 className="font-serif text-2xl md:text-3xl tracking-tight">
            {currentNavItem.label}
          </h1>

          <div className="ml-auto flex items-center gap-3 text-sm font-medium text-slate-500">
            <span className="hidden sm:inline">
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
  count: number;
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
          <div className="text-sm text-slate-500">
            {count} record
            {count === 1 ? '' : 's'}
          </div>

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
  return (
    <ModuleWrapper
      title="Customers"
      description="Customers registered under this tenant."
      loading={loading}
      error={error}
      refresh={refresh}
      count={rows.length}
    >
      <DataTable
        headers={[
          'Name',
          'Phone',
          'Email',
          'Status',
        ]}
        rows={rows.map((row: any) => [
          row.name,
          row.phone || '-',
          row.email || '-',
          formatStatus(row.status),
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
  return (
    <ModuleWrapper
      title="Services"
      description="Services currently offered by your business."
      loading={loading}
      error={error}
      refresh={refresh}
      count={rows.length}
    >
      <DataTable
        headers={[
          'Service',
          'Price',
          'Duration',
          'Status',
        ]}
        rows={rows.map((row: any) => [
          row.name,
          formatMoney(
            row.price,
            currency,
          ),
          row.duration
            ? `${row.duration} min`
            : '-',
          formatStatus(row.status),
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
      description="Tailoring measurements per customer."
      loading={loading}
      error={error}
      refresh={refresh}
      count={rows.length}
    >
      <div className="flex justify-end mb-4">
        <button onClick={() => { setShowForm(!showForm); if (showForm) setFormErrors({}); }} className="flex items-center gap-2 px-4 py-2 bg-brand-900 text-white rounded-xl text-sm font-medium hover:bg-brand-800 transition">
          {showForm ? 'Cancel' : 'New Measurement'}
        </button>
      </div>
      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
          <h3 className="font-serif text-xl mb-4">New Measurement</h3>
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
  return (
    <ModuleWrapper
      title="Garments"
      description="Tailoring garments and their current status."
      loading={loading}
      error={error}
      refresh={refresh}
      count={rows.length}
    >
      <DataTable
        headers={[
          'Garment',
          'Customer',
          'Category',
          'Status',
        ]}
        rows={rows.map((row: any) => [
          row.name,
          row.customer?.name || '-',
          row.category || '-',
          formatStatus(row.status),
        ])}
      />
    </ModuleWrapper>
  );
}

/* =========================================================
   PRODUCTION
========================================================= */

function ProductionModule({
  rows,
  loading,
  error,
  refresh,
}: any) {
  return (
    <ModuleWrapper
      title="Production"
      description="Tailoring production workflow."
      loading={loading}
      error={error}
      refresh={refresh}
      count={rows.length}
    >
      <DataTable
        headers={[
          'Order',
          'Customer',
          'Garment',
          'Staff',
          'Status',
        ]}
        rows={rows.map((row: any) => [
          row.order?.orderNumber ||
            '-',

          row.customer?.name ||
            '-',

          row.garment?.name || '-',

          row.staff?.user?.name ||
            '-',

          formatStatus(row.status),
        ])}
      />
    </ModuleWrapper>
  );
}

/* =========================================================
   STAFF
========================================================= */

function StaffModule({
  rows,
  loading,
  error,
  refresh,
}: any) {
  return (
    <ModuleWrapper
      title="Staff"
      description="Business staff and assigned roles."
      loading={loading}
      error={error}
      refresh={refresh}
      count={rows.length}
    >
      <DataTable
        headers={[
          'Name',
          'Job Title',
          'Department',
          'Status',
        ]}
        rows={rows.map((row: any) => [
          row.user?.name || '-',
          row.jobTitle || '-',
          row.department || '-',
          formatStatus(row.status),
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