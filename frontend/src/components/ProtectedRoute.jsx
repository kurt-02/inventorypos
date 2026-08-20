import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Spinner } from './Ui';

/**
 * Route guard. Waits for the initial silent refresh to finish, then redirects
 * unauthenticated users to /login and users with the wrong role to their own
 * home page (so a cashier can't reach /admin by typing the URL).
 */
export default function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Checking your session…" />;

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (role && user.role !== role) {
    return <Navigate to={user.role === 'admin' ? '/admin' : '/pos'} replace />;
  }

  return children;
}
