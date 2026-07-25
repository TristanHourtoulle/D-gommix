/** Seat member passed from the server page (usernames come from the DB). */
export interface LivePlayer {
  userId: string
  username: string
}

/** userId → username lookup shared by the live components. */
export type NameMap = Record<string, string>

export function displayName(names: NameMap, userId: string): string {
  return names[userId] ?? 'Joueur'
}
