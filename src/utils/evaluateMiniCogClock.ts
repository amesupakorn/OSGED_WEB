import type {
  ClockCenter,
  HandAngleAudit,
  MiniCogClockEvaluation,
  NumberAngleAudit,
  PlacedElement,
  PlacedHandElement,
  PlacedNumberElement,
} from '@/types/miniCogClockScoring'

/**
 * Mini-Cog© Clock Drawing Test is scored All-or-Nothing (0 or 2 points) —
 * there is no partial credit in the validated instrument. These tolerances
 * exist only to absorb drag-and-drop / motor-control noise (shaky hands,
 * imprecise touch input) that has nothing to do with cognitive intent.
 */
export const NUMBER_TOLERANCE_DEG = 20
export const HAND_TOLERANCE_DEG = 10

/** 11:10 target: minute hand → "2" (10 minutes = 10/60 * 360°), hour hand → "11". */
export const MINUTE_HAND_TARGET_DEG = 60
export const HOUR_HAND_TARGET_DEG = 330

export const DISTRACTOR_IDS = [13, 14, 15, 16]
export const REQUIRED_NUMBERS = Array.from({ length: 12 }, (_, i) => i + 1)

/**
 * Converts an (x, y) drop point into a clockwise angle from 12 o'clock,
 * relative to the clock's center. Unit-agnostic — pass percentages (0-100,
 * recommended) or raw pixels, as long as x/y and cx/cy share the same unit;
 * it's a ratio (atan2) calculation, not a pixel-benchmark comparison.
 *
 * Screen-space y grows downward, so "up" is -dy. Using atan2(dx, -dy)
 * instead of the textbook atan2(dy, dx) re-anchors the zero-reference from
 * 3 o'clock (standard math convention) to 12 o'clock and flips the winding
 * to clockwise — matching a real clock face, and matching the rotation math
 * already used for hand-dragging in AssessmentClockDrawingPage.tsx
 * (`angle = atan2(dy, dx) * 180/PI + 90`), so number-placement angles and
 * hand-rotation angles land in the same coordinate system.
 */
function angleFromCenter(cx: number, cy: number, x: number, y: number): number {
  const dx = x - cx
  const dy = y - cy
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI
  return deg < 0 ? deg + 360 : deg
}

/**
 * Shortest angular distance between two angles on a 0-360° circle,
 * correctly handling wraparound (e.g. 5° vs 355° is 10° apart, not 350°).
 * Without this, a number placed 1° early past 12 o'clock (e.g. 359° vs a
 * 0°/360° target) would be misread as ~359° off instead of ~1°.
 */
function angularDeviation(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360
  return diff > 180 ? 360 - diff : diff
}

/** Euclidean distance from center vs. face radius — used only for the distractor boundary check. */
function isInsideClockFace(
  cx: number,
  cy: number,
  radius: number,
  x: number,
  y: number
): boolean {
  const dx = x - cx
  const dy = y - cy
  return Math.sqrt(dx * dx + dy * dy) <= radius
}

const isNumberElement = (el: PlacedElement): el is PlacedNumberElement =>
  el.kind === 'number'

const isHandElement = (el: PlacedElement): el is PlacedHandElement =>
  el.kind === 'hand'

/**
 * Scores a submitted Mini-Cog Clock Drawing Test.
 *
 * Checks run in strict priority order and return immediately on the first
 * failing category (distractors → completeness → number placement →
 * hand vectors), matching the clinical binary pass/fail model. Any failure
 * short-circuits to Score 0 (Abnormal); only a submission that clears every
 * gate scores 2 (Normal).
 */
export function evaluateMiniCogClock(
  placedElements: PlacedElement[],
  clockCenter: ClockCenter
): MiniCogClockEvaluation {
  const { cx, cy, radius = 50 } = clockCenter

  const numberElements = placedElements.filter(isNumberElement)
  const handElements = placedElements.filter(isHandElement)

  const emptyAudit = { numbers: [] as NumberAngleAudit[], hands: [] as HandAngleAudit[] }

  // ---- 1. Distractor validation ------------------------------------------
  const distractorsOnFace = numberElements.filter(
    (n) => DISTRACTOR_IDS.includes(n.id) && isInsideClockFace(cx, cy, radius, n.x, n.y)
  )
  if (distractorsOnFace.length > 0) {
    return {
      score: 0,
      verdict: 'Abnormal',
      reasons: distractorsOnFace.map(
        (n) => `Distractor number ${n.id} was placed on the clock face`
      ),
      audit: emptyAudit,
    }
  }

  // ---- 2. Completeness validation ----------------------------------------
  const placedIds = new Set(numberElements.map((n) => n.id))
  const missingNumbers = REQUIRED_NUMBERS.filter((n) => !placedIds.has(n))
  if (missingNumbers.length > 0) {
    return {
      score: 0,
      verdict: 'Abnormal',
      reasons: [`Missing required number(s): ${missingNumbers.join(', ')}`],
      audit: emptyAudit,
    }
  }

  // ---- 3. Spatial sequence check (±20°) ----------------------------------
  const numberAudit: NumberAngleAudit[] = REQUIRED_NUMBERS.map((id) => {
    // Safe to use `!` — completeness check above guarantees every id 1-12 exists.
    const el = numberElements.find((n) => n.id === id)!
    const actualAngle = angleFromCenter(cx, cy, el.x, el.y)
    const targetAngle = (id * 30) % 360 // 12 * 30 = 360 → normalize to 0
    const deviation = angularDeviation(actualAngle, targetAngle)
    return {
      id,
      actualAngle,
      targetAngle,
      deviation,
      withinTolerance: deviation <= NUMBER_TOLERANCE_DEG,
    }
  })

  const misplacedNumbers = numberAudit.filter((a) => !a.withinTolerance)
  if (misplacedNumbers.length > 0) {
    return {
      score: 0,
      verdict: 'Abnormal',
      reasons: misplacedNumbers.map(
        (a) =>
          `Number ${a.id} is ${a.deviation.toFixed(1)}° off target ` +
          `(target ${a.targetAngle}°, tolerance ±${NUMBER_TOLERANCE_DEG}°)`
      ),
      audit: { numbers: numberAudit, hands: [] },
    }
  }

  // ---- 4. Clock hand vector validation (±10°, target 11:10) -------------
  const hourEl = handElements.find((h) => h.id === 'hour')
  const minuteEl = handElements.find((h) => h.id === 'minute')

  if (!hourEl || !minuteEl) {
    return {
      score: 0,
      verdict: 'Abnormal',
      reasons: [
        !hourEl && 'Hour hand was not placed',
        !minuteEl && 'Minute hand was not placed',
      ].filter((r): r is string => Boolean(r)),
      audit: { numbers: numberAudit, hands: [] },
    }
  }

  const hourDeviation = angularDeviation(hourEl.angle, HOUR_HAND_TARGET_DEG)
  const minuteDeviation = angularDeviation(minuteEl.angle, MINUTE_HAND_TARGET_DEG)

  const handAudit: HandAngleAudit[] = [
    {
      hand: 'hour',
      actualAngle: hourEl.angle,
      targetAngle: HOUR_HAND_TARGET_DEG,
      deviation: hourDeviation,
      withinTolerance: hourDeviation <= HAND_TOLERANCE_DEG,
    },
    {
      hand: 'minute',
      actualAngle: minuteEl.angle,
      targetAngle: MINUTE_HAND_TARGET_DEG,
      deviation: minuteDeviation,
      withinTolerance: minuteDeviation <= HAND_TOLERANCE_DEG,
    },
  ]

  const misplacedHands = handAudit.filter((a) => !a.withinTolerance)
  if (misplacedHands.length > 0) {
    return {
      score: 0,
      verdict: 'Abnormal',
      reasons: misplacedHands.map(
        (a) =>
          `${a.hand === 'hour' ? 'Hour' : 'Minute'} hand is ${a.deviation.toFixed(1)}° off target ` +
          `(target ${a.targetAngle}°, tolerance ±${HAND_TOLERANCE_DEG}°)`
      ),
      audit: { numbers: numberAudit, hands: handAudit },
    }
  }

  // ---- 5. Success ---------------------------------------------------------
  return {
    score: 2,
    verdict: 'Normal',
    reasons: [],
    audit: { numbers: numberAudit, hands: handAudit },
  }
}

/**
 * Adapter for the exact state shape `AssessmentClockDrawingPage.tsx`
 * already keeps in memory (`numbers`, `hourHand`, `minuteHand`) — wires it
 * into `evaluateMiniCogClock` without that component needing to know about
 * `PlacedElement`. Only placed (dropped) items are included, matching how
 * the component itself filters (`numbers.filter(n => n.isPlaced)`).
 */
export function toPlacedElements(state: {
  numbers: { value: number; x: number; y: number; isPlaced: boolean }[]
  hourHand: { angle: number; isPlaced: boolean }
  minuteHand: { angle: number; isPlaced: boolean }
}): PlacedElement[] {
  const elements: PlacedElement[] = state.numbers
    .filter((n) => n.isPlaced)
    .map((n) => ({ kind: 'number', id: n.value, x: n.x, y: n.y }))

  if (state.hourHand.isPlaced) {
    elements.push({ kind: 'hand', id: 'hour', angle: state.hourHand.angle })
  }
  if (state.minuteHand.isPlaced) {
    elements.push({ kind: 'hand', id: 'minute', angle: state.minuteHand.angle })
  }

  return elements
}
