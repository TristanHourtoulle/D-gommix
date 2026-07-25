/**
 * French elision of the preposition « de » before a name: « de Astrid » is
 * wrong, « d’Astrid » is right. Applies before a vowel and before an « h »,
 * which is treated as always mute — a deliberate simplification, since a
 * player-chosen pseudo carries no information about whether its « h » is
 * aspirated, and « d’Hugo » is the far more common case.
 *
 * Uses the typographic apostrophe U+2019, like every other French string in
 * this app.
 */
const ELIDES_BEFORE = /^[aàâäeéèêëiîïoôöuùûüyhAÀÂÄEÉÈÊËIÎÏOÔÖUÙÛÜYH]/

/** Renders « de <name> », elided to « d’<name> » when the name requires it. */
export function deName(name: string): string {
  return ELIDES_BEFORE.test(name) ? `d’${name}` : `de ${name}`
}
