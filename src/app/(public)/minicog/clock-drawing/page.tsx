'use client'

import { useEffect, useRef } from 'react'
import { AppShell } from '@/components/public/AppShell'
import { AssessmentClockDrawingPage } from '@/components/public/AssessmentClockDrawingPage'
import { useAssessmentStore } from '@/store/assessmentStore'
import { createClockDrawing } from '@/api/minicog/clock/createClockDrawing'
import { useRouter } from 'next/navigation'
import { useClockRecording } from '@/hooks/useClockRecording'
import { completeClockDrawing } from '@/api/minicog/clock/completeClockDrawing'
import { uploadMedia } from '@/api/media/uploadMedia'
import { base64ToBlob } from '@/utils/base64ToBlob'

export default function ClockDrawingRoute() {
  const router = useRouter()

  const sessionId =
  useAssessmentStore((s) => s.sessionId)
    
  const hasHydrated = useAssessmentStore((s) => s.hasHydrated)
  const { stopAndGetVideo } = useClockRecording(!!sessionId)

  const startedRef = useRef(false)

  useEffect(() => {
    if (!hasHydrated) return 

    if (!sessionId) {
      router.replace('/')
      return
    }

    if (startedRef.current) return

    startedRef.current = true

    createClockDrawing(sessionId).then((res) =>
      res.match(
        () => {},
        () => alert('ไม่สามารถเริ่มการวาดนาฬิกาได้')
      )
    )
  }, [sessionId, router])

  return (
    <AppShell>
     <AssessmentClockDrawingPage
      onNext={async ({ final_image, events, evaluation }) => {
        if (!sessionId) return

        const videoBlob = await stopAndGetVideo()
        if (!videoBlob) return alert('ไม่สามารถบันทึกวิดีโอ')

        const eventsBlob = new Blob(
          [JSON.stringify(events)],
          { type: 'application/json' }
        )

        const [videoRes, imageRes, eventsRes] = await Promise.all([
          uploadMedia({ purpose: 'minicog_clock_video', file: videoBlob, sessionId }),
          uploadMedia({ purpose: 'minicog_clock_image', file: base64ToBlob(final_image), sessionId }),
          uploadMedia({ purpose: 'minicog_clock_events', file: eventsBlob, sessionId }),
        ])

        if (videoRes.isErr() || imageRes.isErr() || eventsRes.isErr()) {
          alert('อัปโหลดไม่สำเร็จ')
          return
        }

        await completeClockDrawing({
          session_id: sessionId,
          video_media_id: videoRes.value.media_id,
          image_media_id: imageRes.value.media_id,
          events_media_id: eventsRes.value.media_id,
          clock_score: evaluation.score,
        })

        router.push('/minicog/word-recall')
      }}
      />
    </AppShell>
  )
}