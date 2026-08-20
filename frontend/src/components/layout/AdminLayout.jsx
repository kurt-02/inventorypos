import AppLayout from './AppLayout';

const LINKS = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/comparison', label: 'Comparison' },
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/recipes', label: 'Recipes' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/inventory', label: 'Inventory' },
  { to: '/admin/reports', label: 'Reports' },
];

export default function AdminLayout() {
  return <AppLayout links={LINKS} sectionLabel="Admin" />;
}
