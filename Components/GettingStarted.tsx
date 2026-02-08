/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
import React from 'react';

interface GettingStartedProps {
  onClose: () => void;
}

export function GettingStarted({onClose}: GettingStartedProps) {
  return (
    <div
      className="getting-started-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="getting-started-title">
      <div className="getting-started-content">
        <button
          className="getting-started-close"
          onClick={onClose}
          aria-label="Close getting started guide">
          &times;
        </button>
        <main>
          <h1 id="getting-started-title">AI Photo Studio</h1>
          <p className="getting-started-description">
            Generate and edit images on an infinite canvas. Combine text and image inputs to create something new.
          </p>
          <p className="getting-started-description">
            Use the "Master Style Guidelines" in settings to adhere to specific educational resource requirements.
          </p>
        </main>
      </div>
    </div>
  );
}