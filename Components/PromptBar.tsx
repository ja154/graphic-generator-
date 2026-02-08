/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
import React, {useCallback, useRef, useState} from 'react';

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface StudioSettings {
  systemPrompt: string;
  aspectRatio: "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
  isProMode: boolean;
}

export function PromptBar({
  onSubmit,
  settings,
  onSettingsChange,
}: {
  onSubmit: (prompt: string, imageSrc: string) => Promise<void>;
  settings: StudioSettings;
  onSettingsChange: (s: StudioSettings) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptInputRef = useRef<HTMLInputElement>(null);

  const handleRun = useCallback(async () => {
    if ((!prompt && !imageFile) || isGenerating) return;
    
    // Pro Mode check
    if (settings.isProMode && window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (!hasKey) {
            await window.aistudio.openSelectKey();
        }
    }

    setIsGenerating(true);
    let img = null;
    if (imageFile) img = await fileToBase64(imageFile);

    try {
        await onSubmit(prompt, img);
        setPrompt('');
        setImageFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
        setIsGenerating(false);
        promptInputRef.current?.focus();
    }
  }, [prompt, imageFile, isGenerating, onSubmit, settings]);

  return (
    <div className="prompt-bar-wrapper">
      {showSettings && (
        <div className="studio-settings-drawer" onKeyDown={e => e.stopPropagation()}>
          <div className="settings-header">
            <h3>Master Style Guidelines</h3>
            <button onClick={() => setShowSettings(false)}>×</button>
          </div>
          
          <div className="settings-section">
            <label>Master Visual Style & Constraints</label>
            <textarea 
              value={settings.systemPrompt}
              onChange={(e) => onSettingsChange({...settings, systemPrompt: e.target.value})}
              placeholder="System prompt for visual style..."
              style={{ minHeight: '180px' }}
            />
          </div>

          <div className="settings-row">
            <div className="settings-section">
              <label>Output Format</label>
              <div className="ratio-grid">
                {["1:1", "4:3", "3:4", "16:9", "9:16"].map(r => (
                  <button 
                    key={r}
                    className={settings.aspectRatio === r ? 'active' : ''}
                    onClick={() => onSettingsChange({...settings, aspectRatio: r as any})}
                  >{r}</button>
                ))}
              </div>
            </div>

            <div className="settings-section">
              <label>Quality Mode</label>
              <div className="pro-toggle">
                <input 
                  type="checkbox" 
                  id="pro-mode" 
                  checked={settings.isProMode} 
                  onChange={(e) => onSettingsChange({...settings, isProMode: e.target.checked})}
                />
                <label htmlFor="pro-mode">Enable 1K Pro Rendering</label>
              </div>
              <p className="pro-tip">Gemini 3 Pro recommended for complex character anatomy.</p>
            </div>
          </div>
        </div>
      )}

      <div className="prompt-bar" onKeyDown={(e) => e.stopPropagation()}>
        <button 
          className={`prompt-bar-button studio-toggle ${showSettings ? 'active' : ''}`}
          onClick={() => setShowSettings(!showSettings)}
          title="Studio Styles"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>
        </button>

        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => e.target.files && setImageFile(e.target.files[0])}
          style={{display: 'none'}}
          accept="image/*"
        />

        {imageFile && (
          <div className="prompt-image-preview">
            <img src={URL.createObjectURL(imageFile)} alt="preview" />
            <button className="prompt-image-preview-close" onClick={() => setImageFile(null)}>×</button>
          </div>
        )}

        <input
          ref={promptInputRef}
          type="text"
          className="prompt-input"
          placeholder="Enter Brief: Characters, Activity, Setting..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleRun()}
          disabled={isGenerating}
        />
        
        <button
          className="prompt-bar-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isGenerating}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        </button>

        <button
          className={`prompt-bar-button run-button ${settings.isProMode ? 'pro' : ''}`}
          onClick={handleRun}
          disabled={isGenerating || (!prompt && !imageFile)}
        >
          {isGenerating ? 'Rendering...' : 'Capture'}
        </button>
      </div>
    </div>
  );
}
