import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Shield, FlaskConical, Search, Menu, X, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import Dashboard from './pages/Dashboard';
import StoneViewer from './pages/StoneViewer';
import NgjaAdmin from './pages/NgjaAdmin';
import { useBlockchain } from './hooks/useBlockchain';
import { ThemeProvider } from './hooks/useTheme';
import ThemeToggle from './components/ThemeToggle';

function NavLink({ to, children, icon: Icon }) {
  const location = useLocation();
  const isActive = location.pathname === to || (to === '/' && location.search.includes('id=') && location.pathname === '/');
  return (
    <Link
      to={to}
      aria-current={isActive ? 'page' : undefined}
      className="nav-pill group flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-all duration-200"
    >
      {Icon && <Icon size={16} className="nav-pill-icon" />}
      {children}
    </Link>
  );
}

function ContractErrorBanner({ error }) {
  if (!error) return null;
  return (
    <div className="contract-error-banner text-sm px-6 py-3 flex items-start gap-3 animate-fade-in">
      <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <span className="font-bold">Contract not reachable — </span>
        {error.includes('Hardhat') ? (
          <>
            Your Hardhat node may have restarted (contract reset).{' '}
            <span className="font-semibold">Run:</span>{' '}
            <code className="banner-code">
              cd OptiCut-Backend && npx hardhat node
            </code>{' '}
            then{' '}
            <code className="banner-code">
              npx hardhat run scripts/deployPure.js
            </code>
            {', '}then <span className="font-semibold">Reset Account</span> in MetaMask → Settings → Advanced.
          </>
        ) : (
          error
        )}
      </div>
    </div>
  );
}

function MobileNav({ isOpen, setIsOpen, isLab, isNgjaAdmin }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
      <div className="absolute right-0 top-0 bottom-0 w-72 bg-[var(--color-bg-secondary)] border-l border-[var(--color-border-default)] p-6 animate-slide-down">
        <div className="flex justify-between items-center mb-8">
          <span className="font-bold text-[var(--color-text-primary)] text-lg">Menu</span>
          <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-[var(--color-bg-hover)] rounded-full transition">
            <X size={20} className="text-[var(--color-text-secondary)]" />
          </button>
        </div>
        <nav className="space-y-2">
          <NavLink to="/" icon={Search}>Verify Stone</NavLink>
          {isLab && <NavLink to="/dashboard" icon={FlaskConical}>Lab Portal</NavLink>}
          {isNgjaAdmin && <NavLink to="/admin" icon={Shield}>NGJA Admin</NavLink>}
        </nav>
      </div>
    </div>
  );
}

function AppLayout() {
  let blockchain;
  try {
    blockchain = useBlockchain() || {};
  } catch (err) {
    console.error('useBlockchain error:', err);
    blockchain = {};
  }

  const { contractError = null, account = null, isLab = false, isNgjaAdmin = false } = blockchain;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] flex flex-col font-sans selection:bg-gray-500/25 transition-colors duration-300">
      <ContractErrorBanner error={contractError} />

      <nav className="bg-[var(--color-bg-primary)]/90 backdrop-blur-xl border-b border-[var(--color-border-subtle)] sticky top-0 z-40 transition-colors duration-300">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <Link to="/" className="focus:outline-none">
              <span className="font-extrabold text-xl tracking-tight text-[var(--color-text-primary)]">OptiCut</span>
            </Link>

            <div className="hidden lg:flex items-center gap-1">
              <NavLink to="/" icon={Search}>Verify Stone</NavLink>
              {isLab && <NavLink to="/dashboard" icon={FlaskConical}>Lab Portal</NavLink>}
              {isNgjaAdmin && <NavLink to="/admin" icon={Shield}>NGJA Admin</NavLink>}
              
              {account ? (
                <div className="ml-2 pl-2 border-l border-[var(--color-border-default)] flex items-center gap-2">
                  <span className="mono-addr text-xs px-3 py-1.5 rounded-full">
                    <span className="inline-block w-2 h-2 rounded-full bg-[var(--color-success)] mr-2 align-middle shadow-[0_0_8px_var(--color-success)]" />
                    {account.slice(0, 6)}...{account.slice(-4)}
                  </span>
                </div>
              ) : (
                <button
                  onClick={blockchain.connect}
                  className="ml-2 flex items-center gap-1.5 btn btn-primary !py-2.5 px-5 rounded-full text-xs font-semibold"
                >
                  <Shield size={12} />
                  Connect Wallet
                </button>
              )}

              <div className="ml-2 pl-2 border-l border-[var(--color-border-default)]">
                <ThemeToggle />
              </div>
            </div>

            <div className="lg:hidden flex items-center gap-3">
              {account && (
                <span className="font-mono text-[10px] px-2.5 py-1 bg-white/5 border border-[var(--color-border-default)] rounded-full text-[var(--color-text-secondary)]">
                  {account.slice(0, 4)}...{account.slice(-4)}
                </span>
              )}
              <ThemeToggle />
              <button className="p-2 hover:bg-[var(--color-bg-hover)] rounded-full transition" onClick={() => setMobileNavOpen(true)}>
                <Menu size={20} className="text-[var(--color-text-secondary)]" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <MobileNav isOpen={mobileNavOpen} setIsOpen={setMobileNavOpen} isLab={isLab} isNgjaAdmin={isNgjaAdmin} />

      <main className="flex-grow">
        <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <Routes>
            <Route path="/" element={<StoneViewer />} />
            <Route path="/stone/:id" element={<StoneViewer />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/admin" element={<NgjaAdmin />} />
          </Routes>
        </div>
      </main>

      <footer className="bg-[var(--color-bg-secondary)] border-t border-[var(--color-border-subtle)] mt-auto transition-colors duration-300">
        <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-[var(--color-text-primary)] text-sm font-semibold">OptiCut</p>
            <p className="text-[var(--color-text-secondary)] text-xs">
              &copy; {new Date().getFullYear()} OptiCut
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <Router>
        <AppLayout />
      </Router>
    </ThemeProvider>
  );
}

export default App;


