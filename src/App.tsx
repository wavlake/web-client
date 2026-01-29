import { NDKProvider } from './lib/ndk';
import DebugLayout from './components/DebugLayout';
import TrackList from './components/TrackList';

function App() {
  return (
    <NDKProvider>
      <DebugLayout trackList={<TrackList />} />
    </NDKProvider>
  );
}

export default App;
