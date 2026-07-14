/**
 * Types for the Mini-Cog© Clock Drawing Test (CDT) automated scoring engine.
 *
 * Coordinate convention: x/y are expected to be RELATIVE percentages
 * (0-100) of the clock canvas, not raw pixels — this matches how
 * `AssessmentClockDrawingPage.tsx` already stores `ClockNumber.x/y`
 * (`((clientX - rect.left) / rect.width) * 100`). Scoring on percentages
 * instead of pixel benchmarks keeps results identical across phones,
 * tablets, and desktop regardless of the container's actual rendered size.
 */

export type PlacedNumberElement = {
  kind: 'number'
  /** 1-12 = clock numbers, 13-16 = distractors */
  id: number
  x: number
  y: number
}

export type PlacedHandElement = {
  kind: 'hand'
  id: 'hour' | 'minute'
  /**
   * Clockwise degrees from 12 o'clock (0-360). This is the same
   * convention already produced by the drag handler in
   * `AssessmentClockDrawingPage.tsx`
   * (`angle = atan2(dy, dx) * 180/PI + 90`, normalized to [0, 360)),
   * so `hourHand.angle` / `minuteHand.angle` can be passed straight
   * through with no conversion.
   */
  angle: number
}

export type PlacedElement = PlacedNumberElement | PlacedHandElement

export interface ClockCenter {
  cx: number
  cy: number
  /**
   * Radius of the circular clock face, in the same unit as cx/cy.
   * Defaults to 50 — the container's edge when x/y are 0-100 percentages
   * and the clock face fills its (square) container.
   */
  radius?: number
}

export type MiniCogScore = 0 | 2
export type MiniCogVerdict = 'Normal' | 'Abnormal'

export interface NumberAngleAudit {
  id: number
  actualAngle: number
  targetAngle: number
  deviation: number
  withinTolerance: boolean
}

export interface HandAngleAudit {
  hand: 'hour' | 'minute'
  actualAngle: number
  targetAngle: number
  deviation: number
  withinTolerance: boolean
}

export interface MiniCogClockEvaluation {
  score: MiniCogScore
  verdict: MiniCogVerdict
  /**
   * Every specific violation found within the first failing category
   * (not just the first one hit) — the final score is strictly
   * binary per Mini-Cog guidelines, but a clinician/reviewer auditing
   * a failed attempt benefits from seeing all of them at once.
   */
  reasons: string[]
  audit: {
    numbers: NumberAngleAudit[]
    hands: HandAngleAudit[]
  }
}
