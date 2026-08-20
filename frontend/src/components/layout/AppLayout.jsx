import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/** Brand mark: a stock crate seen head-on. Industry-neutral. */
function BrandMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="26" height="26" rx="6" className="fill-brand-500" />
      <path d="M9 12.5 16 9l7 3.5v7L16 23l-7-3.5v-7Z" fill="none" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 12.5 16 16l7-3.5M16 16v7" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Shared shell for both the cashier and admin sections. `links` differs per
 * role and is supplied by CashierLayout / AdminLayout.
 */
export default function AppLayout({ links, sectionLabel }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <BrandMark />
            <div>
              <p className="font-mono text-sm font-bold uppercase tracking-wider text-ink-900">
                Inventory <span className="text-brand-600">POS</span>
              </p>
              <p className="text-xs text-ink-500">{sectionLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-ink-900">{user?.full_name}</p>
              <p className="text-xs capitalize text-ink-500">
                {user?.role}
                {user?.branch_id ? ` · Branch #${user.branch_id}` : ''}
              </p>
            </div>
            <button type="button" onClick={handleLogout} className="btn-secondary">
              Log out
            </button>
          </div>
        </div>

        <nav className="mx-auto max-w-7xl px-4">
          <ul className="-mb-px flex flex-wrap gap-6">
            {links.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    `block border-b-2 pb-2.5 pt-1 text-sm font-medium transition-colors ${
                      isActive
                        ? 'border-brand-500 text-brand-600'
                        : 'border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-900'
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
