import { Routes, Route, Navigate } from 'react-router-dom';

import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import BusinessPage from './pages/BusinessPage';
import TrackOrder from './pages/TrackOrder';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />

      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Login register />} />

      {/* All admin pages */}
      <Route path="/dashboard/*" element={<Dashboard />} />

      <Route path="/b/:slug" element={<BusinessPage />} />
      <Route path="/track/:token" element={<TrackOrder />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;