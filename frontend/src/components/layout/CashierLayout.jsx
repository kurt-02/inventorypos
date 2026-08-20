import AppLayout from './AppLayout';

const LINKS = [
  { to: '/pos', label: 'POS', end: true },
  { to: '/pos/inventory', label: 'Inventory' },
  { to: '/pos/inventory-check', label: 'Shift Count' },
  { to: '/pos/sales', label: "Today's Sales" },
];

export default function CashierLayout() {
  return <AppLayout links={LINKS} sectionLabel="Cashier" />;
}
