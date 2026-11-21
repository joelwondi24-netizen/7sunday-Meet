import React, { useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Download,
  Flag,
  KeyRound,
  Package,
  Plus,
  ScrollText,
  Settings2,
  ShieldAlert,
  ShoppingCart,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { api } from '../services/api';
import { exportAuditLogsPDF, exportOrdersExcel } from '../services/exportService';
import {
  adminUpdateUserAccount,
  createDepartment,
  deleteDepartment,
  deleteProductDoc,
  moderateReportedMessage,
  saveCustomRole,
  saveIntegrationConfig,
  saveProductDoc,
  subscribeAllUsersForAdmin,
  subscribeAuditLogs,
  subscribeCustomRoles,
  subscribeDepartments,
  subscribeIntegrationConfig,
  subscribeModerationReports,
  updateOrderStatus,
} from '../services/firestoreService';
import {
  AccountStatus,
  AccountType,
  ALL_SYSTEM_ROLES,
  AuditLog,
  CustomRole,
  CustomerOrder,
  Department,
  IntegrationConfig,
  IntegrationEnvStatus,
  ModerationReport,
  OrderStatus,
  Product,
  UserPrivateProfile,
  UserRole,
} from '../types';

interface AdminPanelProps {
  currentUser: UserPrivateProfile;
  products: Product[];
  orders: CustomerOrder[];
}

type AdminTab =
  | 'employees'
  | 'customers'
  | 'moderation'
  | 'rbac'
  | 'departments'
  | 'catalog'
  | 'orders'
  | 'integrations'
  | 'audit';

const RBAC_PERMISSION_KEYS = [
  'schedule_meetings',
  'moderate_meetings',
  'view_analytics',
  'publish_reports',
  'support_customers',
  'manage_catalog',
  'manage_orders',
  'admin_console',
];

export const AdminPanel: React.FC<AdminPanelProps> = ({
  currentUser,
  products,
  orders,
}) => {
  const [tab, setTab] = useState<AdminTab>('employees');
  const [users, setUsers] = useState<UserPrivateProfile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [moderationReports, setModerationReports] = useState<ModerationReport[]>([]);
  const [integrationConfig, setIntegrationConfig] = useState<IntegrationConfig | null>(null);
  const [envStatus, setEnvStatus] = useState<IntegrationEnvStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Forms
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptDesc, setNewDeptDesc] = useState('');

  const [roleName, setRoleName] = useState<string>('Department Manager');
  const [roleScope, setRoleScope] = useState<AccountType>('employee');
  const [rolePerms, setRolePerms] = useState<Record<string, boolean>>({
    schedule_meetings: true,
    moderate_meetings: true,
    view_analytics: true,
  });

  // Product Form
  const [prodName, setProdName] = useState('');
  const [prodCategory, setProdCategory] = useState('Manufacturing');
  const [prodDesc, setProdDesc] = useState('');
  const [prodPrice, setProdPrice] = useState('0');
  const [prodCurrency, setProdCurrency] = useState('ETB');
  const [prodImageUrl, setProdImageUrl] = useState('');
  const [prodStock, setProdStock] = useState<Product['stockStatus']>('in_stock');

  // Integration Form
  const [waEnabled, setWaEnabled] = useState(false);
  const [waNum, setWaNum] = useState('');
  const [tgEnabled, setTgEnabled] = useState(false);
  const [tgBot, setTgBot] = useState('');
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [smtpHost, setSmtpHost] = useState('');
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [smsSender, setSmsSender] = useState('');
  const [dmsEndpoint, setDmsEndpoint] = useState('');

  useEffect(() => {
    const u1 = subscribeAllUsersForAdmin(setUsers);
    const u2 = subscribeDepartments(setDepartments);
    const u3 = subscribeCustomRoles(setCustomRoles);
    const u4 = subscribeAuditLogs(setAuditLogs);
    const u5 = subscribeIntegrationConfig((cfg) => {
      setIntegrationConfig(cfg);
      if (cfg) {
        setWaEnabled(Boolean(cfg.whatsappEnabled));
        setWaNum(cfg.whatsappBusinessNumber || '');
        setTgEnabled(Boolean(cfg.telegramEnabled));
        setTgBot(cfg.telegramBotUsername || '');
        setEmailEnabled(Boolean(cfg.emailEnabled));
        setSmtpHost(cfg.smtpHost || '');
        setSmsEnabled(Boolean(cfg.smsEnabled));
        setSmsSender(cfg.smsSenderId || '');
        setDmsEndpoint(cfg.sevenSundayDmsEndpoint || '');
      }
    });
    const u6 = subscribeModerationReports(currentUser, setModerationReports);
    api.getIntegrationStatus().then(setEnvStatus).catch(() => {});

    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
      u6();
    };
  }, [currentUser.uid]);

  const pendingModCount = moderationReports.filter((r) => r.status === 'pending').length;

  const employees = users.filter((u) => u.accountType !== 'customer');
  const customers = users.filter((u) => u.accountType === 'customer');

  const handleProductImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const uploaded = await api.uploadFile(file, file.name);
    setProdImageUrl(uploaded.url);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveProductDoc(currentUser.uid, {
      name: prodName,
      category: prodCategory,
      description: prodDesc,
      price: Number(prodPrice) || 0,
      currency: prodCurrency,
      imageUrl: prodImageUrl,
      stockStatus: prodStock,
      active: true,
    });
    setProdName('');
    setProdDesc('');
    setProdPrice('0');
    setProdImageUrl('');
    setNotice('Product published to Customer Portal.');
  };

  const handleSaveIntegrations = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveIntegrationConfig(currentUser, {
      whatsappEnabled: waEnabled,
      whatsappBusinessNumber: waNum,
      telegramEnabled: tgEnabled,
      telegramBotUsername: tgBot,
      emailEnabled,
      smtpHost,
      smsEnabled,
      smsSenderId: smsSender,
      sevenSundayDmsEndpoint: dmsEndpoint,
    });
    setNotice('Integration settings saved to Firestore.');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
              7Sunday Meet Administration
            </h2>
            <p className="text-xs text-slate-500">
              Manage separated employee & customer accounts, RBAC matrix, catalog, orders, and audit logs
            </p>
          </div>
        </div>
      </div>

      {notice && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2">
        {(
          [
            { id: 'employees', label: `Employees (${employees.length})`, icon: Users },
            { id: 'customers', label: `Customers (${customers.length})`, icon: Users },
            { id: 'moderation', label: `Moderation (${pendingModCount} pending)`, icon: Flag },
            { id: 'rbac', label: 'RBAC Matrix', icon: KeyRound },
            { id: 'departments', label: 'Departments', icon: Building2 },
            { id: 'catalog', label: `Catalog (${products.length})`, icon: Package },
            { id: 'orders', label: `Orders (${orders.length})`, icon: ShoppingCart },
            { id: 'integrations', label: 'Integrations', icon: Settings2 },
            { id: 'audit', label: 'Audit Logs', icon: ScrollText },
          ] as { id: AdminTab; label: string; icon: any }[]
        ).map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                active
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Employees / Customers User Management Table */}
      {(tab === 'employees' || tab === 'customers') && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 min-w-0">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4">
            {tab === 'employees' ? 'Employee & Administrator Accounts' : 'Isolated Customer Accounts'}
          </h3>
          {(tab === 'employees' ? employees : customers).length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No accounts in this category yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2 pr-4">User</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Department</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(tab === 'employees' ? employees : customers).map((u) => (
                  <tr key={u.uid}>
                    <td className="py-3 pr-4 font-semibold text-slate-900 dark:text-white">{u.displayName}</td>
                    <td className="py-3 pr-4 text-slate-500">{u.email}</td>
                    <td className="py-3 pr-4">
                      <select
                        value={u.role}
                        onChange={(e) =>
                          adminUpdateUserAccount(currentUser, u.uid, {
                            role: e.target.value as UserRole,
                            accountType:
                              e.target.value === 'Customer'
                                ? 'customer'
                                : e.target.value === 'Super Administrator' || e.target.value === 'Company Administrator'
                                ? 'admin'
                                : 'employee',
                          })
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                      >
                        {ALL_SYSTEM_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 pr-4">
                      <input
                        type="text"
                        defaultValue={u.department || ''}
                        onBlur={(e) => {
                          if (e.target.value !== (u.department || '')) {
                            adminUpdateUserAccount(currentUser, u.uid, { department: e.target.value });
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs w-36"
                      />
                    </td>
                    <td className="py-3">
                      <select
                        value={u.status}
                        onChange={(e) =>
                          adminUpdateUserAccount(currentUser, u.uid, {
                            status: e.target.value as AccountStatus,
                          })
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-semibold"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="suspended">Suspended</option>
                        <option value="blocked_temp">Temporarily Blocked</option>
                        <option value="blocked_perm">Permanently Blocked</option>
                        <option value="deleted">Soft Deleted</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Spam & Message Moderation Queue */}
      {tab === 'moderation' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Spam Reporting & Message Moderation Queue
              </h3>
              <p className="text-xs text-slate-500">
                Review flagged messages, remove policy violations from conversations, or suspend repeat offenders
              </p>
            </div>
          </div>

          {moderationReports.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center">No spam or abuse reports submitted yet.</p>
          ) : (
            <div className="space-y-3">
              {moderationReports.map((rep) => (
                <div
                  key={rep.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          rep.status === 'pending'
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                            : rep.status === 'removed'
                            ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                        }`}
                      >
                        {rep.status}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px] font-bold uppercase">
                        {rep.reason}
                      </span>
                      <span className="text-slate-500">
                        Reported user: <strong className="text-slate-900 dark:text-white">{rep.reportedName}</strong> · By {rep.reporterName}
                      </span>
                    </div>
                    <p className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                      “{rep.messageContent}”
                    </p>
                    {rep.details && <p className="text-[11px] text-slate-500">Reporter note: {rep.details}</p>}
                    {rep.resolutionNote && (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                        Resolution: {rep.resolutionNote}
                      </p>
                    )}
                  </div>

                  {rep.status === 'pending' && (
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        onClick={async () => {
                          await moderateReportedMessage(currentUser, rep, 'removed', `Violated policy (${rep.reason})`);
                          setNotice('Message removed from chat thread and logged.');
                        }}
                        className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold"
                      >
                        Remove Message
                      </button>
                      <button
                        onClick={async () => {
                          await moderateReportedMessage(currentUser, rep, 'dismissed', 'No violation found');
                          setNotice('Report dismissed.');
                        }}
                        className="px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 font-semibold"
                      >
                        Dismiss
                      </button>
                      <button
                        onClick={async () => {
                          await adminUpdateUserAccount(currentUser, rep.reportedUid, { status: 'suspended' });
                          await moderateReportedMessage(currentUser, rep, 'removed', `Message removed & sender suspended (${rep.reason})`);
                          setNotice(`Removed message and suspended ${rep.reportedName}.`);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold"
                      >
                        Remove & Suspend User
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Configurable RBAC Matrix */}
      {tab === 'rbac' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await saveCustomRole(currentUser, {
                name: roleName,
                accountScope: roleScope,
                permissions: rolePerms,
              });
              setNotice(`Saved RBAC permissions for ${roleName}.`);
            }}
            className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4"
          >
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Configure Role Permissions</h3>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Role Name</label>
              <input
                type="text"
                list="system-roles-list"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
              />
              <datalist id="system-roles-list">
                {ALL_SYSTEM_ROLES.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Account Scope</label>
              <select
                value={roleScope}
                onChange={(e) => setRoleScope(e.target.value as AccountType)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
              >
                <option value="employee">Employee</option>
                <option value="customer">Customer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="space-y-2 pt-1">
              {RBAC_PERMISSION_KEYS.map((key) => (
                <label key={key} className="flex items-center justify-between text-xs p-2 rounded-xl bg-slate-50 dark:bg-slate-950 cursor-pointer">
                  <span className="font-mono">{key}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(rolePerms[key])}
                    onChange={(e) =>
                      setRolePerms((prev) => ({ ...prev, [key]: e.target.checked }))
                    }
                  />
                </label>
              ))}
            </div>
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
            >
              Save Role Matrix
            </button>
          </form>

          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Configured Roles</h3>
            {customRoles.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No custom role policies saved yet.</p>
            ) : (
              <div className="space-y-2.5">
                {customRoles.map((cr) => (
                  <div
                    key={cr.id}
                    className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-white">{cr.name}</span>
                      <span className="uppercase text-[10px] font-bold text-sky-500">{cr.accountScope}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {Object.entries(cr.permissions)
                        .filter(([, allowed]) => allowed)
                        .map(([k]) => (
                          <span key={k} className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-[10px]">
                            {k}
                          </span>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Departments */}
      {tab === 'departments' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await createDepartment(currentUser, newDeptName, newDeptDesc);
              setNewDeptName('');
              setNewDeptDesc('');
            }}
            className="md:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3"
          >
            <h3 className="text-sm font-bold">Add Department</h3>
            <input
              type="text"
              required
              value={newDeptName}
              onChange={(e) => setNewDeptName(e.target.value)}
              placeholder="Department Name (e.g. Sales & Marketing)"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
            />
            <textarea
              rows={2}
              value={newDeptDesc}
              onChange={(e) => setNewDeptDesc(e.target.value)}
              placeholder="Department responsibilities..."
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
            />
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
            >
              Create Department
            </button>
          </form>

          <div className="md:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-2.5">
            <h3 className="text-sm font-bold">Company Departments</h3>
            {departments.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No departments added yet.</p>
            ) : (
              departments.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                >
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">{d.name}</p>
                    {d.description && <p className="text-[11px] text-slate-500">{d.description}</p>}
                  </div>
                  <button
                    onClick={() => deleteDepartment(currentUser, d.id)}
                    className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Product Catalog Management */}
      {tab === 'catalog' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleSaveProduct}
            className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3"
          >
            <h3 className="text-sm font-bold">Publish Product / Service</h3>
            <input
              type="text"
              required
              value={prodName}
              onChange={(e) => setProdName(e.target.value)}
              placeholder="Product or Service Name"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                required
                value={prodCategory}
                onChange={(e) => setProdCategory(e.target.value)}
                placeholder="Category"
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
              />
              <select
                value={prodStock}
                onChange={(e) => setProdStock(e.target.value as any)}
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
              >
                <option value="in_stock">In Stock</option>
                <option value="made_to_order">Made to Order</option>
                <option value="out_of_stock">Out of Stock</option>
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={prodPrice}
                onChange={(e) => setProdPrice(e.target.value)}
                placeholder="Price"
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
              />
              <input
                type="text"
                required
                value={prodCurrency}
                onChange={(e) => setProdCurrency(e.target.value)}
                placeholder="Currency (ETB/USD)"
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
              />
            </div>
            <textarea
              rows={2}
              value={prodDesc}
              onChange={(e) => setProdDesc(e.target.value)}
              placeholder="Product specifications..."
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
            />
            <div className="flex items-center gap-3">
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Image</span>
                <input type="file" accept="image/*" onChange={handleProductImageUpload} className="hidden" />
              </label>
              {prodImageUrl && <span className="text-[11px] text-emerald-500 font-semibold">Image attached</span>}
            </div>
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
            >
              <Plus className="w-3.5 h-3.5 inline mr-1" />
              Publish Product
            </button>
          </form>

          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-2.5">
            <h3 className="text-sm font-bold">Active Catalog</h3>
            {products.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No products published yet.</p>
            ) : (
              products.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                >
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">{p.name}</p>
                    <p className="text-[11px] text-slate-500 tabular-nums">
                      {p.category} · {p.price.toLocaleString()} {p.currency}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteProductDoc(p.id)}
                    className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Orders Management */}
      {tab === 'orders' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold">Customer Orders Management</h3>
            <button
              onClick={() => exportOrdersExcel(orders)}
              disabled={orders.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Excel</span>
            </button>
          </div>

          {orders.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No customer orders submitted yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-xs">
              <thead className="text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2 pr-4">Order #</th>
                  <th className="py-2 pr-4">Customer</th>
                  <th className="py-2 pr-4">Total</th>
                  <th className="py-2 pr-4">DMS Sync</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {orders.map((ord) => (
                  <tr key={ord.id}>
                    <td className="py-3 pr-4 font-mono font-bold">{ord.orderNumber}</td>
                    <td className="py-3 pr-4">
                      <div>{ord.customerName}</div>
                      <div className="text-[10px] text-slate-400">{ord.customerEmail}</div>
                    </td>
                    <td className="py-3 pr-4 font-bold tabular-nums">
                      {ord.totalAmount.toLocaleString()} {ord.currency}
                    </td>
                    <td className="py-3 pr-4 text-[11px]">{ord.dmsSyncStatus || 'not_configured'}</td>
                    <td className="py-3">
                      <select
                        value={ord.status}
                        onChange={(e) => updateOrderStatus(ord.id, e.target.value as OrderStatus)}
                        className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-semibold"
                      >
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="processing">Processing</option>
                        <option value="shipped">Shipped</option>
                        <option value="delivered">Delivered</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* External Integrations Config */}
      {tab === 'integrations' && (
        <form
          onSubmit={handleSaveIntegrations}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5"
        >
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              External Messaging & Seven Sunday DMS Integrations
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              API tokens/passwords stay strictly in server Secrets (.env). Configure non-secret channel metadata here.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <label className="flex items-center justify-between font-bold">
                <span>WhatsApp Business Cloud ({envStatus?.whatsappConfigured ? 'Secret Ready' : 'Not Configured'})</span>
                <input type="checkbox" checked={waEnabled} onChange={(e) => setWaEnabled(e.target.checked)} />
              </label>
              <input
                type="text"
                value={waNum}
                onChange={(e) => setWaNum(e.target.value)}
                placeholder="Business Phone Number (+251...)"
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              />
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <label className="flex items-center justify-between font-bold">
                <span>Telegram Bot API ({envStatus?.telegramConfigured ? 'Secret Ready' : 'Not Configured'})</span>
                <input type="checkbox" checked={tgEnabled} onChange={(e) => setTgEnabled(e.target.checked)} />
              </label>
              <input
                type="text"
                value={tgBot}
                onChange={(e) => setTgBot(e.target.value)}
                placeholder="@SevenSundayMeetBot"
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              />
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <label className="flex items-center justify-between font-bold">
                <span>SMTP Email Gateway ({envStatus?.emailConfigured ? 'Secret Ready' : 'Not Configured'})</span>
                <input type="checkbox" checked={emailEnabled} onChange={(e) => setEmailEnabled(e.target.checked)} />
              </label>
              <input
                type="text"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="smtp.sevensundayethiopia.com"
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              />
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <label className="flex items-center justify-between font-bold">
                <span>Seven Sunday Ethiopia DMS Sync ({envStatus?.dmsConfigured ? 'Secret Ready' : 'Not Configured'})</span>
                <input type="checkbox" checked={smsEnabled} onChange={(e) => setSmsEnabled(e.target.checked)} />
              </label>
              <input
                type="text"
                value={dmsEndpoint}
                onChange={(e) => setDmsEndpoint(e.target.value)}
                placeholder="https://dms.sevensundayethiopia.com/api/orders"
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              />
            </div>
          </div>

          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
          >
            Save Integration Settings
          </button>
        </form>
      )}

      {/* Immutable Audit Logs */}
      {tab === 'audit' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold">Immutable Security & Administration Audit Logs</h3>
            <button
              onClick={() => exportAuditLogsPDF(auditLogs)}
              disabled={auditLogs.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export PDF</span>
            </button>
          </div>
          {auditLogs.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No administrative audit events recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-xs">
              <thead className="text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2 pr-4">Actor</th>
                  <th className="py-2 pr-4">Action</th>
                  <th className="py-2 pr-4">Target</th>
                  <th className="py-2">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2.5 pr-4">
                      <div className="font-semibold">{log.actorEmail}</div>
                      <div className="text-[10px] text-slate-400">{log.actorRole}</div>
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-sky-600 dark:text-sky-400">{log.action}</td>
                    <td className="py-2.5 pr-4 font-mono">{log.targetType}:{log.targetId || '-'}</td>
                    <td className="py-2.5 text-slate-500 max-w-md truncate">{log.details}</td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
