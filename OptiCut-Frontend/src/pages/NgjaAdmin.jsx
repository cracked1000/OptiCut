import { useState, useEffect, useCallback } from 'react';
import { isAddress } from 'ethers';
import { useBlockchain, friendlyError } from '../hooks/useBlockchain.jsx';
import { 
  Shield, Plus, Trash2, Loader2, RefreshCw, 
  CheckCircle2, AlertTriangle, X, Users, Globe, 
  FlaskConical, ArrowRight, Search, Filter
} from 'lucide-react';

const formatDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString('en-US', {
  year: 'numeric', month: 'short', day: 'numeric'
}) : '—';

const shortAddr = (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '—';

// ── Stat Card ──
function StatCard({ label, value, icon: Icon }) {
  return (
    <div className="stat-card hover-lift">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-[var(--color-bg-hover)] border border-[var(--color-border-default)] flex items-center justify-center flex-shrink-0">
          <Icon size={22} className="text-[var(--color-text-primary)]" />
        </div>
        <div>
          <p className="text-2xl font-extrabold text-[var(--color-text-primary)]">{value}</p>
          <p className="text-xs text-[var(--color-text-muted)] font-semibold uppercase tracking-wider">{label}</p>
        </div>
      </div>
    </div>
  );
}

// ── Toast ──
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`toast toast-${type}`}>
      {type === 'success' && <CheckCircle2 size={18} />}
      {type === 'error' && <AlertTriangle size={18} />}
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="p-1 hover:bg-white/10 rounded transition">
        <X size={14} />
      </button>
    </div>
  );
}

// ── Confirm Dialog ──
function ConfirmDialog({ isOpen, title, message, onConfirm, onCancel, confirmText = 'Confirm', isLoading = false }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <AlertTriangle size={20} className="text-red-400" />
            </div>
            <h3 className="text-lg font-bold text-[var(--color-text-primary)]">{title}</h3>
          </div>
        </div>
        <div className="modal-body">
          <p className="text-[var(--color-text-muted)] text-sm">{message}</p>
        </div>
        <div className="modal-footer">
          <button onClick={onCancel} className="btn btn-secondary flex-1" disabled={isLoading}>
            Cancel
          </button>
          <button onClick={onConfirm} className="btn btn-danger flex-1" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Trash2 size={14} />
                {confirmText}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ──
export default function NgjaAdmin() {
  const { account, connect, isNgjaAdmin, loading, grantLab, revokeLab, getAuthorizedLabs } = useBlockchain();

  const [labs, setLabs] = useState([]);
  const [labsLoading, setLabsLoading] = useState(false);
  const [labsError, setLabsError] = useState(null);

  // ✅ UPDATED: separate state for address and name inputs
  const [newLabAddress, setNewLabAddress] = useState('');
  const [newLabName, setNewLabName] = useState('');
  const [grantLoading, setGrantLoading] = useState(false);
  const [grantMsg, setGrantMsg] = useState(null);

  const [revokeLoading, setRevokeLoading] = useState(null);
  const [confirmRevoke, setConfirmRevoke] = useState(null);

  const [toast, setToast] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  const loadLabs = useCallback(async () => {
    setLabsLoading(true);
    setLabsError(null);
    try {
      const result = await getAuthorizedLabs();
      setLabs(result);
    } catch (err) {
      console.error("Failed to load labs:", err);
      setLabsError(err?.message || "Failed to load lab list.");
    } finally {
      setLabsLoading(false);
    }
  }, [getAuthorizedLabs]);

  useEffect(() => {
    if (isNgjaAdmin && account) {
      loadLabs();
    }
  }, [isNgjaAdmin, account, loadLabs]);

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-3 border-[var(--color-border-default)] border-t-[var(--color-text-primary)] animate-spin" />
          </div>
          <p className="text-[var(--color-text-muted)] text-sm font-medium">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  // ── Not Connected ──
  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-fade-in">
        <div className="w-20 h-20 rounded-2xl bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] flex items-center justify-center">
          <Shield size={36} className="text-[var(--color-text-muted)]" />
        </div>
        <div className="text-center space-y-3">
          <h2 className="text-3xl font-extrabold text-[var(--color-text-primary)] tracking-tight">NGJA Admin Panel</h2>
          <p className="text-[var(--color-text-muted)] max-w-sm mx-auto">Connect your NGJA admin wallet to manage authorized gem laboratories</p>
        </div>
        <button
          id="connect-wallet-admin-btn"
          onClick={connect}
          className="btn btn-primary btn-lg"
        >
          <Shield size={18} />
          Connect Wallet
        </button>
      </div>
    );
  }

  // ── Not Admin ──
  if (!isNgjaAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 animate-fade-in">
        <div className="w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <AlertTriangle size={36} className="text-red-400" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-red-400">Access Denied</h2>
          <p className="text-[var(--color-text-muted)]">Your wallet does not have NGJA_ADMIN_ROLE.</p>
          <p className="mono-addr mt-4">{account}</p>
        </div>
      </div>
    );
  }

  // ── Handlers ──
  const handleGrant = async (e) => {
    e.preventDefault();
    setGrantMsg(null);

    const addr = newLabAddress.trim();
    const name = newLabName.trim();

    // ✅ UPDATED: validate both address and name before submitting
    if (!isAddress(addr)) {
      setGrantMsg({ type: 'error', text: 'Invalid Ethereum address. Please enter a valid 0x... address.' });
      return;
    }
    if (!name) {
      setGrantMsg({ type: 'error', text: 'Lab name is required. Please enter the laboratory name.' });
      return;
    }

    setGrantLoading(true);
    setGrantMsg({ type: 'info', text: 'Confirm the transaction in MetaMask...' });
    try {
      // ✅ UPDATED: pass name as second argument to grantLab
      await grantLab(addr, name);
      setGrantMsg({ type: 'success', text: `${name} (${shortAddr(addr)}) successfully authorized.` });
      setNewLabAddress('');
      setNewLabName('');
      showToast(`${name} authorized successfully`, 'success');
      await loadLabs();
    } catch (err) {
      const msg = friendlyError(err);
      setGrantMsg({ type: 'error', text: msg });
      showToast(msg, 'error');
    }
    setGrantLoading(false);
  };

  const handleRevoke = async (address) => {
    setRevokeLoading(address);
    try {
      await revokeLab(address);
      showToast(`Lab access revoked for ${shortAddr(address)}`, 'success');
      await loadLabs();
    } catch (err) {
      showToast(friendlyError(err), 'error');
    }
    setRevokeLoading(null);
    setConfirmRevoke(null);
  };

  // ✅ UPDATED: search now matches on name too, not just addresses
  const filteredLabs = labs.filter(lab => 
    (lab.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    lab.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
    lab.authorizedBy.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-6">
      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={!!confirmRevoke}
        title="Revoke Lab Access"
        message={`Are you sure you want to revoke LAB_ROLE from ${shortAddr(confirmRevoke)}? This action cannot be undone.`}
        onConfirm={() => handleRevoke(confirmRevoke)}
        onCancel={() => setConfirmRevoke(null)}
        confirmText="Revoke Access"
        isLoading={revokeLoading === confirmRevoke}
      />

      {/* Header */}
      <header className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-500/5 border border-blue-500/15 rounded-full mb-4">
          <Shield size={14} className="text-blue-500" />
          <span className="text-blue-500 text-xs font-bold uppercase tracking-wider">Administration</span>
        </div>
        <h1 className="text-3xl font-extrabold text-[var(--color-text-primary)] tracking-tight mb-3">NGJA Admin Panel</h1>
        <div className="flex items-center justify-center gap-3">
          <span className="mono-addr">{shortAddr(account)}</span>
          <span className="badge badge-blue">NGJA Administrator</span>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="Authorized Labs" value={labs.length} icon={FlaskConical} />
        <StatCard label="Total Labs" value={labs.length} icon={Users} />
        <StatCard label="Network" value="Polygon Amoy" icon={Globe} />
      </div>

      {/* ── DESKTOP GRID LAYOUT ── */}
      <div className="dashboard-grid">
        {/* Left Sidebar - Grant Form */}
        <div className="dashboard-sidebar">
          <div className="card">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-[var(--color-bg-hover)] border border-[var(--color-border-default)] flex items-center justify-center">
                <Plus size={18} className="text-[var(--color-text-primary)]" />
              </div>
              <div>
                <h2 className="section-title text-base">Authorize New Laboratory</h2>
                <p className="section-sub">Grant LAB_ROLE to a gem laboratory wallet address</p>
              </div>
            </div>

            <form onSubmit={handleGrant} className="space-y-4">
              {/* ✅ NEW: Lab name field */}
              <div>
                <label className="label">Lab Name</label>
                <input
                  id="new-lab-name"
                  type="text"
                  value={newLabName}
                  onChange={(e) => { setNewLabName(e.target.value); setGrantMsg(null); }}
                  placeholder="e.g. Ceylon Gem Labs"
                  className="input text-sm"
                  required
                />
              </div>

              <div>
                <label className="label">Lab Wallet Address</label>
                <input
                  id="new-lab-address"
                  type="text"
                  value={newLabAddress}
                  onChange={(e) => { setNewLabAddress(e.target.value); setGrantMsg(null); }}
                  placeholder="0x..."
                  className="input font-mono text-sm"
                  required
                />
              </div>

              {grantMsg && (
                <div className={`p-4 rounded-xl text-sm font-medium flex items-start gap-3 ${
                  grantMsg.type === 'success' ? 'bg-emerald-500/5 border border-emerald-500/15 text-emerald-500'
                  : grantMsg.type === 'info' ? 'bg-blue-500/5 border border-blue-500/15 text-blue-500'
                  : 'bg-red-500/5 border border-red-500/15 text-red-400'
                }`}>
                  {grantMsg.type === 'success' ? <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" /> 
                  : grantMsg.type === 'info' ? <Loader2 size={16} className="flex-shrink-0 mt-0.5 animate-spin" />
                  : <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />}
                  {grantMsg.text}
                </div>
              )}

              <button
                id="grant-lab-btn"
                type="submit"
                disabled={grantLoading}
                className="btn btn-primary w-full"
              >
                {grantLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Authorizing...
                  </>
                ) : (
                  <>
                    <Plus size={16} />
                    Grant Lab Access
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Right Content - Lab List */}
        <div className="card">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--color-bg-hover)] border border-[var(--color-border-default)] flex items-center justify-center">
                <FlaskConical size={18} className="text-[var(--color-text-primary)]" />
              </div>
              <div>
                <h2 className="section-title text-base">Registered Laboratories</h2>
                <p className="section-sub">{labs.length} active {labs.length === 1 ? 'laboratory' : 'laboratories'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search labs..."
                  className="input pl-9 py-2 text-sm w-48"
                />
              </div>
              <button
                onClick={loadLabs}
                disabled={labsLoading}
                className="btn btn-ghost btn-sm"
              >
                <RefreshCw size={14} className={labsLoading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
          </div>

          {labsLoading ? (
            <div className="flex justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <div className="w-8 h-8 rounded-full border-2 border-[var(--color-border-default)] border-t-[var(--color-text-primary)] animate-spin" />
                </div>
                <p className="text-[var(--color-text-muted)] text-sm">Loading laboratories...</p>
              </div>
            </div>
          ) : labsError ? (
            <div className="alert alert-error">
              <AlertTriangle size={16} />
              <div>
                <p className="font-bold text-sm">Could not load lab list</p>
                <p className="text-xs text-red-400/70 mt-1">{labsError}</p>
              </div>
              <button onClick={loadLabs} className="btn btn-sm btn-danger ml-auto">Retry</button>
            </div>
          ) : filteredLabs.length === 0 ? (
            <div className="empty-state py-12">
              <div className="empty-state-icon">
                <FlaskConical size={28} className="text-[var(--color-text-muted)]" />
              </div>
              <p className="text-[var(--color-text-secondary)] font-medium text-sm">
                {searchQuery ? 'No labs match your search' : 'No laboratories authorized yet'}
              </p>
              <p className="text-[var(--color-text-muted)] text-xs mt-1">
                {searchQuery ? 'Try a different search term' : 'Use the form to authorize the first lab'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredLabs.map((lab) => (
                <div 
                  key={lab.address} 
                  className="flex items-center gap-4 p-4 bg-[var(--color-bg-tertiary)] rounded-xl border border-[var(--color-border-subtle)] hover:border-[var(--color-border-default)] transition-all group"
                >
                  <div className="w-10 h-10 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border-default)] flex items-center justify-center flex-shrink-0">
                    <FlaskConical size={18} className="text-[var(--color-text-muted)]" />
                  </div>

                  {/* ✅ UPDATED: Lab name shown as primary text, address as secondary */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
                      {lab.name || 'Unnamed Lab'}
                    </p>
                    <p className="mono-addr text-xs inline-block mt-0.5">{lab.address}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-[var(--color-text-muted)]">
                      <span className="flex items-center gap-1">
                        <Shield size={10} />
                        by {shortAddr(lab.authorizedBy)}
                      </span>
                      <span>·</span>
                      <span>{formatDate(lab.timestamp)}</span>
                    </div>
                  </div>

                  <button
                    id={`revoke-${lab.address}`}
                    onClick={() => setConfirmRevoke(lab.address)}
                    disabled={revokeLoading === lab.address}
                    className="btn btn-danger btn-sm flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    {revokeLoading === lab.address ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <>
                        <Trash2 size={14} />
                        Revoke
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}