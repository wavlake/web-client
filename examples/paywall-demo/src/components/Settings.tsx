import { useSettings } from '../hooks/useSettings';

const DESCRIPTIONS = {
  'content': '📄 /content → JSON with signed URL + grant replay (2 requests)',
  'audio': '🎵 /audio → Direct binary stream via header token (1 request)',
  'audio-url': '🔗 /audio?token= → URL param token for native <audio> element',
};

export function Settings() {
  const { endpoint, setEndpoint } = useSettings();

  return (
    <section className="panel settings-panel">
      <h2>⚙️ Settings</h2>
      
      <div className="setting-row">
        <label>Payment Method:</label>
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
          <button 
            className={endpoint === 'audio-url' ? 'active' : ''}
            onClick={() => setEndpoint('audio-url')}
          >
            URL token
          </button>
        </div>
      </div>
      
      <p className="setting-description">
        {DESCRIPTIONS[endpoint]}
      </p>
    </section>
  );
}
