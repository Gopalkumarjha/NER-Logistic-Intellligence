import React from 'react';
import './Navbar.css';

export default function Navbar({ mode, setMode, theme, setTheme }) {
  return (
    <div className="navbar">
      <div className="navbar-left">
        <span className="logo-icon">🛰️</span>
        <div>
          <div className="navbar-title">NER Logistics Intelligence</div>
          <div className="navbar-subtitle">SIH26002 — Smart Accessibility Platform</div>
        </div>
      </div>
      <div className="navbar-right">
        <button
          className={`mode-btn ${mode === 'normal' ? 'active' : ''}`}
          aria-pressed={mode === 'normal'}
          onClick={() => setMode('normal')}
        >
          Normal Mode
        </button>
        <button
          className={`mode-btn emergency ${mode === 'emergency' ? 'active' : ''}`}
          aria-pressed={mode === 'emergency'}
          onClick={() => setMode('emergency')}
        >
          🚨 Emergency Mode
        </button>
        <button
          className="theme-toggle-btn"
          aria-label="Toggle light or dark theme"
          aria-pressed={theme === 'light'}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title="Toggle light/dark theme"
        >
          {theme === 'dark' ? '🌞 Light' : '🌙 Dark'}
        </button>
      </div>
    </div>
  );
}
