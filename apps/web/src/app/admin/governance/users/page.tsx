'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Users, Search, Plus, User, Mail, Phone, Shield,
  CheckCircle2, XCircle, Edit2, UserX, X, Loader2, AlertCircle
} from 'lucide-react';

interface UserItem {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  role_id: string | null;
  phone: string | null;
  is_active: boolean;
  avatar_url: string | null;
  created_at: string;
  roles?: { name: string } | null;
  tenants?: { name: string } | null;
}

const ROLE_STYLES: Record<string, string> = {
  superadmin: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  admin:       'text-indigo-400 border-indigo-500/30 bg-indigo-500/10',
  coach:       'text-purple-400 border-purple-500/30 bg-purple-500/10',
  student:     'text-slate-400 border-slate-500/30 bg-slate-500/10',
};

export default function UserDirectoryPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deactivating, setDeactivating] = useState<string | null>(null);
  const [form, setForm] = useState({ email: '', password: '', firstName: '', lastName: '', phone: '', role: 'student' });

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/governance/users');
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setUsers(json.data.users);
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const filtered = users.filter(u =>
    `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(search.toLowerCase())
  );

  const addUser = async () => {
    if (!form.email || !form.password || !form.firstName || !form.lastName) {
      setErrorMsg('Please fill all required fields.'); return;
    }
    setAdding(true); setErrorMsg(null);
    try {
      const res = await fetch('/api/v1/governance/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, password: form.password, firstName: form.firstName, lastName: form.lastName, phone: form.phone, role: form.role }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setShowAddModal(false);
      setForm({ email: '', password: '', firstName: '', lastName: '', phone: '', role: 'student' });
      setSuccessMsg('User added successfully.');
      setTimeout(() => setSuccessMsg(null), 3000);
      await loadUsers();
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setAdding(false);
    }
  };

  const deactivateUser = async (userId: string) => {
    setDeactivating(userId);
    try {
      const res = await fetch('/api/v1/governance/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setSuccessMsg('User deactivated.');
      setTimeout(() => setSuccessMsg(null), 3000);
      await loadUsers();
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setDeactivating(null);
    }
  };

  // Group filtered users by role key
  const groups: Record<string, UserItem[]> = {};
  filtered.forEach(u => {
    const rKey = (u.roles?.name || u.role).toLowerCase();
    if (!groups[rKey]) groups[rKey] = [];
    groups[rKey].push(u);
  });

  // Determine sorted order for role groups
  const systemRolesOrder = ['super admin', 'superadmin', 'admin', 'coach', 'student'];
  const sortedRoleKeys = Array.from(new Set([...systemRolesOrder, ...Object.keys(groups)]))
    .filter(rKey => groups[rKey] && groups[rKey].length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/30 rounded-full text-indigo-400 text-[10px] font-bold tracking-wider uppercase mb-3 w-fit">
            <Users className="w-3.5 h-3.5" /> User Directory
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">User Management</h1>
          <p className="text-xs text-slate-400 mt-1">Manage academy staff, coaches, and administrators</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="h-10 px-5 rounded-xl btn-premium text-white font-bold text-xs flex items-center gap-2 cursor-pointer glow-indigo"
        >
          <Plus className="w-3.5 h-3.5" /> Add New User
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />{errorMsg}
          <button onClick={() => setErrorMsg(null)} className="ml-auto cursor-pointer"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      {successMsg && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />{successMsg}
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          className="w-full h-9 pl-9 pr-4 rounded-xl glass-input text-xs" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-indigo-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="glass-panel rounded-3xl border border-white/5 p-16 text-center">
          <Users className="w-10 h-10 mx-auto mb-3 text-slate-600" />
          <p className="text-sm text-slate-400">{search ? 'No users match your search.' : 'No users found in this academy.'}</p>
        </div>
      ) : (
        <div className="space-y-10">
          {sortedRoleKeys.map(roleKey => {
            const roleUsers = groups[roleKey];
            const sampleUser = roleUsers[0];
            const roleDisplayName = sampleUser.roles?.name || (sampleUser.role.charAt(0).toUpperCase() + sampleUser.role.slice(1));
            const styleKey = sampleUser.role.toLowerCase();
            const roleStyle = ROLE_STYLES[styleKey] ?? ROLE_STYLES.student;

            return (
              <div key={roleKey} className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* Role header with visual partition */}
                <div className="flex items-center gap-3">
                  <span className={`text-[9px] font-extrabold px-3 py-1 rounded-full border uppercase tracking-widest ${roleStyle}`}>
                    {roleDisplayName}s
                  </span>
                  <div className="h-px bg-white/10 flex-1" />
                  <span className="text-[10px] text-slate-500 font-extrabold tracking-wider uppercase">
                    {roleUsers.length} {roleUsers.length === 1 ? 'Member' : 'Members'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {roleUsers.map(user => {
                    const initials = `${user.first_name[0] ?? ''}${user.last_name[0] ?? ''}`.toUpperCase();
                    return (
                      <div key={user.id} className={`glass-panel rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg ${
                        user.is_active ? 'border-white/10 hover:border-white/15' : 'border-red-500/10 opacity-60'
                      }`}>
                        <div className="flex items-start gap-3 mb-3">
                          <div className="w-11 h-11 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-300 font-black text-sm shrink-0">
                            {initials || <User className="w-5 h-5" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-bold text-white truncate">{user.first_name} {user.last_name}</h4>
                            <p className="text-[10px] text-slate-500 font-mono truncate">{user.email}</p>
                            {user.tenants?.name && (
                              <div className="text-[9px] text-indigo-400 font-extrabold uppercase tracking-wide mt-1 truncate bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md w-fit">
                                {user.tenants.name}
                              </div>
                            )}
                          </div>
                          <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border uppercase tracking-wide shrink-0 ${roleStyle}`}>
                            {roleDisplayName}
                          </span>
                        </div>

                        <div className="space-y-1.5 mb-3">
                          {user.phone && (
                            <div className="flex items-center gap-2 text-[10px] text-slate-400">
                              <Phone className="w-3 h-3 text-slate-600" /> {user.phone}
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-[10px]">
                            {user.is_active
                              ? <><CheckCircle2 className="w-3 h-3 text-emerald-500" /><span className="text-emerald-400">Active</span></>
                              : <><XCircle className="w-3 h-3 text-red-500" /><span className="text-red-400">Deactivated</span></>}
                          </div>
                        </div>

                        {user.is_active && (
                          <button
                            onClick={() => deactivateUser(user.id)}
                            disabled={deactivating === user.id}
                            className="w-full h-8 rounded-xl border border-red-500/20 hover:border-red-500/40 bg-red-500/5 hover:bg-red-500/10 text-red-400 text-[10px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                          >
                            {deactivating === user.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserX className="w-3 h-3" />}
                            Deactivate
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass-panel rounded-3xl border border-white/10 p-6 w-full max-w-md shadow-2xl mx-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-black text-white">Add New User</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {[['First Name', 'firstName', 'text'], ['Last Name', 'lastName', 'text']].map(([label, key, type]) => (
                  <div key={key} className="space-y-1">
                    <label className="text-slate-400 text-[10px] font-extrabold uppercase tracking-wide block">{label}</label>
                    <input type={type} value={(form as any)[key]} onChange={e => setForm(f => ({...f, [key]: e.target.value}))}
                      className="w-full h-9 px-3 rounded-xl glass-input text-xs" />
                  </div>
                ))}
              </div>
              {[['Email', 'email', 'email'], ['Password', 'password', 'password'], ['Phone (Optional)', 'phone', 'tel']].map(([label, key, type]) => (
                <div key={key} className="space-y-1">
                  <label className="text-slate-400 text-[10px] font-extrabold uppercase tracking-wide block">{label}</label>
                  <input type={type} value={(form as any)[key]} onChange={e => setForm(f => ({...f, [key]: e.target.value}))}
                    className="w-full h-9 px-3 rounded-xl glass-input text-xs" />
                </div>
              ))}
              <div className="space-y-1">
                <label className="text-slate-400 text-[10px] font-extrabold uppercase tracking-wide block">Role</label>
                <select value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))}
                  className="w-full h-9 px-3 rounded-xl glass-input text-xs font-bold">
                  <option value="admin">Admin</option>
                  <option value="student">Student</option>
                </select>
                <p className="text-slate-500 text-[10px]">
                  To add a coach, use &ldquo;Onboard New Coach&rdquo; on the Coaches page — coach accounts need a full profile that this form doesn&apos;t collect.
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAddModal(false)} className="flex-1 h-9 rounded-xl border border-white/10 text-slate-400 text-xs font-bold cursor-pointer hover:bg-white/5 transition-all">Cancel</button>
              <button onClick={addUser} disabled={adding} className="flex-1 h-9 rounded-xl btn-premium text-white text-xs font-bold cursor-pointer glow-indigo flex items-center justify-center gap-1.5">
                {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
