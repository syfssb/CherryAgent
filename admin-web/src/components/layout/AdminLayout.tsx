import { useState, type ComponentType } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  CreditCard,
  Radio,
  Boxes,
  Package,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  ChevronDown,
  Megaphone,
  Share2,
  Tag,
  Zap,
  Sun,
  Moon,
  Monitor,
  ShieldAlert,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAdminStore, type AdminRole } from '@/store/useAdminStore'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

interface MenuChildItem {
  label: string
  path: string
  /** 需要的权限（任一满足即可见） */
  permissions?: string[]
}

interface MenuItem {
  label: string
  path: string
  icon: ComponentType<{ size?: number; strokeWidth?: number }>
  roles?: AdminRole[]
  /** 需要的权限（任一满足即可见） */
  permissions?: string[]
  children?: MenuChildItem[]
}

const menuItems: MenuItem[] = [
  {
    label: '仪表盘',
    path: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    label: '用户管理',
    path: '/users',
    icon: Users,
    permissions: ['users:read'],
  },
  {
    label: '管理员管理',
    path: '/admins',
    icon: ShieldCheck,
    roles: ['super_admin'],
  },
  {
    label: '同步管理',
    path: '/sync',
    icon: RefreshCw,
    permissions: ['config:write'],
  },
  {
    label: '防刷管理',
    path: '/fraud',
    icon: ShieldAlert,
    permissions: ['users:suspend'],
  },
  {
    label: '财务管理',
    path: '/finance',
    icon: CreditCard,
    permissions: ['finance:read'],
    children: [
      { label: '充值记录', path: '/finance' },
      { label: '收入统计', path: '/finance/revenue' },
      { label: '消费明细', path: '/finance/transactions' },
      { label: '提现管理', path: '/finance/withdrawals', permissions: ['finance:write'] },
    ],
  },
  {
    label: '渠道管理',
    path: '/channels',
    icon: Radio,
    permissions: ['channels:read'],
  },
  {
    label: '模型管理',
    path: '/models',
    icon: Boxes,
    permissions: ['models:read'],
  },
  {
    label: 'Skill 管理',
    path: '/skills',
    icon: Zap,
    permissions: ['config:read'],
    children: [
      { label: 'Skill 列表', path: '/skills' },
      { label: '外部 Skill 市场', path: '/skills/external' },
    ],
  },
  {
    label: '版本管理',
    path: '/versions',
    icon: Package,
    permissions: ['versions:read'],
  },
  {
    label: '内容管理',
    path: '/content',
    icon: Megaphone,
    permissions: ['config:write'],
    children: [
      { label: '公告管理', path: '/content/announcements' },
      { label: '隐私政策', path: '/content/privacy-policy' },
      { label: '服务条款', path: '/content/terms-of-service' },
      { label: '关于我们', path: '/content/about-us' },
    ],
  },
  {
    label: '分销管理',
    path: '/referrals',
    icon: Share2,
    permissions: ['finance:read'],
    children: [
      { label: '分销概览', path: '/referrals' },
      { label: '佣金管理', path: '/referrals/commissions', permissions: ['finance:write'] },
      { label: '分销配置', path: '/referrals/config', permissions: ['config:write'] },
    ],
  },
  {
    label: '营销管理',
    path: '/marketing',
    icon: Tag,
    permissions: ['finance:write'],
    children: [
      { label: '折扣码', path: '/marketing/discounts' },
      { label: '兑换码', path: '/marketing/redeem-codes' },
      { label: '期卡套餐', path: '/marketing/period-cards' },
      { label: '期卡订阅', path: '/marketing/period-cards/subscriptions' },
    ],
  },
  {
    label: '系统设置',
    path: '/settings',
    icon: Settings,
    permissions: ['config:write'],
    children: [
      { label: '全局配置', path: '/settings/system' },
      { label: '内容配置', path: '/settings/content' },
      { label: '邮件配置', path: '/settings/email' },
      { label: '支付配置', path: '/settings/payment' },
    ],
  },
]

interface AdminLayoutProps {
  children: React.ReactNode
}

function ThemeToggle() {
  const { theme, setTheme } = useAdminStore()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
          {theme === 'dark' ? (
            <Moon size={15} />
          ) : theme === 'light' ? (
            <Sun size={15} />
          ) : (
            <Monitor size={15} />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem onClick={() => setTheme('light')}>
          <Sun size={14} className="mr-2" />
          浅色
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>
          <Moon size={14} className="mr-2" />
          深色
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>
          <Monitor size={14} className="mr-2" />
          跟随系统
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NavContent({
  collapsed,
  adminRole,
  onNavigate,
}: {
  collapsed: boolean
  adminRole?: AdminRole
  onNavigate?: () => void
}) {
  const location = useLocation()
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null)

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return location.pathname === '/dashboard' || location.pathname === '/'
    }
    if (path === '/finance') {
      return location.pathname === '/finance'
    }
    return location.pathname === path
  }

  const isGroupActive = (item: MenuItem) => {
    if (item.children) {
      return item.children.some((c) => location.pathname === c.path)
    }
    return isActive(item.path)
  }

  const toggleSubmenu = (path: string) => {
    setExpandedMenu(expandedMenu === path ? null : path)
  }

  const { hasPermission } = useAdminStore()

  const checkAccess = (item: { roles?: AdminRole[]; permissions?: string[] }) => {
    // 角色限制
    if (item.roles?.length) {
      if (!adminRole || !item.roles.includes(adminRole)) return false
    }
    // 权限限制（任一满足即可见）
    if (item.permissions?.length) {
      if (!item.permissions.some((p) => hasPermission(p))) return false
    }
    return true
  }

  const visibleMenuItems = menuItems
    .filter(checkAccess)
    .map((item) => {
      if (!item.children) return item
      const visibleChildren = item.children.filter(checkAccess)
      return visibleChildren.length > 0 ? { ...item, children: visibleChildren } : item
    })

  return (
    <TooltipProvider delayDuration={0}>
      <nav className="flex-1 py-3 overflow-y-auto">
        <ul className="space-y-0.5 px-3">
          {visibleMenuItems.map((item) => {
            const Icon = item.icon
            const active = isGroupActive(item)
            const hasChildren = item.children && item.children.length > 0
            const isExpanded = expandedMenu === item.path

            if (collapsed && !hasChildren) {
              return (
                <li key={item.path}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        to={item.path}
                        onClick={onNavigate}
                        className={cn(
                          'flex items-center justify-center h-9 w-9 mx-auto rounded-md transition-colors',
                          active
                            ? 'bg-accent text-foreground'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        )}
                      >
                        <Icon size={16} strokeWidth={active ? 2 : 1.5} />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8}>
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                </li>
              )
            }

            if (collapsed && hasChildren) {
              return (
                <li key={item.path}>
                  <DropdownMenu>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <button
                            className={cn(
                              'flex items-center justify-center h-9 w-9 mx-auto rounded-md transition-colors',
                              active
                                ? 'bg-accent text-foreground'
                                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                            )}
                          >
                            <Icon size={16} strokeWidth={active ? 2 : 1.5} />
                          </button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="right" sideOffset={8}>
                        {item.label}
                      </TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent side="right" align="start" sideOffset={8}>
                      <DropdownMenuLabel className="text-xs text-muted-foreground">{item.label}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {item.children!.map((child) => (
                        <DropdownMenuItem key={child.path} asChild>
                          <Link
                            to={child.path}
                            onClick={onNavigate}
                            className={cn(
                              location.pathname === child.path && 'bg-accent'
                            )}
                          >
                            {child.label}
                          </Link>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              )
            }

            return (
              <li key={item.path}>
                {hasChildren ? (
                  <>
                    <button
                      onClick={() => toggleSubmenu(item.path)}
                      className={cn(
                        'relative w-full flex items-center gap-2.5 px-2.5 h-9 rounded-md text-[13px] transition-all hover:translate-x-0.5',
                        active
                          ? 'text-foreground before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-4 before:w-0.5 before:rounded-full before:bg-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      )}
                    >
                      <Icon size={16} strokeWidth={active ? 2 : 1.5} />
                      <span className="flex-1 text-left">{item.label}</span>
                      <ChevronDown
                        size={14}
                        className={cn(
                          'text-muted-foreground transition-transform duration-200',
                          isExpanded && 'rotate-180'
                        )}
                      />
                    </button>
                    <div
                      className={cn(
                        'overflow-hidden transition-all duration-200',
                        isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                      )}
                    >
                      <ul className="mt-0.5 ml-[22px] border-l border-border pl-2.5 space-y-0.5">
                        {item.children!.map((child) => (
                          <li key={child.path}>
                            <Link
                              to={child.path}
                              onClick={onNavigate}
                              className={cn(
                                'flex items-center px-2.5 h-8 rounded-md text-[13px] transition-all hover:translate-x-0.5',
                                location.pathname === child.path
                                  ? 'text-foreground bg-accent font-medium'
                                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                              )}
                            >
                              {child.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                ) : (
                  <Link
                    to={item.path}
                    onClick={onNavigate}
                    className={cn(
                      'relative flex items-center gap-2.5 px-2.5 h-9 rounded-md text-[13px] transition-all hover:translate-x-0.5',
                      active
                        ? 'bg-accent text-foreground font-medium before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-4 before:w-0.5 before:rounded-full before:bg-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                  >
                    <Icon size={16} strokeWidth={active ? 2 : 1.5} />
                    <span>{item.label}</span>
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      </nav>
    </TooltipProvider>
  )
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const navigate = useNavigate()
  const { admin, logout, sidebarCollapsed, toggleSidebar } = useAdminStore()
  const adminRole = admin?.role

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const SidebarHeader = ({ collapsed }: { collapsed: boolean }) => (
    <div className="h-14 flex items-center justify-between px-4 shrink-0">
      {!collapsed && (
        <Link to="/dashboard" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-foreground flex items-center justify-center">
            <span className="text-[11px] font-bold text-background tracking-tight">AI</span>
          </div>
          <span className="font-semibold text-sm text-foreground tracking-tight">Cherry Agent</span>
        </Link>
      )}
      {collapsed && (
        <div className="w-7 h-7 rounded-md bg-foreground flex items-center justify-center mx-auto">
          <span className="text-[11px] font-bold text-background tracking-tight">AI</span>
        </div>
      )}
    </div>
  )

  const SidebarFooter = ({ collapsed }: { collapsed: boolean }) => (
    <div className="p-3 shrink-0">
      {collapsed ? (
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleLogout}
                className="flex items-center justify-center h-9 w-9 mx-auto rounded-md text-muted-foreground hover:bg-accent hover:text-destructive transition-colors"
              >
                <LogOut size={15} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              退出登录
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-accent transition-colors group">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-[11px] bg-muted text-muted-foreground">
              {admin?.username?.charAt(0).toUpperCase() || 'A'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-foreground truncate leading-tight">
              {admin?.username || '管理员'}
            </p>
            <p className="text-[11px] text-muted-foreground truncate leading-tight">
              {admin?.email}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors opacity-0 group-hover:opacity-100"
          >
            <LogOut size={14} />
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden lg:flex flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-in-out',
          sidebarCollapsed ? 'w-[52px]' : 'w-[220px]'
        )}
      >
        <SidebarHeader collapsed={sidebarCollapsed} />
        <div className="mx-3 h-px bg-border" />
        <NavContent collapsed={sidebarCollapsed} adminRole={adminRole} />
        <div className="mx-3 h-px bg-border" />
        <SidebarFooter collapsed={sidebarCollapsed} />
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-14 border-b border-border bg-background/80 backdrop-blur-sm flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
          <div className="flex items-center gap-2">
            {/* Mobile Menu */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden">
                  <Menu size={16} />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[220px] p-0">
                <SidebarHeader collapsed={false} />
                <div className="mx-3 h-px bg-border" />
                <NavContent collapsed={false} adminRole={adminRole} />
                <div className="mx-3 h-px bg-border" />
                <SidebarFooter collapsed={false} />
              </SheetContent>
            </Sheet>

            {/* Collapse Toggle (Desktop) */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hidden lg:flex text-muted-foreground hover:text-foreground"
              onClick={toggleSidebar}
            >
              {sidebarCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
            </Button>
          </div>

          <div className="flex items-center gap-1">
            <ThemeToggle />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-2 px-2">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-[10px] bg-muted text-muted-foreground">
                      {admin?.username?.charAt(0).toUpperCase() || 'A'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-[13px] hidden sm:inline text-foreground">{admin?.username}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="font-normal">
                  <p className="text-sm font-medium">{admin?.username}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{admin?.role}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/settings/system')}>
                  <Settings size={14} className="mr-2" />
                  系统设置
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                  <LogOut size={14} className="mr-2" />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
