import { apiAction } from '@/api/apiAction'
import { post } from '@/services/httpRequest'
import { object, string, array, number } from 'valibot'

export const completeClockDrawing = (payload: {
  session_id: string
  video_media_id: string
  image_media_id: string
  events_media_id: string
  clock_score: number
}) =>
  apiAction(
    payload,
    object({
      session_id: string(),
      video_media_id: string(),
      image_media_id: string(),
      events_media_id: string(),
      clock_score: number()
    }),
    object({}),
    async (v) => {
      const res = await post(
        `/api/minicog/${v.session_id}/clock/complete`,
        v
      )
      return res.data
    }
  )