import type { ReactNode } from 'react';

function Icon({ size = 18, children }: { size?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const LogoIcon = () => (
  <Icon size={22}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 8h8M12 8v9" /></Icon>
);
export const SunIcon = () => (
  <Icon><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Icon>
);
export const MoonIcon = () => (
  <Icon><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></Icon>
);
export const InboxIcon = () => (
  <Icon size={16}><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z" /></Icon>
);
export const PlusIcon = () => <Icon size={16}><path d="M12 5v14M5 12h14" /></Icon>;
export const CheckIcon = () => <Icon size={16}><path d="M20 6 9 17l-5-5" /></Icon>;
export const ChevronIcon = () => <Icon size={14}><path d="m6 9 6 6 6-6" /></Icon>;
