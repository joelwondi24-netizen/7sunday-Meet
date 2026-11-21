import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  MessageSquare,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  Truck,
  Video,
} from 'lucide-react';
import { api } from '../services/api';
import { exportOrderInvoicePDF } from '../services/exportService';
import { createCustomerOrder, updateOrderStatus } from '../services/firestoreService';
import {
  CustomerOrder,
  Meeting,
  OrderItem,
  Product,
  UserPrivateProfile,
} from '../types';

interface CustomerPortalProps {
  mode: 'customer-home' | 'products' | 'orders';
  currentUser: UserPrivateProfile;
  products: Product[];
  orders: CustomerOrder[];
  meetings: Meeting[];
  onNavigateTab: (tab: string) => void;
  onJoinMeeting: (code: string) => void;
}

export const CustomerPortal: React.FC<CustomerPortalProps> = ({
  mode,
  currentUser,
  products,
  orders,
  meetings,
  onNavigateTab,
  onJoinMeeting,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [shippingAddress, setShippingAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderNotice, setOrderNotice] = useState<string | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => p.category && set.add(p.category));
    return Array.from(set);
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (!p.active) return false;
      if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;
      if (
        searchTerm &&
        !p.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !(p.description || '').toLowerCase().includes(searchTerm.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [products, selectedCategory, searchTerm]);

  const cartItems: OrderItem[] = useMemo(() => {
    return Object.entries(cart)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([productId, qty]) => {
        const prod = products.find((p) => p.id === productId);
        if (!prod) return null;
        return {
          productId: prod.id,
          productName: prod.name,
          quantity: Number(qty),
          unitPrice: prod.price,
          subtotal: prod.price * Number(qty),
        };
      })
      .filter(Boolean) as OrderItem[];
  }, [cart, products]);

  const cartTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.subtotal, 0),
    [cartItems]
  );

  const currency = products[0]?.currency || 'ETB';

  const adjustCart = (productId: string, delta: number) => {
    setCart((prev) => {
      const next = Math.max(0, (prev[productId] || 0) + delta);
      if (next === 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      return { ...prev, [productId]: next };
    });
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cartItems.length === 0) return;
    setPlacingOrder(true);
    setOrderNotice(null);
    try {
      const order = await createCustomerOrder(currentUser, {
        items: cartItems,
        totalAmount: cartTotal,
        currency,
        shippingAddress,
        notes,
      });

      const dmsRes = await api.syncOrderToDms(order).catch(() => ({
        synced: false,
        dmsSyncStatus: 'not_configured',
      }));
      if (dmsRes.dmsSyncStatus && dmsRes.dmsSyncStatus !== 'not_configured') {
        await updateOrderStatus(order.id, 'pending', dmsRes.dmsSyncStatus as any).catch(() => {});
      }

      setCart({});
      setShippingAddress('');
      setNotes('');
      setOrderNotice(`Order ${order.orderNumber} submitted! Invoice ${order.invoiceNumber} is ready in My Orders.`);
      onNavigateTab('orders');
    } catch (err: any) {
      setOrderNotice(err?.message || 'Unable to submit order.');
    } finally {
      setPlacingOrder(false);
    }
  };

  if (mode === 'customer-home') {
    const activeOrders = orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled');
    const upcomingMeetings = meetings.filter((m) => m.status === 'live' || m.status === 'waiting');

    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <img
              src="/assets/aistudio/seven_sunday_app_icon_crcle_c5b9c7db.png"
              alt="7Sunday Meet"
              className="w-12 h-12 rounded-2xl object-cover shadow-sm"
            />
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
                Welcome to Seven Sunday Customer Portal, {currentUser.displayName}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Explore products, track your orders, join customer meetings, and chat with Customer Support.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onNavigateTab('products')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Browse Products</span>
            </button>
            <button
              onClick={() => onNavigateTab('messaging')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white text-xs font-semibold"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Customer Support</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>Total Orders</span>
              <ShoppingCart className="w-4 h-4 text-sky-500" />
            </div>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-2 tabular-nums">
              {orders.length}
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>Active Deliveries</span>
              <Truck className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-2 tabular-nums">
              {activeOrders.length}
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>Customer Meetings</span>
              <Video className="w-4 h-4 text-indigo-500" />
            </div>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-2 tabular-nums">
              {upcomingMeetings.length}
            </p>
          </div>
        </div>

        {upcomingMeetings.length > 0 && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Your Upcoming Meetings</h2>
            <div className="space-y-2">
              {upcomingMeetings.slice(0, 4).map((m) => (
                <div
                  key={m.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white truncate">{m.title}</p>
                    <p className="text-[11px] text-slate-500">{new Date(m.scheduledStart).toLocaleString()}</p>
                  </div>
                  <button
                    onClick={() => onJoinMeeting(m.code)}
                    className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold self-start sm:self-auto shrink-0"
                  >
                    Join
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (mode === 'products') {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">Products & Services Catalog</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Order official Seven Sunday products and services directly
            </p>
          </div>
          <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-initial">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search products..."
                className="w-full sm:w-48 pl-8 pr-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            >
              <option value="all">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {orderNotice && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{orderNotice}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8">
            {filteredProducts.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center space-y-2">
                <Package className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-sm font-bold text-slate-900 dark:text-white">No published products yet</p>
                <p className="text-xs text-slate-500">
                  Products published by Seven Sunday administrators will appear here in real time.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filteredProducts.map((product) => {
                  const qty = cart[product.id] || 0;
                  return (
                    <div
                      key={product.id}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col justify-between"
                    >
                      <div>
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="w-full h-40 object-cover bg-slate-100 dark:bg-slate-800"
                          />
                        ) : (
                          <div className="w-full h-32 bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                            <Package className="w-8 h-8" />
                          </div>
                        )}
                        <div className="p-4 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                              {product.category}
                            </span>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              {product.stockStatus.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{product.name}</h3>
                          {product.description && (
                            <p className="text-xs text-slate-500 line-clamp-2">{product.description}</p>
                          )}
                        </div>
                      </div>

                      <div className="p-4 pt-2 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
                        <span className="text-sm font-extrabold text-slate-900 dark:text-white tabular-nums">
                          {product.price.toLocaleString()} {product.currency}
                        </span>
                        {product.stockStatus === 'out_of_stock' ? (
                          <span className="text-xs text-rose-500 font-semibold">Unavailable</span>
                        ) : qty === 0 ? (
                          <button
                            onClick={() => adjustCart(product.id, 1)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add</span>
                          </button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => adjustCart(product.id, -1)}
                              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="text-xs font-bold tabular-nums w-5 text-center">{qty}</span>
                            <button
                              onClick={() => adjustCart(product.id, 1)}
                              className="p-1.5 rounded-lg bg-sky-600 text-white"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Order Cart Sidebar */}
          <div className="lg:col-span-4">
            <form
              onSubmit={handleCheckout}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 lg:sticky lg:top-20"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-sky-500" />
                  <span>Order Summary</span>
                </h3>
                <span className="text-xs font-bold text-slate-500 tabular-nums">{cartItems.length} item(s)</span>
              </div>

              {cartItems.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">Add products from the catalog to submit an order.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {cartItems.map((item) => (
                    <div
                      key={item.productId}
                      className="flex items-center justify-between text-xs p-2 rounded-xl bg-slate-50 dark:bg-slate-950"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-white truncate">{item.productName}</p>
                        <p className="text-[11px] text-slate-500 tabular-nums">
                          {item.quantity} × {item.unitPrice.toLocaleString()} {currency}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-bold tabular-nums">{item.subtotal.toLocaleString()}</span>
                        <button
                          type="button"
                          onClick={() => adjustCart(item.productId, -item.quantity)}
                          className="text-rose-500 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Delivery / Shipping Address
                </label>
                <input
                  type="text"
                  required
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  placeholder="Addis Ababa, Bole Sub-City..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Order Notes
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Special specifications or delivery window..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-sm font-extrabold">
                <span>Total</span>
                <span className="tabular-nums">
                  {cartTotal.toLocaleString()} {currency}
                </span>
              </div>

              <button
                type="submit"
                disabled={cartItems.length === 0 || placingOrder}
                className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold"
              >
                {placingOrder ? 'Submitting Order...' : 'Submit Order'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Orders & Invoices Mode
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">My Orders & Invoices</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Track live fulfillment status and download official PDF invoices
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center space-y-2">
          <ShoppingCart className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm font-bold text-slate-900 dark:text-white">No orders placed yet</p>
          <button
            onClick={() => onNavigateTab('products')}
            className="mt-2 px-4 py-2 rounded-xl bg-sky-600 text-white text-xs font-bold"
          >
            Browse Products Catalog
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                      {order.orderNumber}
                    </span>
                    <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400">
                      {order.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Invoice: {order.invoiceNumber || '-'} · Delivery: {order.shippingAddress || 'Standard'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm font-extrabold text-slate-900 dark:text-white tabular-nums mr-2">
                    {order.totalAmount.toLocaleString()} {order.currency}
                  </span>
                  <button
                    onClick={() => exportOrderInvoicePDF(order)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Invoice PDF</span>
                  </button>
                  {order.status === 'pending' && (
                    <button
                      onClick={() => updateOrderStatus(order.id, 'cancelled')}
                      className="px-3 py-1.5 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-semibold"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {order.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs flex justify-between"
                  >
                    <span className="truncate font-medium">{item.productName} × {item.quantity}</span>
                    <span className="font-bold tabular-nums shrink-0 ml-2">
                      {item.subtotal.toLocaleString()} {order.currency}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
