'use client'

import React, {
  useRef,
  useState,
  useEffect,
  useCallback
} from 'react'

import { BaseTGDSLayout } from './BaseTGDSLayout'
import { useTGDSRecordingUpload } from '@/hooks/useTGDSRecordingUpload'
import { uploadMedia } from '@/api/media/uploadMedia'
import { useTGDSAudioRecorder } from '@/hooks/useTGDSAudioRecorder'
import { useTGDSAutoSkipTimer } from '@/hooks/useTGDSAutoSkipTimer'
import { useRealtimeSpeech } from '@/hooks/useRealtimeSpeech'

interface Props {
  question: string
  index: number
  total: number
  progressPercent: number
  sessionId: string
  onAnswer: (
    answer: boolean | 'skip',
    videoMediaId?: string,
    audioMediaId?: string
  ) => void
  isSpeaking: boolean
}

export const TGDSAnswerPage: React.FC<Props> = ({
  question,
  index,
  total,
  progressPercent,
  sessionId,
  onAnswer,
  isSpeaking
}) => {

  /* ================= STATE ================= */

  const [finalAnswer, setFinalAnswer] =
    useState<boolean | 'skip' | null>(null)

  const [hasDetectedAnswer, setHasDetectedAnswer] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const accumulatedTranscriptRef = useRef('')
  const audioBlobRef = useRef<Blob | null>(null)

  /* ================= REALTIME SPEECH ================= */

  const {
    transcript,
    isListening,
    startListening,
    stopListening,
    resetTranscript
  } = useRealtimeSpeech()

  /* ================= AUDIO ================= */

  const {
    start: startAudio,
    stop: stopAudio,
    getStream: getAudioStream
  } = useTGDSAudioRecorder()

  /* ================= VIDEO ================= */

  const {
    stopAndUpload,
    startRecording,
    stopRecordingOnly,
    initCamera,
    isUploading,
    getStream: getCombinedStream
  } = useTGDSRecordingUpload({
    uploadFn: async (blob) => {

      const result = await uploadMedia({
        sessionId,
        purpose: 'tgds_test',
        questionNo: index + 1,
        file: blob
      })

      return result.match(
        (m) => m.media_id,
        (e) => { throw e }
      )

    }
  })

  useEffect(() => {
    initCamera()
  }, [])

  /* ================= AUDIO UPLOAD ================= */

  const uploadTGDSSound = useCallback(
    async (blob: Blob): Promise<string> => {

      const result = await uploadMedia({
        sessionId,
        purpose: 'tgds_audio',
        questionNo: index + 1,
        file: blob
      })

      return result.match(
        (m) => m.media_id,
        (e) => { throw e }
      )

    },
    [sessionId, index]
  )

  /* ================= AUTOSKIP ================= */

  const { showHint, onUserActivity } = useTGDSAutoSkipTimer({
    isAiSpeaking: isSpeaking,
    isListening,
    isSubmitting,
    
    onSkip: () => {
      stopRecordingOnly()
      onAnswer('skip')
    }
  })

  /* ================= RESET ================= */

  const [isReadyToRecord, setIsReadyToRecord] = useState(false)
  const hasSpokenRef = useRef(false)

  const resetAnswer = useCallback(async () => {

    accumulatedTranscriptRef.current = ''
    audioBlobRef.current = null

    resetTranscript()

    setFinalAnswer(null)
    setHasDetectedAnswer(false)

    await stopListening()

    await stopAudio()

    stopRecordingOnly()
    setIsReadyToRecord(true)

    
  }, [resetTranscript, stopListening, stopAudio, stopRecordingOnly])

  useEffect(() => {
    resetAnswer()
  }, [question])

  useEffect(() => {
    return () => stopRecordingOnly()
  }, [stopRecordingOnly])

  /* ================= ANSWER DETECTION ================= */

const processTranscriptForAnswer = (
  fullTranscript: string
): boolean | 'skip' | null => {

  if (!fullTranscript) return null

  let cleaned = fullTranscript
    .toLowerCase()
    .replace(/[.,!?]/g, '')
    .replace(/ครับ|ค่ะ|จ้ะ|จ้า|นะ|เลย|แหละ|หรอก|ลูก|หลาน/g, '')
    .trim()

  if (cleaned.includes('หรือไม่')) {
    cleaned = cleaned.split('หรือไม่').pop()!.trim()
  }

  if (!cleaned) return null

  const tail = cleaned.slice(-15)

  // skip
   if (/ข้าม|ไม่ตอบ|ผ่าน/.test(tail)) return 'skip'

  // negative
  if (
    /ไม่(ใช่)?$/.test(tail) ||
    /ไม่มี$/.test(tail) ||
    /เปล่า$/.test(tail)
  ) return false

  // positive
  if (/ใช่$/.test(tail)) return true

  return null
}
/* ================= TRANSCRIPT ================= */

  useEffect(() => {

    if (!transcript) return
  
    if (transcript) {
      hasSpokenRef.current = true
    }

    onUserActivity()

    accumulatedTranscriptRef.current = transcript

    const detected =
      processTranscriptForAnswer(
        accumulatedTranscriptRef.current
      )

    if (detected !== null) {

      const finalize = async () => {

        await stopListening()

        const blob = await stopAudio()

        audioBlobRef.current = blob

        setHasDetectedAnswer(true)
        setFinalAnswer(detected)

      }

      finalize()

    }

  }, [transcript])

  /* ================= LISTEN ================= */

  const toggleListening = async () => {

    onUserActivity()

    if (isListening) {

      const finalSpeech = await stopListening()

      audioBlobRef.current = await stopAudio()
      stopRecordingOnly()

      const detected = processTranscriptForAnswer(finalSpeech)
      if (detected !== null) {
        setFinalAnswer(detected)
        setHasDetectedAnswer(true)
      }
      return


    } else {

      accumulatedTranscriptRef.current = ''

      resetTranscript()
      if (hasSpokenRef.current) {
        stopRecordingOnly()
        hasSpokenRef.current = false
      }

      await startRecording()

      await new Promise(r => setTimeout(r, 150))

      const stream = getCombinedStream()

      await startAudio(stream)

      if (stream) {
        await startListening(stream)
      }

    }
  }

  /* ================= SUBMIT ================= */

  const handleSubmit = async () => {

    if (finalAnswer === null || isSubmitting)
      return

    setIsSubmitting(true)

    try {

      const videoPromise = stopAndUpload()

      const audioBlob = audioBlobRef.current
      
      const audioPromise =
        audioBlob && audioBlob.size > 0
          ? uploadTGDSSound(audioBlob)
          : Promise.resolve(undefined)

      const [videoMediaId, audioMediaId] =
        await Promise.all([
          videoPromise,
          audioPromise
        ])
      
      stopRecordingOnly()
      await onAnswer(
        finalAnswer,
        videoMediaId,
        audioMediaId
      )

    } catch (e) {

      console.error(e)
      alert('เกิดข้อผิดพลาด')

    } finally {

      setIsSubmitting(false)

    }

  }

  /* ================= RENDER ================= */

  return (
    <BaseTGDSLayout
      index={index}
      total={total}
      progressPercent={progressPercent}
      questionText={question}
      isListening={isListening}
      finalAnswerText={
        finalAnswer === true
          ? 'ใช่'
          : finalAnswer === false
          ? 'ไม่ใช่'
          : finalAnswer === 'skip'
          ? 'ข้ามคำถามนี้'
          : undefined
      }
      hasDetectedAnswer={hasDetectedAnswer}
      onToggleListening={toggleListening}
      onResetAnswer={resetAnswer}
      onSubmitAnswer={handleSubmit}
      isUploading={isUploading}
      isSubmitting={isSubmitting}
      isSpeaking={isSpeaking}
      showHint={showHint}
    />
  )

}