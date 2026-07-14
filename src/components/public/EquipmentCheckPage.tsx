'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Camera,
  Mic,
  Volume2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  Play
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRealtimeSpeech } from '@/hooks/useRealtimeSpeech'

interface Status {
  type: 'idle' | 'loading' | 'success' | 'error'
  message?: string
}

export const EquipmentCheckPage: React.FC = () => {
  const router = useRouter()

  const [cameraStatus, setCameraStatus] = useState<Status>({ type: 'idle' })
  const [micStatus, setMicStatus] = useState<Status>({ type: 'idle' })
  const [speakerStatus, setSpeakerStatus] = useState<Status>({ type: 'idle' })

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const [volume, setVolume] = useState(0)

  const { transcript, isListening, startListening, stopListening } = useRealtimeSpeech()
  const validVolumeFramesRef = useRef(0)
  const isMicCheckedRef = useRef(false)
  const animationFrameIdRef = useRef<number | null>(null)

  // Unified stream setup to resolve camera & mic concurrent access/lock issues on mobile (Safari iOS)
  const initUnifiedStream = async (preferVideo = true, preferAudio = true) => {
    if (streamRef.current) {
      const hasVideo = streamRef.current.getVideoTracks().length > 0
      const hasAudio = streamRef.current.getAudioTracks().length > 0
      
      // If we already have a stream that satisfies the request, return it
      if ((!preferVideo || hasVideo) && (!preferAudio || hasAudio)) {
        return streamRef.current
      }
      
      // Otherwise, close the current stream and request a new one with the needed tracks
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }

    const constraints: MediaStreamConstraints = {}
    if (preferVideo) {
      constraints.video = { width: 480, height: 360, facingMode: 'user' }
    }
    if (preferAudio) {
      constraints.audio = {
        echoCancellation: true,
        noiseSuppression: true
      }
    }

    const stream = await navigator.mediaDevices.getUserMedia(constraints)
    streamRef.current = stream
    return stream
  }

  // Cleanup
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(err => console.error("Error closing AudioContext in cleanup:", err))
      }
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current)
      }
      stopListening()
    }
  }, [stopListening])

  /* ================= CAMERA CHECK ================= */
  const checkCamera = async () => {
    setCameraStatus({ type: 'loading' })
    try {
      // First try unified (both video and audio) to prevent iOS Safari lock issues
      const stream = await initUnifiedStream(true, true)

      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }

      setCameraStatus({ type: 'success' })
    } catch (err) {
      console.warn("Unified stream request failed in checkCamera, retrying with video only:", err)
      try {
        // Fallback to video only
        const stream = await initUnifiedStream(true, false)
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
        setCameraStatus({ type: 'success' })
      } catch (fallbackErr) {
        console.error("Video-only fallback failed in checkCamera:", fallbackErr)
        setCameraStatus({ type: 'error', message: 'ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการเข้าถึงกล้อง' })
      }
    }
  }

  const handleMicSuccess = useCallback(async (msg?: string) => {
    if (isMicCheckedRef.current) return
    isMicCheckedRef.current = true
    
    await stopListening()
    setMicStatus({ type: 'success', message: msg || 'พร้อมใช้งาน' })
  }, [stopListening])

  // Watch transcript for keyword match
  useEffect(() => {
    if (micStatus.type === 'loading' && transcript && !isMicCheckedRef.current) {
      const matched = ['สวัสดี', 'ทดสอบ', 'เทส', 'hello', 'test', 'หวัดดี', 'สะ', 'หวัด', 'ดี', 'ทศ', 'สอบ'].some(word => 
        transcript.toLowerCase().includes(word)
      )
      if (matched) {
        handleMicSuccess(`พร้อมใช้งาน (คำที่พูด: ${transcript})`)
      }
    }
  }, [transcript, micStatus.type, handleMicSuccess])

  /* ================= MICROPHONE CHECK ================= */
  const checkMic = async () => {
    // 1. Instantiating AudioContext at the absolute start of user event handler (before any await)
    // to preserve user gesture context for Safari/iOS
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    const audioContext = new AudioContextClass({ sampleRate: 16000 })
    
    // Resume immediately under user gesture context
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(err => console.error("Immediate resume failed:", err))
    }

    setMicStatus({ type: 'loading', message: 'กรุณาพูดคำว่า "สวัสดี" หรือ "ทดสอบ"' })
    isMicCheckedRef.current = false
    validVolumeFramesRef.current = 0
    
    try {
      let stream: MediaStream
      const needVideo = cameraStatus.type === 'success'
      try {
        // Only request video if the camera check has already succeeded
        stream = await initUnifiedStream(needVideo, true)
        if (needVideo && videoRef.current && videoRef.current.srcObject !== stream) {
          videoRef.current.srcObject = stream
        }
      } catch (err) {
        console.warn("Unified stream request failed in checkMic, retrying with audio only:", err)
        // Fallback to audio only
        stream = await initUnifiedStream(false, true)
      }

      // Set up Audio Context for Volume Meter (using our blessed context)
      const analyser = audioContext.createAnalyser()
      const source = audioContext.createMediaStreamSource(stream)

      analyser.fftSize = 256
      source.connect(analyser)

      audioContextRef.current = audioContext
      analyserRef.current = analyser

      // Start speech recognition, passing our user-gesture-activated AudioContext
      await startListening(stream, audioContext)

      // Start monitoring volume
      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)

      const updateVolume = () => {
        if (!analyserRef.current || isMicCheckedRef.current) return
        analyserRef.current.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i]
        }
        const average = sum / bufferLength
        setVolume(average)

        // Volume-based fallback check: if they make sound for enough frames
        if (average > 12) {
          validVolumeFramesRef.current += 1
          if (validVolumeFramesRef.current >= 45) { // ~0.75 seconds of speaking
            handleMicSuccess('พร้อมใช้งาน')
            return
          }
        }

        animationFrameIdRef.current = requestAnimationFrame(updateVolume)
      }
      
      updateVolume()

    } catch (err) {
      console.error(err)
      setMicStatus({ type: 'error', message: 'ไม่สามารถเข้าถึงไมโครโฟนได้ กรุณาอนุญาตการเข้าถึงไมโครโฟน' })
    }
  }

  /* ================= SPEAKER CHECK ================= */
  const testSpeaker = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      const ctx = new AudioContextClass()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.type = 'sine'
      osc.frequency.setValueAtTime(440, ctx.currentTime) // A4 note

      gain.gain.setValueAtTime(0, ctx.currentTime)
      gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05)
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5)

      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.5)

      setSpeakerStatus({ type: 'success' })
    } catch (err) {
      console.error(err)
      setSpeakerStatus({ type: 'error', message: 'ไม่สามารถทดสอบเสียงได้' })
    }
  }

  const allReady = cameraStatus.type === 'success' &&
    micStatus.type === 'success' &&
    speakerStatus.type === 'success'

  return (
    <div className="w-full max-w-4xl mx-auto px-6 py-12 animate-fade-in flex flex-col min-h-[80vh]">
      
      {/* Step Progress */}
      <div className="flex items-center justify-center gap-4 mb-12">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-sm font-bold">✓</div>
          <span className="text-sm font-bold text-gray-500 hidden sm:block">ยืนยันตัวตน</span>
        </div>
        <div className="w-12 h-0.5 bg-green-200" />
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold animate-pulse">2</div>
          <span className="text-sm font-bold text-primary">ตรวจเช็คอุปกรณ์</span>
        </div>
        <div className="w-12 h-0.5 bg-gray-200" />
        <div className="flex items-center gap-2 opacity-40">
          <div className="w-8 h-8 rounded-full bg-gray-300 text-white flex items-center justify-center text-sm font-bold">3</div>
          <span className="text-sm font-bold text-gray-500 hidden sm:block">ยินยอมรับบริการ</span>
        </div>
      </div>

      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-black text-gray-900 mb-4">ตรวจสอบความพร้อม</h1>
        <p className="text-xl text-gray-500">กรุณาทดสอบ กล้อง ไมโครโฟน และลำโพง เพื่อเข้าสู่การประเมิน</p>
      </div>


      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">

        {/* 1. Camera Card */}
        <div className={`bg-white rounded-[32px] p-8 border-4 transition-all shadow-xl flex flex-col items-center
          ${cameraStatus.type === 'success' ? 'border-green-400 bg-green-50/30' : 'border-gray-100'}`}>
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-6">
            <Camera size={32} />
          </div>
          <h3 className="text-2xl text-black font-bold mb-4">1. กล้อง</h3>

          <div className="relative w-full aspect-square bg-gray-900 rounded-[24px] overflow-hidden mb-6 shadow-inner">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            {cameraStatus.type !== 'success' && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                {cameraStatus.type === 'loading' ? (
                  <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Camera size={48} className="opacity-20" />
                )}
              </div>
            )}
          </div>

          {cameraStatus.type === 'idle' || cameraStatus.type === 'error' ? (
            <button
              onClick={checkCamera}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors">
              ทดสอบกล้อง
            </button>
          ) : (
            <div className="flex items-center gap-2 text-green-600 font-bold">
              <CheckCircle2 size={20} /> พร้อมใช้งาน
            </div>
          )}
          {cameraStatus.type === 'error' && <p className="text-red-500 text-sm mt-2">{cameraStatus.message}</p>}
        </div>

        {/* 2. Microphone Card */}
        <div className={`bg-white rounded-[32px] p-8 border-4 transition-all shadow-xl flex flex-col items-center
          ${micStatus.type === 'success' ? 'border-green-400 bg-green-50/30' : 'border-gray-100'}`}>
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-6">
            <Mic size={32} />
          </div>
          <h3 className="text-2xl text-black font-bold mb-4">2. ไมโครโฟน</h3>

          <div className="w-full flex-grow flex flex-col items-center justify-center gap-6 mb-6">
            {/* Volume Visualizer */}
            <div className="w-full h-24 bg-gray-50 rounded-2xl flex items-end justify-center gap-1 p-4 overflow-hidden border border-gray-100">
              {[...Array(12)].map((_, i) => (
                <div
                  key={i}
                  className="w-full bg-blue-500 rounded-full transition-all duration-75"
                  style={{ height: (micStatus.type === 'loading' || micStatus.type === 'success') ? `${Math.min(100, Math.max(5, volume * (1.5 + Math.sin(i))))}%` : '5%' }}
                />
              ))}
            </div>
            {micStatus.type === 'loading' && (
              <div className="text-center">
                <p className="text-sm font-bold text-blue-600 animate-pulse">
                  กรุณาพูดว่า "สวัสดี" หรือ "ทดสอบ"
                </p>
                {transcript ? (
                  <p className="text-xs text-gray-500 mt-1">
                    คำที่จับได้: <span className="font-semibold text-gray-800">"{transcript}"</span>
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 mt-1 animate-pulse">
                    กำลังฟังเสียง...
                  </p>
                )}
              </div>
            )}
            {micStatus.type === 'success' && (
              <div className="text-center">
                <p className="text-sm text-green-600 font-bold flex items-center justify-center gap-1">
                  <CheckCircle2 size={16} /> ตรวจสอบผ่านแล้ว
                </p>
                {micStatus.message && (
                  <p className="text-xs text-gray-500 mt-1">
                    {micStatus.message}
                  </p>
                )}
              </div>
            )}
            {micStatus.type === 'idle' && (
              <p className="text-sm text-gray-400">กรุณากดปุ่มเพื่อเริ่มทดสอบไมค์</p>
            )}
            {micStatus.type === 'error' && (
              <p className="text-sm text-red-500 font-bold">{micStatus.message}</p>
            )}
          </div>

          {micStatus.type === 'idle' || micStatus.type === 'error' ? (
            <button
              onClick={checkMic}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors">
              ทดสอบไมค์
            </button>
          ) : micStatus.type === 'loading' ? (
            <div className="w-full py-3 bg-gray-100 text-gray-500 rounded-xl font-bold flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
              <span>กำลังทดสอบ...</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-green-600 font-bold py-3">
              <CheckCircle2 size={20} /> พร้อมใช้งาน
            </div>
          )}
        </div>

        {/* 3. Speaker Card */}
        <div className={`bg-white rounded-[32px] p-8 border-4 transition-all shadow-xl flex flex-col items-center
          ${speakerStatus.type === 'success' ? 'border-green-400 bg-green-50/30' : 'border-gray-100'}`}>
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-6">
            <Volume2 size={32} />
          </div>
          <h3 className="text-2xl text-black  font-bold mb-4">3. ลำโพง</h3>

          <div className="w-full flex-grow flex flex-col items-center justify-center mb-6">
            <button
              onClick={testSpeaker}
              className="w-24 h-24 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center hover:bg-blue-100 transition-all hover:scale-110 active:scale-95 group">
              <Play size={40} className="ml-1 group-hover:animate-pulse" />
            </button>
            <p className="text-sm text-gray-400 mt-4 text-center">คลิกเพื่อฟังเสียงทดสอบ</p>
          </div>

          {speakerStatus.type === 'success' ? (
            <div className="flex items-center gap-2 text-green-600 font-bold">
              <CheckCircle2 size={20} /> ได้ยินชัดเจน
            </div>
          ) : (
            <button
              onClick={testSpeaker}
              className="w-full py-3 border-2 border-blue-600 text-blue-600 rounded-xl font-bold hover:bg-blue-50 transition-colors">
              ทดสอบเสียง
            </button>
          )}
        </div>

      </div>

      {/* Troubleshooting */}
      {(!allReady && (cameraStatus.type === 'error' || micStatus.type === 'error')) && (
        <div className="bg-red-50 border-2 border-red-200 rounded-3xl p-6 mb-12 flex items-start gap-4 animate-shake">
          <AlertCircle className="text-red-600 shrink-0 mt-1" size={24} />
          <div>
            <h4 className="text-lg font-bold text-red-900 mb-1">พบปัญหาการเข้าถึงอุปกรณ์</h4>
            <p className="text-red-700">
              กรุณาตรวจสอบว่าท่านได้ "อนุญาต" (Allow) การเข้าถึงกล้องและไมโครโฟนในเบราว์เซอร์แล้ว
              หากยังไม่สามารถใช้งานได้ กรุณารีเฟรชหน้านี้หรือเปลี่ยนไปใช้ Google Chrome
            </p>
          </div>
        </div>
      )}

      {/* Action Button */}
      <div className="flex justify-center mt-auto">
        <button
          onClick={() => router.push('/consent')}
          disabled={!allReady}
          className={`
            w-full max-w-lg py-6 rounded-[28px] text-3xl font-black shadow-2xl transition-all flex items-center justify-center gap-4
            ${allReady
              ? 'bg-blue-600 text-white hover:bg-blue-700 hover:-translate-y-1 hover:shadow-blue-200/50'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'}
          `}
        >
          <span>เริ่มการประเมิน</span>
          <ArrowRight size={36} strokeWidth={3} />
        </button>
      </div>

      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
      `}</style>
    </div>
  )
}
