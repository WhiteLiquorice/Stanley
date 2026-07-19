import { Activity, Settings, ShieldAlert, Sparkles, Workflow } from 'lucide-react';

export const mobileDestinations = [
  { name: 'Stanley', path: '/dashboard', icon: Sparkles },
  { name: 'Automations', path: '/dashboard/automations', icon: Workflow },
  { name: 'Activity', path: '/dashboard/results', icon: Activity },
  { name: 'Inbox', path: '/dashboard/exceptions', icon: ShieldAlert },
  { name: 'You', path: '/dashboard/account', icon: Settings },
] as const;
