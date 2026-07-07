import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="theme-toggle"
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <div className="theme-toggle-thumb">
        {theme === 'dark' ? (
          <Moon size={10} className="text-black" />
        ) : (
          <Sun size={10} className="text-white" />
        )}
      </div>
    </button>
  );
}
