import { beforeEach, describe, expect, it } from 'vitest'
import { buildGameState, reduce } from './reducer'
import {
  degommage,
  endRequested,
  endValidated,
  quit,
  resetSeq,
  started,
  undo,
  SEATS_4,
} from './test-helpers'

beforeEach(resetSeq)

describe('fold vs incremental parity', () => {
  it('produces identical states on a mixed log', () => {
    const events = [
      started(SEATS_4),
      degommage('u1', 'u2'),
      degommage('u2', 'u1'),
      undo('u3', 3),
      degommage('u4', 'u1'),
      quit('u3'),
      degommage('u1', 'u4'),
      endRequested('u2', 'village', 'u1'),
      endValidated('u1', 8),
    ]
    const folded = buildGameState(events)
    const first = events[0]
    if (!first) throw new Error('unreachable')
    let incremental = buildGameState([first])
    for (const e of events.slice(1)) incremental = reduce(incremental, e)
    expect(incremental).toEqual(folded)
  })
})
