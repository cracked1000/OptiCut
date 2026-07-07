import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBlockchain, friendlyError } from '../hooks/useBlockchain.jsx';
import { uploadToPinata } from '../utils/pinata';
import QRGenerator from '../components/QRGenerator';
import { 
  Plus, Lock, Scissors, Gem, Upload, X, CheckCircle2, 
  AlertTriangle, Loader2, ChevronDown, ChevronUp, Trash2,
  ArrowRight, FileCheck, Clock, Flame, FlaskConical, Diamond
} from 'lucide-react';

const STONE_STATES = ['Rough', 'Preform', 'Cut', 'Polished'];

const formatWeight = (raw) => (raw / 100).toFixed(2) + ' ct';
const formatDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const shortAddr = (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '—';

const STATUS_LABELS = { 0: 'Active', 1: 'Pending', 2: 'Burned' };
const STATUS_CONFIG = {
  0: { badge: 'badge-green', icon: CheckCircle2 },
  1: { badge: 'badge-amber', icon: Clock },
  2: { badge: 'badge-gray', icon: Flame },
};

const STATE_STYLES = {
  'Rough': { bg: 'bg-stone-500/15', text: 'text-stone-400', border: 'border-stone-500/20' },
  'Preform': { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/20' },
  'Cut': { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/20' },
  'Polished': { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/20' },
};

// ── Error Display ──
function ErrorDisplay({ error, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 animate-fade-in px-4">
      <div className="w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
        <AlertTriangle size={36} className="text-red-400" />
      </div>
      <div className="text-center space-y-2 max-w-md">
        <h2 className="text-2xl font-bold text-red-400">Something went wrong</h2>
        <p className="text-[var(--color-text-muted)] text-sm">{error?.message || 'An unexpected error occurred while loading the dashboard.'}</p>
      </div>
      <button onClick={onRetry} className="btn btn-primary">
        Retry
      </button>
    </div>
  );
}

// ── Mint Success Modal ──
function MintSuccessModal({ tokenId, stoneData, onClose, onView }) {
  if (!tokenId) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 size={20} className="text-emerald-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[var(--color-text-primary)]">Stone Minted Successfully</h3>
              <p className="text-[var(--color-text-muted)] text-xs">Your gemstone is now on the blockchain</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition">
            <X size={18} className="text-[var(--color-text-muted)]" />
          </button>
        </div>

        <div className="modal-body space-y-5">
          <div className="text-center py-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/5 border border-emerald-500/15 rounded-xl">
              <Gem size={16} className="text-emerald-500" />
              <span className="text-2xl font-extrabold text-emerald-500">Stone #{tokenId}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[var(--color-bg-tertiary)] rounded-xl p-4 border border-[var(--color-border-subtle)]">
              <p className="text-[var(--color-text-muted)] text-[10px] font-bold uppercase tracking-wider mb-1">Weight</p>
              <p className="text-[var(--color-text-primary)] font-bold text-lg">{stoneData?.weight ? formatWeight(stoneData.weight) : '—'}</p>
            </div>
            <div className="bg-[var(--color-bg-tertiary)] rounded-xl p-4 border border-[var(--color-border-subtle)]">
              <p className="text-[var(--color-text-muted)] text-[10px] font-bold uppercase tracking-wider mb-1">State</p>
              <p className="text-[var(--color-text-primary)] font-bold text-lg">{stoneData?.stoneState || '—'}</p>
            </div>
            <div className="bg-[var(--color-bg-tertiary)] rounded-xl p-4 border border-[var(--color-border-subtle)]">
              <p className="text-[var(--color-text-muted)] text-[10px] font-bold uppercase tracking-wider mb-1">Status</p>
              <span className="badge badge-green text-[10px]">Active</span>
            </div>
            <div className="bg-[var(--color-bg-tertiary)] rounded-xl p-4 border border-[var(--color-border-subtle)]">
              <p className="text-[var(--color-text-muted)] text-[10px] font-bold uppercase tracking-wider mb-1">Date</p>
              <p className="text-[var(--color-text-primary)] font-medium text-sm">{formatDate(Math.floor(Date.now() / 1000))}</p>
            </div>
          </div>

          <div className="bg-[var(--color-bg-secondary)] rounded-xl p-5 border border-[var(--color-border-subtle)]">
            <p className="text-[var(--color-text-muted)] text-xs font-semibold mb-4 text-center">Certificate QR Code</p>
            <QRGenerator tokenId={tokenId} showActions={false} />
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary flex-1">Close</button>
          <button onClick={onView} className="btn btn-primary flex-1">
            <ArrowRight size={16} />
            View Certificate
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Section Card ──
function SectionCard({ title, subtitle, icon: Icon, children, defaultOpen = true }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between p-1">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-bg-hover)] border border-[var(--color-border-default)] flex items-center justify-center">
            <Icon size={18} className="text-[var(--color-text-primary)]" />
          </div>
          <div className="text-left">
            <h2 className="section-title text-base">{title}</h2>
            {subtitle && <p className="section-sub">{subtitle}</p>}
          </div>
        </div>
        {isOpen ? <ChevronUp size={18} className="text-[var(--color-text-muted)]" /> : <ChevronDown size={18} className="text-[var(--color-text-muted)]" />}
      </button>

      {isOpen && (
        <div className="mt-5 pt-5 border-t border-[var(--color-border-subtle)] animate-fade-in">
          {children}
        </div>
      )}
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
    <div className={`toast toast-${type} animate-toast-in`}>
      {type === 'success' && <CheckCircle2 size={18} />}
      {type === 'error' && <AlertTriangle size={18} />}
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="p-1 hover:bg-white/10 rounded transition">
        <X size={14} />
      </button>
    </div>
  );
}

// ── Main Dashboard ──
export default function Dashboard() {
  const [renderError, setRenderError] = useState(null);
  const navigate = useNavigate();

  // Safely destructure with defaults
  let blockchain;
  try {
    blockchain = useBlockchain() || {};
  } catch (err) {
    console.error('useBlockchain hook error:', err);
    return <ErrorDisplay error={err} onRetry={() => window.location.reload()} />;
  }

  const {
    account = null,
    connect = () => {},
    isLab = false,
    loading = false,
    registerGenesis = () => Promise.reject(new Error('Not connected')),
    requestTransformation = () => Promise.reject(new Error('Not connected')),
    completeTransformation = () => Promise.reject(new Error('Not connected')),
    getMintedTokenId = () => null,
    getStonesForAccount = () => Promise.resolve([]),
  } = blockchain;

  // ── State ──
  const [genUri, setGenUri] = useState('');
  const [genWeight, setGenWeight] = useState('');
  const [genState, setGenState] = useState('Rough');
  const [mintedTokenId, setMintedTokenId] = useState(null);
  const [mintedStoneData, setMintedStoneData] = useState(null);
  const [showMintModal, setShowMintModal] = useState(false);

  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null);

  const [reqTokenId, setReqTokenId] = useState('');
  const [parentId, setParentId] = useState('');
  const [childInputs, setChildInputs] = useState([{ weight: '', state: 'Cut', uri: '' }]);

  const [txHash, setTxHash] = useState('');
  const [errorMSG, setErrorMSG] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  const [myStones, setMyStones] = useState([]);
  const [stonesLoading, setStonesLoading] = useState(false);
  const [stonesError, setStonesError] = useState(null);

  // ── Load stones ──
  const loadMyStones = async () => {
    if (!account) return;
    setStonesLoading(true);
    setStonesError(null);
    try {
      const stones = await getStonesForAccount(account);
      setMyStones(stones || []);
    } catch (err) {
      console.error('Failed to load stones:', err);
      setStonesError(friendlyError(err));
    }
    setStonesLoading(false);
  };

  useEffect(() => {
    if (!account) return;
    loadMyStones();
  }, [account, txHash]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  const addChildRow = () => setChildInputs([...childInputs, { weight: '', state: 'Cut', uri: '' }]);
  const removeChildRow = (idx) => setChildInputs(childInputs.filter((_, i) => i !== idx));

  const updateChild = (index, field, value) => {
    const updated = [...childInputs];
    updated[index][field] = value;
    setChildInputs(updated);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setUploadMsg(null);
  };

  const handleUploadToIPFS = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const ipfsUri = await uploadToPinata(selectedFile);
      setGenUri(ipfsUri);
      setUploadMsg({ type: 'success', text: 'Image uploaded to IPFS' });
      showToast('Image uploaded to IPFS successfully', 'success');
    } catch (err) {
      setUploadMsg({ type: 'error', text: err.message || 'Upload failed' });
      showToast(err.message || 'Upload failed', 'error');
    }
    setUploading(false);
  };

  const handleGenesis = async (e) => {
    e.preventDefault();
    setIsSubmitting(true); setTxHash(''); setErrorMSG('');
    setMintedTokenId(null);
    try {
      const receipt = await registerGenesis(genUri, genWeight, genState);
      const newId = getMintedTokenId(receipt);
      setMintedTokenId(newId);
      setMintedStoneData({ weight: Math.round(parseFloat(genWeight) * 100), stoneState: genState });
      setShowMintModal(true);
      setTxHash(receipt.hash);
      setGenUri(''); setGenWeight(''); setGenState('Rough');
      setSelectedFile(null); setPreviewUrl(null); setUploadMsg(null);
      showToast(`Stone #${newId} minted successfully!`, 'success');
    } catch (err) { 
      setErrorMSG(err.reason || err.message);
      showToast(err.reason || err.message, 'error');
    }
    setIsSubmitting(false);
  };

  const handleRequest = async (e) => {
    e.preventDefault();
    setIsSubmitting(true); setTxHash(''); setErrorMSG('');
    try {
      const receipt = await requestTransformation(reqTokenId);
      setTxHash(receipt.hash);
      setReqTokenId('');
      showToast(`Transformation requested for Stone #${reqTokenId}`, 'success');
    } catch (err) { 
      setErrorMSG(err.reason || err.message);
      showToast(err.reason || err.message, 'error');
    }
    setIsSubmitting(false);
  };

  const handleComplete = async (e) => {
    e.preventDefault();
    setIsSubmitting(true); setTxHash(''); setErrorMSG('');
    try {
      const weights = childInputs.map(c => c.weight);
      const states = childInputs.map(c => c.state);
      const uris = childInputs.map(c => c.uri);
      const receipt = await completeTransformation(parentId, weights, states, uris);
      setTxHash(receipt.hash);
      setParentId('');
      setChildInputs([{ weight: '', state: 'Cut', uri: '' }]);
      showToast('Transformation completed successfully', 'success');
    } catch (err) { 
      setErrorMSG(err.reason || err.message);
      showToast(err.reason || err.message, 'error');
    }
    setIsSubmitting(false);
  };

  // ── Loading State ──
  if (loading === true) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-3 border-[var(--color-border-default)] border-t-[var(--color-text-primary)] animate-spin" />
            <div className="absolute inset-0 w-12 h-12 rounded-full border-3 border-transparent border-b-[var(--color-border-hover)] animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
          </div>
          <p className="text-[var(--color-text-muted)] text-sm font-medium">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // ── Not Connected ──
  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-fade-in">
        <div className="w-20 h-20 rounded-2xl bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] flex items-center justify-center">
          <FlaskConical size={36} className="text-[var(--color-text-muted)]" />
        </div>
        <div className="text-center space-y-3">
          <h2 className="text-3xl font-extrabold text-[var(--color-text-primary)] tracking-tight">Authorized Laboratory Portal</h2>
          <p className="text-[var(--color-text-muted)] max-w-sm mx-auto">Connect your lab wallet to manage gemstone passports on the blockchain</p>
        </div>
        <button
          id="connect-wallet-btn"
          onClick={connect}
          className="btn btn-primary btn-lg"
        >
          <Gem size={18} />
          Connect Wallet
        </button>
      </div>
    );
  }

  // ── Not Lab ──
  if (!isLab) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 animate-fade-in">
        <div className="w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <AlertTriangle size={36} className="text-red-400" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-red-400">Access Denied</h2>
          <p className="text-[var(--color-text-muted)] max-w-sm">Your wallet does not have LAB_ROLE. Please contact NGJA to be authorized.</p>
          <p className="mono-addr mt-4">{account}</p>
        </div>
      </div>
    );
  }

  // ── Connected Lab View ──
  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <MintSuccessModal 
        tokenId={mintedTokenId} 
        stoneData={mintedStoneData}
        onClose={() => setShowMintModal(false)}
        onView={() => { setShowMintModal(false); navigate(`/?id=${mintedTokenId}`); }}
      />

      <header className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/5 border border-emerald-500/15 rounded-full mb-4">
          <FlaskConical size={14} className="text-emerald-500" />
          <span className="text-emerald-500 text-xs font-bold uppercase tracking-wider">Lab Portal</span>
        </div>
        <h1 className="text-3xl font-extrabold text-[var(--color-text-primary)] tracking-tight mb-3">Laboratory Dashboard</h1>
        <div className="flex items-center justify-center gap-3">
          <span className="mono-addr">{shortAddr(account)}</span>
          <span className="badge badge-green">Authorized Lab</span>
        </div>
      </header>

      {txHash && (
        <div className="alert alert-success animate-scale-in">
          <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-emerald-300 text-sm">Transaction Successful</p>
            <p className="text-emerald-400/70 text-xs font-mono mt-1 break-all">{txHash}</p>
          </div>
        </div>
      )}

      {errorMSG && (
        <div className="alert alert-error animate-scale-in">
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-red-300">Transaction Failed</p>
            <p className="text-red-400/70 text-xs mt-1">{errorMSG}</p>
          </div>
        </div>
      )}

      <div className="dashboard-grid">
        <div className="dashboard-sidebar space-y-6">
          <SectionCard title="Register New Stone" subtitle="Mint a new blockchain certificate" icon={Plus}>
            <form onSubmit={handleGenesis} className="space-y-5">
              <div>
                <label className="label">Certificate Image</label>
                <div className="relative">
                  <input id="gem-image-upload" type="file" accept="image/jpeg,image/png" onChange={handleFileChange} className="hidden" />
                  {!previewUrl ? (
                    <label htmlFor="gem-image-upload" className="flex flex-col items-center justify-center py-10 px-4 bg-[var(--color-bg-tertiary)] border-2 border-dashed border-[var(--color-border-default)] rounded-xl cursor-pointer hover:border-[var(--color-border-hover)] hover:bg-[var(--color-bg-hover)] transition-all group">
                      <Upload size={28} className="text-[var(--color-text-muted)] group-hover:text-[var(--color-text-primary)] transition-colors mb-3" />
                      <p className="text-[var(--color-text-secondary)] text-sm font-medium">Click to upload gem image</p>
                      <p className="text-[var(--color-text-muted)] text-xs mt-1">JPG or PNG, max 10MB</p>
                    </label>
                  ) : (
                    <div className="relative">
                      <img src={previewUrl} alt="Preview" className="w-full h-48 object-cover rounded-xl border border-[var(--color-border-default)]" />
                      <button type="button" onClick={() => { setSelectedFile(null); setPreviewUrl(null); }} className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded-lg transition">
                        <X size={14} className="text-white" />
                      </button>
                    </div>
                  )}
                </div>

                {previewUrl && (
                  <button type="button" id="upload-ipfs-btn" onClick={handleUploadToIPFS} disabled={uploading} className="btn btn-sm btn-secondary mt-3 w-full">
                    {uploading ? <><Loader2 size={14} className="animate-spin" />Uploading...</> : <><Upload size={14} />Upload to IPFS</>}
                  </button>
                )}

                {uploadMsg && (
                  <p className={`mt-2 text-xs font-medium ${uploadMsg.type === 'success' ? 'text-emerald-500' : 'text-red-400'}`}>
                    {uploadMsg.text}
                  </p>
                )}
              </div>

              <div>
                <label className="label">IPFS Certificate URI</label>
                <input id="gen-uri" type="text" required value={genUri} onChange={(e) => setGenUri(e.target.value)} className="input" placeholder="ipfs://Qm... (auto-filled after upload)" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Weight (carats)</label>
                  <input id="gen-weight" type="number" required min="0.01" step="0.01" value={genWeight} onChange={(e) => setGenWeight(e.target.value)} className="input" placeholder="e.g. 5.20" />
                </div>
                <div>
                  <label className="label">Stone State</label>
                  <select id="gen-state" value={genState} onChange={(e) => setGenState(e.target.value)} className="input">
                    {STONE_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <button id="mint-genesis-btn" type="submit" disabled={isSubmitting} className="btn btn-primary w-full btn-lg">
                {isSubmitting ? <><Loader2 size={18} className="animate-spin" />Minting...</> : <><Gem size={18} />Mint Genesis Token</>}
              </button>
            </form>
          </SectionCard>

          <SectionCard title="Request Transformation" subtitle="Lock a stone for transformation" icon={Lock} defaultOpen={false}>
            <form onSubmit={handleRequest} className="space-y-4">
              <div>
                <label className="label">Token ID to Transform</label>
                <input id="req-token-id" type="number" required min="1" value={reqTokenId} onChange={(e) => setReqTokenId(e.target.value)} className="input" placeholder="Enter Token ID" />
              </div>
              <button id="request-transform-btn" type="submit" disabled={isSubmitting} className="btn btn-secondary w-full">
                {isSubmitting ? <><Loader2 size={16} className="animate-spin" />Processing...</> : <><Lock size={16} />Lock Token (Pending)</>}
              </button>
            </form>
          </SectionCard>

          <SectionCard title="Complete Transformation" subtitle="Burn parent & mint children" icon={Scissors} defaultOpen={false}>
            <form onSubmit={handleComplete} className="space-y-5">
              <div>
                <label className="label">Parent Token ID</label>
                <input id="parent-token-id" type="number" required min="1" value={parentId} onChange={(e) => setParentId(e.target.value)} className="input" placeholder="ID of stone being cut" />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="label mb-0">Child Stones</label>
                  <span className="text-[var(--color-text-muted)] text-xs">{childInputs.length} stone{childInputs.length !== 1 ? 's' : ''}</span>
                </div>

                {childInputs.map((child, idx) => (
                  <div key={idx} className="card bg-[var(--color-bg-tertiary)] border-[var(--color-border-subtle)] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Child #{idx + 1}</span>
                      {childInputs.length > 1 && (
                        <button type="button" onClick={() => removeChildRow(idx)} className="p-1.5 hover:bg-red-500/10 rounded-lg transition text-red-400" title="Remove">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      <div className="sm:col-span-4">
                        <label className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5 block">Weight</label>
                        <input type="number" required min="0.01" step="0.01" value={child.weight} onChange={(e) => updateChild(idx, 'weight', e.target.value)} className="input py-2.5 text-sm" placeholder="2.50" />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5 block">State</label>
                        <select value={child.state} onChange={(e) => updateChild(idx, 'state', e.target.value)} className="input py-2.5 text-sm">
                          {STONE_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="sm:col-span-5">
                        <label className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5 block">IPFS URI</label>
                        <input type="text" required value={child.uri} onChange={(e) => updateChild(idx, 'uri', e.target.value)} className="input py-2.5 text-sm" placeholder="ipfs://..." />
                      </div>
                    </div>
                  </div>
                ))}

                <button type="button" onClick={addChildRow} id="add-child-btn" className="btn btn-ghost btn-sm w-full border border-dashed border-[var(--color-border-default)] hover:border-[var(--color-text-primary)]/30">
                  <Plus size={14} />
                  Add Child Stone
                </button>
              </div>

              <button id="complete-transform-btn" type="submit" disabled={isSubmitting} className="btn btn-secondary w-full">
                {isSubmitting ? <><Loader2 size={16} className="animate-spin" />Processing...</> : <><Scissors size={16} />Burn Parent & Mint Children</>}
              </button>
            </form>
          </SectionCard>
        </div>

        <div>
          <SectionCard title="My Registered Stones" subtitle="Gemstones registered by your lab wallet" icon={Gem} defaultOpen={true}>
            {stonesLoading ? (
              <div className="flex justify-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <div className="relative">
                    <div className="w-8 h-8 rounded-full border-2 border-[var(--color-border-default)] border-t-[var(--color-text-primary)] animate-spin" />
                  </div>
                  <p className="text-[var(--color-text-muted)] text-sm">Loading stones...</p>
                </div>
              </div>
            ) : stonesError ? (
              <div className="alert alert-error">
                <AlertTriangle size={16} />
                <div>
                  <p className="font-bold text-sm">Could not load stones</p>
                  <p className="text-xs text-red-400/70 mt-1">{stonesError}</p>
                </div>
                <button onClick={loadMyStones} className="btn btn-sm btn-danger ml-auto">Retry</button>
              </div>
            ) : myStones.length === 0 ? (
              <div className="empty-state py-12">
                <div className="empty-state-icon">
                  <Diamond size={28} className="text-[var(--color-text-muted)]" />
                </div>
                <p className="text-[var(--color-text-secondary)] font-medium text-sm">No stones registered yet</p>
                <p className="text-[var(--color-text-muted)] text-xs mt-1">Mint your first genesis token above</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myStones.map((s) => {
                  const statusCfg = STATUS_CONFIG[s.status] || STATUS_CONFIG[0];
                  const stateStyle = STATE_STYLES[s.stoneState] || STATE_STYLES['Rough'];
                  const StatusIcon = statusCfg.icon;

                  return (
                    <div key={s.tokenId} className="card card-interactive p-4 flex items-center gap-4 group">
                      <div className="w-12 h-12 rounded-xl bg-[var(--color-bg-tertiary)] border border-[var(--color-border-subtle)] flex items-center justify-center flex-shrink-0">
                        <Gem size={20} className="text-[var(--color-text-muted)] group-hover:text-[var(--color-text-primary)] transition-colors" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-bold text-[var(--color-text-primary)]">Stone #{s.tokenId}</span>
                          <span className={`badge ${statusCfg.badge} text-[10px]`}>
                            <StatusIcon size={10} />
                            {STATUS_LABELS[s.status]}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="font-bold text-[var(--color-text-primary)]">{formatWeight(s.weight)}</span>
                          <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold border ${stateStyle.bg} ${stateStyle.text} ${stateStyle.border}`}>
                            {s.stoneState}
                          </span>
                          <span className="text-[var(--color-text-muted)] text-xs">{formatDate(s.timestamp)}</span>
                        </div>
                      </div>

                      <button onClick={() => navigate(`/?id=${s.tokenId}`)} className="p-2 hover:bg-white/5 rounded-xl transition flex-shrink-0">
                        <ArrowRight size={18} className="text-[var(--color-text-muted)] group-hover:text-[var(--color-text-primary)] transition-colors" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
