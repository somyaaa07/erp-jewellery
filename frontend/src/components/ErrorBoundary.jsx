// src/components/ErrorBoundary.jsx
// Previously, if any single page threw while rendering, React unmounted the whole app and the
// browser showed a completely white screen with no clue what happened. This catches that and
// shows a readable message plus a way back, so one broken page never kills the whole ERP.
import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the full stack in the console for debugging.
    console.error('Page crashed:', error, info);
  }

  componentDidUpdate(prevProps) {
    // Navigating to a different route should clear the error.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="card">
        <div className="card-body">
          <div className="state">
            <p className="state-title">This page ran into a problem</p>
            <p className="state-text">
              {this.state.error?.message || 'An unexpected error occurred while rendering this screen.'}
            </p>
            <div className="state-actions">
              <button type="button" className="btn" onClick={() => this.setState({ error: null })}>
                Try again
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { window.location.href = '/'; }}
              >
                Go to home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
