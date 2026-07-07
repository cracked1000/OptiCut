import { QRCodeSVG } from 'qrcode.react';
import { Download, Printer, ExternalLink } from 'lucide-react';

const QRGenerator = ({ tokenId, showActions = true }) => {
  const verificationUrl = `${window.location.origin}/?id=${tokenId}`;

  const handleDownload = () => {
    const svg = document.getElementById(`qr-${tokenId}`);
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width * 4;
      canvas.height = img.height * 4;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const link = document.createElement('a');
      link.download = `opticut-stone-${tokenId}-qr.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative p-5 bg-[var(--color-bg-tertiary)] rounded-2xl border border-[var(--color-border-default)] hover:border-[var(--color-border-hover)] transition-colors">
        <div className="absolute inset-0 bg-[var(--color-text-primary)]/[0.02] rounded-2xl" />
        <div className="relative">
          <QRCodeSVG 
            id={`qr-${tokenId}`}
            value={verificationUrl} 
            size={160}
            level="H"
            bgColor="transparent"
            fgColor="currentColor"
            includeMargin={false}
            style={{ color: 'var(--color-text-primary)' }}
          />
        </div>
      </div>

      <div className="mt-4 text-center">
        <p className="text-xs font-mono text-[var(--color-text-muted)] bg-[var(--color-bg-tertiary)] px-3 py-1.5 rounded-lg border border-[var(--color-border-subtle)]">
          Stone ID: <span className="text-[var(--color-text-primary)] font-bold">#{tokenId}</span>
        </p>
      </div>

      {showActions && (
        <div className="flex items-center gap-2 mt-4">
          <button 
            onClick={handleDownload}
            className="btn btn-sm btn-secondary"
          >
            <Download size={14} />
            Download
          </button>
          <button 
            onClick={() => window.print()} 
            className="btn btn-sm btn-secondary"
          >
            <Printer size={14} />
            Print
          </button>
          <a 
            href={verificationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm btn-secondary"
          >
            <ExternalLink size={14} />
            Open
          </a>
        </div>
      )}
    </div>
  );
};

export default QRGenerator;