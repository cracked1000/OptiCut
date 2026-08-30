import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useBlockchain } from '../hooks/useBlockchain';
import QRGenerator from '../components/QRGenerator';
import QrScannerModal from '../components/QrScannerModal';
import {
  Search, ArrowLeft, Clock, Weight, Gem, User,
  FileCheck, Scissors, GitBranch, X, ExternalLink,
  ChevronRight, ShieldCheck, AlertTriangle, Diamond, Info, Camera,
  Flame, Leaf, MessageSquare
} from 'lucide-react';

// ── Helpers ──
const formatWeight = (raw) => (raw / 100).toFixed(2) + ' ct';

const formatDate = (ts) => {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
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

// ── Status Config: the stone's on-chain lifecycle state ──
const STATUS_CONFIG = {
  0: {
    label: 'Active',
    badge: 'badge-green',
    icon: ShieldCheck,
    plain: 'Certified & Active',
    sub: 'Verified on-chain and ready for trade.',
  },
  1: {
    label: 'Pending',
    badge: 'badge-amber',
    icon: Clock,
    plain: 'Transformation Pending',
    sub: 'Currently being processed by the laboratory.',
  },
  2: {
    label: 'Transformed',
    badge: 'badge-gray',
    icon: Scissors,
    plain: 'Stone Was Transformed',
    sub: 'This record was cut into new stones — see below for what it became.',
  },
};

const statusCfgFor = (status) => STATUS_CONFIG[status] ?? STATUS_CONFIG[0];

// ── Treatment badge ──
// Its own icon/color language (orange flame vs. green leaf), deliberately
// unlike any Status badge color, so "Heated" is never mistaken for a
// lifecycle state and never visually merges with "Active/Pending/Transformed".
function TreatmentBadge({ isHeated }) {
  return isHeated ? (
    <span className="badge bg-orange-500/10 text-orange-400 border border-orange-500/20">
      <Flame size={11} />
      Heated
    </span>
  ) : (
    <span className="badge bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
      <Leaf size={11} />
      Natural
    </span>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Resolve every branch below a cut stone down to the stones that still
// currently exist (Active / Pending). A stone only "ends" a branch once
// it is no longer Cut — that may be several transformations deep.
// Returns a flat list of { id, ...details, trail, deadEnd? }, where
// `trail` is the list of intermediate Cut stones strictly between the
// stone the user searched for and this result (root excluded).
// ══════════════════════════════════════════════════════════════════════
async function resolveCurrentDescendants(startId, { getStoneDetails, getChildIds }) {
  const seen = new Set();

  async function walk(tokenId, trail, depth) {
    if (seen.has(tokenId) || depth > 64) {
      // Defensive guard against malformed/cyclical on-chain data.
      return [{ id: tokenId, trail, deadEnd: true, malformed: true }];
    }
    seen.add(tokenId);

    const details = await getStoneDetails(tokenId);

    if (details.status !== 2) {
      return [{ id: tokenId, ...details, trail }];
    }

    const childIds = await getChildIds(tokenId);
    if (childIds.length === 0) {
      return [{ id: tokenId, ...details, trail, deadEnd: true }];
    }

    const nextTrail = tokenId === startId ? trail : [...trail, { id: tokenId, ...details }];
    const branches = await Promise.all(
      childIds.map((cid) => walk(cid, nextTrail, depth + 1))
    );
    return branches.flat();
  }

  return walk(startId, [], 0);
}

// ── Trail breadcrumb: "via #12 → #45" ──
function TrailBreadcrumb({ trail }) {
  if (!trail || trail.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap text-xs text-[var(--color-text-muted)] mt-1.5">
      <Scissors size={12} className="flex-shrink-0" />
      <span>via</span>
      {trail.map((t, i) => (
        <span key={t.id} className="flex items-center gap-1.5">
          <span className="font-semibold text-[var(--color-text-secondary)]">#{t.id}</span>
          {i < trail.length - 1 && <span>→</span>}
        </span>
      ))}
    </div>
  );
}

// ── Modal: shows a snapshot of any stone in the timeline without navigating ──
function StoneSnapshotModal({ stone, onClose }) {
  if (!stone) return null;
  const cfg = statusCfgFor(stone.status);
  const img = resolveIpfsImage(stone.ipfsUri);
  const Icon = cfg.icon;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
            <h3 className="text-lg font-bold text-[var(--color-text-primary)] truncate">
              {stone.stoneState} <span className="text-[var(--color-text-muted)] text-base font-medium">#{stone.id}</span>
            </h3>
            <span className={`badge ${cfg.badge} flex-shrink-0`}>{cfg.label}</span>
            <TreatmentBadge isHeated={!!stone.isHeated} />
          </div>
          <button onClick={onClose} className="icon-btn p-2 flex-shrink-0" aria-label="Close">
            <X size={20} className="text-[var(--color-text-muted)]" />
          </button>
        </div>

        <div className="modal-body space-y-4">
          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{cfg.sub}</p>

          {img && (
            <img
              src={img}
              alt={`${stone.stoneState} #${stone.id}`}
              className="w-full rounded-xl border border-[var(--color-border-default)] object-contain bg-[var(--color-bg-secondary)]"
              style={{ maxHeight: '220px' }}
            />
          )}

          <div className="rounded-2xl overflow-hidden border border-[var(--color-border-subtle)]">
            <DetailRow label="Weight" value={formatWeight(stone.weight)} icon={Weight} />
            <DetailRow label="Stage" value={stone.stoneState} icon={Gem} />
            <DetailRow label="Timestamp" value={formatDate(stone.timestamp)} icon={Clock} />
            <DetailRow label="Custodian" value={shortAddr(stone.custodian)} icon={User} mono />
            <DetailRow
              label="Parent"
              value={!stone.parentTokenId ? 'Genesis' : `#${stone.parentTokenId}`}
              icon={GitBranch}
            />
          </div>

          {stone.labComments && (
            <div className="rounded-xl border border-[var(--color-border-subtle)] p-4" style={{ background: 'var(--color-bg-card)' }}>
              <div className="flex items-center gap-2 text-[var(--color-text-muted)] text-xs font-semibold uppercase tracking-wide mb-2">
                <MessageSquare size={13} />
                <span>Lab Comments</span>
              </div>
              <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{stone.labComments}</p>
            </div>
          )}

          {img && (
            <a
              href={img}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm btn-ghost w-full justify-center text-[var(--color-text-primary)]"
            >
              <ExternalLink size={14} />
              View Certificate on IPFS
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function TimelineNode({ stone, isCurrent, isFirst, index = 0, onOpen }) {
  const cfg = statusCfgFor(stone.status);
  const NodeIcon = stone.parentTokenId === 0 ? Diamond : stone.status === 2 ? Scissors : Gem;
  const nodeClass =
    stone.status === 2 ? 'journey-node--burned'
    : stone.status === 1 ? 'journey-node--pending'
    : 'journey-node--genesis';

  const clickable = !isCurrent;

  return (
    <div className="relative pl-9 pb-4">
      <div className={`journey-node ${nodeClass} ${isCurrent ? 'journey-node--current animate-pulse-glow-soft' : ''}`}>
        <NodeIcon />
      </div>

      <button
        type="button"
        onClick={clickable ? () => onOpen(stone) : undefined}
        disabled={!clickable}
        className={`journey-card w-full text-left ${isCurrent ? 'journey-card--current' : ''} ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
        style={{ display: 'block' }}
      >
        <div className="journey-step text-xs mb-1.5">
          {isFirst ? <><b>✦</b> Origin</> : isCurrent ? <><b>◆</b> Current</> : <><b>✂</b> Cut {index}</>}
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="text-base font-bold text-[var(--color-text-primary)]">
                {stone.stoneState} <span className="text-[var(--color-text-muted)] font-medium text-sm">#{stone.id}</span>
              </span>
              {isCurrent && <span className="badge badge-green">Current</span>}
              <span className={`badge ${cfg.badge}`}>{cfg.label}</span>
              <TreatmentBadge isHeated={!!stone.isHeated} />
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--color-text-muted)]">
              <span className="flex items-center gap-1.5">
                <Weight size={14} />
                <b className="text-[var(--color-text-primary)]">{formatWeight(stone.weight)}</b>
              </span>
              <span className="flex items-center gap-1.5">
                <Clock size={13} />
                {formatDate(stone.timestamp)}
              </span>
            </div>
          </div>

          {clickable && (
            <ChevronRight size={18} className="text-[var(--color-text-muted)] flex-shrink-0 mt-1" />
          )}
        </div>
      </button>
    </div>
  );
}

// ── A currently-existing stone reached from a cut root (used in both the
//    disambiguation screen and the "Resulting Stones" section) ──
function ResultCard({ stone, navigate }) {
  if (stone.deadEnd) {
    return (
      <div className="alert alert-amber items-start">
        <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">
            Stone #{stone.id} was cut, but no resulting stone is recorded on-chain
          </p>
          <TrailBreadcrumb trail={stone.trail} />
        </div>
      </div>
    );
  }

  const cfg = statusCfgFor(stone.status);

  return (
    <button
      onClick={() => navigate(`/?id=${stone.id}`)}
      className="child-card group"
    >
      <div className="child-card-icon">
        <Gem size={18} />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-base font-bold text-[var(--color-text-primary)]">
            {stone.stoneState} <span className="text-[var(--color-text-muted)] font-medium text-sm">#{stone.id}</span>
          </span>
          <span className={`badge ${cfg.badge}`}>{cfg.label}</span>
          <TreatmentBadge isHeated={!!stone.isHeated} />
        </div>
        <span className="text-lg font-bold text-[var(--color-text-primary)]">{formatWeight(stone.weight)}</span>
        <TrailBreadcrumb trail={stone.trail} />
      </div>
      <ChevronRight size={20} className="text-[var(--color-text-muted)] group-hover:text-[var(--color-accent)] transition-colors flex-shrink-0" />
    </button>
  );
}

function GemImage({ src, alt }) {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-[var(--color-text-muted)]">
        <div className="w-14 h-14 rounded-2xl bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] flex items-center justify-center mb-3">
          <Gem size={26} className="text-[var(--color-text-muted)]" />
        </div>
        <p className="text-sm font-medium">Image unavailable</p>
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
        style={{ maxHeight: '280px' }}
        onLoad={() => setLoading(false)}
        onError={() => setError(true)}
      />
    </div>
  );
}

function DetailRow({ label, value, icon: Icon, mono = false }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5 border-b border-[var(--color-border-subtle)] last:border-b-0" style={{ background: 'var(--color-bg-card)' }}>
      <div className="flex items-center gap-2 text-[var(--color-text-muted)] text-xs font-semibold uppercase tracking-wide flex-shrink-0">
        {Icon && <Icon size={15} />}
        <span>{label}</span>
      </div>
      <span className={mono ? 'mono-addr text-xs' : 'text-[15px] font-semibold text-[var(--color-text-primary)] text-right'}>{value}</span>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="relative">
        <div className="w-11 h-11 rounded-full border-[3px] border-[var(--color-border-default)] border-t-[var(--color-text-primary)] animate-spin" />
        <div className="absolute inset-0 w-11 h-11 rounded-full border-[3px] border-transparent border-b-[var(--color-border-hover)] animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
      </div>
      <div className="text-center">
        <p className="text-[var(--color-text-secondary)] font-semibold text-sm">Loading stone data…</p>
        <p className="text-[var(--color-text-muted)] text-xs mt-1">Fetching from Polygon Amoy</p>
      </div>
    </div>
  );
}

// ── Disambiguation view: burned root whose branches settle into 2+
//    currently-existing stones (however many cuts deep that took) ──
function DisambiguationView({ burned, children, navigate }) {
  return (
    <div className="space-y-6 animate-slide-up">
      <div className="card-elevated p-6 sm:p-7">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[var(--color-accent-glow)] border border-[var(--color-accent-ring)] flex items-center justify-center flex-shrink-0">
            <Scissors size={24} className="text-[var(--color-accent)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <h2 className="text-xl sm:text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
                {burned.stoneState} <span className="text-[var(--color-text-muted)] text-base font-medium">#{burned.id}</span>
              </h2>
              <span className="badge badge-gray">Cut</span>
            </div>
            <p className="text-[var(--color-text-secondary)] text-sm leading-relaxed">
              This stone was cut and no longer exists on its own. It led to {children.length} stone{children.length === 1 ? '' : 's'} that {children.length === 1 ? 'is' : 'are'} still active today.
            </p>
          </div>
        </div>
      </div>

      <div className="card p-6 sm:p-7">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-accent-glow)] border border-[var(--color-accent-ring)] flex items-center justify-center">
            <Gem size={18} className="text-[var(--color-accent)]" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--color-text-primary)]">
              Currently Existing Stones ({children.length})
            </h3>
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Tap one to view its certificate</p>
          </div>
        </div>
        <div className="space-y-3">
          {children.map((child) => (
            <ResultCard key={child.id} stone={child} navigate={navigate} />
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
  const [childDetails, setChildDetails] = useState([]);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [error, setError] = useState(null);
  const [disambig, setDisambig] = useState(null);
  const [modalStone, setModalStone] = useState(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  const redirectedFrom = searchParams.get('from');

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

  useEffect(() => {
    if (!tokenId) return;
    let cancelled = false;

    const fetchAll = async () => {
      setFetchLoading(true);
      setError(null);
      setStone(null);
      setLineage([]);
      setChildDetails([]);
      setDisambig(null);
      setModalStone(null);

      try {
        const stoneData = await getStoneDetails(tokenId);
        if (cancelled) return;

        if (!stoneData.timestamp) {
          setError(`Stone #${tokenId} does not exist on the blockchain.`);
          setFetchLoading(false);
          return;
        }

        // ── Burned stone: resolve all the way down to whatever currently exists ──
        if (stoneData.status === 2) {
          const rootChildIds = await getChildIds(tokenId);
          if (cancelled) return;

          if (rootChildIds.length > 0) {
            const resolved = await resolveCurrentDescendants(tokenId, { getStoneDetails, getChildIds });
            if (cancelled) return;

            const liveOnly = resolved.filter((r) => !r.deadEnd);
            const hasDeadEnds = resolved.some((r) => r.deadEnd);

            if (resolved.length === 1 && liveOnly.length === 1) {
              // Whole tree collapses to exactly one live stone, however deep.
              navigate(`/?id=${liveOnly[0].id}&from=${tokenId}`, { replace: true });
              return;
            }

            if (resolved.length >= 1 && (liveOnly.length >= 1 || hasDeadEnds)) {
              setDisambig({ burned: { id: tokenId, ...stoneData }, children: resolved });
              setFetchLoading(false);
              return;
            }
          }
          // Edge case: burned with no children recorded at all — fall through
          // and display this record on its own, like any other stone.
        }

        // ── Normal load for Active / Pending stones (or a dead-end burned one) ──
        setStone(stoneData);

        const [lineageData, childIds] = await Promise.all([
          getLineage(tokenId),
          getChildIds(tokenId),
        ]);
        if (cancelled) return;

        setLineage(lineageData);

        if (childIds.length > 0) {
          const details = await Promise.all(childIds.map((id) => getStoneDetails(id)));
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

  // Certificates encode a full verification URL (see QRGenerator.jsx:
  // `${origin}/?id=${tokenId}`), so try to pull the id out of a URL first;
  // fall back to treating the scanned text as a bare numeric id, in case
  // the QR was generated or re-printed some other way.
  const handleScanResult = (decodedText) => {
    setScannerOpen(false);

    let id = null;
    try {
      const url = new URL(decodedText);
      const fromQuery = url.searchParams.get('id');
      if (fromQuery) id = parseInt(fromQuery, 10);
    } catch {
      // Not a URL — fall through to the plain-number check below.
    }
    if (id === null || isNaN(id)) {
      const raw = parseInt(decodedText.trim(), 10);
      if (!isNaN(raw)) id = raw;
    }

    if (id !== null && !isNaN(id) && id > 0) {
      setSearchInput(String(id));
      navigate(`/?id=${id}`);
    } else {
      setError("The scanned QR code didn't contain a valid Stone ID.");
    }
  };

  const ipfsImageUrl = stone ? resolveIpfsImage(stone.ipfsUri) : null;
  const statusCfg  = stone ? statusCfgFor(stone.status) : null;
  const StatusIcon = statusCfg?.icon;

  const redirectedFromStone = redirectedFrom
    ? lineage.find((s) => s.id === parseInt(redirectedFrom, 10))
    : null;
  const parentStone = stone && stone.parentTokenId
    ? lineage.find((s) => s.id === stone.parentTokenId)
    : null;

  return (
    <div className="max-w-3xl lg:max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {/* ── HERO + SEARCH ── */}
      <div className="mb-9 sm:mb-12">
        <div className="text-center mb-7 sm:mb-9">
          <span className="eyebrow mb-4">Blockchain Provenance</span>
          <h1 className="text-3xl sm:text-4xl font-bold text-[var(--color-text-primary)] tracking-tight mb-3">
            Verify <span className="gradient-text">Gemstone</span>
          </h1>
          <p className="text-[var(--color-text-secondary)] text-sm sm:text-base max-w-sm mx-auto leading-relaxed">
            Enter a stone ID, or scan the QR code on your certificate
          </p>
        </div>

        <form onSubmit={handleSearch} className="max-w-xl mx-auto space-y-3">
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <input
              id="stone-search-input"
              type="text"
              inputMode="numeric"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Enter Stone ID (e.g. 42)"
              aria-label="Stone ID to verify"
              className="input pl-11 py-3.5"
              style={{ fontSize: '16px' }}
            />
          </div>
          <div className="flex gap-3">
            <button
              id="stone-search-btn"
              type="submit"
              className="btn btn-primary px-7 py-3.5 text-base flex-1 justify-center"
            >
              Verify
            </button>
            <button
              id="stone-scan-btn"
              type="button"
              onClick={() => setScannerOpen(true)}
              className="btn btn-secondary px-5 py-3.5 flex-1 flex items-center justify-center gap-2"
              aria-label="Scan QR code on certificate"
              title="Scan QR code"
            >
              <Camera size={18} />
              <span>Scan</span>
            </button>
          </div>
        </form>
      </div>

      <QrScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScanResult}
      />

      {/* ── WELCOME STATE ── */}
      {!tokenId && !error && (
        <div className="text-center py-10 sm:py-14 animate-fade-in">
          <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-[var(--color-accent-glow)] border border-[var(--color-accent-ring)] flex items-center justify-center animate-float-slow">
            <Diamond size={38} className="text-[var(--color-accent)]" />
          </div>
          <h3 className="text-xl font-bold text-[var(--color-text-primary)] mb-2 tracking-tight">Ready to Verify</h3>
          <p className="text-[var(--color-text-secondary)] text-sm max-w-xs mx-auto leading-relaxed">
            Enter a stone ID above to see its authenticity and full history.
          </p>

          <div className="mt-9 grid grid-cols-3 gap-3 max-w-md mx-auto">
            {[
              { icon: ShieldCheck, label: 'Tamper-proof' },
              { icon: GitBranch,   label: 'Full Lineage' },
              { icon: FileCheck,   label: 'NGJA Certified' },
            ].map((item, i) => (
              <div key={i} className="card p-4 text-center">
                <div className="w-10 h-10 mx-auto mb-2.5 rounded-xl bg-[var(--color-accent-glow)] border border-[var(--color-accent-ring)] flex items-center justify-center">
                  <item.icon size={18} className="text-[var(--color-accent)]" />
                </div>
                <p className="text-[var(--color-text-primary)] text-xs font-bold leading-tight">{item.label}</p>
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
            <p className="font-bold text-red-300 text-sm">{error}</p>
            <p className="text-red-400/70 text-xs mt-1">Please check the ID and try again</p>
          </div>
        </div>
      )}

      {/* ── LOADING ── */}
      {tokenId && fetchLoading && <Spinner />}

      {/* ── DISAMBIGUATION VIEW: cut stone, resolved to 2+ live stones ── */}
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

          {/* Back to parent — opens a snapshot, doesn't bounce you away */}
          {parentStone && (
            <button
              onClick={() => setModalStone(parentStone)}
              className="btn btn-ghost btn-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            >
              <ArrowLeft size={14} />
              Cut from Stone #{stone.parentTokenId}
            </button>
          )}

          {/* Redirected-from info banner */}
          {redirectedFrom && (
            <div className="alert alert-info flex items-start gap-3">
              <Info size={16} className="flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">Stone #{redirectedFrom} was cut — this is the current result</p>
                {redirectedFromStone && (
                  <button
                    onClick={() => setModalStone(redirectedFromStone)}
                    className="underline underline-offset-2 hover:opacity-100 opacity-80 text-xs mt-1"
                  >
                    View original record
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Status Banner */}
          <div className={`status-hero status-hero--${stone.status === 0 ? 'active' : stone.status === 1 ? 'pending' : 'burned'}`}>
            <div className="status-hero-icon">
              <StatusIcon size={22} />
            </div>
            <div>
              <h4 className="text-base">{statusCfg.plain}</h4>
              <p className="text-sm">{statusCfg.sub}</p>
            </div>
          </div>

          {/* ── STONE HEADER CARD ── */}
          <div className="card-elevated p-6 sm:p-7">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-[var(--color-accent-glow)] border border-[var(--color-accent-ring)] flex items-center justify-center flex-shrink-0">
                <Diamond size={28} className="text-[var(--color-accent)]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <h2 className="text-2xl sm:text-3xl font-bold text-[var(--color-text-primary)] tracking-tight">
                    {stone.stoneState} <span className="text-[var(--color-text-muted)] font-semibold text-base">#{tokenId}</span>
                  </h2>
                  <span className={`badge ${statusCfg.badge}`}>{statusCfg.label}</span>
                  <TreatmentBadge isHeated={!!stone.isHeated} />
                </div>
                <p className="text-[var(--color-text-secondary)] text-sm">{formatDate(stone.timestamp)}</p>
              </div>
            </div>

            <div className="divider my-5" />

            {/* Weight as the hero stat — the number a buyer actually cares about */}
            <div className="flex items-baseline gap-2 mb-5">
              <span className="text-4xl font-bold text-[var(--color-text-primary)] tracking-tight">{formatWeight(stone.weight)}</span>
              <span className="text-sm text-[var(--color-text-muted)] font-medium">carat weight</span>
            </div>

            <div className="rounded-2xl overflow-hidden border border-[var(--color-border-subtle)]">
              <DetailRow label="Stage"      value={stone.stoneState}                                                         icon={Gem} />
              <DetailRow label="Treatment"  value={<TreatmentBadge isHeated={!!stone.isHeated} />}                            icon={stone.isHeated ? Flame : Leaf} />
              <DetailRow label="Certified"  value={formatDate(stone.timestamp)}                                               icon={Clock} />
              <DetailRow label="Custodian"  value={shortAddr(stone.custodian)}                                                icon={User} mono />
              <DetailRow label="Parent ID"  value={stone.parentTokenId === 0 ? 'Genesis (None)' : `#${stone.parentTokenId}`} icon={GitBranch} />
              <DetailRow label="Token ID"   value={`#${tokenId}`}                                                             icon={FileCheck} />
            </div>
          </div>

          {/* ── LAB COMMENTS — its own card, separate from the status/treatment
                badges above, so free-text lab notes never get visually mixed
                with the stone's lifecycle state or treatment disclosure ── */}
          {stone.labComments && (
            <div className="card p-6 sm:p-7">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[var(--color-accent-glow)] border border-[var(--color-accent-ring)] flex items-center justify-center">
                  <MessageSquare size={18} className="text-[var(--color-accent)]" />
                </div>
                <h3 className="text-base font-bold text-[var(--color-text-primary)]">Lab Comments</h3>
              </div>
              <p className="text-[var(--color-text-secondary)] text-sm leading-relaxed">{stone.labComments}</p>
            </div>
          )}

          {/* ── GEM IMAGE ── */}
          {ipfsImageUrl && (
            <div className="card p-6 sm:p-7">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-[var(--color-accent-glow)] border border-[var(--color-accent-ring)] flex items-center justify-center">
                  <Diamond size={18} className="text-[var(--color-accent)]" />
                </div>
                <h3 className="text-base font-bold text-[var(--color-text-primary)]">Certificate Image</h3>
              </div>
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

          {/* ── PROVENANCE JOURNEY ── */}
          <div className="card p-6 sm:p-7">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-[var(--color-accent-glow)] border border-[var(--color-accent-ring)] flex items-center justify-center">
                <GitBranch size={18} className="text-[var(--color-accent)]" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--color-text-primary)]">Provenance Timeline</h3>
                <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Tap any step to see that stone's details</p>
              </div>
            </div>

            {lineage.length > 0 ? (
              <div className="relative">
                <div className="journey-legend text-xs">
                  <span className="journey-legend-item"><span className="journey-legend-dot legend-active" /> Active</span>
                  <span className="journey-legend-item"><span className="journey-legend-dot legend-pending" /> Pending</span>
                  <span className="journey-legend-item"><span className="journey-legend-dot legend-burned" /> Cut</span>
                </div>
                <div className="journey">
                  <div className="journey-line" />
                  {lineage.map((s, i) => (
                    <TimelineNode
                      key={s.id}
                      stone={s}
                      isCurrent={s.id === tokenId}
                      isFirst={i === 0}
                      index={i}
                      onOpen={setModalStone}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="empty-state py-10">
                <div className="empty-state-icon w-14 h-14 mb-3">
                  <Diamond size={24} className="text-[var(--color-accent)]" />
                </div>
                <p className="text-[var(--color-text-secondary)] font-semibold text-sm">Genesis Stone</p>
                <p className="text-[var(--color-text-muted)] text-xs mt-1">No prior history — it all starts here</p>
              </div>
            )}
          </div>

          {/* ── CHILD STONES (defensive: normally empty for Active/Pending) ── */}
          {childDetails.length > 0 && (
            <div className="card p-6 sm:p-7">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-[var(--color-accent-glow)] border border-[var(--color-accent-ring)] flex items-center justify-center">
                  <Scissors size={18} className="text-[var(--color-accent)]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--color-text-primary)]">Resulting Stones</h3>
                  <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Tap to view each certificate</p>
                </div>
              </div>
              <div className="space-y-3">
                {childDetails.map((child) => (
                  <ResultCard key={child.id} stone={child} navigate={navigate} />
                ))}
              </div>
            </div>
          )}

          {/* ── QR CODE ── */}
          <div className="card p-6 sm:p-7">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-[var(--color-accent-glow)] border border-[var(--color-accent-ring)] flex items-center justify-center">
                <FileCheck size={18} className="text-[var(--color-accent)]" />
              </div>
              <h3 className="text-base font-bold text-[var(--color-text-primary)]">Certificate QR Code</h3>
            </div>
            <div className="qr-card">
              <div className="qr-frame">
                <QRGenerator tokenId={tokenId} />
              </div>
              <p className="text-[var(--color-text-muted)] text-xs text-center mt-4 max-w-xs">
                Scan to verify on any device — no wallet needed
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── SNAPSHOT MODAL (timeline node / parent / redirected-from) ── */}
      <StoneSnapshotModal stone={modalStone} onClose={() => setModalStone(null)} />
    </div>
  );
}