import { useRef, useState } from "react"

const BACKEND_SOCKET = "osged-api.online"

export function useRealtimeSpeech() {
  const socketRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<AudioWorkletNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null)

  const [transcript, setTranscript] = useState("")
  const [isListening, setIsListening] = useState(false)

  const completedTranscriptRef = useRef("")
  const interimTranscriptRef = useRef("")

  const resetTranscript = () => {
    completedTranscriptRef.current = ""
    interimTranscriptRef.current = ""
    setTranscript("")
  }

  /* ================= SOCKET ================= */

  const connectSocket = () => {
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
      } else {
        interimTranscriptRef.current = data.text
        const currentWhole = completedTranscriptRef.current
          ? `${completedTranscriptRef.current} ${data.text}`
          : data.text
        setTranscript(currentWhole)
      }
    }

    socketRef.current.onclose = () => {
      if (!isListening) return

      reconnectTimerRef.current = setTimeout(() => {
        connectSocket()
      }, 1000)
    }
  }

  /* ================= START ================= */

  const startListening = async (stream?: MediaStream) => {
    if (isListening) return

    resetTranscript()

    if (!stream) {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1
        }
      })
    }

    streamRef.current = stream

    connectSocket()

    const AudioContext =
      window.AudioContext ||
      (window as any).webkitAudioContext

    audioContextRef.current = new AudioContext({
      sampleRate: 16000
    })

    const source = audioContextRef.current.createMediaStreamSource(stream)

    await audioContextRef.current.audioWorklet.addModule(
      "/audioProcessor.js"
    )

    const workletNode = new AudioWorkletNode(
      audioContextRef.current,
      "pcm-processor"
    )

    source.connect(workletNode)

    workletNode.port.onmessage = (event) => {
      const pcm = event.data

      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(pcm.buffer)
      }
    }

    setIsListening(true)
  }

  /* ================= STOP ================= */

  const stopListening = async () => {
    // 1. Stop mic input immediately to save battery/resources and stop sending audio
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }

    // 2. Wait for a grace period (e.g., 1000ms) to receive any final transcripts from the server
    await new Promise(resolve => setTimeout(resolve, 1000))

    // 3. Clean up the AudioContext and WebSocket
    if (audioContextRef.current) {
      try {
        await audioContextRef.current.close()
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

    setIsListening(false)

    // Return the final combined transcript
    const completed = completedTranscriptRef.current
    const interim = interimTranscriptRef.current
    return completed ? (interim ? `${completed} ${interim}` : completed) : interim
  }

  return {
    transcript,
    isListening,
    startListening,
    stopListening,
    resetTranscript
  }
}