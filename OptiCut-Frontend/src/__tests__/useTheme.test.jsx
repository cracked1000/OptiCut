/**
 * Theme hook tests — dark/light persistence + document class sync.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ThemeProvider, useTheme } from '../hooks/useTheme'

function Probe() {
  const { theme, toggleTheme } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={toggleTheme}>toggle</button>
    </div>
  )
}

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
  })

  it('defaults to the OS preference when nothing is saved', () => {
    window.matchMedia = () => ({ matches: true })
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('theme').textContent).toBe('dark')
  })

  it('defaults to light when OS prefers light', () => {
    window.matchMedia = () => ({ matches: false })
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('theme').textContent).toBe('light')
  })

  it('restores a saved theme from localStorage', () => {
    localStorage.setItem('opticut-theme', 'light')
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('theme').textContent).toBe('light')
  })

  it('toggles the theme and persists it', () => {
    localStorage.setItem('opticut-theme', 'dark')
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('theme').textContent).toBe('dark')
    act(() => fireEvent.click(screen.getByText('toggle')))
    expect(screen.getByTestId('theme').textContent).toBe('light')
    expect(localStorage.getItem('opticut-theme')).toBe('light')
  })

  it('syncs the document class list', () => {
    localStorage.setItem('opticut-theme', 'dark')
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    act(() => fireEvent.click(screen.getByText('toggle')))
    expect(document.documentElement.classList.contains('light')).toBe(true)
  })

  it('throws when used outside the provider', () => {
    expect(() => render(<Probe />)).toThrow('useTheme must be used within ThemeProvider')
  })
})
