import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useBlockchain } from '../hooks/useBlockchain';
import QRGenerator from '../components/QRGenerator';
import { 
  Search, ArrowLeft, Clock, Weight, Gem, User, 
  FileCheck, Scissors, GitBranch, X, ExternalLink,
  ChevronRight, ShieldCheck, AlertTriangle, Diamond, Info
} from 'lucide-react';

// ── Helpers ──
const formatWeight = (raw) => (raw / 100).toFixed(2) + ' ct';

const formatDate = (ts) => {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
};

const shortAddr = (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '—';

const resolveIpfsImage = (ipfsUri) => {
  if (!ipfsUri) return null;
  let cid = ipfsUri;
  if (cid.startsWith('ipfs://')) cid = cid.slice(7);
  if (cid.startsWith('/ipfs/')) cid = cid.slice(6);
  return `https://gateway.pinata.cloud/ipfs/${cid}`;
};

// ── Status Config ──
const STATUS_CONFIG = {
  0: { 
    label: 'Active', 
    badge: 'badge-green',
    icon: ShieldCheck,
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.06)',
    border: 'rgba(16, 185, 129, 0.15)'
  },
  1: { 
    label: 'Pending Transformation', 
    badge: 'badge-amber',
    icon: Clock,
    color: '#d97706',
    bg: 'rgba(245, 158, 11, 0.06)',
    border: 'rgba(245, 158, 11, 0.15)'
  },
  2: { 
    label: 'Burned (Cut)', 
    badge: 'badge-gray',
    icon: Scissors,
    color: '#6b6b6b',
    bg: 'rgba(107, 107, 107, 0.06)',
    border: 'rgba(107, 107, 107, 0.15)'
  },
};

const STATE_COLORS = {
  'Rough':    { bg: 'bg-stone-500/15',   text: 'text-stone-400',   border: 'border-stone-500/20' },
  'Preform':  { bg: 'bg-blue-500/15',    text: 'text-blue-400',    border: 'border-blue-500/20' },
  'Cut':      { bg: 'bg-purple-500/15',  text: 'text-purple-400',  border: 'border-purple-500/20' },
  'Polished': { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/20' },
};

// ── Stone display name helper ──
// Primary: stoneState ("Rough", "Cut", …)  Secondary: token ID
const stoneName = (stoneState, id) => (
  <>
    {stoneState}{' '}
    <span className="text-[var(--color-text-muted)] font-medium text-[0.75em]">#{id}</span>
  </>
);

// ── Components ──

function StatusBanner({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG[0];
  const Icon = cfg.icon;

  if (status === 0) {
    return (
      <div className="flex items-center gap-3 px-5 py-4 rounded-2xl mb-6"
        style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
          <Icon size={20} className="text-emerald-500" />
        </div>
        <div>
          <p className="font-bold text-emerald-500 text-sm">Certified & Active</p>
          <p className="text-emerald-500/60 text-xs mt-0.5">This gemstone is verified on the blockchain and ready for trade</p>
        </div>
      </div>
    );
  }
  if (status === 1) {
    return (
      <div className="flex items-center gap-3 px-5 py-4 rounded-2xl mb-6"
        style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
          <Icon size={20} className="text-amber-500" />
        </div>
        <div>
          <p className="font-bold text-amber-500 text-sm">Transformation Pending</p>
          <p className="text-amber-500/60 text-xs mt-0.5">This stone is currently being processed by the laboratory</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 px-5 py-4 rounded-2xl mb-6"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
      <div className="w-10 h-10 rounded-xl bg-gray-500/10 flex items-center justify-center flex-shrink-0">
        <Icon size={20} className="text-gray-400" />
      </div>
      <div>
        <p className="font-bold text-gray-400 text-sm">Stone Was Cut</p>
        <p className="text-gray-500/60 text-xs mt-0.5">This stone was transformed — see the resulting stones below</p>
      </div>
    </div>
  );
}

function TimelineCard({ stone, isCurrent, isFirst }) {
  const cfg = STATUS_CONFIG[stone.status] || STATUS_CONFIG[0];
  const stateStyle = STATE_COLORS[stone.stoneState] || STATE_COLORS['Rough'];

  return (
    <div className="relative pl-8 pb-8">
      {!isFirst && (
        <div className="absolute left-[11px] top-0 bottom-0 w-0.5 bg-gradient-to-b from-[var(--color-border-default)] to-[var(--color-text-primary)]" />
      )}
      <div className={`absolute left-0 top-1 w-6 h-6 rounded-full border-[3px] border-[var(--color-bg-primary)] flex items-center justify-center z-10 ${
        isCurrent ? 'bg-[var(--color-text-primary)] shadow-lg shadow-white/10' : 
        stone.status === 2 ? 'bg-[var(--color-text-muted)]' : 'bg-[var(--color-text-primary)]'
      }`}>
        {isCurrent && <div className="w-2 h-2 bg-[var(--color-bg-primary)] rounded-full" />}
      </div>

      <div className={`card p-5 transition-all ${isCurrent ? 'border-[var(--color-text-primary)]/20 bg-[var(--color-text-primary)]/[0.02]' : ''}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {/* CHANGED: stoneState as primary label, id as secondary */}
              <span className="font-bold text-[var(--color-text-primary)] text-base">
                {stoneName(stone.stoneState, stone.id)}
              </span>
              {isCurrent && <span className="badge badge-green text-[10px]">Current</span>}
              <span className={`badge ${cfg.badge} text-[10px]`}>{cfg.label}</span>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-bold text-[var(--color-text-primary)] text-lg">{formatWeight(stone.weight)}</span>
              <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${stateStyle.bg} ${stateStyle.text} ${stateStyle.border}`}>
                {stone.stoneState}
              </span>
              <span className="text-[var(--color-text-muted)] text-xs flex items-center gap-1">
                <Clock size={12} />
                {formatDate(stone.timestamp)}
              </span>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <User size={12} className="text-[var(--color-text-muted)]" />
              <span className="mono-addr text-[11px]">{shortAddr(stone.custodian)}</span>
            </div>
          </div>

          {stone.ipfsUri && (
            <a 
              href={resolveIpfsImage(stone.ipfsUri)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 p-2 hover:bg-white/5 rounded-xl transition"
            >
              <ExternalLink size={16} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function ChildCard({ stone, navigate }) {
  const cfg = STATUS_CONFIG[stone.status] || STATUS_CONFIG[0];
  const stateStyle = STATE_COLORS[stone.stoneState] || STATE_COLORS['Rough'];

  return (
    <button
      onClick={() => navigate(`/?id=${stone.id}`)}
      className="w-full text-left card-interactive card p-5 group"
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            {/* CHANGED: stoneState as primary label, id as secondary */}
            <span className="font-bold text-[var(--color-text-primary)] group-hover:text-[var(--color-text-primary)] transition-colors">
              {stoneName(stone.stoneState, stone.id)}
            </span>
            <span className={`badge ${cfg.badge} text-[10px]`}>{cfg.label}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-[var(--color-text-primary)]">{formatWeight(stone.weight)}</span>
            <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold border ${stateStyle.bg} ${stateStyle.text} ${stateStyle.border}`}>
              {stone.stoneState}
            </span>
          </div>
        </div>
        <ChevronRight size={18} className="text-[var(--color-text-muted)] group-hover:text-[var(--color-text-primary)] transition-colors flex-shrink-0" />
      </div>
    </button>
  );
}

function GemImage({ src, alt }) {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-muted)]">
        <div className="w-16 h-16 rounded-2xl bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] flex items-center justify-center mb-4">
          <Gem size={28} className="text-[var(--color-text-muted)]" />
        </div>
        <p className="text-sm font-medium">Image unavailable</p>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">The certificate image could not be loaded</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-[var(--color-border-default)] border-t-[var(--color-text-primary)] animate-spin" />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={`w-full rounded-2xl border border-[var(--color-border-default)] object-contain bg-[var(--color-bg-secondary)] transition-opacity duration-300 ${loading ? 'opacity-0' : 'opacity-100'}`}
        style={{ maxHeight: '320px' }}
        onLoad={() => setLoading(false)}
        onError={() => setError(true)}
      />
    </div>
  );
}

function DetailRow({ label, value, icon: Icon, mono = false }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[var(--color-border-subtle)] last:border-0">
      <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
        {Icon && <Icon size={14} />}
        <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <span className={mono ? 'mono-addr' : 'text-[var(--color-text-primary)] font-medium text-sm'}>{value}</span>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-5">
      <div className="relative">
        <div className="w-12 h-12 rounded-full border-3 border-[var(--color-border-default)] border-t-[var(--color-text-primary)] animate-spin" />
        <div className="absolute inset-0 w-12 h-12 rounded-full border-3 border-transparent border-b-[var(--color-border-hover)] animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
      </div>
      <div className="text-center">
        <p className="text-[var(--color-text-secondary)] font-semibold text-sm">Loading stone data</p>
        <p className="text-[var(--color-text-muted)] text-xs mt-1">Fetching from Polygon Amoy blockchain...</p>
      </div>
    </div>
  );
}

// ── NEW: Disambiguation view for burned stones with multiple children ──
// Shown instead of the normal stone view when a burned stone has 2+ children.
function DisambiguationView({ burned, children, navigate }) {
  const stateStyle = STATE_COLORS[burned.stoneState] || STATE_COLORS['Rough'];

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="card-elevated">
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 rounded-2xl bg-[var(--color-bg-hover)] border border-[var(--color-border-default)] flex items-center justify-center flex-shrink-0">
            <Scissors size={28} className="text-[var(--color-text-muted)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <h2 className="text-2xl font-extrabold text-[var(--color-text-primary)]">
                {stoneName(burned.stoneState, burned.id)}
              </h2>
              <span className="badge badge-gray">Burned</span>
            </div>
            <p className="text-[var(--color-text-muted)] text-sm">
              This stone has been cut — it no longer exists as an active token.
              Select a resulting stone below to view its certificate.
            </p>
          </div>
        </div>

        <div className="divider my-5" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
          <DetailRow label="Original Weight" value={formatWeight(burned.weight)} icon={Weight} />
          <DetailRow label="Stone State"     value={burned.stoneState}            icon={Gem} />
          <DetailRow label="Certified"       value={formatDate(burned.timestamp)} icon={Clock} />
          <DetailRow label="Token ID"        value={`#${burned.id}`}             icon={FileCheck} />
        </div>
      </div>

      {/* Resulting stones — prominent */}
      <div className="card">
        <h3 className="section-title mb-2 flex items-center gap-2">
          <Scissors size={18} className="text-[var(--color-text-secondary)]" />
          Resulting Stones ({children.length})
        </h3>
        <p className="section-sub mb-5">
          Stone #{burned.id} was cut into the following gemstones. Click one to view its certificate.
        </p>
        <div className="space-y-3">
          {children.map((child) => (
            <ChildCard key={child.id} stone={child} navigate={navigate} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ──
export default function StoneViewer() {
  const { id: paramId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { getStoneDetails, getChildIds, getLineage } = useBlockchain();

  const [searchInput, setSearchInput] = useState('');
  const [tokenId, setTokenId] = useState(null);

  const [stone, setStone] = useState(null);
  const [lineage, setLineage] = useState([]);
  const [children, setChildren] = useState([]);
  const [childDetails, setChildDetails] = useState([]);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [error, setError] = useState(null);
  // NEW: holds { burned, children[] } when a burned stone has multiple children
  const [disambig, setDisambig] = useState(null);

  // NEW: ?from=N tells us we were redirected from a burned stone
  const redirectedFrom = searchParams.get('from');

  // Determine tokenId from URL
  useEffect(() => {
    const fromParam = paramId;
    const fromQuery = searchParams.get('id');
    const id = fromParam || fromQuery;
    if (id) {
      const parsed = parseInt(id, 10);
      if (!isNaN(parsed) && parsed > 0) {
        setTokenId(parsed);
      } else {
        setError("Invalid stone ID in URL.");
      }
    } else {
      setTokenId(null);
      setError(null);
    }
  }, [paramId, searchParams]);

  // Fetch stone data
  useEffect(() => {
    if (!tokenId) return;
    let cancelled = false;

    const fetchAll = async () => {
      setFetchLoading(true);
      setError(null);
      setStone(null);
      setLineage([]);
      setChildren([]);
      setChildDetails([]);
      setDisambig(null); // NEW: reset disambiguation state

      try {
        const stoneData = await getStoneDetails(tokenId);
        if (cancelled) return;

        if (!stoneData.timestamp) {
          setError(`Stone #${tokenId} does not exist on the blockchain.`);
          setFetchLoading(false);
          return;
        }

        // ── NEW: Burned stone handling ──
        // A burned stone's data is preserved on-chain but the token no longer exists.
        // We route the user to the resulting stone(s) instead of showing a dead end.
        if (stoneData.status === 2) {
          const childIds = await getChildIds(tokenId);
          if (cancelled) return;

          if (childIds.length === 1) {
            // Single child: silently redirect, carry ?from= so we can show the banner
            navigate(`/?id=${childIds[0]}&from=${tokenId}`, { replace: true });
            return;
          }

          if (childIds.length > 1) {
            // Multiple children: show disambiguation screen, not a redirect
            const details = await Promise.all(childIds.map(id => getStoneDetails(id)));
            if (cancelled) return;
            setDisambig({
              burned: { id: tokenId, ...stoneData },
              children: details.map((d, i) => ({ id: childIds[i], ...d })),
            });
            setFetchLoading(false);
            return;
          }

          // Edge case: burned but no children recorded — fall through to normal display
        }

        // ── Normal load for Active / Pending stones ──
        setStone(stoneData);

        const [lineageData, childIds] = await Promise.all([
          getLineage(tokenId),
          getChildIds(tokenId),
        ]);
        if (cancelled) return;

        setLineage(lineageData);
        setChildren(childIds);

        if (childIds.length > 0) {
          const details = await Promise.all(childIds.map(id => getStoneDetails(id)));
          if (cancelled) return;
          setChildDetails(details.map((d, i) => ({ id: childIds[i], ...d })));
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Fetch error:", err);
          setError("Failed to load stone data. Please check the stone ID and try again.");
        }
      }
      if (!cancelled) setFetchLoading(false);
    };

    fetchAll();
    return () => { cancelled = true; };
  }, [tokenId, getStoneDetails, getChildIds, getLineage]);

  const handleSearch = (e) => {
    e.preventDefault();
    const id = parseInt(searchInput.trim(), 10);
    if (!isNaN(id) && id > 0) {
      navigate(`/?id=${id}`);
    } else {
      setError("Please enter a valid stone ID (a positive number).");
    }
  };

  const ipfsImageUrl = stone ? resolveIpfsImage(stone.ipfsUri) : null;
  const statusCfg   = stone ? (STATUS_CONFIG[stone.status] || STATUS_CONFIG[0]) : null;
  const stateStyle  = stone ? (STATE_COLORS[stone.stoneState] || STATE_COLORS['Rough']) : null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* ── SEARCH BAR ── */}
      <div className="mb-10">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-extrabold text-[var(--color-text-primary)] tracking-tight mb-3">
            Verify <span className="gradient-text">Gemstone</span> Authenticity
          </h1>
          <p className="text-[var(--color-text-muted)] text-sm max-w-md mx-auto">
            Enter a stone ID or scan the QR code on your physical certificate to verify its blockchain provenance
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex gap-3 max-w-xl mx-auto">
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <input
              id="stone-search-input"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Enter Stone ID (e.g. 42)"
              className="input pl-11"
            />
          </div>
          <button
            id="stone-search-btn"
            type="submit"
            className="btn btn-primary px-6"
          >
            Verify
          </button>
        </form>
      </div>

      {/* ── WELCOME STATE ── */}
      {!tokenId && !error && (
        <div className="text-center py-20 animate-fade-in">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] flex items-center justify-center">
            <Diamond size={36} className="text-[var(--color-text-muted)]" />
          </div>
          <h3 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">Ready to Verify</h3>
          <p className="text-[var(--color-text-muted)] text-sm max-w-sm mx-auto">
            Enter a stone ID above to verify its authenticity and view its complete provenance history on the blockchain.
          </p>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg mx-auto">
            {[
              { icon: ShieldCheck, label: 'Tamper-proof',   desc: 'Blockchain verified' },
              { icon: GitBranch,   label: 'Full Lineage',   desc: 'Complete history' },
              { icon: FileCheck,   label: 'NGJA Certified', desc: 'Official authority' },
            ].map((item, i) => (
              <div key={i} className="card p-4 text-center">
                <item.icon size={20} className="text-[var(--color-text-primary)] mx-auto mb-2" />
                <p className="text-[var(--color-text-primary)] text-xs font-semibold">{item.label}</p>
                <p className="text-[var(--color-text-muted)] text-[10px] mt-0.5">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ERROR STATE ── */}
      {error && (
        <div className="alert alert-error animate-scale-in">
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-red-300">{error}</p>
            <p className="text-red-400/70 text-xs mt-1">Please check the ID and try again</p>
          </div>
        </div>
      )}

      {/* ── LOADING ── */}
      {tokenId && fetchLoading && <Spinner />}

      {/* ── NEW: DISAMBIGUATION VIEW (burned stone, multiple children) ── */}
      {disambig && !fetchLoading && (
        <DisambiguationView
          burned={disambig.burned}
          children={disambig.children}
          navigate={navigate}
        />
      )}

      {/* ── STONE DATA ── */}
      {stone && !fetchLoading && (
        <div className="space-y-6 animate-slide-up">

          {/* Back button */}
          {lineage.length > 1 && (
            <button 
              onClick={() => navigate(`/?id=${stone.parentTokenId}`)}
              className="btn btn-ghost btn-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            >
              <ArrowLeft size={14} />
              View Parent Stone #{stone.parentTokenId}
            </button>
          )}

          {/* NEW: Redirected-from info banner */}
          {redirectedFrom && (
            <div className="alert alert-info flex items-start gap-3">
              <Info size={16} className="flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-sm">Stone #{redirectedFrom} was transformed into this stone</p>
                <p className="text-xs mt-0.5 opacity-70">
                  The original token was burned when it was cut.{' '}
                  <button
                    onClick={() => navigate(`/?id=${redirectedFrom}`)}
                    className="underline underline-offset-2 hover:opacity-100 opacity-80"
                  >
                    View original record
                  </button>
                </p>
              </div>
            </div>
          )}

          {/* Status Banner */}
          <StatusBanner status={stone.status} />

          {/* ── STONE HEADER CARD ── */}
          <div className="card-elevated">
            <div className="flex items-start gap-5">
              <div className="w-16 h-16 rounded-2xl bg-[var(--color-bg-hover)] border border-[var(--color-border-default)] flex items-center justify-center flex-shrink-0">
                <Diamond size={28} className="text-[var(--color-text-primary)]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap mb-1">
                  {/* CHANGED: stoneState as primary heading, token ID as secondary */}
                  <h2 className="text-2xl font-extrabold text-[var(--color-text-primary)]">
                    {stone.stoneState}{' '}
                    <span className="text-[var(--color-text-muted)] font-semibold text-lg">#{tokenId}</span>
                  </h2>
                  <span className={`badge ${statusCfg.badge}`}>{statusCfg.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-xl text-sm font-bold border ${stateStyle.bg} ${stateStyle.text} ${stateStyle.border}`}>
                    {stone.stoneState}
                  </span>
                  <span className="text-[var(--color-text-muted)] text-sm">-</span>
                  <span className="text-[var(--color-text-secondary)] text-sm">{formatDate(stone.timestamp)}</span>
                </div>
              </div>
            </div>

            <div className="divider my-5" />

            {/* Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
              <DetailRow label="Weight"     value={formatWeight(stone.weight)}                                                 icon={Weight} />
              <DetailRow label="Stone State" value={stone.stoneState}                                                         icon={Gem} />
              <DetailRow label="Certified"  value={formatDate(stone.timestamp)}                                               icon={Clock} />
              <DetailRow label="Custodian"  value={shortAddr(stone.custodian)}                                                icon={User} mono />
              <DetailRow label="Parent ID"  value={stone.parentTokenId === 0 ? 'Genesis (None)' : `#${stone.parentTokenId}`} icon={GitBranch} />
              <DetailRow label="Token ID"   value={`#${tokenId}`}                                                             icon={FileCheck} />
            </div>
          </div>

          {/* ── GEM IMAGE ── */}
          {ipfsImageUrl && (
            <div className="card">
              <h3 className="section-title mb-5 flex items-center gap-2">
                <Diamond size={18} className="text-[var(--color-text-primary)]" />
                Certificate Image
              </h3>
              <GemImage src={ipfsImageUrl} alt={`${stone.stoneState} stone #${tokenId}`} />
              <div className="mt-4 flex justify-center">
                <a
                  href={ipfsImageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm btn-ghost text-[var(--color-text-primary)]"
                >
                  <ExternalLink size={14} />
                  View Full Certificate on IPFS
                </a>
              </div>
            </div>
          )}

          {/* ── PROVENANCE TIMELINE ── */}
          <div className="card">
            <h3 className="section-title mb-6 flex items-center gap-2">
              <GitBranch size={18} className="text-[var(--color-text-primary)]" />
              Provenance Timeline
            </h3>

            {lineage.length > 0 ? (
              <div className="relative">
                {lineage.map((s, i) => (
                  <TimelineCard 
                    key={s.id} 
                    stone={s} 
                    isCurrent={s.id === tokenId}
                    isFirst={i === 0}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <Diamond size={28} className="text-[var(--color-text-muted)]" />
                </div>
                <p className="text-[var(--color-text-secondary)] font-medium text-sm">Genesis Stone</p>
                <p className="text-[var(--color-text-muted)] text-xs mt-1">This stone has no prior history on the blockchain</p>
              </div>
            )}
          </div>

          {/* ── CHILD STONES ── */}
          {childDetails.length > 0 && (
            <div className="card">
              <h3 className="section-title mb-2 flex items-center gap-2">
                <Scissors size={18} className="text-[var(--color-text-secondary)]" />
                Resulting Stones
              </h3>
              <p className="section-sub mb-5">This stone was cut into the following gemstones. Click to view each certificate.</p>
              <div className="space-y-3">
                {childDetails.map((child) => (
                  <ChildCard key={child.id} stone={child} navigate={navigate} />
                ))}
              </div>
            </div>
          )}

          {/* ── QR CODE ── */}
          <div className="card">
            <h3 className="section-title mb-6 flex items-center gap-2">
              <FileCheck size={18} className="text-[var(--color-text-primary)]" />
              Certificate QR Code
            </h3>
            <div className="flex flex-col items-center">
              <QRGenerator tokenId={tokenId} />
              <p className="text-[var(--color-text-muted)] text-xs text-center mt-4 max-w-xs">
                Scan this QR code to verify this stone on any device — no wallet or app installation required
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}