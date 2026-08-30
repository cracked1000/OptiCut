import { useState, useEffect, useCallback } from 'react';
import { isAddress } from 'ethers';
import { useBlockchain, friendlyError } from '../hooks/useBlockchain.jsx';
import { 
  Shield, Plus, Trash2, Loader2, RefreshCw, 
  CheckCircle2, AlertTriangle, X, Users, Globe, 
  FlaskConical, ArrowRight, Search, Filter,
  ChevronDown, ChevronRight, Unlock, Gem, Send, Info
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

// ── Stone status helpers ──
const STATUS_META = {
  0: { label: 'Active', cls: 'badge-emerald' },
  1: { label: 'Pending', cls: 'badge-amber' },
  2: { label: 'Burned', cls: 'badge-red' },
};
const statusMeta = (s) => STATUS_META[s] || { label: 'Unknown', cls: 'badge-gray' };

// ── Reassign dialog: pick a destination lab (or NGJA) for a stuck gem ──
function ReassignDialog({ isOpen, gem, activeLabs, ngjaAddress, onConfirm, onCancel, isLoading }) {
  const [dest, setDest] = useState('');
  useEffect(() => { if (isOpen) setDest(''); }, [isOpen, gem]);
  if (!isOpen) return null;

  const valid = isAddress((dest || '').trim());

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Send size={20} className="text-blue-400" />
            </div>
            <h3 className="text-lg font-bold text-[var(--color-text-primary)]">
              Reassign Gem #{gem?.tokenId}
            </h3>
          </div>
        </div>
        <div className="modal-body space-y-4">
          <p className="text-[var(--color-text-muted)] text-sm">
            Move this gem to a new custodian and reset it to <b>Active</b>. Choose an
            authorized lab to continue its transformation, or hold it under NGJA custody.
          </p>

          {activeLabs.length > 0 && (
            <div>
              <label className="label">Authorized labs</label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {activeLabs.map((lab) => (
                  <button
                    key={lab.address}
                    type="button"
                    onClick={() => setDest(lab.address)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      dest.toLowerCase() === lab.address.toLowerCase()
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-[var(--color-border-subtle)] hover:border-[var(--color-border-default)]'
                    }`}
                  >
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">{lab.name || 'Unnamed Lab'}</p>
                    <p className="mono-addr text-xs">{shortAddr(lab.address)}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setDest(ngjaAddress)}
            className={`w-full text-left p-3 rounded-xl border transition-all ${
              dest.toLowerCase() === (ngjaAddress || '').toLowerCase()
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-[var(--color-border-subtle)] hover:border-[var(--color-border-default)]'
            }`}
          >
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">Hold under NGJA custody</p>
            <p className="mono-addr text-xs">{shortAddr(ngjaAddress)} · park until reassigned</p>
          </button>

          <div>
            <label className="label">Or paste a custodian address</label>
            <input
              type="text"
              value={dest}
              onChange={(e) => setDest(e.target.value)}
              placeholder="0x..."
              className="input font-mono text-sm"
            />
            {dest && !valid && (
              <p className="text-xs text-red-400 mt-1">Not a valid Ethereum address.</p>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onCancel} className="btn btn-secondary flex-1" disabled={isLoading}>Cancel</button>
          <button
            onClick={() => onConfirm(dest.trim())}
            className="btn btn-primary flex-1"
            disabled={isLoading || !valid}
          >
            {isLoading ? (<><Loader2 size={14} className="animate-spin" />Reassigning...</>)
                       : (<><Send size={14} />Reassign & Activate</>)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── One revoked lab row: expandable, shows its gems + recovery actions ──
function RevokedLabCard({ lab, activeLabs, ngjaAddress, busyToken, onRelease, onReassign, onRestore, restoring }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-[var(--color-bg-tertiary)] rounded-xl border border-[var(--color-border-subtle)] overflow-hidden">
      <div className="w-full flex items-center gap-4 p-4 hover:bg-[var(--color-bg-hover)] transition-colors text-left">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-4 flex-1 min-w-0 text-left"
          aria-label={`Toggle gems for ${lab.name || 'lab'}`}
        >
          {open ? <ChevronDown size={18} className="text-[var(--color-text-muted)] flex-shrink-0" />
                : <ChevronRight size={18} className="text-[var(--color-text-muted)] flex-shrink-0" />}
          <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
            <FlaskConical size={18} className="text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{lab.name || 'Unnamed Lab'}</p>
              <span className="badge badge-red">Revoked</span>
            </div>
            <p className="mono-addr text-xs inline-block mt-0.5">{lab.address}</p>
          </div>
        </button>

        <div className="flex items-center gap-2 flex-shrink-0">
          {lab.stuckCount > 0 && (
            <span className="badge badge-amber">{lab.stuckCount} stuck</span>
          )}
          <span className="text-xs text-[var(--color-text-muted)] hidden sm:inline">{lab.gems.length} gems</span>
          <button
            onClick={onRestore}
            disabled={restoring}
            className="btn btn-success btn-sm"
            title="Re-activate this lab — restores its LAB_ROLE (gems stay with it)"
          >
            {restoring ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            Restore Access
          </button>
        </div>
      </div>

      {open && (
        <div className="px-4 pb-4 border-t border-[var(--color-border-subtle)]">
          {lab.gems.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)] py-4">This lab never minted any gems.</p>
          ) : (
            <div className="space-y-2 pt-3">
              {lab.gems.map((gem) => {
                const meta = statusMeta(gem.status);
                const canRecover = gem.status === 1 && gem.heldByLab; // Pending + still held
                const isBusy = busyToken === gem.tokenId;
                return (
                  <div key={gem.tokenId} className="flex items-center gap-3 p-4 bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border-subtle)] hover:border-[var(--color-border-hover)] transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-[var(--color-bg-hover)] flex items-center justify-center flex-shrink-0">
                      <Gem size={15} className="text-[var(--color-text-muted)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-[var(--color-text-primary)]">Gem #{gem.tokenId}</p>
                        <span className={`badge ${meta.cls}`}>{meta.label}</span>
                        {gem.status === 1 && !gem.heldByLab && (
                          <span className="text-[10px] text-[var(--color-text-muted)]">held elsewhere</span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {(gem.weight / 100).toFixed(2)} ct · {gem.stoneState || '—'}
                      </p>
                    </div>
                    {canRecover ? (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => onRelease(gem)}
                          disabled={isBusy}
                          className="btn btn-secondary btn-sm"
                          title="Reset to Active, keep in this wallet"
                        >
                          {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Unlock size={13} />}
                          Release
                        </button>
                        <button
                          onClick={() => onReassign(gem)}
                          disabled={isBusy}
                          className="btn btn-primary btn-sm"
                          title="Move to another lab or NGJA and reset to Active"
                        >
                          <Send size={13} />
                          Reassign
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--color-text-muted)] flex-shrink-0">
                        {gem.status === 2 ? 'Transformed' : 'No action needed'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Recovery panel: lists revoked labs and their recoverable gems ──
function RevokedLabsPanel({ showToast, onLabsChanged }) {
  const {
    account, getRevokedLabsWithGems, getActiveLabs,
    cancelTransformation, adminReassignStone, grantLab,
  } = useBlockchain();

  const [revokedLabs, setRevokedLabs] = useState([]);
  const [activeLabs, setActiveLabs] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState(null);
  const [busyToken, setBusyToken] = useState(null);
  const [reassignGem, setReassignGem] = useState(null);
  const [reassignLoading, setReassignLoading] = useState(false);
  const [restoringLab, setRestoringLab] = useState(null);

  const load = useCallback(async () => {
    setLoadingData(true);
    setError(null);
    try {
      const [revoked, active] = await Promise.all([
        getRevokedLabsWithGems(),
        getActiveLabs(),
      ]);
      setRevokedLabs(revoked);
      setActiveLabs(active);
    } catch (err) {
      console.error('Failed to load revoked labs:', err);
      setError(friendlyError(err));
    } finally {
      setLoadingData(false);
    }
  }, [getRevokedLabsWithGems, getActiveLabs]);

  useEffect(() => { if (account) load(); }, [account, load]);

  const totalStuck = revokedLabs.reduce((n, l) => n + l.stuckCount, 0);

  const handleRelease = async (gem) => {
    setBusyToken(gem.tokenId);
    try {
      await cancelTransformation(gem.tokenId);
      showToast(`Gem #${gem.tokenId} released and set to Active`, 'success');
      await load();
    } catch (err) {
      showToast(friendlyError(err), 'error');
    }
    setBusyToken(null);
  };

  const handleReassign = async (destination) => {
    if (!reassignGem) return;
    setReassignLoading(true);
    try {
      await adminReassignStone(reassignGem.tokenId, destination);
      showToast(`Gem #${reassignGem.tokenId} reassigned to ${shortAddr(destination)}`, 'success');
      setReassignGem(null);
      await load();
    } catch (err) {
      showToast(friendlyError(err), 'error');
    }
    setReassignLoading(false);
  };

  // Re-grant LAB_ROLE to a previously revoked lab — the contract clears the
  // revoked flag and keeps the same record (no duplicate entry).
  const handleRestore = async (lab) => {
    setRestoringLab(lab.address);
    try {
      await grantLab(lab.address, lab.name || 'Lab');
      showToast(`${lab.name || 'Lab'} has been re-activated successfully`, 'success');
      await load();            // refresh the recovery panel
      if (onLabsChanged) await onLabsChanged(); // refresh the main labs list + counts
    } catch (err) {
      showToast(friendlyError(err), 'error');
    }
    setRestoringLab(null);
  };

  return (
    <div className="card">
      <ReassignDialog
        isOpen={!!reassignGem}
        gem={reassignGem}
        activeLabs={activeLabs}
        ngjaAddress={account}
        onConfirm={handleReassign}
        onCancel={() => setReassignGem(null)}
        isLoading={reassignLoading}
      />

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <AlertTriangle size={18} className="text-red-400" />
          </div>
          <div>
            <h2 className="section-title text-base">Revoked Labs &amp; Gem Recovery</h2>
            <p className="section-sub">
              {revokedLabs.length} revoked {revokedLabs.length === 1 ? 'lab' : 'labs'}
              {totalStuck > 0 && <> · <span className="text-amber-500 font-semibold">{totalStuck} gem{totalStuck === 1 ? '' : 's'} need attention</span></>}
            </p>
          </div>
        </div>
        <button onClick={load} disabled={loadingData} className="btn btn-ghost btn-sm">
          <RefreshCw size={14} className={loadingData ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {loadingData ? (
        <div className="flex justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-[var(--color-border-default)] border-t-[var(--color-text-primary)] animate-spin" />
            <p className="text-[var(--color-text-muted)] text-sm">Scanning revoked labs...</p>
          </div>
        </div>
      ) : error ? (
        <div className="alert alert-error">
          <AlertTriangle size={16} />
          <div>
            <p className="font-bold text-sm">Could not load recovery data</p>
            <p className="text-xs text-red-400/70 mt-1">{error}</p>
          </div>
          <button onClick={load} className="btn btn-sm btn-danger ml-auto">Retry</button>
        </div>
      ) : revokedLabs.length === 0 ? (
        <div className="empty-state py-12">
          <div className="empty-state-icon">
            <CheckCircle2 size={28} className="text-emerald-500" />
          </div>
          <p className="text-[var(--color-text-secondary)] font-medium text-sm">No revoked labs</p>
          <p className="text-[var(--color-text-muted)] text-xs mt-1">Revoked labs and any gems they left behind will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {revokedLabs.map((lab) => (
            <RevokedLabCard
              key={lab.address}
              lab={lab}
              activeLabs={activeLabs}
              ngjaAddress={account}
              busyToken={busyToken}
              onRelease={handleRelease}
              onReassign={(gem) => setReassignGem(gem)}
              onRestore={() => handleRestore(lab)}
              restoring={restoringLab === lab.address}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── NGJA custody panel ──
// A stone parked "under NGJA custody" (via adminReassignStone) has no other
// screen anywhere in the app that lists it — the admin wallet holds no
// LAB_ROLE, so it never reaches the Lab Portal dashboard that normally lists
// stones by current custodian. Without this panel, a parked stone is only
// findable by manually typing its token ID into the public verify page,
// which reads exactly like the stone "disappeared." This panel closes that
// gap by listing whatever the connected admin wallet currently holds, with
// a one-click way to hand it on to a real lab.
function NgjaCustodyPanel({ showToast }) {
  const { account, getStonesForAccount, getActiveLabs, adminReassignStone } = useBlockchain();

  const [stones, setStones] = useState([]);
  const [activeLabs, setActiveLabs] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState(null);
  const [reassignGem, setReassignGem] = useState(null);
  const [reassignLoading, setReassignLoading] = useState(false);

  const load = useCallback(async () => {
    if (!account) return;
    setLoadingData(true);
    setError(null);
    try {
      const [mine, active] = await Promise.all([
        getStonesForAccount(account),
        getActiveLabs(),
      ]);
      // Only ever Active here in practice (adminReassignStone always resets
      // status to Active), but filtering defensively in case custody was
      // gained some other way.
      setStones(mine.filter((s) => s.status !== 2));
      setActiveLabs(active);
    } catch (err) {
      console.error('Failed to load NGJA-held stones:', err);
      setError(friendlyError(err));
    } finally {
      setLoadingData(false);
    }
  }, [account, getStonesForAccount, getActiveLabs]);

  useEffect(() => { load(); }, [load]);

  const handleReassign = async (destination) => {
    if (!reassignGem) return;
    setReassignLoading(true);
    try {
      await adminReassignStone(reassignGem.tokenId, destination);
      showToast(`Gem #${reassignGem.tokenId} handed off to ${shortAddr(destination)}`, 'success');
      setReassignGem(null);
      await load();
    } catch (err) {
      showToast(friendlyError(err), 'error');
    }
    setReassignLoading(false);
  };

  if (!loadingData && !error && stones.length === 0) {
    // Nothing parked under NGJA right now — no need to take up space with
    // an empty-state card the admin has to scroll past every visit.
    return null;
  }

  return (
    <div className="card">
      <ReassignDialog
        isOpen={!!reassignGem}
        gem={reassignGem}
        activeLabs={activeLabs}
        ngjaAddress={account}
        onConfirm={handleReassign}
        onCancel={() => setReassignGem(null)}
        isLoading={reassignLoading}
      />

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Shield size={18} className="text-blue-400" />
          </div>
          <div>
            <h2 className="section-title text-base">Stones in NGJA Custody</h2>
            <p className="section-sub">
              Parked here after a rescue reassignment — not held by any lab right now.
            </p>
          </div>
        </div>
        <button onClick={load} disabled={loadingData} className="btn btn-ghost btn-sm">
          <RefreshCw size={14} className={loadingData ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="alert alert-error">
          <AlertTriangle size={16} />
          <div>
            <p className="font-bold text-sm">Could not load NGJA-held stones</p>
            <p className="text-xs text-red-400/70 mt-1">{error}</p>
          </div>
          <button onClick={load} className="btn btn-sm btn-danger ml-auto">Retry</button>
        </div>
      ) : (
        <div className="space-y-2">
          {stones.map((gem) => (
            <div key={gem.tokenId} className="flex items-center gap-3 p-4 bg-[var(--color-bg-tertiary)] rounded-xl border border-[var(--color-border-subtle)]">
              <div className="w-8 h-8 rounded-lg bg-[var(--color-bg-hover)] flex items-center justify-center flex-shrink-0">
                <Gem size={15} className="text-[var(--color-text-muted)]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">Gem #{gem.tokenId}</p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {(gem.weight / 100).toFixed(2)} ct · {gem.stoneState || '—'} · {gem.isHeated ? 'Heated' : 'Natural'}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <a href={`/?id=${gem.tokenId}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm" title="Open on the public verify page">
                  View
                </a>
                <button onClick={() => setReassignGem(gem)} className="btn btn-primary btn-sm">
                  <Send size={13} />
                  Hand to a lab
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──
export default function NgjaAdmin() {
  const { account, connect, isNgjaAdmin, loading, grantLab, revokeLab, getAuthorizedLabs, getActiveLabs } = useBlockchain();

  const [labs, setLabs] = useState([]);
  const [totalLabs, setTotalLabs] = useState(0);
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
      // Active labs go in the "Registered Laboratories" list & Authorized count;
      // all labs (incl. revoked) feed the "Total Labs" stat.
      const [active, all] = await Promise.all([
        getActiveLabs(),
        getAuthorizedLabs(),
      ]);
      setLabs(active || []);
      setTotalLabs((all || []).length);
    } catch (err) {
      console.error("Failed to load labs:", err);
      setLabsError(err?.message || "Failed to load lab list.");
    } finally {
      setLabsLoading(false);
    }
  }, [getActiveLabs, getAuthorizedLabs]);

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
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8">
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
        <span className="eyebrow mb-4"><Shield size={13} /> Administration</span>
        <h1 className="text-4xl font-extrabold text-[var(--color-text-primary)] tracking-tight mb-3">
          NGJA <span className="gradient-text">Admin Panel</span>
        </h1>
        <p className="text-[var(--color-text-muted)] text-sm max-w-md mx-auto mb-4">
          Authorize laboratories and keep the network safe — every action is recorded on-chain.
        </p>
        <div className="flex items-center justify-center gap-3">
          <span className="mono-addr">{shortAddr(account)}</span>
          <span className="badge badge-blue">NGJA Administrator</span>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="Authorized Labs" value={labs.length} icon={FlaskConical} />
        <StatCard label="Total Labs" value={totalLabs} icon={Users} />
        <StatCard label="Network" value="Polygon Amoy" icon={Globe} />
      </div>

      {/* ── DESKTOP GRID LAYOUT ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Authorize Form */}
        <div className="lg:col-span-1 card p-6 lg:p-7">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-11 h-11 rounded-xl bg-[var(--color-accent-glow)] border border-[var(--color-accent-ring)] flex items-center justify-center">
                <Plus size={20} className="text-[var(--color-accent)]" />
              </div>
              <div>
                <h2 className="section-title">Authorize New Laboratory</h2>
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
                <p className="hint">
                  <Info size={14} />
                  The lab's display name — shown to customers on certificates.
                </p>
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
                <p className="hint">
                  <Info size={14} />
                  The wallet this lab will use to mint and transform stones on-chain.
                </p>
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

        {/* Registered Laboratories */}
        <div className="lg:col-span-2 card p-6 lg:p-7">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[var(--color-accent-glow)] border border-[var(--color-accent-ring)] flex items-center justify-center">
                <FlaskConical size={20} className="text-[var(--color-accent)]" />
              </div>
              <div>
                <h2 className="section-title">Registered Laboratories</h2>
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
              {filteredLabs.map((lab) => {
                const isSelf = lab.address.toLowerCase() === account.toLowerCase();
                return (
                  <div 
                    key={lab.address} 
                    className="flex items-center gap-4 p-4 sm:p-5 bg-[var(--color-bg-tertiary)] rounded-2xl border border-[var(--color-border-subtle)] hover:border-[var(--color-accent-ring)] hover:shadow-[var(--shadow-glow)] transition-all group"
                  >
                    <div className="w-11 h-11 rounded-xl bg-[var(--color-accent-glow)] border border-[var(--color-accent-ring)] flex items-center justify-center flex-shrink-0">
                      <FlaskConical size={20} className="text-[var(--color-accent)]" />
                    </div>

                    {/* ✅ UPDATED: Lab name shown as primary text, address as secondary */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">
                          {lab.name || 'Unnamed Lab'}
                        </p>
                        <span className="badge badge-green text-[9px]">Authorized</span>
                        {/* ✅ NEW: flag the NGJA admin's own bootstrap lab entry so it isn't
                            mistaken for a normal third-party lab */}
                        {isSelf && <span className="badge badge-blue text-[9px]">Your Admin Wallet</span>}
                      </div>
                      <p className="mono-addr text-xs inline-block mt-1">{lab.address}</p>
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
                      disabled={revokeLoading === lab.address || isSelf}
                      title={isSelf ? "This is your connected NGJA admin wallet — revoke its lab role from a different admin session if you really need to." : undefined}
                      className="btn btn-danger btn-sm flex-shrink-0 transition-opacity"
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
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ✅ NEW: stones parked under NGJA custody after a rescue reassignment */}
      <NgjaCustodyPanel showToast={showToast} />

      {/* ✅ NEW: Revoked labs & gem recovery */}
      <RevokedLabsPanel showToast={showToast} onLabsChanged={loadLabs} />
    </div>
  );
}