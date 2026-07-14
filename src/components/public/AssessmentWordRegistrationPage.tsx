import React, { useEffect, useState, useRef } from 'react';
import { Volume2, ArrowRight, RefreshCcw, Mic, StopCircle, CheckCircle, XCircle, Send, RotateCcw, VolumeX, Loader } from 'lucide-react';
import { WordSet } from '@/types';
import { playAudioUrl, playSequential, stopAudio, subscribeSpeaking } from '@/lib/audioManager';
import { useRealtimeSpeech } from '@/hooks/useRealtimeSpeech'
import { useLocalVoiceGuide } from '@/hooks/useLocalVoiceGuide';
import { submitWordRegistration } from '@/api/minicog/submitWordRegistration';
import { useAssessmentStore } from '@/store/assessmentStore';

interface AssessmentWordRegistrationPageProps {
  wordSet: WordSet;
  onReroll: () => void;
  onNext: () => void;
}

type CompleteStatus = 'correct' | 'attempted';

export const AssessmentWordRegistrationPage: React.FC<AssessmentWordRegistrationPageProps> = ({ 
  wordSet, 
  onReroll,
  onNext 
}) => {
  // State
  const [hasPlayedAudio, setHasPlayedAudio] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [completed, setCompleted] = useState(false);
  
  const fallbackTimeoutRef = useRef<number | null>(null);
  
  const hasSpokenMicGuide = useRef(false);

  const hasSpokenCompletion = useRef(false);

  const [isSpeaking, setIsAudioSpeaking] = useState(false)

    useEffect(() => {
      return subscribeSpeaking(setIsAudioSpeaking)
    }, []);

    
  const hasSpoken = useRef(false);

  const [autoReplay, setAutoReplay] = useState(false);
  const [attempt, setAttempt] = useState(1); // รอบที่ 1 หรือ 2
  const [isEvaluating, setIsEvaluating] = useState(false);

  const [completeStatus, setCompleteStatus] = useState<CompleteStatus | null>(null);
  const sessionId = useAssessmentStore((s) => s.sessionId)
  const [isWaitingMicGuide, setIsWaitingMicGuide] = useState(false)

  const [introPlayed, setIntroPlayed] = useState(false)

  const { isSpeaking: isGuideSpeaking } = useLocalVoiceGuide(
      '/audio/minicog_regis_intro.mp3',
      !introPlayed,
      {
        allowReplay: true,
        onEnd: () => setIntroPlayed(true)
      }
    )

    useEffect(() => {
      return () => {
        stopAudio();
      };
    }, []);

  // Initialize Speech Recognition
    const {
      transcript,
      isListening,
      startListening,
      stopListening,
      resetTranscript
    } = useRealtimeSpeech()
    

    const speakWords = async () => {
      if (hasPlayedAudio || isPlaying) return

      stopAudio()

      try {
        setIsPlaying(true)

        await playAudioUrl(
          `/audio/minicog_wordset/wordset-${wordSet.id}.mp3`,
          undefined,
          { remember: false }
        )

        setHasPlayedAudio(true)
      } finally {
        setIsPlaying(false)
      }
    }
      
    const showPlayButton =
    attempt === 1 && !hasPlayedAudio && !completed;
    const showMicSection =

    !completed &&
    (
      (attempt === 1 && hasPlayedAudio) ||
      (attempt >= 2)
    );

    const showNextButton = completed;
    const [hasPlayedMicGuide, setHasPlayedMicGuide] = useState(false);

      const {
    isSpeaking: isMicGuideSpeaking,
    play: playMicGuide,
  } = useLocalVoiceGuide(
    '/audio/minicog_show_mic.mp3',
    false, 
    {
      allowReplay: true,
      onEnd: () => {
        setHasPlayedMicGuide(true)
        resetSilenceTimer()
      },
    }
  )

  useEffect(() => {
    if (!showMicSection) return
    if (micGuideStartedRef.current) return

    const timer = setInterval(() => {
      if (!isSpeaking) {
        micGuideStartedRef.current = true
        playMicGuide()
        clearInterval(timer)
      }
    }, 200)

    return () => clearInterval(timer)
  }, [showMicSection, isSpeaking])
    
    const handleAutoSkip = async () => {

      if (isEvaluating) return
      await evaluateAnswer()
    }


    const [showHint, setShowHint] = useState(false)

    const startTimeRef = useRef<number>(Date.now())
    const autoSkippedRef = useRef(false)

    useEffect(() => {
      if (!transcript) return

      startTimeRef.current = Date.now()
      setShowHint(false)

    }, [transcript])


    const resetSilenceTimer = () => {
      startTimeRef.current = Date.now()
      autoSkippedRef.current = false
      setShowHint(false)
    }

    const replayingRef = useRef(false)

    useEffect(() => {
      if (!autoReplay) return
      if (completed) return
      if (replayingRef.current) return

      replayingRef.current = true

      const run = async () => {
        try {
         await playSequential(
            [
              '/audio/minicog_regis_2.mp3',
              `/audio/minicog_wordset/wordset-${wordSet.id}.mp3`
            ],
            undefined,
            { remember: false }
          )

          setHasPlayedAudio(true)
          setAutoReplay(false)

          resetSilenceTimer()
          
        } finally {
          replayingRef.current = false
        }
      }

      run()
    }, [autoReplay, completed, wordSet.id])

  useEffect(() => {
    setHasPlayedAudio(false);
    setCompleted(false);
    setAttempt(1);

    resetTranscript()

    hasSpokenMicGuide.current = false;
    hasSpokenCompletion.current = false;
    micGuideStartedRef.current = false

    resetSilenceTimer() 
    
  }, [wordSet]);

  useEffect(() => {
    if (completed) return
    resetTranscript()
    resetSilenceTimer()

  }, [attempt])

  useEffect(() => {
  return () => {
    if (fallbackTimeoutRef.current) {
      clearTimeout(fallbackTimeoutRef.current);
    }
  };
}, []);


  useEffect(() => {
    if (!sessionId) return

    const loadState = async () => {
      try {
        const res = await fetch(
          `/api/minicog/${sessionId}/get_registration`,
          {
            method: 'GET'
          }
        )

        if (!res.ok) return

        const state = await res.json()

        setAttempt(state.attempt ?? 1)

        if (state.completed) {
          setCompleteStatus(state.correct ? 'correct' : 'attempted')
          setCompleted(true)
        }

      } catch (err) {
        console.error('Failed to load word registration state', err)
      }
    }

    loadState()
  }, [sessionId])



  const isAiSpeaking =
    isSpeaking ||
    isPlaying ||
    isGuideSpeaking ||
    isMicGuideSpeaking ||
    isEvaluating ||
    isWaitingMicGuide;
   

  const micGuideStartedRef = useRef(false)

  const evaluateAnswer = async (overrideTranscript?: string) => {
    if (!sessionId) return

    const finalTranscriptText = overrideTranscript !== undefined ? overrideTranscript : transcript

    try {
      setIsEvaluating(true)

      const result = await submitWordRegistration({
        session_id: sessionId,
        transcript: finalTranscriptText,
      })

      setAttempt(result.attempt)

      if (result.completed) {
            
        setCompleteStatus(result.correct ? 'correct' : 'attempted')
        setCompleted(true)

        try {
            await playAudioUrl('/audio/minicog_complete.mp3')
        } catch (err) {
            console.warn('Completion audio failed', err)
        }
        
        hasSpokenCompletion.current = true

          

      } else {
        // ผิดรอบแรก → auto replay
        if (result.attempt === 2) {
          setAutoReplay(true)
          setHasPlayedAudio(true)  
        }
        resetTranscript()
      }

    } catch (err) {
      console.error(err)
      alert('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
    } finally {
      setIsEvaluating(false)
    }
  }

  const isBlocked =
    isAiSpeaking ||
    isListening;

  
  //timeout ผู้ใช้ไม่ตอบ
    
  useEffect(() => {
    const interval = setInterval(() => {

      if (!hasPlayedMicGuide) return
      if (completed) return
      if (isAiSpeaking || isListening) return

      const elapsed = Date.now() - startTimeRef.current

      if (elapsed > 30000 && !showHint) {
        setShowHint(true)
      }

      if (elapsed > 120000 && !autoSkippedRef.current) {
        autoSkippedRef.current = true
        handleAutoSkip()
      }

    }, 1000)

    return () => clearInterval(interval)

  }, [isAiSpeaking, isListening, completed, hasPlayedMicGuide])

  useEffect(() => {
    if (!completed) return

    setShowHint(false)

  }, [completed])


  return (
    <div className="w-full max-w-4xl mx-auto px-6 py-8 animate-fade-in flex flex-col items-center pb-32">

    {!completed && (
      <div className="w-full max-w-2xl mx-auto text-center mt-10 mb-6 px-4">
        <h1 className="font-black text-gray-900 leading-tight
          text-2xl sm:text-3xl lg:text-5xl">
          {showMicSection
            ? 'พูดคำทั้ง 3 คำที่ได้ยินเมื่อสักครู่'
            : 'ฟังและจำคำ 3 คำต่อไปนี้'}
        </h1>
      </div>
    )}

    {showHint && (
      <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4 text-center animate-fade-in mb-6">

        <p className="text-gray-700 mt- text-lg">
          💡 หากนึกคำตอบไม่ออก สามารถพูดว่า
          <strong> "นึกไม่ออก"</strong>
          แล้วกดส่งคำตอบได้เลย
        </p>

        <p className="text-base text-gray-500 mt-2">
          ระบบจะข้ามคำถามให้อัตโนมัติภายใน 2 นาที
        </p>

      </div>
    )}


      <div className="w-full max-w-2xl flex flex-col items-center gap-8">
        
        {showPlayButton ? (
            <div className="
              flex flex-col items-center gap-8
              w-full max-w-md
              bg-white px-6 py-8
              rounded-[32px]
              border-4 border-primary/20
              shadow-xl
              animate-fade-in
            ">

                <button
                  onClick={speakWords}
                  disabled={isPlaying || isGuideSpeaking}
                  className={`
                    w-40 h-40 rounded-full flex items-center justify-center shadow-2xl border-8 transition-all mt-4
                    ${
                      isPlaying || isGuideSpeaking
                        ? 'bg-gray-200 border-gray-300 text-gray-400 cursor-not-allowed'
                        : 'bg-primary text-white border-blue-200 hover:scale-105'
                    }
                  `}
                >
                  <Volume2 size={80} className={isPlaying ? 'animate-pulse' : ''} />
                </button>
                <div className="text-center">
                    <p className="text-3xl font-bold text-gray-800 mb-2 mt-12">
                        {isPlaying ? 'กำลังอ่านคำให้ฟัง...' : 'กดปุ่มสีฟ้าเพื่อเริ่มฟังคำ'}
                    </p>
                </div>

            </div>
        ) : null}

        {showMicSection && (
            <div className="
              flex flex-col items-center gap-6
              w-full max-w-md
              bg-white px-6 py-8
              rounded-[32px]
              border-4 border-primary/20
              shadow-xl
              animate-fade-in
            ">

          {/* ===== Progress ===== */}
          {isEvaluating && (
            <div className="mt-4 flex items-center justify-center gap-2 text-green-600">
              <span className="text-lg font-medium">
                กำลังตรวจสอบให้ครับ
              </span>
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce delay-150" />
                <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce delay-300" />
              </div>
            </div>
          )}

            {transcript && (
              <div className="
                mt-2 px-6 py-2
                bg-gray-50 border-2 border-gray-200
                rounded-2xl text-center
              ">
                <p className="text-lg text-gray-600">
                  ได้ยินว่า:
                </p>
                <p className="text-2xl font-semibold text-gray-800 mt-2">
                  {transcript}
                </p>
              </div>
            )}

          {/* ===== Status ===== */}
          <div className="min-h-[56px] flex items-center justify-center text-center">
            {isMicGuideSpeaking ? (
              <span className="text-gray-500 text-lg font-semibold animate-pulse">
                กำลังอธิบาย
              </span>
            ) : isListening ? (
              <div className="flex items-center gap-3 bg-red-50 px-6 py-2 rounded-full border-2 border-red-200">
                <ListeningWave />
                <span className="text-red-600 font-bold text-lg">
                  กำลังฟังอยู่
                </span>
              </div>
            ) : (
              <span className="text-gray-400 text-base italic px-4">
                กดปุ่มแล้วพูดคำทั้ง 3 คำ ต่อเนื่องได้เลยครับ
              </span>
            )}
          </div>

          {/* ===== Mic Button (Primary) ===== */}
          <button
            onClick={async () => {
                if (isAiSpeaking || isEvaluating) return

                if (isListening) {
                  setIsEvaluating(true)

                  const finalSpeech = await stopListening()

                  await new Promise(r => setTimeout(r, 200))

                  await evaluateAnswer(finalSpeech)

                } else {
                  resetTranscript()
                  await startListening()
                }
              }}
            disabled={isAiSpeaking || isEvaluating}
            className={`
              w-44 h-44 rounded-full
              flex flex-col items-center justify-center
              shadow-2xl transition-all
              ${
                isAiSpeaking
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : isListening
                    ? 'bg-red-600 text-white animate-pulse'
                    :isEvaluating
                    ? 'bg-green-500 text-white animate-pulse'
                    : 'bg-red-500 text-white hover:scale-105 active:scale-95'
              }
            `}
          >
            {isAiSpeaking || isEvaluating ? (
                <Volume2 size={72} className="animate-pulse" />
              ) : isListening ? (
                <StopCircle size={72} />
              ) : isEvaluating ? (
                <Loader size={72} />
              )
                : <Mic size={72} /> 
              }

              <span className="text-lg font-black mt-3">
                {isAiSpeaking
                  ? 'กรุณารอฟัง'
                  : isListening
                    ? 'กดเมื่อพูดครบแล้ว'
                    : isEvaluating
                    ? 'กำลังเช็คคำตอบ'
                    : 'กดเพื่อพูด'}
              </span>
          </button>

          {/* ===== Helper Text ===== */}
            <p className="text-gray-400 text-center text-base px-4 mt-4">
              พูดเสร็จแล้วกดปุ่มอีกครั้งได้เลย ระบบจะตรวจสอบให้ทันที
            </p>

        </div>
      )}

       {completed && (
          <div className="mt-42 flex flex-col items-center gap-6 animate-fade-in">

            <div className="w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center">
              <CheckCircle size={56} className="text-blue-500" />
            </div>

            <p className="text-2xl font-bold text-blue-600 text-center">
              อย่าลืมจำคำเหล่านี้ไว้
            </p>

            <p className="text-xl text-gray-600 text-center max-w-md">
              อย่าลืมจำคำเหล่านี้ไว้นะครับ เดี๋ยวผมจะกลับมาถามใหม่อีกครั้ง
            </p>

           <button
              onClick={() => {
                if (isBlocked) return
                stopAudio()
                onNext()
              }}
              disabled={isBlocked}
              className={`
                mt-4
                w-full max-w-sm
                h-20
                rounded-3xl
                text-2xl
                font-black
                shadow-2xl
                flex items-center justify-center gap-4
                transition-all
                ${
                  isBlocked
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-primary hover:bg-primaryHover text-white'
                }
              `}
            >
              {isBlocked ? 'กำลังอธิบาย...' : 'ไปข้อถัดไป'}
              <ArrowRight size={44} strokeWidth={4} />
            </button>
          </div>
        )}


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