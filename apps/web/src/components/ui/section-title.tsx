interface SectionTitleProps {
  children: string
  sub?: string
}

/** Cinzel uppercase screen/section heading, maquette `.s-title` style. */
export function SectionTitle({ children, sub }: SectionTitleProps) {
  return (
    <div>
      <h2 className="s-title">{children}</h2>
      {sub ? <p className="s-sub">{sub}</p> : null}
    </div>
  )
}
