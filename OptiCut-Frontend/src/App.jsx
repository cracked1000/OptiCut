import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Diamond, Shield, FlaskConical, Search, Menu, X, AlertTriangle } from 'lucide-react';
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
      className={`group flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 ${
        isActive 
          ? 'bg-white/10 text-white' 
          : 'text-gray-400 hover:text-white hover:bg-white/5'
      }`}
    >
      {Icon && <Icon size={16} className={isActive ? 'text-white' : 'text-gray-500 group-hover:text-gray-300'} />}
      {children}
    </Link>
  );
}

function ContractErrorBanner({ error }) {
  if (!error) return null;
  return (
    <div className="bg-red-950/80 border-b border-red-800/50 text-red-300 text-sm px-6 py-3 flex items-start gap-3 animate-fade-in">
      <AlertTriangle size={18} className="flex-shrink-0 mt-0.5 text-red-400" />
      <div className="flex-1">
        <span className="font-bold text-red-200">Contract not reachable — </span>
        {error.includes('Hardhat') ? (
          <>
            Your Hardhat node may have restarted (contract reset).{' '}
            <span className="font-semibold text-red-200">Run:</span>{' '}
            <code className="bg-red-900/50 px-1.5 py-0.5 rounded font-mono text-xs text-red-300">
              cd OptiCut-Backend && npx hardhat node
            </code>{' '}
            then{' '}
            <code className="bg-red-900/50 px-1.5 py-0.5 rounded font-mono text-xs text-red-300">
              npx hardhat run scripts/deployPure.js
            </code>
            {', '}then <span className="font-semibold text-red-200">Reset Account</span> in MetaMask → Settings → Advanced.
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
          <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition">
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
            <Link to="/" className="flex items-center gap-3 group focus:outline-none">
              <div className="w-10 h-10 bg-[var(--color-text-primary)] rounded-xl flex items-center justify-center transition-all">
                <Diamond className="h-5 w-5 text-[var(--color-bg-primary)]" />
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-lg tracking-tight text-[var(--color-text-primary)] leading-none">OptiCut</span>
                <span className="text-[10px] text-[var(--color-text-muted)] font-semibold tracking-widest uppercase mt-0.5">by NGJA</span>
              </div>
            </Link>

            <div className="hidden lg:flex items-center gap-1">
              <NavLink to="/" icon={Search}>Verify Stone</NavLink>
              {isLab && <NavLink to="/dashboard" icon={FlaskConical}>Lab Portal</NavLink>}
              {isNgjaAdmin && <NavLink to="/admin" icon={Shield}>NGJA Admin</NavLink>}
              
              {account ? (
                <div className="ml-2 pl-2 border-l border-[var(--color-border-default)] flex items-center gap-2">
                  <span className="font-mono text-xs px-3 py-1.5 bg-white/5 border border-[var(--color-border-default)] rounded-full text-[var(--color-text-secondary)]">
                    {account.slice(0, 6)}...{account.slice(-4)}
                  </span>
                </div>
              ) : (
                <button
                  onClick={blockchain.connect}
                  className="ml-2 flex items-center gap-1.5 bg-[var(--color-text-primary)] hover:bg-[var(--color-text-primary)]/90 text-[var(--color-bg-primary)] px-4 py-2 rounded-full text-xs font-semibold transition"
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
              <button className="p-2 hover:bg-white/5 rounded-full transition" onClick={() => setMobileNavOpen(true)}>
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
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-[var(--color-text-primary)] rounded-lg flex items-center justify-center">
                <Diamond className="h-4 w-4 text-[var(--color-bg-primary)]" />
              </div>
              <div>
                <p className="text-[var(--color-text-secondary)] text-sm font-semibold">OptiCut by NGJA</p>
                <p className="text-[var(--color-text-muted)] text-xs">Authenticity on the Blockchain</p>
              </div>
            </div>
            <p className="text-[var(--color-text-muted)] text-xs">
              &copy; {new Date().getFullYear()} National Gem & Jewellery Authority. All rights reserved.
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
