import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, Zap, ZapOff, AlertTriangle, Loader2 } from 'lucide-react';

const SCANNER_ELEMENT_ID = 'opticut-qr-scanner-region';

// ── Full-screen camera QR scanner ──
// Opens the device's back camera (on phones/tablets) and watches for a QR
// code. Built as its own fixed-position overlay (not the app's generic
// .modal-content box) because a live camera feed needs to fill as much of
// the small-screen viewport as possible to be usable.
export default function QrScannerModal({ isOpen, onClose, onScan }) {
  const scannerRef = useRef(null);
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setStarting(true);
    setError(null);
    setTorchOn(false);
    setTorchSupported(false);

    const instance = new Html5Qrcode(SCANNER_ELEMENT_ID, { verbose: false });
    scannerRef.current = instance;

    instance
      .start(
        { facingMode: 'environment' },
        {
          fps: 10,
          // Keep the scan box a fixed proportion of whatever viewport we get,
          // so it looks right on both a phone in portrait and a tablet.
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const size = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.7);
            return { width: size, height: size };
          },
        },
        (decodedText) => {
          if (cancelled) return;
          onScan(decodedText);
        },
        () => {
          // Fires continuously while no QR code is in frame — expected
          // during normal scanning, not a real error, so it's ignored.
        }
      )
      .then(() => {
        if (cancelled) return;
        setStarting(false);
        try {
          const capabilities = instance.getRunningTrackCapabilities?.();
          if (capabilities && capabilities.torch) {
            setTorchSupported(true);
          }
        } catch {
          // Torch support detection is best-effort; safe to skip.
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setStarting(false);
        const message = String(err?.message || err || '').toLowerCase();
        if (message.includes('permission') || message.includes('notallowed')) {
          setError('Camera access was denied. Please allow camera permission in your browser settings and try again.');
        } else if (message.includes('notfound')) {
          setError('No camera was found on this device.');
        } else {
          setError('Could not start the camera. You can still enter the Stone ID manually.');
        }
      });

    return () => {
      cancelled = true;
      const inst = scannerRef.current;
      scannerRef.current = null;
      if (inst) {
        inst
          .stop()
          .then(() => inst.clear())
          .catch(() => {
            // Scanner may already be stopped (e.g. closed before start()
            // resolved) — nothing to clean up in that case.
          });
      }
    };
  }, [isOpen, onScan]);

  const toggleTorch = useCallback(async () => {
    const inst = scannerRef.current;
    if (!inst) return;
    try {
      const next = !torchOn;
      await inst.applyVideoConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {
      // Some devices report torch support but reject the constraint at
      // runtime — fail quietly rather than show a confusing error over
      // an otherwise-working camera view.
    }
  }, [torchOn]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col" style={{ minHeight: '100dvh' }}>
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 py-4 flex-shrink-0"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center gap-2 text-white">
          <Camera size={20} />
          <span className="font-semibold text-sm">Scan Certificate QR Code</span>
        </div>
        <button
          onClick={onClose}
          className="w-11 h-11 flex items-center justify-center rounded-full bg-white/10 active:bg-white/20 transition"
          aria-label="Close scanner"
        >
          <X size={22} className="text-white" />
        </button>
      </div>

      {/* ── Camera viewport ── */}
      <div className="relative flex-1 overflow-hidden">
        <div
          id={SCANNER_ELEMENT_ID}
          className="w-full h-full [&_video]:!w-full [&_video]:!h-full [&_video]:!object-cover"
        />

        {starting && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black">
            <Loader2 size={28} className="text-white animate-spin" />
            <p className="text-white/70 text-sm">Starting camera…</p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black px-8 text-center">
            <AlertTriangle size={32} className="text-amber-400" />
            <p className="text-white text-sm max-w-xs">{error}</p>
            <button onClick={onClose} className="btn btn-secondary btn-sm">
              Close and enter ID manually
            </button>
          </div>
        )}
      </div>

      {/* ── Footer controls ── */}
      <div
        className="flex items-center justify-center gap-4 px-4 py-6 flex-shrink-0"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        {torchSupported && !error && (
          <button
            onClick={toggleTorch}
            className={`w-14 h-14 flex items-center justify-center rounded-full transition ${
              torchOn ? 'bg-white text-black' : 'bg-white/10 text-white active:bg-white/20'
            }`}
            aria-label={torchOn ? 'Turn off flashlight' : 'Turn on flashlight'}
          >
            {torchOn ? <Zap size={22} /> : <ZapOff size={22} />}
          </button>
        )}
        {!error && (
          <p className="text-white/60 text-xs text-center max-w-[220px]">
            Point your camera at the QR code on the gemstone certificate
          </p>
        )}
      </div>
    </div>
  );
}
