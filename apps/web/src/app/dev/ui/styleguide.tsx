'use client'

import { useEffect, useState } from 'react'
import type { GameFormat } from '@degommix/game-core'
import { CHARACTER_IDS, CHARACTER_META } from '@/lib/characters'
import { Icon, ICON_NAMES } from '@/components/icons'
import { FormatSegmented } from '@/components/lobby/format-segmented'
import { TabBar } from '@/components/tab-bar'
import { ThemeSegmented } from '@/components/theme/theme-segmented'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CharacterBadge } from '@/components/ui/character-badge'
import { CodeBoxes } from '@/components/ui/code-boxes'
import { EmptyState } from '@/components/ui/empty-state'
import { Pill } from '@/components/ui/pill'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import { SectionTitle } from '@/components/ui/section-title'
import { StatTile } from '@/components/ui/stat-tile'

const BADGE_SIZES = ['sm', 'md', 'lg'] as const
const AVATAR_SIZES = [32, 40, 44, 56] as const

export function Styleguide() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [code, setCode] = useState('ROM')
  const [format, setFormat] = useState<GameFormat>(3)

  useEffect(() => {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark')
      document.documentElement.dataset.theme = 'dark'
    }
  }, [])

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.dataset.theme = next
  }

  return (
    <main className="tab-page" style={{ maxWidth: '28rem' }}>
      <div className="flex items-center justify-between gap-3">
        <h1 className="wordmark" style={{ fontSize: '1.6rem' }}>
          Styleguide
        </h1>
        <button className="cta ghost" type="button" onClick={toggleTheme} style={{ width: 'auto', padding: '0.5rem 0.8rem', fontSize: '0.7rem' }}>
          <Icon name={theme === 'light' ? 'moon' : 'sun'} size={15} />
          {theme === 'light' ? 'Sombre' : 'Clair'}
        </button>
      </div>

      <SectionTitle sub="Sous-titre discret sous le titre">Titre de section</SectionTitle>

      <section className="flex flex-col gap-2">
        <p className="sec-label">Boutons</p>
        <Button>Lancer la partie</Button>
        <Button variant="ghost">Quitter la partie</Button>
        <Button disabled helper="En attente de tous les joueurs…">
          Lancer la partie
        </Button>
        <Button variant="ghost" fullWidth={false}>
          <Icon name="undo" size={15} />
          Annuler
        </Button>
        <p className="sec-label">Mécanique arcade — repos / enfoncé</p>
        <div className="flex items-start gap-2">
          <Button fullWidth={false}>Au repos</Button>
          {/* Static mirror of the :active state so the press depth is reviewable in a screenshot. */}
          <button
            className="cta auto"
            type="button"
            style={{ transform: 'translateY(var(--key-depth))', boxShadow: '0 0 0 var(--key-lip)' }}
          >
            Enfoncé
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <p className="sec-label">Contrôles segmentés</p>
        <FormatSegmented value={format} onChange={setFormat} />
        <ThemeSegmented />
      </section>

      <section className="flex flex-col gap-2">
        <p className="sec-label">Pills</p>
        <div className="flex flex-wrap items-center gap-2">
          <Pill variant="win">Victoire</Pill>
          <Pill variant="loss">Défaite</Pill>
          <Pill variant="wait">En attente</Pill>
          <Pill variant="ffa">Chacun pour soi</Pill>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <p className="sec-label">Carte</p>
        <Card>
          <p className="m-0 text-sm font-semibold">Une carte parchemin</p>
          <p className="m-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
            Bordure 1.5px, rayon 14, surface claire.
          </p>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <p className="sec-label">Personnages</p>
        {BADGE_SIZES.map((size) => (
          <div key={size} className="flex items-center gap-3">
            {CHARACTER_IDS.map((id) => (
              <CharacterBadge key={id} character={id} size={size} />
            ))}
            <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
              {size}
            </span>
          </div>
        ))}
        <div className="flex flex-wrap gap-3 text-xs" style={{ color: 'var(--ink-soft)' }}>
          {CHARACTER_IDS.map((id) => (
            <span key={id} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: CHARACTER_META[id].colorVar }}
              />
              {CHARACTER_META[id].label}
            </span>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <p className="sec-label">Avatars joueurs</p>
        <div className="flex items-center gap-3">
          {AVATAR_SIZES.map((size) => (
            <PlayerAvatar key={size} username="Tristan" size={size} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <p className="sec-label">Tuiles de stats</p>
        <div className="stat-row">
          <StatTile icon="trophy" label="Victoires" value={12} />
          <StatTile icon="sword" label="Dégommages" value={87} />
          <StatTile icon="timer" label="Durée moy." value="24 min" />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <p className="sec-label">Code de partie — affichage</p>
        <CodeBoxes code="GAULE7" />
        <p className="sec-label">Code de partie — saisie (tape ici)</p>
        <CodeBoxes mode="input" code={code} onChange={setCode} />
      </section>

      <section className="flex flex-col gap-2">
        <p className="sec-label">État vide</p>
        <EmptyState
          icon="bell"
          title="Aucune invitation"
          description="Les invitations reçues apparaîtront ici."
        />
      </section>

      <section className="flex flex-col gap-2">
        <p className="sec-label">Icônes ({ICON_NAMES.length})</p>
        <div className="icon-grid">
          {ICON_NAMES.map((name) => (
            <span key={name} className="icon-cell">
              <Icon name={name} size={20} />
              <span>{name}</span>
            </span>
          ))}
        </div>
      </section>

      <TabBar />
    </main>
  )
}
