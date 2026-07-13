import React, { useRef, useState, useEffect } from 'react';
import { ArrowRight, RotateCcw, ClockFading, Trash2 } from 'lucide-react';
import { useRequireLandscape } from '@/hooks/useRequireLandscape';
import { RotateDeviceOverlay } from '../RotateDeviceOverlay';
import { ClockDemoOverlay } from '../ClockDemoOverlay';
import { ClockDrawingResult, ClockEvent } from '@/types/clockEvents';
import { toPng } from 'html-to-image';
import { useLocalVoiceGuide } from '@/hooks/useLocalVoiceGuide';
import { flushSync } from 'react-dom'
import { evaluateMiniCogClock, toPlacedElements } from '@/utils/evaluateMiniCogClock';
import type { ClockCenter } from '@/types/miniCogClockScoring';

// Numbers/hands are stored as 0-100 percentages of the (square) clock
// container, so the center is always (50, 50) regardless of screen size.
const CLOCK_CENTER: ClockCenter = { cx: 50, cy: 50 }
interface AssessmentClockDrawingPageProps {
  onNext: (result: ClockDrawingResult) => void
}
interface ClockNumber {
  value: number;
  x: number; 
  y: number; 
  isPlaced: boolean;
}

interface ClockHand {
  type: 'hour' | 'minute';
  angle: number; 
  isPlaced: boolean;
}

interface ClockSnapshot {
  numbers: ClockNumber[];
  hourHand: ClockHand;
  minuteHand: ClockHand;
}

export const AssessmentClockDrawingPage: React.FC<AssessmentClockDrawingPageProps> = ({ onNext }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<ClockSnapshot[]>([]);
  const [numbers, setNumbers] = useState<ClockNumber[]>(
    Array.from({ length: 16 }, (_, i) => ({
      value: i + 1,
      x: 50,
      y: 50,
      isPlaced: false,
    }))
  );
  const hasPlayedVoiceRef = useRef(false);
  const lastAngleRef = useRef<number | null>(null);
  const [hourHand, setHourHand] = useState<ClockHand>({ type: 'hour', angle: 0, isPlaced: false });
  const [minuteHand, setMinuteHand] = useState<ClockHand>({ type: 'minute', angle: 0, isPlaced: false });
  const [draggingId, setDraggingId] = useState<number | 'hour' | 'minute' | null>(null);
  const hasSpoken = useRef(false);
  const [showDemo, setShowDemo] = useState(false);
  const hasShownDemoRef = useRef(false);
  
  const startedAtRef = useRef<number>(Date.now())
  const [isSubmitting, setIsSubmitting] = useState(false)
  //เก็บ log
  const eventsRef = useRef<ClockEvent[]>([])
  const logEvent = (event: ClockEvent) => {
    eventsRef.current.push(event)
  }
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null)

  const dragMetaRef = useRef<{
      startTime?: number
      startAngle?: number
  } | null>(null)

  const lastMoveAngleRef = useRef<number | null>(null)

    const { isSpeaking } = useLocalVoiceGuide(
    '/audio/minicog_clock.mp3',
    true, // autoPlay
    {
      onEnd: () => {
        if (!hasShownDemoRef.current) {
          setShowDemo(true)
          hasShownDemoRef.current = true
        }
      },
    }
  )

  useEffect(() => {
    const handleGlobalPointerUp = () => {
      if (draggingId !== null) {
        handlePointerUp()
      }
    }

    window.addEventListener('pointerup', handleGlobalPointerUp)

    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerUp)
    }
  }, [draggingId])


  const captureClockArea = async () => {
    if (!containerRef.current) return ''

    return await toPng(containerRef.current, {
      backgroundColor: '#ffffff',
      pixelRatio: 1,
    })
  }

  const pushHistory = () => {
    historyRef.current.push({
      numbers: JSON.parse(JSON.stringify(numbers)),
      hourHand: { ...hourHand },
      minuteHand: { ...minuteHand },
    });
  };
  
  const lockScroll = () => {
  document.body.style.overflow = 'hidden';
  document.body.style.touchAction = 'none';
  };

  const unlockScroll = () => {
    document.body.style.overflow = '';
    document.body.style.touchAction = '';
  };

  const handlePointerDown = (e: React.PointerEvent, id: number | 'hour' | 'minute') => {
    if (isSpeaking) return
    e.preventDefault()

    lockScroll()
    pushHistory()

    dragMetaRef.current = {
      startTime: Date.now(),
      startAngle:
        id === 'hour'
          ? hourHand.angle
          : id === 'minute'
          ? minuteHand.angle
          : undefined,
    }

    if (typeof id === 'number') {
      const n = numbers.find(n => n.value === id)
      if (n) {
        dragStartPosRef.current = { x: n.x, y: n.y }
      }
    }

    lastMoveAngleRef.current = null
    setDraggingId(id)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingId || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();

    if (typeof draggingId === 'number') {
      
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      const clampedX = Math.max(0, Math.min(100, x));
      const clampedY = Math.max(0, Math.min(100, y));

      setNumbers(prev =>
        prev.map(n =>
          n.value === draggingId
            ? { ...n, x: clampedX, y: clampedY, isPlaced: true }
            : n
        )
      );
      return; 
    }

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    if (draggingId === 'hour' || draggingId === 'minute') {
      const radians = Math.atan2(e.clientY - centerY, e.clientX - centerX)
      let angle = (radians * 180) / Math.PI + 90
      if (angle < 0) angle += 360

      if (lastMoveAngleRef.current === null) {
        lastMoveAngleRef.current = angle
        return
      }

      let delta = angle - lastMoveAngleRef.current
      if (delta > 180) delta -= 360
      if (delta < -180) delta += 360

      lastMoveAngleRef.current = angle

      if (draggingId === 'hour') {
        setHourHand(prev => ({ ...prev, angle: prev.angle + delta }))
      }
      if (draggingId === 'minute') {
        setMinuteHand(prev => ({ ...prev, angle: prev.angle + delta }))
      }
    }

  };


  const handlePointerUp = () => {
    unlockScroll()

    const meta = dragMetaRef.current
    if (!meta || draggingId === null) {
      cleanup()
      return
    }

    const duration = Date.now() - (meta.startTime ?? Date.now())

    if (typeof draggingId === 'number' && dragStartPosRef.current) {
      const n = numbers.find(n => n.value === draggingId)
      if (n) {
        const dx = n.x - dragStartPosRef.current.x
        const dy = n.y - dragStartPosRef.current.y

        logEvent({
          type: 'move_number',
          value: draggingId,
          from: dragStartPosRef.current,
          to: { x: n.x, y: n.y },
          distance: Math.sqrt(dx * dx + dy * dy),
          duration_ms: duration,
          t: Date.now(),
        })
      }
    }

    if (draggingId === 'hour' || draggingId === 'minute') {
      logEvent({
        type: 'rotate_hand',
        hand: draggingId,
        fromAngle: meta.startAngle!,
        toAngle: draggingId === 'hour' ? hourHand.angle : minuteHand.angle,
        duration_ms: duration,
        t: Date.now(),
      })
    }

    cleanup()
  }

  const cleanup = () => {
    dragMetaRef.current = null
    dragStartPosRef.current = null
    lastMoveAngleRef.current = null
    setDraggingId(null)
  }

  const placeFromPalette = (id: number | 'hour' | 'minute') => {
    if (isSpeaking) return;

    pushHistory();

    if (typeof id === 'number') {
      const safePos = getSafeInitialPosition();

      logEvent({
        type: 'place_number',
        value: id,
        x: safePos.x,
        y: safePos.y,
        t: Date.now(),
      })

      setNumbers(prev =>
        prev.map(n =>
          n.value === id
            ? {
                ...n,
                x: safePos.x,
                y: safePos.y,
                isPlaced: true,
              }
            : n
        )
      );

      setDraggingId(id);
    } else {
      if (id === 'hour') setHourHand({ type: 'hour', angle: 0, isPlaced: true });
      if (id === 'minute') setMinuteHand({ type: 'minute', angle: 0, isPlaced: true });
    }
  };

  const handleReset = () => {
    logEvent({ type: 'reset', t: Date.now() })
    setNumbers(prev => prev.map(n => ({ ...n, isPlaced: false })));
    setHourHand({ type: 'hour', angle: 0, isPlaced: false });
    setMinuteHand({ type: 'minute', angle: 0, isPlaced: false });
    historyRef.current = []
  };

  const handleBack = () => {
    logEvent({ type: 'undo', t: Date.now() })
    const last = historyRef.current.pop();
    if (!last) return;

    setNumbers(last.numbers);
    setHourHand(last.hourHand);
    setMinuteHand(last.minuteHand);
  };

  const generateClockImage = () => {
    const canvas = document.createElement('canvas');
    const size = 600;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, size, size);

    const center = size / 2;
    const radius = size * 0.45;
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 12;
    ctx.stroke();

    ctx.font = 'bold 45px Prompt, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000000';
    numbers.forEach(n => {
      if (n.isPlaced) ctx.fillText(n.value.toString(), (n.x / 100) * size, (n.y / 100) * size);
    });

    const drawHand = (hand: ClockHand, length: number) => {
      if (!hand.isPlaced) return;

      ctx.save();
      ctx.translate(center, center);
      ctx.rotate((hand.angle - 90) * Math.PI / 180);

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(length - 18, 0);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(length, 0);
      ctx.lineTo(length - 22, -12);
      ctx.lineTo(length - 22, 12);
      ctx.closePath();
      ctx.fillStyle = '#000';
      ctx.fill();

      ctx.restore();
    };

    drawHand(hourHand, radius * 0.55);
    drawHand(minuteHand, radius * 0.85);

    ctx.beginPath();
    ctx.arc(center, center, 12, 0, 2 * Math.PI);
    ctx.fillStyle = '#000000';
    ctx.fill();

    return canvas.toDataURL('image/png');
  };

  const isLandscape = typeof window !== 'undefined'
  ? window.innerWidth > window.innerHeight
  : false;

  const isTouchDevice = typeof window !== 'undefined'
    ? window.innerWidth < 1024
    : false;
    
  const needLandscape = useRequireLandscape();
  const isCompactLandscape = isLandscape && isTouchDevice;

  const getSafeInitialPosition = () => {
    if (!containerRef.current) return { x: 50, y: 58 };

    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const offsetY = rect.height * 0.12; 

    return {
      x: (centerX / rect.width) * 100,
      y: ((centerY + offsetY) / rect.height) * 100,
    };
  };

  const handleSubmit = async () => {
    if (isSpeaking || isSubmitting) return

    flushSync(() => {
      setIsSubmitting(true)
    })

    await new Promise(requestAnimationFrame)

  try {
    const finalImage = await captureClockArea()

    const evaluation = evaluateMiniCogClock(
      toPlacedElements({ numbers, hourHand, minuteHand }),
      CLOCK_CENTER
    )

    const finishedAt = Date.now()

    await onNext({
      final_image: finalImage,
      events: eventsRef.current,
      evaluation,
      meta: {
        started_at: startedAtRef.current,
        finished_at: finishedAt,
        duration_ms: finishedAt - startedAtRef.current,
      },
    })

  } finally {
    setIsSubmitting(false)
  }
  }

  return (
    <>
     {needLandscape && <RotateDeviceOverlay />}
     {showDemo && (
        <ClockDemoOverlay
          onClose={() => {
            setShowDemo(false);          
          }}
        />
      )}

      <div
        className={`
          w-full mx-auto
          flex flex-col items-center
          select-none 
          ${
            isCompactLandscape
              ? 'px-2 py-2 overflow-hidden'
              : 'max-w-6xl px-4 py-8 pb-24'
          }
        `}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
      >

    <div className='mb-2 text-center'>
      <h1
        className={`
          font-bold text-center text-gray-900
          ${
            isCompactLandscape
              ? 'text-3xl mb-1'
              : 'text-3xl md:text-5xl mb-4'
          }
        `}
      >
        สร้างนาฬิกา
      </h1>
      

        <p
          className={`
            text-center text-gray-600
            ${
              isCompactLandscape
                ? 'text-lg mb-4'
                : 'text-xl md:text-2xl mb-2'
            }
          `}
        >
          ลากตัวเลขและเข็มนาฬิกา เพื่อบอกเวลา
          <span className="text-primary font-black ml-2">
            11 โมง 10 นาที
          </span>
        </p>

        <button
            onClick={() => setShowDemo(true)}
            className="
              text-center

              mt-2
              text-base md:text-lg
              text-primary
              underline
              underline-offset-4
              font-semibold
              hover:text-primaryHover
              mb-2
            "
          >
            ดูตัวอย่างอีกครั้ง
        </button>

      </div>

        <div
          className={`
            grid w-full px-2
            ${
              isCompactLandscape
                ? 'grid-cols-[3fr_2fr]'
                : 'grid-cols-1 lg:grid-cols-[2fr_1fr]'
            }
            gap-2.5
            items-stretch
          `}
        >
                
         <div className="w-full h-auto flex justify-center">
             <div
              className="
                relative w-full
                p-4 rounded-[48px]
                border-3 border-dashed border-gray-200
                bg-gray-50/60
                flex flex-col items-center
                h-full
              "
              >        
                 {/* Label นำสายตา */}
                <div className="
                  absolute -top-4 left-8
                  bg-gray-50 px-4 py-1
                  text-lg font-semibold text-gray-500
                  rounded-full
                ">
                  พื้นที่สร้างนาฬิกา
                </div>

                {/* Clock wrapper */}
                  <div
                  className={`
                    relative
                    aspect-square
                    bg-white
                    rounded-full
                    border-[5px] border-gray-900
                    shadow-xl
                    flex items-center justify-center
                    touch-none
                    ${
                      isCompactLandscape
                        ? 'w-[86vh] max-w-none'
                        : 'w-full max-w-[500px]'
                    }
                  `}
                  ref={containerRef}
                >

                {numbers.filter(n => n.isPlaced).map(n => (
                  <div
                    key={n.value}
                    onPointerDown={(e) => handlePointerDown(e, n.value)}
                    style={{ left: `${n.x}%`, top: `${n.y}%` }}
                    className={`
                      absolute -translate-x-1/2 -translate-y-1/2
                      w-12 h-12 flex items-center justify-center
                      text-3xl font-black cursor-move
                      bg-white rounded-full select-none
                      ${draggingId === n.value ? 'scale-125 z-50 text-primary shadow-xl ring-4 ring-primary/20' : 'text-gray-900'}
                    `}
                  >
                    {n.value}
                  </div>
                ))}


            {/* Hour Hand */}
            {hourHand.isPlaced && (
              <div
                onPointerDown={(e) => handlePointerDown(e, 'hour')}
                className={`
                  absolute top-1/2 left-1/2
                  origin-left
                  z-20
                  cursor-grab
                  touch-none
                  transition-all
                  hover:scale-[1.04]
                  hover:ring-4 hover:ring-primary/20
                  ${draggingId === 'hour' ? 'scale-105 ring-4 ring-primary/30' : ''}
                `}
                style={{
                              width: hourHand.isPlaced ? '35%' : '55%',
                              transform: `rotate(${hourHand.angle - 90}deg) translateY(-50%)`,
                            }}
              >
                {/* visual hand */}
                <div
                  className="absolute top-1/2 left-0 h-3 bg-black   
                  transition-colors
                  group-hover:bg-gray-800"
                  style={{
                    width: '35%',
                    transform: 'translateY(-50%)',
                  }}
                >
                  <div
                    className="
                      absolute -right-3 top-1/2 -translate-y-1/2 
                      border-l-[16px] border-l-black 
                      border-y-[8px] border-y-transparent
                    "
                  />
                </div>
              </div>
            )}

            {/* Minute Hand */}
            {minuteHand.isPlaced && (
              <div
                onPointerDown={(e) => handlePointerDown(e, 'minute')}
               className={`
                  absolute top-1/2 left-1/2
                  origin-left
                  z-30
                  cursor-grab
                  touch-none
                  transition-all
                  hover:scale-[1.04]
                  hover:ring-4 hover:ring-primary/20
                  ${draggingId === 'minute' ? 'scale-105 ring-4 ring-primary/30' : ''}
                `}
                style={{
                        width: minuteHand.isPlaced ? '35%' : '60%',
                        transform: `rotate(${minuteHand.angle - 90}deg) translateY(-50%)`,
                      }}
              >
                <div
                  className="absolute top-1/2 left-0 h-3 bg-black transition-colors"
                  style={{
                    width: '55%',
                    transform: 'translateY(-50%)',
                  }}
                >
                  <div
                    className="
                      absolute -right-3 top-1/2 -translate-y-1/2 
                      border-l-[16px] border-l-black 
                      border-y-[8px] border-y-transparent
                    "
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>



        <div
          className={`
            relative
            bg-gray-100
            h-full
            rounded-[40px]
            border-2 border-gray-200
            w-full p-4
          `}
        >
          {/* Floating label */}
          <div
            className="
              absolute -top-4 left-8
              bg-gray-100 px-4 py-1
              text-lg font-semibold text-gray-500
              rounded-full
              flex items-center gap-2
            "
          >
            <ClockFading size={20} />
            ชิ้นส่วนนาฬิกา
          </div>
            
           <div className="flex gap-4 mb-4 mt-2">
              {!hourHand.isPlaced && (
                <button
                  onPointerDown={() => placeFromPalette('hour')}
                  className="flex-1 h-14 bg-white rounded-2xl
                    flex items-center justify-center
                    hover:border-primaryHover shadow-md active:scale-95 transition-all"
                >
                  <div className="relative flex items-center">
                    {/* shaft */}
                    <div className="w-14 h-2 bg-black rounded-full" />
                    {/* arrow head */}
                    <div
                      className="ml-[-6px]
                        border-l-[16px] border-l-black
                        border-y-[8px] border-y-transparent"
                    />
                  </div>
                </button>
              )}

              {!minuteHand.isPlaced && (
                <button
                  onPointerDown={() => placeFromPalette('minute')}
                  className="flex-1 h-14 bg-white rounded-2xl
                    flex items-center justify-center
                    hover:border-primaryHover shadow-md active:scale-95 transition-all"
                >
                  <div className="relative flex items-center">
                    {/* shaft */}
                    <div className="w-20 h-2 bg-black rounded-full" />
                    {/* arrow head */}
                    <div
                      className="ml-[-6px]
                        border-l-[16px] border-black
                        border-y-[7px] border-y-transparent"
                    />
                  </div>
                </button>
              )}
            </div>

            <div className="grid grid-cols-4 gap-2">
                {numbers.map((n) => (
                    <button
                        key={n.value}
                        disabled={n.isPlaced}
                        onPointerDown={() => placeFromPalette(n.value)}
                        className={`
                            h-16 rounded-2xl text-3xl font-black flex items-center justify-center border-4 transition-all
                            ${n.isPlaced 
                                ? 'bg-gray-200 text-gray-300 border-gray-200 opacity-50' 
                                : 'bg-white text-gray-900 border-white hover:border-primary shadow-sm hover:scale-105'}
                        `}
                    >
                        {n.value}
                    </button>
                ))}
            </div>

        </div>

      </div>

      <div className="mt-6 grid grid-cols-2 gap-2 w-full max-w-sm mb-4">
              <button
                onClick={handleReset}
                className="py-4 text-red-500 font-bold text-xl 
                  hover:bg-red-50 bg-white rounded-2xl 
                  flex items-center justify-center gap-2 
                  border-2 border-red-200"
              >
                <Trash2 size={24}/>ล้างกระดาน
              </button>

             <button
                onClick={handleBack}
                disabled={historyRef.current.length === 0}
                className="py-4 text-gray-700 font-bold text-xl 
                  hover:bg-gray-200 rounded-2xl 
                  flex items-center bg-white justify-center gap-2 
                  border-2 border-gray-300
                  disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw size={24} />  ย้อนกลับ
              </button>
          </div>

     <div className={`${isCompactLandscape ? 'mt-2' : 'mt-14'} w-full max-w-sm`}>
       <button
          onClick={handleSubmit}
          disabled={isSpeaking || isSubmitting}
          className={`
            w-full h-24 rounded-3xl text-3xl font-black
            flex items-center justify-center gap-4
            transition-all shadow-xl
           ${
              isSpeaking || isSubmitting
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-primary hover:bg-primaryHover text-white hover:-translate-y-2'
            }
          `}
        >
          <span>
            {isSpeaking
              ? 'กำลังอธิบาย...'
              : isSubmitting
              ? 'กำลังบันทึก...'
              : 'เสร็จสิ้น'}
          </span>
          <ArrowRight size={40} strokeWidth={4} />
        </button>
      </div>

    </div>
  </>  
  );
};