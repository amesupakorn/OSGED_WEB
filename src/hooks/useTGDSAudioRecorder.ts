import { useCallback, useRef, useState } from 'react'

interface Options {
  enabled?: boolean
}

export function useTGDSAudioRecorder({ enabled = true }: Options = {}) {

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getSupportedMimeType = () => {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4'
    ]

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type
      }
    }

    return ''
  }

    const initStream = async () => {

      if (streamRef.current) {

        const active = streamRef.current
          .getTracks()
          .some(t => t.readyState === "live")

        if (active) return streamRef.current

      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1
        }
      })

      streamRef.current = stream
      return stream
    }

  const start = useCallback(async (existingStream?: MediaStream | null) => {

    if (!enabled || isRecording) return
    if (recorderRef.current) {
      console.warn("Recorder already exists")
      return
    }
    try {

      setError(null)
      chunksRef.current = []

      // If an existing stream with audio tracks is provided, reuse it
      let stream: MediaStream
      if (existingStream && existingStream.getAudioTracks().length > 0) {
        stream = new MediaStream(existingStream.getAudioTracks())
        streamRef.current = stream
      } else {
        stream = await initStream()
      }

      const mimeType = getSupportedMimeType()

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      recorder.start(1000)

      recorderRef.current = recorder
      setIsRecording(true)

    } catch (err) {

      console.error(err)
      setError('permission_denied')

    }

  }, [enabled, isRecording])

  const stop = useCallback(async (): Promise<Blob | null> => {

    const recorder = recorderRef.current

    if (!recorder || recorder.state === 'inactive') {
      return null
    }

    return new Promise((resolve) => {

      recorder.onstop = () => {

        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm'
        })

        recorderRef.current = null
        setIsRecording(false)

        resolve(blob)

      }

      recorder.stop()

    })

  }, [])

  const forceStop = useCallback(() => {

    recorderRef.current?.stop()
    recorderRef.current = null
    setIsRecording(false)

  }, [])

  const getStream = () => streamRef.current

  return {
    start,
    stop,
    forceStop,
    getStream,
    isRecording,
    error
  }
}