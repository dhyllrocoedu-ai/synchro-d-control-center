import { BrowserRouter } from 'react-router-dom';
import { SyncStatusProvider } from './hooks/useSync';
import { AuthProvider } from './context/AuthContext';
import { RoutesWrapper } from './components/RoutesWrapper';
import { NavigationBridge } from './components/NavigationBridge';
import { TitleBar } from './components/layout/TitleBar';

function App() {
  return (
    <BrowserRouter>
      <NavigationBridge />
      <SyncStatusProvider>
        <AuthProvider>
          <div className="flex h-screen flex-col overflow-hidden">
            <TitleBar />
            <div className="flex-1 overflow-hidden">
              <RoutesWrapper />
            </div>
          </div>
        </AuthProvider>
      </SyncStatusProvider>
    </BrowserRouter>
  );
}

export default App;