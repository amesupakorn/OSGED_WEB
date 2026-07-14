import { useRef, useState, useCallback } from 'react'

interface Options {
  uploadFn: (blob: Blob) => Promise<string>
}

export function useTGDSRecordingUpload({ uploadFn }: Options) {
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeTypeRef = useRef<string>('video/webm')

  const [isRecording, setIsRecording] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  const getSupportedMimeType = () => {
    const types = [
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4'
    ]

    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) return t
    }

    return ''
  }

  /* ================= START ================= */

  const initCamera = useCallback(async () => {
    if (streamRef.current) return

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 480 },
        height: { ideal: 360 },
        frameRate: { ideal: 24 },
        facingMode: 'user',
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1,
      },
    })

    streamRef.current = stream
  }, [])

  const startRecording = useCallback(async () => {
    if (isRecording) return

    await initCamera()

    const stream = streamRef.current!
    chunksRef.current = []

    const mimeType = getSupportedMimeType()
    mimeTypeRef.current = mimeType

    // Create a video-only stream from the combined stream for video recording
    const videoOnlyStream = new MediaStream(stream.getVideoTracks())

    const recorder = mimeType
      ? new MediaRecorder(videoOnlyStream, {
          mimeType,
          videoBitsPerSecond: 700000,
        })
      : new MediaRecorder(videoOnlyStream)

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data)
      }
    }

    recorder.start()

    recorderRef.current = recorder
    setIsRecording(true)

  }, [isRecording, initCamera])

  /* ================= STOP ================= */

  const stopAndUpload = useCallback(async (): Promise<string | undefined> => {
    const recorder = recorderRef.current
    if (!recorder) return

    setIsUploading(true)

    const blob = await new Promise<Blob>((resolve) => {

      recorder.onstop = () => {

        const videoBlob = new Blob(chunksRef.current, {
          type: mimeTypeRef.current || 'video/webm'
        })

        resolve(videoBlob)
      }

      recorder.stop()

    })

    recorderRef.current = null
    setIsRecording(false)

    try {

      const mediaId = await uploadFn(blob)
      return mediaId

    } finally {

      setIsUploading(false)

    }

  }, [uploadFn])

  const stopRecordingOnly = useCallback(() => {

    const recorder = recorderRef.current

    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop()
      } catch {}
    }

    recorderRef.current = null
    chunksRef.current = []

    setIsRecording(false)

  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  return {
    startRecording,
    stopAndUpload,
    stopRecordingOnly,
    initCamera,
    stopCamera,
    isRecording,
    isUploading,
    getStream: () => streamRef.current
  }
}