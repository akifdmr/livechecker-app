import {
    Activity,
    BarChart3,
    CreditCard,
    Database,
    FileText,
    LayoutDashboard,
    MessageSquare,
    Search,
    Settings, Shield,
    Terminal,
    Users, Wallet,
} from 'lucide-react';

export const NAV_GROUPS = [
  {
    id: 'core',
    label: 'Genel',
    icon: LayoutDashboard,
    defaultOpen: true,
    items: [
      { label: 'Dashboard',       path: '/dashboard',       icon: BarChart3 },
      { label: 'Live Kartlar',    path: '/live-cards',      icon: CreditCard },
      { label: 'Kart Kontrol',    path: '/check',           icon: Activity },
    ],
  },
  {
    id: 'finance',
    label: 'Finans',
    icon: Wallet,
    defaultOpen: false,
    items: [
      { label: 'POS',             path: '/pos',             icon: Terminal },
      { label: 'Provizyonlar',    path: '/provisions',      icon: FileText },
      { label: 'Krediler',        path: '/credits',         icon: Wallet },
      { label: 'Ledger',          path: '/ledger',          icon: Database },
    ],
  },
  {
    id: 'tools',
    label: 'Araçlar',
    icon: Search,
    defaultOpen: false,
    items: [
      { label: 'BIN Sorgu',       path: '/bin',             icon: Search },
      { label: 'Intel',           path: '/intel',           icon: Shield },
      { label: 'Processor',       path: '/processors',      icon: Database },
      { label: 'Routing',         path: '/processor-routing', icon: Activity },
    ],
  },
  {
    id: 'admin',
    label: 'Yönetim',
    icon: Settings,
    adminOnly: true,
    defaultOpen: false,
    items: [
      { label: 'Kullanıcılar',    path: '/admin/users',     icon: Users },
      { label: 'İstatistikler',   path: '/admin/stats',     icon: BarChart3 },
      { label: 'Audit',           path: '/admin/audit',     icon: FileText },
      { label: 'Mesajlar',        path: '/admin/messages',  icon: MessageSquare },
      { label: 'Ayarlar',         path: '/admin/settings',  icon: Settings },
    ],
  },
];