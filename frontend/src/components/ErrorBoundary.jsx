import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(err) {
    return { hasError: true, message: err.message || 'Something went wrong' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: '100vh', width: '100vw', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', background: '#0f172a', color: '#e2e8f0',
          fontFamily: 'sans-serif', gap: '10px'
        }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Something went wrong</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{this.state.message}</div>
          <button
            onClick={() => this.setState({ hasError: false })}
            style={{
              marginTop: 10, padding: '8px 16px', background: '#2563eb',
              color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
