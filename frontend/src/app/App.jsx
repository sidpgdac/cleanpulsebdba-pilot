import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

const QRFlow = lazy(() => import('../pages/public/QRFlow'));
const CleanPulseApp = lazy(() => import('./CleanPulseApp'));

function Loading() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeContent: 'center', justifyItems: 'center', gap: 15, background: 'var(--canvas)' }}>
      <div style={{ width: 42, height: 42, border: '3px solid var(--green)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <b style={{ fontSize: 11, letterSpacing: '0.1em', color: 'var(--muted)' }}>LOADING</b>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          {/* Public Citizen/Cleaner QR flow */}
          <Route path="/t/:code" element={<QRFlow />} />
          
          {/* Main App (Admin and Supervisor) - Uses internal view state for navigation */}
          <Route path="/*" element={<CleanPulseApp />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
