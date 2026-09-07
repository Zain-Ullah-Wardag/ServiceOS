import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Clock,
  MapPin,
  Phone,
  Mail,
  ArrowRight,
  CheckCircle,
} from 'lucide-react';

import { api } from '../lib/api';

type Service = {
  id: string;
  name: string;
  description?: string | null;
  price: number | string;
};

type Business = {
  id: string;
  name: string;
  slug?: string;
  businessType: string;
  logoUrl?: string | null;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  currency?: string | null;
  timezone?: string | null;
  status?: string;
  services?: Service[];
};

type OrderForm = {
  name: string;
  phone: string;
  email: string;
  notes: string;
  serviceId: string;
  expectedDate: string;
};

export default function BusinessPage() {
  const { slug } = useParams<{ slug: string }>();

  const [business, setBusiness] = useState<Business | null>(null);
  const [services, setServices] = useState<Service[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [submitted, setSubmitted] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');

  const [orderForm, setOrderForm] = useState<OrderForm>({
    name: '',
    phone: '',
    email: '',
    notes: '',
    serviceId: '',
    expectedDate: '',
  });

  useEffect(() => {
    if (!slug) {
      setLoadError('Business address is invalid.');
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadBusiness() {
      try {
        setLoading(true);
        setLoadError('');

        const response = await api(
          `/api/v1/public/business/${encodeURIComponent(slug!)}`,
        );

        if (cancelled) return;

        if (!response?.success) {
          throw new Error(
            response?.error?.message || 'Unable to load business.',
          );
        }

        const data = response.data as Business;

        setBusiness(data);
        setServices(Array.isArray(data.services) ? data.services : []);
      } catch (error) {
        if (cancelled) return;

        console.error('Business API error:', error);

        setLoadError(
          error instanceof Error
            ? error.message
            : 'Unable to load this business.',
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadBusiness();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  function updateOrderForm<K extends keyof OrderForm>(
    field: K,
    value: OrderForm[K],
  ) {
    setOrderForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!slug) {
      setSubmitError('Business address is invalid.');
      return;
    }

    if (!orderForm.name.trim()) {
      setSubmitError('Please enter your name.');
      return;
    }

    if (!orderForm.phone.trim()) {
      setSubmitError('Please enter your phone number.');
      return;
    }

    if (!orderForm.serviceId) {
      setSubmitError('Please select a service.');
      return;
    }

    try {
      setSubmitting(true);
      setSubmitError('');

      /*
       * Backend expects:
       *
       * customerName
       * customerPhone
       * customerEmail
       * serviceId
       * notes
       * expectedDate
       *
       * Do not send the frontend form field names directly.
       */
      const payload = {
        customerName: orderForm.name.trim(),
        customerPhone: orderForm.phone.trim(),

        customerEmail: orderForm.email.trim()
          ? orderForm.email.trim()
          : undefined,

        serviceId: orderForm.serviceId,

        notes: orderForm.notes.trim()
          ? orderForm.notes.trim()
          : undefined,

        expectedDate: orderForm.expectedDate || undefined,
      };

      const response = await api(
        `/api/v1/public/business/${encodeURIComponent(slug)}/orders`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );

      if (!response?.success) {
        throw new Error(
          response?.error?.message || 'Unable to place your order.',
        );
      }

      setOrderNumber(response.data?.orderNumber || '');
      setTrackingUrl(response.data?.trackingUrl || '');
      setSubmitted(true);
    } catch (error) {
      console.error('Guest order error:', error);

      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Unable to place your order. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-6">
        <div className="text-center">
          <div className="w-10 h-10 rounded-full border-4 border-slate-200 border-t-brand-700 animate-spin mx-auto mb-4" />

          <p className="text-slate-600 font-medium">
            Loading business...
          </p>
        </div>
      </div>
    );
  }

  if (loadError || !business) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 text-center shadow-lg">
          <h1 className="font-serif text-3xl mb-3">
            Business unavailable
          </h1>

          <p className="text-slate-600 mb-6">
            {loadError || 'This business could not be found.'}
          </p>

          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-brand-900 text-white font-semibold"
          >
            Back to ServiceOS
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      {/* =====================================================
          HEADER
      ====================================================== */}

      <header className="relative h-72 md:h-96 overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1600&q=80"
          alt={`${business.name} cover`}
          className="w-full h-full object-cover"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-brand-950/80 via-brand-950/40 to-brand-950/30" />

        <div className="absolute bottom-0 left-0 right-0 p-8 md:p-14">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-3 mb-3">
              <span className="px-2.5 py-0.5 rounded-md bg-white/15 text-white text-xs font-bold uppercase tracking-wide backdrop-blur-sm">
                {business.businessType}
              </span>
            </div>

            <h1 className="font-serif text-5xl md:text-7xl text-white tracking-tight mb-3">
              {business.name}
            </h1>

            <p className="text-brand-100 text-lg max-w-2xl">
              {business.description ||
                'Professional service organization powered by ServiceOS.'}
            </p>
          </div>
        </div>
      </header>

      {/* =====================================================
          CONTENT
      ====================================================== */}

      <div className="max-w-5xl mx-auto px-6 md:px-14 -mt-10 relative z-10 pb-20">
        <div className="grid lg:grid-cols-3 gap-8">

          {/* =================================================
              MAIN
          ================================================== */}

          <div className="lg:col-span-2 space-y-10">

            {/* Services */}

            <section className="bg-white rounded-3xl border border-slate-200/60 shadow-lg shadow-slate-200/30 p-8 md:p-10">
              <div className="flex items-center justify-between gap-4 mb-6">
                <h2 className="font-serif text-3xl">
                  Services
                </h2>

                <span className="text-sm text-slate-500">
                  {services.length}{' '}
                  {services.length === 1 ? 'service' : 'services'}
                </span>
              </div>

              {services.length === 0 ? (
                <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-slate-500">
                  No services are currently available.
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  {services.map((service) => {
                    const selected =
                      orderForm.serviceId === service.id;

                    return (
                      <button
                        type="button"
                        key={service.id}
                        onClick={() =>
                          updateOrderForm('serviceId', service.id)
                        }
                        className={`text-left p-5 rounded-2xl border transition ${
                          selected
                            ? 'border-brand-400 bg-brand-50 ring-2 ring-brand-100'
                            : 'border-slate-200/60 hover:border-brand-200 bg-warm'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-lg mb-1">
                              {service.name}
                            </div>

                            <div className="text-sm text-slate-500 mb-3">
                              {service.description ||
                                'Service details unavailable.'}
                            </div>
                          </div>

                          {selected && (
                            <CheckCircle
                              size={20}
                              className="text-brand-700 shrink-0"
                            />
                          )}
                        </div>

                        <div className="text-brand-700 font-bold">
                          {business.currency || 'PKR'}{' '}
                          {Number(service.price).toLocaleString()}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Place order */}

            <section className="bg-white rounded-3xl border border-slate-200/60 shadow-lg shadow-slate-200/30 p-8 md:p-10">
              <h2 className="font-serif text-3xl mb-6">
                Place Order
              </h2>

              {submitted ? (
                <div className="p-7 rounded-2xl bg-brand-50 border border-brand-100 text-brand-900">
                  <div className="flex items-start gap-4">
                    <CheckCircle
                      className="text-brand-700 shrink-0 mt-1"
                      size={28}
                    />

                    <div>
                      <div className="font-semibold text-xl mb-2">
                        Order received!
                      </div>

                      {orderNumber && (
                        <p className="text-sm mb-2">
                          Order number:{' '}
                          <span className="font-semibold">
                            {orderNumber}
                          </span>
                        </p>
                      )}

                      <p className="text-sm text-brand-800 mb-5">
                        Your order has been created successfully.
                      </p>

                      {trackingUrl && (
                        <Link
                          to={trackingUrl}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-900 text-white text-sm font-semibold hover:bg-brand-800 transition"
                        >
                          Track your order
                          <ArrowRight size={16} />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  className="space-y-4"
                >
                  {submitError && (
                    <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                      {submitError}
                    </div>
                  )}

                  <div className="grid sm:grid-cols-2 gap-4">
                    <input
                      required
                      placeholder="Your name"
                      value={orderForm.name}
                      onChange={(event) =>
                        updateOrderForm(
                          'name',
                          event.target.value,
                        )
                      }
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-brand-200 outline-none"
                    />

                    <input
                      required
                      placeholder="Phone number"
                      value={orderForm.phone}
                      onChange={(event) =>
                        updateOrderForm(
                          'phone',
                          event.target.value,
                        )
                      }
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-brand-200 outline-none"
                    />
                  </div>

                  <input
                    type="email"
                    placeholder="Email (optional)"
                    value={orderForm.email}
                    onChange={(event) =>
                      updateOrderForm(
                        'email',
                        event.target.value,
                      )
                    }
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-brand-200 outline-none"
                  />

                  <div className="grid sm:grid-cols-2 gap-4">
                    <input
                      type="date"
                      value={orderForm.expectedDate}
                      onChange={(event) =>
                        updateOrderForm(
                          'expectedDate',
                          event.target.value,
                        )
                      }
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-brand-200 outline-none"
                    />

                    <select
                      required
                      value={orderForm.serviceId}
                      onChange={(event) =>
                        updateOrderForm(
                          'serviceId',
                          event.target.value,
                        )
                      }
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-brand-200 outline-none"
                    >
                      <option value="">
                        Select service
                      </option>

                      {services.map((service) => (
                        <option
                          key={service.id}
                          value={service.id}
                        >
                          {service.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <textarea
                    placeholder="Special instructions"
                    rows={3}
                    value={orderForm.notes}
                    onChange={(event) =>
                      updateOrderForm(
                        'notes',
                        event.target.value,
                      )
                    }
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-brand-200 outline-none"
                  />

                  <button
                    type="submit"
                    disabled={submitting || services.length === 0}
                    className="w-full py-3.5 rounded-xl bg-brand-900 text-white font-semibold hover:bg-brand-800 transition shadow-lg shadow-brand-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting
                      ? 'Creating order...'
                      : 'Confirm order'}
                  </button>
                </form>
              )}
            </section>
          </div>

          {/* =================================================
              SIDEBAR
          ================================================== */}

          <aside className="space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200/60 shadow-lg shadow-slate-200/30 p-6">
              <h3 className="font-semibold text-lg mb-4">
                About
              </h3>

              <ul className="space-y-3 text-sm text-slate-600">
                <li className="flex items-start gap-3">
                  <MapPin
                    size={16}
                    className="text-brand-600 mt-0.5 shrink-0"
                  />

                  <span>
                    {business.address ||
                      'Address not set'}

                    {business.city
                      ? `, ${business.city}`
                      : ''}
                  </span>
                </li>

                <li className="flex items-center gap-3">
                  <Phone
                    size={16}
                    className="text-brand-600 shrink-0"
                  />

                  <span>
                    {business.phone || '-'}
                  </span>
                </li>

                <li className="flex items-center gap-3">
                  <Mail
                    size={16}
                    className="text-brand-600 shrink-0"
                  />

                  <span className="break-all">
                    {business.email || '-'}
                  </span>
                </li>

                <li className="flex items-center gap-3">
                  <Clock
                    size={16}
                    className="text-brand-600 shrink-0"
                  />

                  <span>
                    Business hours not configured
                  </span>
                </li>
              </ul>
            </div>

            <div className="bg-brand-900 text-white rounded-3xl p-6 shadow-2xl shadow-brand-900/20">
              <h3 className="font-serif text-2xl mb-2">
                No account needed.
              </h3>

              <p className="text-brand-200 text-sm mb-4">
                Place an order as a guest and use your
                tracking link to check its progress.
              </p>

              <Link
                to="/register"
                className="inline-flex items-center gap-2 text-sm font-semibold text-white hover:underline"
              >
                Create account
                <ArrowRight size={16} />
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}