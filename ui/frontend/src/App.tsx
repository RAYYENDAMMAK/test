import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Subscribers from './pages/Subscribers';
import NFConfig from './pages/NFConfig';
import Metrics from './pages/Metrics';
import Topology from './pages/Topology';
import Logs from './pages/Logs';
import Tracing from './pages/Tracing';
import Slicing from './pages/Slicing';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard"   element={<Dashboard />} />
            <Route path="subscribers" element={<Subscribers />} />
            <Route path="nf-config"   element={<NFConfig />} />
            <Route path="metrics"     element={<Metrics />} />
            <Route path="topology"    element={<Topology />} />
            <Route path="logs"        element={<Logs />} />
            <Route path="tracing"     element={<Tracing />} />
            <Route path="slicing"     element={<Slicing />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
