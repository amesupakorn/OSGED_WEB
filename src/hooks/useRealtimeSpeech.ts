import { useRef, useState, useCallback } from "react"

const BACKEND_SOCKET = "osged-api.online"

export function useRealtimeSpeech() {
  const socketRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<AudioWorkletNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null)

  const [transcript, setTranscript] = useState("")
  const [isListening, setIsListening] = useState(false)
  const isListeningRef = useRef(false)
  const isLocalStreamRef = useRef(false)
  const completedTranscriptRef = useRef("")
  const interimTranscriptRef = useRef("")

  const isStoppingRef = useRef(false)
  const stopResolveRef = useRef<((value: string) => void) | null>(null)

  const resetTranscript = useCallback(() => {
    completedTranscriptRef.current = ""
    interimTranscriptRef.current = ""
    setTranscript("")
  }, [])

  /* ================= SOCKET ================= */

  const connectSocket = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "wss"

    socketRef.current = new WebSocket(`${protocol}://${BACKEND_SOCKET}/ws/speech`)

    socketRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (!data.text) return

      if (data.isFinal) {
        completedTranscriptRef.current = completedTranscriptRef.current
          ? `${completedTranscriptRef.current} ${data.text}`
          : data.text
        interimTranscriptRef.current = ""
        setTranscript(completedTranscriptRef.current)

        if (isStoppingRef.current && stopResolveRef.current) {
          const finalResult = completedTranscriptRef.current
          stopResolveRef.current(finalResult)
          stopResolveRef.current = null
        }
      } else {
        interimTranscriptRef.current = data.text
        const currentWhole = completedTranscriptRef.current
          ? `${completedTranscriptRef.current} ${data.text}`
          : data.text
        setTranscript(currentWhole)
      }
    }

    socketRef.current.onclose = () => {
      if (!isListeningRef.current) return

      reconnectTimerRef.current = setTimeout(() => {
        connectSocket()
      }, 1000)
    }
  }, [])

  /* ================= START ================= */

  const startListening = useCallback(async (stream?: MediaStream, externalCtx?: AudioContext) => {
    if (isListeningRef.current) return

    resetTranscript()

    if (!stream) {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1
        }
      })
      isLocalStreamRef.current = true
    } else {
      isLocalStreamRef.current = false
    }

    streamRef.current = stream

    connectSocket()

    if (externalCtx) {
      audioContextRef.current = externalCtx
    } else {
      const AudioContext =
        window.AudioContext ||
        (window as any).webkitAudioContext

      audioContextRef.current = new AudioContext({
        sampleRate: 16000
      })
    }

    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume()
    }

    const source = audioContextRef.current.createMediaStreamSource(stream)

    await audioContextRef.current.audioWorklet.addModule(
      "/audioProcessor.js"
    )

    const workletNode = new AudioWorkletNode(
      audioContextRef.current,
      "pcm-processor"
    )

    processorRef.current = workletNode

    source.connect(workletNode)

    workletNode.port.onmessage = (event) => {
      const pcm = event.data

      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(pcm.buffer)
      }
    }

    isListeningRef.current = true
    setIsListening(true)
  }, [connectSocket, resetTranscript])

  /* ================= STOP ================= */

  const stopListening = useCallback(async () => {
    isStoppingRef.current = true

    // 1. Stop mic input immediately to save battery/resources and stop sending audio
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }

    if (streamRef.current) {
      if (isLocalStreamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
      streamRef.current = null
    }

    // Determine final transcript text
    let finalSpeech = ""

    // If we have interim text, we wait for it to become final or time out
    if (interimTranscriptRef.current !== "" && socketRef.current?.readyState === WebSocket.OPEN) {
      finalSpeech = await new Promise<string>((resolve) => {
        stopResolveRef.current = resolve
        
        // Safety timeout of 2 seconds in case backend never sends isFinal: true
        setTimeout(() => {
          if (stopResolveRef.current) {
            const completed = completedTranscriptRef.current
            const interim = interimTranscriptRef.current
            resolve(completed ? (interim ? `${completed} ${interim}` : completed) : interim)
            stopResolveRef.current = null
          }
        }, 2000)
      })
    } else {
      // No interim text, we can resolve immediately
      const completed = completedTranscriptRef.current
      const interim = interimTranscriptRef.current
      finalSpeech = completed ? (interim ? `${completed} ${interim}` : completed) : interim
    }

    isStoppingRef.current = false
    stopResolveRef.current = null

    // 3. Clean up the AudioContext and WebSocket
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          await audioContextRef.current.close()
        }
      } catch (e) {
        console.error("Error closing AudioContext:", e)
      }
      audioContextRef.current = null
    }

    if (socketRef.current) {
      socketRef.current.close()
      socketRef.current = null
    }

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
    }

    isListeningRef.current = false
    setIsListening(false)

    return finalSpeech
  }, [])

  return {
    transcript,
    isListening,
    startListening,
    stopListening,
    resetTranscript
  }
}