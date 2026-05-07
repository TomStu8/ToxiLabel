import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import PrivateRoute from './components/PrivateRoute'
import Login from './pages/Login'
import AdminDashboard from './pages/AdminDashboard'
import AnnotatorDashboard from './pages/AnnotatorDashboard'
import AnnotationView from './pages/AnnotationView'
import ProjectTaskList from './pages/ProjectTaskList'

function Dashboard() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'admin') return <AdminDashboard />
  return <AnnotatorDashboard />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/project/:projectId/tasks"
            element={
              <PrivateRoute>
                <ProjectTaskList />
              </PrivateRoute>
            }
          />
          <Route
            path="/annotate/:taskId"
            element={
              <PrivateRoute>
                <AnnotationView />
              </PrivateRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
