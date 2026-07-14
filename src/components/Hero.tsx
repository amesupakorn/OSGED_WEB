import React from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

interface HeroProps {
  onStart: () => void;
  onOpenInfo: () => void;
  onOpenPDPA: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onStart, onOpenInfo, onOpenPDPA }) => {
  return (
    <section className="relative w-full overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-1/3 h-full bg-blue-50/50 -z-10 rounded-l-[100px] hidden lg:block" />
      <div className="absolute -top-24 -left-24 w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-10" />

      <div className="max-w-7xl mx-auto px-6 py-16 md:py-24 flex flex-col lg:flex-row items-center gap-12">

        {/* Left Column: Text Content */}
        <div className="flex-1 text-center lg:text-left animate-fade-in">

          <h1 className="text-4xl md:text-6xl font-black text-gray-900 leading-[1.1] mb-8">
            OSGED – ระบบคัดกรอง<br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-blue-400">
              การรู้คิดและอารมณ์
            </span><br />
            สำหรับผู้สูงอายุ
          </h1>

          <div className="text-xl md:text-2xl text-gray-600 font-medium mb-10 max-w-2xl leading-relaxed">
            <p>ช่วยประเมินเบื้องต้นด้านความจำ การคิด และอารมณ์</p>
            <p className="mt-2 text-gray-400 text-base md:text-lg italic">
              ✨ ใช้เวลาทำเพียง 10-15 นาที ทราบผลทันที
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            <button
              onClick={onStart}
              className="
                group w-full sm:w-auto
                bg-primary hover:bg-primaryHover 
                text-white 
                text-xl md:text-2xl font-bold 
                py-5 px-10 
                rounded-2xl 
                shadow-[0_20px_50px_rgba(37,99,235,0.3)]
                hover:shadow-[0_20px_50px_rgba(37,99,235,0.4)]
                transform transition-all duration-300 hover:-translate-y-1 active:scale-95
                flex items-center justify-center gap-3
              "
            >
              <span>เริ่มคัดกรอง</span>
              <ArrowRight className="group-hover:translate-x-1 transition-transform" size={28} strokeWidth={3} />
            </button>

            <button
              onClick={onOpenInfo}
              className="w-full sm:w-auto px-8 py-5 text-gray-600 font-bold text-lg hover:bg-gray-50 rounded-2xl transition-colors"
            >
              ดูข้อมูลโครงการ
            </button>
          </div>

          {/* PDPA Footer */}
          <div className="mt-12 pt-8 border-t border-gray-100">
            <button
              onClick={onOpenPDPA}
              className="text-gray-400 hover:text-primary text-sm flex items-center gap-2 mx-auto lg:mx-0 transition-colors"
            >
              <div className="w-1.5 h-1.5 bg-gray-300 rounded-full" />
              นโยบายคุ้มครองข้อมูลส่วนบุคคล (PDPA)
            </button>
          </div>
        </div>

        {/* Right Column: Illustration */}
        <div className="flex-1 relative w-full max-w-xl animate-fade-in delay-200">
          <div className="relative rounded-[40px] overflow-hidden shadow-2xl border-8 border-white">
            <img
              src="/hero-illustration.png"
              alt="Elderly Care Illustration"
              className="w-full h-auto object-cover transform hover:scale-105 transition-transform duration-700"
            />
          </div>
        </div>

      </div>
    </section>
  );
};