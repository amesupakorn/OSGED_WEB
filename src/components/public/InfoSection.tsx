import { BookOpen, ShieldCheck, Zap, HeartPulse } from 'lucide-react';

interface InfoSectionProps {
  onReadMore: () => void;
}

export const InfoSection: React.FC<InfoSectionProps> = ({ onReadMore }) => {
  const features = [
    {
      icon: <Zap size={28} />,
      iconClass: "text-amber-500",
      bgClass: "bg-amber-50 ring-amber-100/50",
      title: "รวดเร็ว",
      description: "ใช้เวลาเพียง 10-15 นาที ในการคัดกรองเบื้องต้น"
    },
    // {
    //   icon: <ShieldCheck size={28} />,
    //   iconClass: "text-green-500",
    //   bgClass: "bg-green-50 ring-green-100/50",
    //   title: "แม่นยำ",
    //   description: "พัฒนาและทดสอบโดยทีมแพทย์ผู้เชี่ยวชาญด้านสมอง"
    // },
    {
      icon: <HeartPulse size={28} />,
      iconClass: "text-rose-500",
      bgClass: "bg-rose-50 ring-rose-100/50",
      title: "ใส่ใจ",
      description: "ออกแบบมาเพื่อผู้สูงอายุโดยเฉพาะ ใช้งานง่าย ไม่ซับซ้อน"
    }
  ];

  return (
    <section className="bg-white py-24 px-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />

      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16 animate-fade-in">
          <div className="inline-flex items-center justify-center p-3 bg-blue-50 rounded-2xl mb-6 text-primary">
            <BookOpen size={40} />
          </div>
          <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-6">
            OSGED คืออะไร?
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
            ระบบคัดกรองอัจฉริยะที่พัฒนาขึ้นเพื่อช่วยให้ผู้สูงอายุและครอบครัวสามารถตรวจสอบ
            ภาวะสุขภาพจิตเบื้องต้นได้ด้วยตนเอง สะดวก รวดเร็ว และแม่นยำ
            โดยทีมแพทย์และนักวิจัยผู้เชี่ยวชาญ
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
          {features.map((f, i) => (
            <div
              key={i}
              className="
                bg-gray-50/50 p-8 rounded-[32px] border border-gray-100 
                hover:bg-white hover:shadow-[0_20px_50px_rgba(219,234,254,0.3)] 
                hover:-translate-y-1 hover:border-blue-100/50 
                transition-all duration-300 group 
                flex flex-col items-center text-center 
                md:flex-row md:items-start md:text-left gap-6
              "
            >
              <div className={`
                w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 
                ring-4 shadow-sm group-hover:scale-110 transition-transform 
                ${f.bgClass} ${f.iconClass}
              `}>
                {f.icon}
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-gray-900 mb-2 group-hover:text-primary transition-colors">
                  {f.title}
                </h3>
                <p className="text-gray-500 leading-relaxed">
                  {f.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center">
          <button
            onClick={onReadMore}
            className="
              inline-flex items-center gap-3
              bg-white border-2 border-primary text-primary 
              font-bold text-lg 
              px-10 py-4 rounded-2xl 
              hover:bg-primary hover:text-white 
              transition-all duration-300 
              focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary
              shadow-lg shadow-blue-50
            "
          >
            อ่านข้อมูลโครงการ & คำถามที่พบบ่อย
          </button>
        </div>
      </div>
    </section>
  );
};