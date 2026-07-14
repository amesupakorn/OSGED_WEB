import type { MiniCogClockEvaluation } from '@/types/miniCogClockScoring'

export type ClockEvent =
  | {
      type: 'place_number'
      value: number
      x: number
      y: number
      t: number
    }
  | {
      type: 'move_number'
      value: number
      from: { x: number; y: number }
      to: { x: number; y: number }
      distance: number
      duration_ms: number
      t: number
    }
  | {
      type: 'rotate_hand'
      hand: 'hour' | 'minute'
      fromAngle: number
      toAngle: number
      duration_ms: number
      t: number
    }
  | { type: 'undo'; t: number }
  | { type: 'reset'; t: number }

  export interface ClockDrawingResult {
  final_image: string          // base64 PNG
  events: ClockEvent[]         // interaction log
  evaluation: MiniCogClockEvaluation // Mini-Cog automated score, computed client-side at submit
  meta: {
    started_at: number
    finished_at: number
    duration_ms: number
  }
}