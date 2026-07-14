import React, { useEffect, useRef, useState } from 'react';
import { Mic, StopCircle } from 'lucide-react';
import { useRealtimeSpeech } from '@/hooks/useRealtimeSpeech'
import { SpeechSegment } from '@/hooks/useSpeechRecognition'
import { useLocalVoiceGuide } from '@/hooks/useLocalVoiceGuide';

interface AssessmentWordRecallPageProps {
  onNext: (transcript: string, segments: SpeechSegment[]) => void;
}

export const AssessmentWordRecallPage: React.FC<AssessmentWordRecallPageProps> = ({
  onNext,
}) => {

  const [isEvaluating, setIsEvaluating] = useState(false);

  const { isSpeaking } = useLocalVoiceGuide('/audio/minicog_recall.mp3')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showHint, setShowHint] = useState(false)

  const startTimeRef = useRef<number | null>(null)
  const autoSubmittedRef = useRef(false)

  useEffect(() => {
    if (isSpeaking) return

    if (!startTimeRef.current) {
      startTimeRef.current = Date.now()
    }

  }, [isSpeaking])


  /* ================= Speech Recognition ================= */
  const {
    transcript,
    isListening,
    startListening,
    stopListening,
    resetTranscript
  } = useRealtimeSpeech()

  const recognizedWords = transcript
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 3)

  const normalize = (text: string) =>
    text
      .replace(/\s+/g, '')
      .replace(/[่้๊๋]/g, '') 
      .toLowerCase()
  
  const handleSubmit = (finalTranscript?: string) => {
    if (isSubmitting) return

    setIsSubmitting(true)

    const textToSubmit = finalTranscript !== undefined ? finalTranscript : transcript

    const segments: SpeechSegment[] = [
      {
        text: textToSubmit,
        confidence: 1
      }
    ]

    onNext(textToSubmit, segments)

    setIsEvaluating(false)
  }
  const displayWords = [
    recognizedWords[0] || '',
    recognizedWords[1] || '',
    recognizedWords[2] || '',
  ];
  
  useEffect(() => {
  const interval = setInterval(() => {

    if (!startTimeRef.current) return
    if (isSpeaking || isListening) return
    if (autoSubmittedRef.current) return

    const elapsed = Date.now() - startTimeRef.current

    if (elapsed > 30000 && !showHint) {
      setShowHint(true)
    }

    if (elapsed > 120000) {
      autoSubmittedRef.current = true
      handleSubmit()
    }

  }, 1000)

  return () => clearInterval(interval)

  }, [isSpeaking, isListening, showHint])

  useEffect(() => {
    if (!transcript) return

    startTimeRef.current = Date.now()
    setShowHint(false)

  }, [transcript])


  /* ================= UI ================= */
  return (
    <div className="w-full max-w-5xl mx-auto px-6 py-10 animate-fade-in flex flex-col items-center">

      <h1 className="text-3xl md:text-5xl font-bold text-center mb-8 text-gray-900 mt-12">
        พูดคำทั้ง 3 คำที่ขอให้จำก่อนหน้านี้
      </h1>
      {showHint && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4 text-center animate-fade-in mb-6">

          <p className="text-gray-700 text-lg">
            💡 หากนึกคำตอบไม่ออก สามารถพูดว่า
            <strong> "นึกไม่ออก"</strong>
            แล้วกดส่งคำตอบได้เลย
          </p>

          <p className="text-base text-gray-500 mt-2">
            ระบบจะข้ามคำถามให้อัตโนมัติภายใน 2 นาที
          </p>

        </div>
      )}


      {/* ================= Interaction Panel ================= */}
     <div
        className="
          w-full max-w-md
          bg-white
          border-4 border-primary/20
          rounded-[32px]
          shadow-xl
          px-6 py-8
          mt-2
          flex flex-col items-center gap-4
        "
      >
    
        {/* Status */}

        {isEvaluating && (
            <div className="mt-4 flex items-center justify-center gap-2 text-green-600">
              <span className="text-lg font-medium">
                ผมได้รับคำตอบแล้วครับ 
              </span>
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce delay-150" />
                <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce delay-300" />
              </div>
            </div>
          )}

        {transcript && !isEvaluating  && (
            <div
              className="
                mt-2 mb-2 px-6 py-3
                bg-gray-50 border-2 border-gray-200
                rounded-2xl text-center
                animate-fade-in
              "
            >
              <p className="text-lg text-gray-500">
                ได้ยินว่า:
              </p>
              <p className="text-2xl font-semibold text-gray-800 mt-1">
                {transcript}
              </p>
            </div>
          )}

        <div className="text-center space-y-2  flex items-center justify-center">
          {isSpeaking ? (
            <p className="text-gray-400 animate-pulse font-semibold">
              กำลังอธิบาย
            </p>
          ) : isListening ? (
            <div className="flex items-center gap-3 bg-red-50 px-6 py-2 rounded-full border-2 border-red-200">
              <ListeningWave />
              <span className="text-red-600 font-bold text-lg">
                กำลังฟังอยู่
              </span>
            </div>
          ) : !isEvaluating ? (
            <p className="text-gray-400 italic text-sm px-4">
              กดปุ่มแล้วพูดคำทั้ง 3 คำ ต่อเนื่องได้เลยครับ
            </p>
          ) : null}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-center gap-12">

          {/* Mic */}
             <button
                onClick={async () => {
                  if (isListening) {
                    setIsEvaluating(true)
                    const finalSpeech = await stopListening()
                    handleSubmit(finalSpeech)
                  } else {
                   resetTranscript()
                    startListening()
                  }
                }}
                disabled={isSpeaking || isSubmitting}
                className={`
                  w-40 h-40 rounded-full
                  flex flex-col items-center justify-center
                  shadow-2xl transition-all
                  ${
                    isSpeaking
                      ? 'bg-gray-200 text-gray-400'
                      : isListening
                        ? 'bg-red-600 text-white animate-pulse'
                        : 'bg-red-500 text-white hover:scale-105 active:scale-95'
                  }
                `}
              >
                {isListening ? <StopCircle size={72} /> : <Mic size={72} />}
                <span className="mt-3 text-lg font-black">
                  {isListening ? 'กดเมื่อพูดครบแล้ว' : 'กดเพื่อพูด'}
                </span>
              </button>
          {/* Send */}
          
        </div>
          <p className="mt-4 text-gray-400 text-base text-center">
            หากนึกไม่ออก สามารถกดส่งคำตอบได้เลยครับ
          </p>
      </div>

    </div>
  );
};

const ListeningWave = () => (
  <div className="flex items-center gap-1">
    {[1, 2, 3].map(i => (
      <span
        key={i}
        className="w-2 h-6 bg-red-500 rounded-full animate-wave"
        style={{ animationDelay: `${i * 0.15}s` }}
      />
    ))}
  </div>
);

