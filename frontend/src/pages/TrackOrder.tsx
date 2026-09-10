import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle,
  Clock,
  Package,
  RefreshCw,
} from 'lucide-react';

import { api } from '../lib/api';

type OrderItem = {
  quantity: number;
  unitPrice: number | string;
  total: number | string;
  service?: {
    id: string;
    name: string;
  } | null;
};

type TimelineItem = {
  status: string;
  notes?: string | null;
  createdAt: string;
};

type TrackingData = {
  orderNumber: string;
  status: string;
  customerName?: string;
  items?: OrderItem[];
  timeline?: TimelineItem[];
};

function formatStatus(status: string) {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function TrackOrder() {
  const { token } = useParams<{ token: string }>();

  const [order, setOrder] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadOrder() {
    if (!token) {
      setError('Invalid tracking link.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');

      /*
       * IMPORTANT:
       * The backend expects the complete UUID.
       * Do not split the token using "-".
       */
      const response = await api(
        `/api/v1/public/orders/${encodeURIComponent(token)}`,
      );

      if (!response?.success) {
        throw new Error(
          response?.error?.message || 'Unable to load order.',
        );
      }

      setOrder(response.data);
    } catch (err) {
      console.error('Order tracking error:', err);

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load order tracking information.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrder();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-6">
        <div className="text-center">
          <div className="w-10 h-10 rounded-full border-4 border-slate-200 border-t-brand-700 animate-spin mx-auto mb-4" />

          <p className="text-slate-600 font-medium">
            Loading order...
          </p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 shadow-lg text-center">
          <Package
            size={42}
            className="mx-auto mb-4 text-slate-400"
          />

          <h1 className="font-serif text-3xl mb-3">
            Order unavailable
          </h1>

          <p className="text-slate-600 mb-6">
            {error || 'The order could not be found.'}
          </p>

          <button
            type="button"
            onClick={loadOrder}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-brand-900 text-white font-semibold mr-3"
          >
            <RefreshCw size={16} />
            Try again
          </button>

          <Link
            to="/"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-200 font-semibold"
          >
            <ArrowLeft size={16} />
            Home
          </Link>
        </div>
      </div>
    );
  }

  const items = Array.isArray(order.items) ? order.items : [];
  const timeline = Array.isArray(order.timeline)
    ? order.timeline
    : [];

  return (
    <div className="min-h-screen bg-paper py-12 px-6">
      <div className="max-w-3xl mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-brand-900 mb-8"
        >
          <ArrowLeft size={16} />
          Back to ServiceOS
        </Link>

        {/* Header */}

        <div className="bg-brand-900 text-white rounded-3xl p-8 md:p-10 shadow-xl mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <p className="text-brand-200 text-sm mb-2">
                Order tracking
              </p>

              <h1 className="font-serif text-4xl md:text-5xl mb-3">
                {order.orderNumber}
              </h1>

              {order.customerName && (
                <p className="text-brand-100">
                  Customer: {order.customerName}
                </p>
              )}
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 self-start">
              <Clock size={17} />

              <span className="font-semibold">
                {formatStatus(order.status)}
              </span>
            </div>
          </div>
        </div>

        {/* Services */}

        <section className="bg-white rounded-3xl border border-slate-200 p-7 md:p-8 shadow-sm mb-8">
          <h2 className="font-serif text-3xl mb-6">
            Order Details
          </h2>

          {items.length === 0 ? (
            <p className="text-slate-500">
              No service details are available for this order.
            </p>
          ) : (
            <div className="space-y-4">
              {items.map((item, index) => (
                <div
                  key={`${item.service?.id || 'item'}-${index}`}
                  className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100"
                >
                  <div>
                    <div className="font-semibold">
                      {item.service?.name || 'Service'}
                    </div>

                    <div className="text-sm text-slate-500 mt-1">
                      Quantity: {item.quantity}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-semibold text-brand-900">
                      PKR {Number(item.total).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Timeline */}

        <section className="bg-white rounded-3xl border border-slate-200 p-7 md:p-8 shadow-sm">
          <h2 className="font-serif text-3xl mb-7">
            Order Progress
          </h2>

          {timeline.length === 0 ? (
            <div className="flex items-start gap-4">
              <CheckCircle
                size={23}
                className="text-brand-700 mt-0.5"
              />

              <div>
                <div className="font-semibold">
                  {formatStatus(order.status)}
                </div>

                <p className="text-sm text-slate-500 mt-1">
                  Your order has been received.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {timeline.map((entry, index) => (
                <div
                  key={`${entry.createdAt}-${index}`}
                  className="flex gap-4"
                >
                  <div className="flex flex-col items-center">
                    <CheckCircle
                      size={22}
                      className="text-brand-700 shrink-0"
                    />

                    {index < timeline.length - 1 && (
                      <div className="w-px flex-1 bg-slate-200 mt-2" />
                    )}
                  </div>

                  <div className="pb-5">
                    <h3 className="font-semibold text-lg">
                      {formatStatus(entry.status)}
                    </h3>

                    {entry.notes && (
                      <p className="text-slate-600 text-sm mt-1">
                        {entry.notes}
                      </p>
                    )}

                    <p className="text-xs text-slate-400 mt-2">
                      {new Date(entry.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}