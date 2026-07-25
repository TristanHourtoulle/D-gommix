'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon, type IconName } from '@/components/icons'

interface Tab {
  href: string
  label: string
  icon: IconName
}

const TABS: Tab[] = [
  { href: '/', label: 'Accueil', icon: 'home' },
  { href: '/amis', label: 'Amis', icon: 'users' },
  { href: '/jouer', label: 'Jouer', icon: 'play' },
  { href: '/classement', label: 'Classement', icon: 'trophy' },
]

function activeIndex(pathname: string): number {
  const index = TABS.findIndex(
    (tab) => tab.href !== '/' && (pathname === tab.href || pathname.startsWith(`${tab.href}/`)),
  )
  return index === -1 ? 0 : index
}

/** Floating liquid-glass bottom tab bar with a sliding water-bubble indicator. */
export function TabBar() {
  const pathname = usePathname()
  const active = activeIndex(pathname)

  return (
    <nav className="tabbar-zone" aria-label="Navigation principale">
      <div className="tabbar">
        <span
          className="tab-bubble"
          style={{ transform: `translateX(${active * 100}%)` }}
          aria-hidden
        >
          <span key={active} className="tab-bubble-water" />
        </span>
        {TABS.map((tab, index) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={index === active ? 'tab-item active' : 'tab-item'}
            aria-current={index === active ? 'page' : undefined}
          >
            <Icon name={tab.icon} size={22} strokeWidth={index === active ? 2.2 : 1.8} />
            <span className="tab-label">{tab.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  )
}
