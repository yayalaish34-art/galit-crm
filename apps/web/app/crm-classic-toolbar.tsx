'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  User,
  Plus,
  Search,
  History,
  Inbox,
  CalendarDays,
  LayoutDashboard,
  Mail,
  Phone,
  Printer,
  MessageSquare,
  Link2,
  LifeBuoy,
  Upload,
  Download,
  FileText,
  Settings,
  Sparkles,
  ListOrdered,
  BarChart3,
  Table2,
  Tags,
  ClipboardCheck,
  Target,
  TrendingUp,
} from 'lucide-react';

const GLOBAL_SEARCH_INPUT_ID = 'global-crm-search-input';

/** ירוק מותג (כמו ב-page.tsx galit.primary) */
const GALIT_GREEN = '#4ba647';
const GALIT_GREEN_DARK = '#2f5c32';

export { GLOBAL_SEARCH_INPUT_ID };

/** ריווח תוכן: שורת טאבים + סרגל ירוק — עדכן אם משנים גבהים */
export const GALIT_TOPBAR_SPACER_CLASS = 'h-[8rem] shrink-0';

export type SettingsToolbarJumpTab =
  | 'import'
  | 'followupImport'
  | 'catalog'
  | 'targets'
  | 'customerClassification'
  | 'system'
  | 'statuses'
  | 'permissions'
  | 'templates'
  | 'services';

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function Sep() {
  return (
    <span
      className="hidden w-px shrink-0 self-stretch bg-white/35 sm:block"
      style={{ minHeight: '3.25rem' }}
      aria-hidden
    />
  );
}

type NavBtnProps = {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  active?: boolean;
};

function NavBtn({ label, Icon, onClick, disabled, title, active }: NavBtnProps) {
  return (
    <button
      type="button"
      title={title ?? label}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={cn(
        'flex h-full min-h-[3.25rem] w-auto min-w-[4.75rem] shrink-0 flex-col items-center justify-center gap-1 rounded-sm border px-2 py-2 text-xs font-semibold leading-snug text-white transition sm:min-w-[5.25rem] sm:px-2.5 sm:text-sm',
        active
          ? 'border-white/80 bg-black/20 text-white shadow-inner'
          : 'border-transparent bg-transparent hover:border-white/50 hover:bg-white/15',
        disabled && 'cursor-not-allowed opacity-45 hover:border-transparent hover:bg-transparent',
      )}
    >
      <Icon className="h-6 w-6 shrink-0 text-white sm:h-7 sm:w-7" />
      <span className="line-clamp-2 max-w-[6rem] text-center text-white">{label}</span>
    </button>
  );
}

type RibbonTab = 'file' | 'main' | 'extras';

type MenuKind = 'new' | 'search';

type DropdownPos = { top: number; right: number; minWidth: number };

function DropdownRow({
  label,
  disabled,
  title,
  onPick,
}: {
  label: string;
  disabled?: boolean;
  title?: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title ?? (disabled ? 'לא זמין' : label)}
      className={cn(
        'block w-full border-b border-slate-200 px-4 py-3 text-right text-sm font-medium text-slate-900 transition last:border-b-0 hover:bg-slate-100',
        disabled && 'cursor-not-allowed text-slate-400 hover:bg-transparent',
      )}
      onClick={() => {
        if (!disabled) onPick();
      }}
    >
      {label}
    </button>
  );
}

function useDropdownPosition(
  openMenu: MenuKind | null,
  newBtnRef: React.RefObject<HTMLButtonElement | null>,
  searchBtnRef: React.RefObject<HTMLButtonElement | null>,
) {
  const [pos, setPos] = useState<DropdownPos | null>(null);

  const measure = useCallback(() => {
    if (!openMenu) {
      setPos(null);
      return;
    }
    const el = openMenu === 'new' ? newBtnRef.current : searchBtnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      top: r.bottom + 6,
      right: Math.max(8, window.innerWidth - r.right),
      minWidth: Math.max(200, r.width),
    });
  }, [openMenu, newBtnRef, searchBtnRef]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    if (!openMenu) return;
    const onScroll = () => measure();
    const onResize = () => measure();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [openMenu, measure]);

  return pos;
}

const RibbonTabButton = React.forwardRef<
  HTMLButtonElement,
  { label: string; active: boolean; onClick: () => void }
>(function RibbonTabButton({ label, active, onClick }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={cn(
        'relative -mb-px rounded-t border border-b-0 px-4 py-2 text-sm font-bold transition sm:px-5 sm:text-[15px]',
        active
          ? 'z-[2] border-slate-500 bg-[#f2efe8] text-slate-900 shadow-sm'
          : 'z-[1] border-transparent bg-[#d8d4cc] text-slate-700 hover:bg-[#e4e0d8]',
      )}
    >
      {label}
    </button>
  );
});

/** כחול תפריט «קובץ» בסגנון מערכת ישנה */
const FILE_MENU_BLUE = '#1a4a7a';
const FILE_MENU_BLUE_DEEP = '#143a62';

type FilePanelPos = { top: number; right: number; width: number };

function useFilePanelPosition(open: boolean, tabRef: React.RefObject<HTMLButtonElement | null>) {
  const [pos, setPos] = useState<FilePanelPos | null>(null);

  const measure = useCallback(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const el = tabRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      top: r.bottom + 2,
      right: Math.max(8, window.innerWidth - r.right),
      width: Math.min(320, Math.max(260, r.width + 120)),
    });
  }, [open, tabRef]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => measure();
    const onResize = () => measure();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, measure]);

  return pos;
}

function FileMenuRow({
  label,
  disabled,
  title,
  active,
  onPick,
}: {
  label: string;
  disabled?: boolean;
  title?: string;
  active?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title ?? (disabled ? 'לא זמין' : label)}
      className={cn(
        'block w-full border-b border-white/20 px-4 py-3.5 text-right text-[15px] font-semibold leading-snug text-white transition last:border-b-0',
        !disabled && 'hover:bg-white/15 active:bg-white/25',
        disabled && 'cursor-not-allowed opacity-45 hover:bg-transparent',
        active && !disabled && 'bg-black/20',
      )}
      onClick={() => {
        if (!disabled) onPick();
      }}
    >
      {label}
    </button>
  );
}

/**
 * סרגל עליון: שורת טאבים (קובץ / ראשי / תוספות) + סרגל ירוק קבוע; תוכן הסרגל משתנה לפי הטאב.
 */
export function CrmLegacyTopNav({
  current,
  currentUserRole,
  canAccess,
  onNavigate,
  onFocusSearch,
  onOpenQuickCreate,
  onJumpSettingsTab,
  onLogout,
  onSearchCustomer,
  onSearchQuote,
  onNewCustomer,
  isCustomerCard = false,
}: {
  current: string;
  currentUserRole: string;
  canAccess: (role: string, key: string) => boolean;
  onNavigate: (target: string) => void;
  onFocusSearch: () => void;
  onOpenQuickCreate: () => void;
  /** קפיצה ללשונית בהגדרות (ייבוא / קטלוג / יעדים וכו') */
  onJumpSettingsTab: (tab: SettingsToolbarJumpTab) => void;
  /** יציאה מתפריט קובץ */
  onLogout: () => void;
  /** פתיחת חלון חיפוש לקוח מודרני */
  onSearchCustomer?: () => void;
  /** פתיחת חלון חיפוש הצעות מחיר מודרני */
  onSearchQuote?: () => void;
  /** חדש → לקוח — פתיחת כרטיס לקוח חדש (מצב יצירה) */
  onNewCustomer?: () => void;
  /** When true, render the toolbar with a premium light style instead of the dark green */
  isCustomerCard?: boolean;
}) {
  const role = currentUserRole;
  const [ribbonTab, setRibbonTab] = useState<RibbonTab>('main');
  const [filePanelOpen, setFilePanelOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<MenuKind | null>(null);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileTabRef = useRef<HTMLButtonElement>(null);
  const newBtnRef = useRef<HTMLButtonElement>(null);
  const searchBtnRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const fileMenuPanelRef = useRef<HTMLDivElement>(null);

  const ddPos = useDropdownPosition(ribbonTab === 'main' ? openMenu : null, newBtnRef, searchBtnRef);
  const filePanelPos = useFilePanelPosition(filePanelOpen, fileTabRef);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setOpenMenu(null);
  }, [ribbonTab]);

  const closeFilePanel = () => setFilePanelOpen(false);

  const onFileTabClick = () => {
    if (ribbonTab === 'file') {
      setFilePanelOpen((v) => !v);
    } else {
      setRibbonTab('file');
      setFilePanelOpen(true);
    }
  };

  useEffect(() => {
    if (!filePanelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeFilePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filePanelOpen]);

  useEffect(() => {
    if (!filePanelOpen) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (fileTabRef.current?.contains(t)) return;
      if (fileMenuPanelRef.current?.contains(t)) return;
      closeFilePanel();
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [filePanelOpen]);

  useEffect(() => {
    if (!openMenu) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (menuPanelRef.current?.contains(t)) return;
      setOpenMenu(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [openMenu]);

  const go = (target: string) => {
    if (!canAccess(role, target)) return;
    onNavigate(target);
  };

  const closeMenus = () => setOpenMenu(null);

  const toggleMenu = (kind: MenuKind) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenu((prev) => (prev === kind ? null : kind));
  };

  const triggerClass = (active: boolean) =>
    cn(
      'flex h-full min-h-[3.25rem] w-auto min-w-[4.75rem] shrink-0 flex-col items-center justify-center gap-1 rounded-sm border px-2 py-2 text-xs font-semibold leading-snug text-white transition sm:min-w-[5.25rem] sm:text-sm',
      active ? 'border-white/80 bg-black/20' : 'border-transparent hover:border-white/50 hover:bg-white/15',
    );

  const settingsOk = canAccess(role, 'settings');
  const canClassify = role === 'admin' || role === 'manager';
  const canAdminRibbon = role === 'admin' || role === 'manager';

  const closeFileAndRun = (fn: () => void) => {
    closeFilePanel();
    fn();
  };

  const filePanelPortal =
    mounted &&
    filePanelOpen &&
    filePanelPos &&
    createPortal(
      <div
        ref={fileMenuPanelRef}
        className="fixed z-[310] overflow-hidden rounded-sm border-2 border-[#0f3558] shadow-2xl"
        style={{
          top: filePanelPos.top,
          right: filePanelPos.right,
          width: filePanelPos.width,
          maxHeight: 'min(72vh, 28rem)',
          background: `linear-gradient(180deg, ${FILE_MENU_BLUE} 0%, ${FILE_MENU_BLUE_DEEP} 100%)`,
        }}
        dir="rtl"
      >
        <div className="max-h-[min(72vh,28rem)] overflow-y-auto py-1">
          <FileMenuRow
            label="החלפת חברה / משתמש"
            disabled
            title="החלפת חברה / משתמש — לא זמין בשלב מעבר (התנתק והתחבר מחדש)"
            onPick={() => {}}
          />
          <FileMenuRow
            label="לקוחות אחרונים"
            disabled
            title="תצוגת לקוחות אחרונים — לא זמין בשלב מעבר"
            onPick={() => {}}
          />
          <FileMenuRow
            label="לקוחות מועדפים"
            disabled
            title="מועדפים — לא זמין בשלב מעבר"
            onPick={() => {}}
          />
          <FileMenuRow
            label="אפשרויות"
            disabled={!settingsOk}
            title={!settingsOk ? 'אין הרשאה' : 'הגדרות — מערכת'}
            onPick={() =>
              closeFileAndRun(() => {
                onJumpSettingsTab('system');
              })
            }
          />
          <FileMenuRow
            label="מילון נתונים"
            disabled={!settingsOk}
            title={
              !settingsOk
                ? 'אין הרשאה'
                : canClassify
                  ? 'סיווגי לקוחות / מילון'
                  : 'סטטוסים וקודים — הגדרות'
            }
            onPick={() =>
              closeFileAndRun(() => {
                onJumpSettingsTab(canClassify ? 'customerClassification' : 'statuses');
              })
            }
          />
          <FileMenuRow
            label="הרשאות"
            disabled={!settingsOk || !canAdminRibbon}
            title={!settingsOk ? 'אין הרשאה' : !canAdminRibbon ? 'תפקידים — ניהול מנהלים בלבד' : 'תפקידים והרשאות'}
            active={current === 'settings'}
            onPick={() =>
              closeFileAndRun(() => {
                onJumpSettingsTab('permissions');
              })
            }
          />
          <FileMenuRow
            label="הגדרות"
            disabled={!settingsOk}
            title={!settingsOk ? 'אין הרשאה' : 'הגדרות'}
            active={current === 'settings'}
            onPick={() => closeFileAndRun(() => go('settings'))}
          />
          <FileMenuRow
            label="תוכניות שירות"
            disabled={!settingsOk}
            title={
              !settingsOk
                ? 'אין הרשאה'
                : canAdminRibbon
                  ? 'תבניות הצעות מחיר / תוכניות'
                  : 'שירותים — הגדרות'
            }
            active={current === 'settings'}
            onPick={() =>
              closeFileAndRun(() => {
                onJumpSettingsTab(canAdminRibbon ? 'templates' : 'services');
              })
            }
          />
          <FileMenuRow
            label="תמיכה"
            title="מידע תמיכה"
            onPick={() =>
              closeFileAndRun(() => {
                window.alert(
                  'תמיכה טכנית — בשלב מעבר הנתונים.\nלשאלות פנה למנהל המערכת או לצוות IT.',
                );
              })
            }
          />
          <FileMenuRow
            label="יציאה"
            title="התנתקות מהמערכת"
            onPick={() =>
              closeFileAndRun(() => {
                onLogout();
              })
            }
          />
        </div>
      </div>,
      document.body,
    );

  const dropdownPortal =
    mounted &&
    ribbonTab === 'main' &&
    openMenu &&
    ddPos &&
    createPortal(
      <div
        ref={menuPanelRef}
        className="fixed z-[300] rounded-sm border-2 border-slate-500 bg-white shadow-xl"
        style={{
          top: ddPos.top,
          right: ddPos.right,
          minWidth: ddPos.minWidth,
          maxWidth: 'min(92vw, 22rem)',
        }}
        dir="rtl"
      >
        {openMenu === 'new' && (
          <>
            <div className="border-b border-slate-300 bg-slate-100 px-3 py-2 text-right text-xs font-bold text-slate-700">
              חדש
            </div>
            <DropdownRow
              label="לקוח"
              disabled={!canAccess(role, 'customers')}
              title={!canAccess(role, 'customers') ? 'אין הרשאה' : 'פתיחת כרטיס לקוח חדש'}
              onPick={() => {
                closeMenus();
                if (onNewCustomer) {
                  onNewCustomer();
                } else {
                  go('customers');
                }
              }}
            />
            <DropdownRow
              label="התקשרות"
              title="פתיחת טופס התקשרות חדשה"
              onPick={() => {
                closeMenus();
                onNavigate('interaction-new');
              }}
            />
            <DropdownRow
              label="הצעה"
              disabled={!canAccess(role, 'quotes')}
              title={!canAccess(role, 'quotes') ? 'אין הרשאה' : 'הצעות מחיר'}
              onPick={() => {
                closeMenus();
                go('quotes');
              }}
            />
            <DropdownRow
              label="הזמנה"
              title="פתיחת הזמנה חדשה"
              onPick={() => {
                closeMenus();
                onNavigate('order-new');
              }}
            />
            <DropdownRow
              label="פנייה"
              title="פתיחת טופס פנייה חדשה (לקוח/ליד)"
              onPick={() => {
                closeMenus();
                onNavigate('interaction-new');
              }}
            />
          </>
        )}
        {openMenu === 'search' && (
          <>
            <div className="border-b border-slate-300 bg-slate-100 px-3 py-2 text-right text-xs font-bold text-slate-700">
              חפש
            </div>
            <DropdownRow
              label="לקוח"
              disabled={!canAccess(role, 'customers')}
              title={!canAccess(role, 'customers') ? 'אין הרשאה' : 'חיפוש לקוח'}
              onPick={() => {
                closeMenus();
                if (onSearchCustomer) { onSearchCustomer(); }
                else { go('customers'); onFocusSearch(); }
              }}
            />
            <DropdownRow
              label="הצעה"
              disabled={!canAccess(role, 'quotes')}
              title={!canAccess(role, 'quotes') ? 'אין הרשאה' : 'חיפוש הצעות מחיר'}
              onPick={() => {
                closeMenus();
                if (onSearchQuote) { onSearchQuote(); }
                else { go('quotes'); onFocusSearch(); }
              }}
            />
            <DropdownRow
              label="הזמנה"
              disabled
              title="חיפוש הזמנות — לא זמין בשלב מעבר"
              onPick={() => {}}
            />
            <DropdownRow
              label="פנייה"
              disabled={!canAccess(role, 'leads')}
              title={!canAccess(role, 'leads') ? 'אין הרשאה' : 'לידים / פניות + מיקוד חיפוש'}
              onPick={() => {
                closeMenus();
                go('leads');
                onFocusSearch();
              }}
            />
          </>
        )}
      </div>,
      document.body,
    );

  const greenBar = (
    <div
      className={cn('w-full border-b-2 shadow-md', isCustomerCard && 'galit-premium-bar')}
      style={isCustomerCard
        ? {
            background: 'linear-gradient(180deg, #EAF5EA 0%, #F6FBF6 100%)',
            borderColor: '#DCE7D9',
            boxShadow: '0 2px 8px rgba(100,140,100,0.08)',
          }
        : {
            background: `linear-gradient(180deg, ${GALIT_GREEN} 0%, ${GALIT_GREEN_DARK} 100%)`,
            borderColor: GALIT_GREEN_DARK,
          }
      }
    >
      <div className="flex min-h-[4.5rem] w-full items-stretch sm:min-h-[4.75rem]">
        <div className="flex shrink-0 items-center justify-center border-e border-white/30 px-2 sm:px-4">
          <img src="/logo.png" alt="גלית" className="h-9 w-auto max-h-11 object-contain sm:h-11" />
        </div>

        <div
          className="flex min-h-[4.5rem] min-w-0 shrink-0 items-stretch overflow-x-auto overflow-y-hidden sm:min-h-[4.75rem]"
          style={{ width: 'min(75vw, calc(100% - 5.5rem))' }}
        >
          <div className="flex min-w-min flex-nowrap items-stretch">
            {ribbonTab === 'file' && (
              <>
                <NavBtn
                  label="ייבוא"
                  Icon={Upload}
                  disabled={!settingsOk}
                  title={!settingsOk ? 'אין הרשאה' : 'ייבוא נתונים — הגדרות'}
                  onClick={() => onJumpSettingsTab('import')}
                />
                <Sep />
                <NavBtn label="ייצוא" Icon={Download} disabled title="ייצוא — לא זמין בשלב מעבר" />
                <Sep />
                <NavBtn
                  label="מסמכים"
                  Icon={FileText}
                  disabled={!canAccess(role, 'documents')}
                  title={!canAccess(role, 'documents') ? 'אין הרשאה' : 'מסמכים'}
                  active={current === 'documents'}
                  onClick={() => go('documents')}
                />
                <Sep />
                <NavBtn
                  label="הגדרות"
                  Icon={Settings}
                  disabled={!settingsOk}
                  title={!settingsOk ? 'אין הרשאה' : 'הגדרות מערכת'}
                  active={current === 'settings'}
                  onClick={() => go('settings')}
                />
                <Sep />
                <NavBtn
                  label="הדפסה"
                  Icon={Printer}
                  title="הדפסה מהדפדפן"
                  onClick={() => window.print()}
                />
                <Sep />
                <NavBtn
                  label="מערכת"
                  Icon={LayoutDashboard}
                  disabled={!settingsOk}
                  title={!settingsOk ? 'אין הרשאה' : 'לשונית מערכת בהגדרות'}
                  onClick={() => onJumpSettingsTab('system')}
                />
              </>
            )}

            {ribbonTab === 'main' && (
              <>
                <NavBtn
                  label="לקוח"
                  Icon={User}
                  disabled={!canAccess(role, 'customers')}
                  title={!canAccess(role, 'customers') ? 'אין הרשאה' : 'לקוחות'}
                  active={current === 'customers' || current === 'customer-profile'}
                  onClick={() => go('customers')}
                />
                <Sep />
                <button
                  ref={newBtnRef}
                  type="button"
                  title="חדש"
                  onClick={toggleMenu('new')}
                  className={triggerClass(openMenu === 'new')}
                >
                  <Plus className="h-6 w-6 shrink-0 text-white sm:h-7 sm:w-7" />
                  <span className="line-clamp-2 max-w-[5.5rem] text-center">חדש</span>
                </button>
                <Sep />
                <button
                  ref={searchBtnRef}
                  type="button"
                  title="חפש"
                  onClick={toggleMenu('search')}
                  className={triggerClass(openMenu === 'search')}
                >
                  <Search className="h-6 w-6 shrink-0 text-white sm:h-7 sm:w-7" />
                  <span className="line-clamp-2 max-w-[5.5rem] text-center">חפש</span>
                </button>
                <Sep />
                <NavBtn
                  label="אירועים היסטוריה"
                  Icon={History}
                  disabled={!canAccess(role, 'alerts')}
                  title={!canAccess(role, 'alerts') ? 'אין הרשאה' : 'התראות ואירועים'}
                  active={current === 'alerts'}
                  onClick={() => go('alerts')}
                />
                <Sep />
                <NavBtn
                  label="פניות היסטוריה"
                  Icon={Inbox}
                  disabled={!canAccess(role, 'leads')}
                  title={!canAccess(role, 'leads') ? 'אין הרשאה' : 'לידים / פניות'}
                  active={current === 'leads' || current === 'lead-profile' || current === 'pipeline'}
                  onClick={() => go('leads')}
                />
                <Sep />
                <NavBtn
                  label="מבצע פעילויות שנה"
                  Icon={CalendarDays}
                  disabled={!canAccess(role, 'dashboard') && !canAccess(role, 'reports')}
                  title="סיכום פעילות — דשבורד או דוחות"
                  active={current === 'dashboard' || current === 'reports'}
                  onClick={() => (canAccess(role, 'dashboard') ? go('dashboard') : go('reports'))}
                />
                <Sep />
                <NavBtn
                  label="לוח נתונים"
                  Icon={LayoutDashboard}
                  disabled={!canAccess(role, 'dashboard')}
                  title={!canAccess(role, 'dashboard') ? 'אין הרשאה' : 'דשבורד'}
                  active={current === 'dashboard'}
                  onClick={() => go('dashboard')}
                />
                <Sep />
                <NavBtn
                  label="מייל"
                  Icon={Mail}
                  title="פתיחת לקוח דואר"
                  onClick={() => window.open('mailto:', '_blank', 'noopener,noreferrer')}
                />
                <Sep />
                <NavBtn label="חיוג" Icon={Phone} disabled title="חיוג — מודול טלפוניה לא מחובר (שלב מעבר)" />
                <Sep />
                <NavBtn label="פקס כללי" Icon={Printer} disabled title="פקס — לא זמין במערכת (שלב מעבר)" />
                <Sep />
                <NavBtn label="מסרון" Icon={MessageSquare} disabled title="מסרונים — לא זמין במערכת (שלב מעבר)" />
                <Sep />
                <NavBtn
                  label="קישור"
                  Icon={Link2}
                  disabled={!canAccess(role, 'documents')}
                  title={!canAccess(role, 'documents') ? 'אין הרשאה' : 'מסמכים / קבצים'}
                  active={current === 'documents'}
                  onClick={() => go('documents')}
                />
                <Sep />
                <NavBtn
                  label="תמיכה"
                  Icon={LifeBuoy}
                  title="מידע תמיכה"
                  onClick={() =>
                    window.alert(
                      'תמיכה טכנית — בשלב מעבר הנתונים.\nלשאלות פנה למנהל המערכת או לצוות IT.',
                    )
                  }
                />
              </>
            )}

            {ribbonTab === 'extras' && (
              <>
                <NavBtn
                  label="מחולל"
                  Icon={Sparkles}
                  disabled={!canAccess(role, 'lab')}
                  title={!canAccess(role, 'lab') ? 'אין הרשאה' : 'מעבדה / דגימות — הקרוב ל«מחולל»'}
                  active={current === 'lab'}
                  onClick={() => go('lab')}
                />
                <Sep />
                <NavBtn
                  label="קטלוג"
                  Icon={ListOrdered}
                  disabled={!settingsOk}
                  title={!settingsOk ? 'אין הרשאה' : 'פריטים / מחירון — הגדרות'}
                  active={current === 'settings'}
                  onClick={() => onJumpSettingsTab('catalog')}
                />
                <Sep />
                <NavBtn
                  label="דוחות"
                  Icon={BarChart3}
                  disabled={!canAccess(role, 'reports')}
                  title={!canAccess(role, 'reports') ? 'אין הרשאה' : 'דוחות'}
                  active={current === 'reports'}
                  onClick={() => go('reports')}
                />
                <Sep />
                <NavBtn
                  label="טבלאות נוספות"
                  Icon={Table2}
                  disabled={!canAccess(role, 'tests')}
                  title={!canAccess(role, 'tests') ? 'אין הרשאה' : 'בדיקות סביבה / טבלאות'}
                  active={current === 'tests'}
                  onClick={() => go('tests')}
                />
                <Sep />
                <NavBtn
                  label="שיוך תוספות"
                  Icon={Tags}
                  disabled={!settingsOk || !canClassify}
                  title={
                    !settingsOk
                      ? 'אין הרשאה'
                      : !canClassify
                        ? 'סיווגי לקוחות — ניהול'
                        : 'סיווגי לקוחות בהגדרות'
                  }
                  active={current === 'settings'}
                  onClick={() => onJumpSettingsTab('customerClassification')}
                />
                <Sep />
                <NavBtn
                  label="מפקר"
                  Icon={ClipboardCheck}
                  disabled
                  title="מפקר — מודול ביקורת לא זמין בשלב מעבר"
                />
                <Sep />
                <NavBtn
                  label="יעדים"
                  Icon={Target}
                  disabled={!settingsOk}
                  title={!settingsOk ? 'אין הרשאה' : 'יעדים — הגדרות'}
                  active={current === 'settings'}
                  onClick={() => onJumpSettingsTab('targets')}
                />
                <Sep />
                <NavBtn
                  label="תחזיות"
                  Icon={TrendingUp}
                  disabled={!canAccess(role, 'dashboard') && !canAccess(role, 'reports')}
                  title="תחזיות — דשבורד / דוחות"
                  active={current === 'dashboard' || current === 'reports'}
                  onClick={() => (canAccess(role, 'dashboard') ? go('dashboard') : go('reports'))}
                />
              </>
            )}
          </div>
        </div>

        <div className="hidden min-w-0 flex-1 sm:block" aria-hidden />
      </div>
    </div>
  );

  return (
    <>
      {isCustomerCard && (
        <style>{`
          .galit-premium-bar button { color: #2E4A2D !important; }
          .galit-premium-bar button svg { color: #3D6B3A !important; }
          .galit-premium-bar button span { color: #2E4A2D !important; }
          .galit-premium-bar button:hover { background: rgba(76,140,70,0.10) !important; border-color: rgba(76,140,70,0.25) !important; }
          .galit-premium-bar button[class*="bg-black"] { background: rgba(76,140,70,0.15) !important; border-color: rgba(76,140,70,0.35) !important; }
          .galit-premium-bar span[class*="bg-white"] { background: #C8DCC5 !important; }
          .galit-premium-bar .border-e { border-color: #C8DCC5 !important; }
          .galit-premium-ribbon { background: #F0F5EF !important; border-color: #C8DCC5 !important; }
          .galit-premium-ribbon button { color: #3D6B3A !important; }
          .galit-premium-ribbon button[class*="bg-[#f2efe8]"] { background: #FFFFFF !important; border-color: #C8DCC5 !important; color: #2E4A2D !important; }
          .galit-premium-ribbon button[class*="bg-[#d8d4cc]"] { background: #E4EDE3 !important; color: #4A7047 !important; }
          .galit-premium-ribbon button:hover { background: #E8F0E7 !important; }
        `}</style>
      )}
      <div ref={rootRef} className="fixed inset-x-0 top-0 z-[200] w-full" dir="rtl">
        {current !== 'interaction-new' && (
          <div className={cn(
            "flex w-full flex-nowrap items-end border-b border-slate-500 bg-[#e4e0d8] px-1 pt-1 sm:px-2",
            isCustomerCard && 'galit-premium-ribbon'
          )}>
            <RibbonTabButton
              ref={fileTabRef}
              label="קובץ"
              active={ribbonTab === 'file'}
              onClick={onFileTabClick}
            />
            <span className="w-1 shrink-0" aria-hidden />
            <RibbonTabButton
              label="ראשי"
              active={ribbonTab === 'main'}
              onClick={() => {
                setRibbonTab('main');
                setFilePanelOpen(false);
              }}
            />
            <span className="w-1 shrink-0" aria-hidden />
            <RibbonTabButton
              label="תוספות"
              active={ribbonTab === 'extras'}
              onClick={() => {
                setRibbonTab('extras');
                setFilePanelOpen(false);
              }}
            />
          </div>
        )}
        {greenBar}
      </div>
      {filePanelPortal}
      {dropdownPortal}
    </>
  );
}
