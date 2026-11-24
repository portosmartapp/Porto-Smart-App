import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Edit3,
  Plus,
  Search,
  Shield,
  ShieldAlert,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
  X,
} from 'lucide-react';
import { getT } from '../i18n/translations';
import {
  AppMode,
  Language,
  MutationResult,
  Owner,
  PlatformUser,
  UserRole,
} from '../types/platform';

interface UsersManagementViewProps {
  users: PlatformUser[];
  owners: Owner[];
  currentUser: PlatformUser;
  lang: Language;
  appMode: AppMode;
  onSaveUser: (user: PlatformUser) => Promise<MutationResult>;
  onDeleteUser: (userId: string) => Promise<MutationResult>;
}

const ASSIGNABLE_ROLES: UserRole[] = [
  'super_admin',
  'manager',
  'owner',
  'reception',
  'housekeeping',
  'maintenance',
  'guest',
];

export const UsersManagementView: React.FC<UsersManagementViewProps> = ({
  users,
  owners,
  currentUser,
  lang,
  appMode,
  onSaveUser,
  onDeleteUser,
}) => {
  const t = getT(lang);
  const isAr = lang === 'ar';
  const canEdit = currentUser.role === 'super_admin';

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<PlatformUser | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Form fields
  const [uidInput, setUidInput] = useState('');
  const [fullName, setFullName] = useState('');
  const [fullNameAr, setFullNameAr] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('reception');
  const [ownerId, setOwnerId] = useState<string>('');
  const [isActive, setIsActive] = useState(true);

  const ownerMap = useMemo(() => {
    const map = new Map<string, Owner>();
    owners.forEach((o) => map.set(o.id, o));
    return map;
  }, [owners]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.fullName.toLowerCase().includes(q) ||
        u.fullNameAr.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q)
      );
    });
  }, [users, search, roleFilter]);

  const openCreateModal = () => {
    setEditingUser(null);
    setUidInput('');
    setFullName('');
    setFullNameAr('');
    setEmail('');
    setPhone('');
    setRole('reception');
    setOwnerId(owners[0]?.id || '');
    setIsActive(true);
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (u: PlatformUser) => {
    setEditingUser(u);
    setUidInput(u.id);
    setFullName(u.fullName);
    setFullNameAr(u.fullNameAr);
    setEmail(u.email);
    setPhone(u.phone);
    setRole(u.role);
    setOwnerId(u.ownerId || owners[0]?.id || '');
    setIsActive(u.isActive);
    setFormError('');
    setModalOpen(true);
  };

  const handleCopyUid = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard blocked in sandbox fallback
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!uidInput.trim() || !fullName.trim() || !email.trim()) {
      setFormError(
        isAr
          ? 'يرجى إدخال معرّف المستخدم (UID) والاسم والبريد الإلكتروني.'
          : 'User UID, full name, and email are required.'
      );
      return;
    }
    if (role === 'owner' && !ownerId) {
      setFormError(
        isAr
          ? 'يرجى ربط حساب المالك بسجل المالك أولاً من قائمة الملاك.'
          : 'Please link an Owner record when assigning the Owner role.'
      );
      return;
    }

    setSaving(true);
    const payload: PlatformUser = {
      id: uidInput.trim(),
      fullName: fullName.trim(),
      fullNameAr: (fullNameAr || fullName).trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      role,
      ownerId: role === 'owner' ? ownerId : null,
      isActive,
      isDemo: appMode === 'demo',
    };
    const res = await onSaveUser(payload);
    setSaving(false);
    if (!res.ok) {
      setFormError(res.error || (isAr ? 'تعذر حفظ المستخدم.' : 'Failed to save user.'));
      return;
    }
    setModalOpen(false);
  };

  const handleToggleActive = async (u: PlatformUser) => {
    if (!canEdit || u.id === currentUser.id) return;
    await onSaveUser({ ...u, isActive: !u.isActive });
  };

  const handleDelete = async (u: PlatformUser) => {
    if (!canEdit || u.id === currentUser.id) return;
    await onDeleteUser(u.id);
  };

  return (
    <div className="space-y-6">
      {/* Header & Onboarding Guide */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-cyan-800" />
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              {isAr ? 'إدارة مستخدمي المنصة والصلاحيات' : 'Platform Users & Role Access Control'}
            </h2>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
            {isAr
              ? 'يمكن للموظفين والملاك إنشاء حساباتهم من شاشة الدخول (إنشاء حساب جديد)، ثم يقوم المدير العام بتفعيل حساباتهم وربط صلاحياتهم من هنا مباشرة بدون الحاجة لـ SQL Editor.'
              : 'Staff and owners can register via Sign Up on the login screen and share their User UID for one-click activation and role assignment here.'}
          </p>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-800 hover:bg-cyan-900 text-white text-xs font-semibold cursor-pointer shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>{isAr ? 'إضافة / تفعيل مستخدم' : 'Add / Activate User'}</span>
          </button>
        )}
      </div>

      {!canEdit && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
          <ShieldAlert className="w-4 h-4 shrink-0 text-amber-700" />
          <span>
            {isAr
              ? 'عرض فقط: تعديل الأدوار وتفعيل أو إيقاف الحسابات متاح للمدير العام (Super Admin) فقط لحماية صلاحيات النظام.'
              : 'Read-only access: Adding, editing, or deactivating platform accounts is restricted to Super Admin.'}
          </span>
        </div>
      )}

      {/* Search & Role Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              isAr
                ? 'ابحث بالاسم، البريد الإلكتروني، أو User UID...'
                : 'Search by name, email, or User UID...'
            }
            className="w-full ps-9 pe-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-700"
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as 'all' | UserRole)}
          className="px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-700"
        >
          <option value="all">{isAr ? 'جميع الصلاحيات' : 'All Roles'}</option>
          {ASSIGNABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {t.roles[r]}
            </option>
          ))}
        </select>
      </div>

      {/* Users Table (Desktop) & Cards (Mobile) */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {filteredUsers.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            {isAr ? 'لا يوجد مستخدمون مطابقون للبحث.' : 'No users match the current filter.'}
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'المستخدم' : 'User'}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'الصلاحية' : 'Role'}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'ربط المالك' : 'Linked Owner'}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">UID</th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'الحالة' : 'Status'}
                    </th>
                    {canEdit && (
                      <th className="px-4 py-3 text-end font-semibold">
                        {isAr ? 'إجراءات' : 'Actions'}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((u) => {
                    const linkedOwner = u.ownerId ? ownerMap.get(u.ownerId) : undefined;
                    const isSelf = u.id === currentUser.id;
                    return (
                      <tr key={u.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">
                            {isAr ? u.fullNameAr : u.fullName}
                          </div>
                          <div className="text-[11px] text-slate-500">{u.email}</div>
                          {u.phone && (
                            <div className="text-[11px] text-slate-400 font-mono-num">
                              {u.phone}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex px-2 py-1 rounded bg-cyan-50 text-cyan-900 border border-cyan-200 font-semibold text-[11px]">
                            {t.roles[u.role]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {u.role === 'owner'
                            ? linkedOwner
                              ? isAr
                                ? linkedOwner.fullNameAr
                                : linkedOwner.fullName
                              : isAr
                              ? 'غير مربوط بمالك'
                              : 'Unlinked'
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => void handleCopyUid(u.id)}
                            className="inline-flex items-center gap-1.5 font-mono-num text-[11px] text-slate-600 hover:text-cyan-800 cursor-pointer"
                            title={u.id}
                          >
                            <span>{u.id.slice(0, 8)}...</span>
                            {copiedId === u.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                              u.isActive
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-red-50 text-red-800 border border-red-200'
                            }`}
                          >
                            {u.isActive
                              ? isAr
                                ? 'مفعّل'
                                : 'Active'
                              : isAr
                              ? 'موقوف'
                              : 'Inactive'}
                          </span>
                        </td>
                        {canEdit && (
                          <td className="px-4 py-3 text-end">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditModal(u)}
                                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 cursor-pointer"
                                title={t.actions.edit}
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              {!isSelf && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => void handleToggleActive(u)}
                                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 cursor-pointer"
                                    title={
                                      u.isActive
                                        ? isAr
                                          ? 'إيقاف الحساب'
                                          : 'Deactivate'
                                        : isAr
                                        ? 'تفعيل الحساب'
                                        : 'Activate'
                                    }
                                  >
                                    {u.isActive ? (
                                      <UserX className="w-3.5 h-3.5 text-amber-700" />
                                    ) : (
                                      <UserCheck className="w-3.5 h-3.5 text-emerald-700" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleDelete(u)}
                                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-red-50 text-red-700 cursor-pointer"
                                    title={t.actions.delete}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card Layout */}
            <div className="md:hidden divide-y divide-slate-200">
              {filteredUsers.map((u) => {
                const linkedOwner = u.ownerId ? ownerMap.get(u.ownerId) : undefined;
                const isSelf = u.id === currentUser.id;
                return (
                  <div key={u.id} className="p-4 space-y-2.5 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-slate-900">
                          {isAr ? u.fullNameAr : u.fullName}
                        </div>
                        <div className="text-[11px] text-slate-500">{u.email}</div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          u.isActive
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-red-50 text-red-800 border border-red-200'
                        }`}
                      >
                        {u.isActive ? (isAr ? 'مفعّل' : 'Active') : isAr ? 'موقوف' : 'Inactive'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="px-2 py-0.5 rounded bg-cyan-50 text-cyan-900 border border-cyan-200 font-semibold">
                        {t.roles[u.role]}
                      </span>
                      {u.role === 'owner' && linkedOwner && (
                        <span className="text-slate-600">
                          · {isAr ? linkedOwner.fullNameAr : linkedOwner.fullName}
                        </span>
                      )}
                    </div>

                    {canEdit && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(u)}
                          className="flex-1 py-1.5 rounded-lg border border-slate-200 text-slate-700 font-medium cursor-pointer"
                        >
                          {t.actions.edit}
                        </button>
                        {!isSelf && (
                          <button
                            type="button"
                            onClick={() => void handleToggleActive(u)}
                            className="flex-1 py-1.5 rounded-lg border border-slate-200 text-slate-700 font-medium cursor-pointer"
                          >
                            {u.isActive
                              ? isAr
                                ? 'إيقاف'
                                : 'Deactivate'
                              : isAr
                              ? 'تفعيل'
                              : 'Activate'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-xl border border-slate-200 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 sticky top-0 bg-white">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-cyan-800" />
                <h3 className="text-sm font-bold text-slate-900">
                  {editingUser
                    ? isAr
                      ? 'تعديل صلاحية المستخدم'
                      : 'Edit User Access'
                    : isAr
                    ? 'إضافة / تفعيل حساب مستخدم'
                    : 'Add / Activate User Account'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isAr ? 'معرّف المستخدم (User UID من المصادقة)' : 'Auth User UID (UUID)'}
                </label>
                <input
                  type="text"
                  required
                  disabled={Boolean(editingUser)}
                  value={uidInput}
                  onChange={(e) => setUidInput(e.target.value)}
                  placeholder="6ae38dd3-24cd-4c86-9477-87ce52c824c9"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono-num disabled:bg-slate-100 dir-ltr text-left"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  {isAr
                    ? 'يحصل المستخدم عليه تلقائياً بعد التسجيل من شاشة «إنشاء حساب جديد» أو من Supabase Authentication -> Users.'
                    : 'Obtained automatically when the user registers via Create Account or from Supabase Authentication -> Users.'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'الاسم بالإنجليزية' : 'Full Name (EN)'}
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ahmed Hassan"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'الاسم بالعربية' : 'Full Name (AR)'}
                  </label>
                  <input
                    type="text"
                    value={fullNameAr}
                    onChange={(e) => setFullNameAr(e.target.value)}
                    placeholder="أحمد حسن"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'البريد الإلكتروني' : 'Email'}
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="staff@porto-sokhna.com"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dir-ltr text-left"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'رقم الهاتف' : 'Phone'}
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+20 10..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono-num dir-ltr text-left"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'الدور والصلاحية' : 'Role'}
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
                  >
                    {ASSIGNABLE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {t.roles[r]}
                      </option>
                    ))}
                  </select>
                </div>

                {role === 'owner' && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {isAr ? 'ربط بسجل المالك (لعزل البيانات)' : 'Linked Owner Portfolio'}
                    </label>
                    <select
                      value={ownerId}
                      onChange={(e) => setOwnerId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
                    >
                      <option value="">
                        {isAr ? '-- اختر المالك --' : '-- Select Owner --'}
                      </option>
                      {owners.map((o) => (
                        <option key={o.id} value={o.id}>
                          {isAr ? o.fullNameAr : o.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded border-slate-300 text-cyan-800 focus:ring-cyan-700"
                />
                <span className="font-medium text-slate-800">
                  {isAr ? 'تفعيل الحساب للدخول للمنصة' : 'Account Active (Allow Sign In)'}
                </span>
              </label>

              {formError && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-800">
                  {formError}
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 font-medium cursor-pointer"
                >
                  {t.actions.cancel}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-cyan-800 hover:bg-cyan-900 text-white font-semibold cursor-pointer disabled:opacity-60"
                >
                  {saving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : t.actions.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
