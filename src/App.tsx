import { Routes, Route } from 'react-router-dom';
import { NDKProvider } from './lib/ndk';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';

function App() {
  return (
    <NDKProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </Layout>
    </NDKProvider>
  );
}

export default App;
