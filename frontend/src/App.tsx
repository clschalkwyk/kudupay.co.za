import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
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
import { AuthProvider, useAuth } from './contexts/AuthContext'
import AdminLogin from './components/AdminLogin'
import AdminPanel from './components/AdminPanel'
import PayPage from './components/PayPage'
import StudentAppShell from './components/student/AppShell'
import StudentHome from './components/student/screens/Home'
import StudentBudgets from './components/student/screens/Budgets'
import StudentActivity from './components/student/screens/Activity'
import StudentMe from './components/student/screens/Me'

function NavMaybe() {
  const location = useLocation()
  if (location.pathname.startsWith('/app')) return null
  return <Navigation />
}

function AutoStudentRedirect() {
  const { user } = useAuth()
  const loc = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    const inPwa = typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches
    if (inPwa && user?.role === 'student' && (loc.pathname === '/' || loc.pathname === '/for-students')) {
      navigate('/app', { replace: true })
    }
  }, [user?.role, loc.pathname, navigate])
  return null
}

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Router>
          <div className="min-h-screen bg-kalahari-sand-light">
            {/* Navigation */}
            <NavMaybe />
            <AutoStudentRedirect />

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

              {/* Student PWA app shell and tabs */}
              <Route
                path="/app"
                element={
                  <ProtectedRoute allowedRoles={['student']}>
                    <StudentAppShell />
                  </ProtectedRoute>
                }
              >
                <Route index element={<StudentHome />} />
                <Route path="pay" element={<PayPage />} />
                <Route path="budgets" element={<StudentBudgets />} />
                <Route path="activity" element={<StudentActivity />} />
                <Route path="me" element={<StudentMe />} />
              </Route>
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