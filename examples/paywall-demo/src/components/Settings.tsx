import { useSettings } from '../hooks/useSettings';

export function Settings() {
  const { endpoint, setEndpoint } = useSettings();

  return (
    <section className="panel settings-panel">
      <h2>⚙️ Settings</h2>
      
      <div className="setting-row">
        <label>API Endpoint:</label>
        <div className="toggle-group">
          <button 
            className={endpoint === 'content' ? 'active' : ''}
            onClick={() => setEndpoint('content')}
          >
            /content
          </button>
          <button 
            className={endpoint === 'audio' ? 'active' : ''}
            onClick={() => setEndpoint('audio')}
          >
            /audio
          </button>
        </div>
      </div>
      
      <p className="setting-description">
        {endpoint === 'content' 
          ? '📄 JSON response with signed URL + grant replay support'
          : '🎵 Direct binary audio stream (simpler, no grants)'}
      </p>
    </section>
  );
}
