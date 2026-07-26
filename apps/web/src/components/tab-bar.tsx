'use client'

import { useContext } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { QueryClientContext } from '@tanstack/react-query'
import { Icon, type IconName } from '@/components/icons'
import { useFriendRequestsCount, useInvitesCount } from '@/hooks/use-tab-data'

interface Tab {
  href: string
  label: string
  icon: IconName
  /** Route prefixes (beyond `href`) that keep this tab highlighted. */
  aliases: string[]
}

const TABS: Tab[] = [
  { href: '/', label: 'Village', icon: 'home', aliases: [] },
  { href: '/amis', label: 'Tribu', icon: 'users', aliases: [] },
  { href: '/jouer', label: 'Arène', icon: 'play', aliases: ['/lobby'] },
  { href: '/classement', label: 'Lauriers', icon: 'trophy', aliases: ['/parties'] },
]

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

function activeIndex(pathname: string): number {
  const index = TABS.findIndex(
    (tab) =>
      tab.href !== '/' &&
      (matchesPrefix(pathname, tab.href) ||
        tab.aliases.some((alias) => matchesPrefix(pathname, alias))),
  )
  if (index !== -1) return index
  return pathname === '/' ? 0 : -1
}

/**
 * Pending-invites badge for the Arène tab. Guarded by QueryClientContext so
 * the TabBar also renders (badge-less) on routes mounted outside the (tabs)
 * layout, which provide no QueryClientProvider (e.g. /lobby/[gameId]).
 */
function InvitesBadge() {
  const client = useContext(QueryClientContext)
  if (!client) return null
  return <InvitesBadgeContent />
}

function InvitesBadgeContent() {
  const inviteCount = useInvitesCount()
  if (inviteCount === 0) return null
  return (
    <span
      className="tab-badge"
      aria-label={`${inviteCount} invitation${inviteCount > 1 ? 's' : ''} en attente`}
    >
      {inviteCount}
    </span>
  )
}

/** Pending friend-requests badge for the Tribu tab; same guard as above. */
function FriendRequestsBadge() {
  const client = useContext(QueryClientContext)
  if (!client) return null
  return <FriendRequestsBadgeContent />
}

function FriendRequestsBadgeContent() {
  const requestCount = useFriendRequestsCount()
  if (requestCount === 0) return null
  return (
    <span
      className="tab-badge"
      aria-label={`${requestCount} demande${requestCount > 1 ? 's' : ''} d'ami en attente`}
    >
      {requestCount}
    </span>
  )
}

/** Floating liquid-glass bottom tab bar with a sliding water-bubble indicator. */
export function TabBar() {
  const pathname = usePathname()
  const active = activeIndex(pathname)

  return (
    <nav className="tabbar-zone" aria-label="Navigation principale">
      <div className="tabbar">
        {active !== -1 ? (
          <span
            className="tab-bubble"
            style={{ transform: `translateX(${active * 100}%)` }}
            aria-hidden
          >
            <span key={active} className="tab-bubble-water" />
          </span>
        ) : null}
        {TABS.map((tab, index) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={index === active ? 'tab-item active' : 'tab-item'}
            aria-current={index === active ? 'page' : undefined}
          >
            <Icon name={tab.icon} size={22} strokeWidth={index === active ? 2.2 : 1.8} />
            <span className="tab-label">{tab.label}</span>
            {tab.href === '/jouer' ? <InvitesBadge /> : null}
            {tab.href === '/amis' ? <FriendRequestsBadge /> : null}
          </Link>
        ))}
      </div>
    </nav>
  )
}
