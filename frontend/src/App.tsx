import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Navigation from './components/Navigation'
import BackToTop from './components/BackToTop'
import HomePage from './components/HomePage'
import ForStudents from './components/ForStudents'
import ForStudentsLogin from './components/ForStudentsLogin'
import ForSponsors from './components/ForSponsors'
import ForMerchants from './components/ForMerchants'
import AboutKoos from './components/AboutKoos'
import Join from './components/Join'
import ProtectedRoute from './components/ProtectedRoute'
import { ToastProvider } from './contexts/ToastContext'
import { AuthProvider } from './contexts/AuthContext'
import AdminLogin from './components/AdminLogin'
import AdminPanel from './components/AdminPanel'
import PayPage from './components/PayPage'

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Router>
          <div className="min-h-screen bg-kalahari-sand-light">
            {/* Navigation */}
            <Navigation />

            {/* Main Content */}
            <Routes>
              <Route path="/" element={ <HomePage /> } />
              <Route path="/join" element={<Join />} />
              <Route path="/for-students" element={
                <ProtectedRoute allowedRoles={['student']}>
                  <ForStudents />
                </ProtectedRoute>
              } />
              <Route path="/for-students/login/verify-intent" element={<ForStudentsLogin />} />
              <Route path="/for-sponsors" element={
                <ProtectedRoute allowedRoles={['sponsor']}>
                  <ForSponsors />
                </ProtectedRoute>
              } />
              <Route path="/for-merchants" element={
                <ProtectedRoute allowedRoles={['merchant']}>
                  <ForMerchants />
                </ProtectedRoute>
              } />
              <Route path="/admin" element={
                <ProtectedRoute allowedRoles={['admin']} fallback={<AdminLogin />}>
                  <AdminPanel />
                </ProtectedRoute>
              } />
              <Route path="/about-koos" element={ <AboutKoos /> } />
              <Route path="/pay" element={
                <ProtectedRoute allowedRoles={['student']}>
                  <PayPage />
                </ProtectedRoute>
              } />
            </Routes>

            {/* Back to Top */}
            <BackToTop />
          </div>
        </Router>
      </AuthProvider>
    </ToastProvider>
  )
}

export default App