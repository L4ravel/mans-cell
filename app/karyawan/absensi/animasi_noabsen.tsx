"use client"

import { motion, useAnimation } from "framer-motion"
import { useEffect, useState } from "react"
import { Clock, Calendar, CheckCircle2, XCircle, Lock } from "lucide-react"

export default function AbsensiProfessionalAlive() {
  const now = new Date()

  const [currentDay, setCurrentDay] = useState(() => {
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
    return days[now.getDay()]
  })

  const [time, setTime] = useState(now)
  const controls = useAnimation()
  
  useEffect(() => {
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

    const timer = setInterval(() => {
      const now = new Date()
      setTime(now)
      setCurrentDay(days[now.getDay()])
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    // Animasi loop untuk floating effect tetap ada
    controls.start({
      y: [0, -12, 0],
      transition: {
        duration: 3,
        repeat: Infinity,
        ease: "easeInOut"
      }
    })
  }, [controls])

  const isFriday = currentDay === 'Jumat'
  const formatUnit = (unit: number) => unit.toString().padStart(2, '0')

  return (
    // Container Utama dengan animasi background warna halus
    <motion.div 
      animate={{
        background: [
          "linear-gradient(to bottom right, #f0f9ff, #e0f2fe, #f0f9ff)", // Sky-50
          "linear-gradient(to bottom right, #e0f2fe, #bae6fd, #e0f2fe)", // Sky-100 accent
          "linear-gradient(to bottom right, #f0f9ff, #dbeafe, #f0f9ff)", // Blue mix
        ]
      }}
      transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
      className="relative flex min-h-screen w-full items-center justify-center overflow-hidden p-2 font-sans"
    >
      
      {/* --- Animated Background Elements (Lebih Hidup) --- */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        {/* Orb Kiri Atas - Berubah warna Sky ke Blue */}
        <motion.div 
          animate={{ 
            x: [0, 80, 0],
            y: [0, 40, 0],
            scale: [1, 1.3, 1],
            backgroundColor: ["rgba(56, 189, 248, 0.2)", "rgba(14, 165, 233, 0.3)", "rgba(59, 130, 246, 0.2)"]
          }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -left-20 top-0 h-[500px] w-[500px] rounded-full blur-[100px]" 
        />
        
        {/* Orb Kanan Bawah - Berubah warna Indigo ke Purple */}
        <motion.div 
          animate={{ 
            x: [0, -80, 0],
            y: [0, -40, 0],
            scale: [1, 1.2, 1],
            backgroundColor: ["rgba(99, 102, 241, 0.2)", "rgba(139, 92, 246, 0.2)", "rgba(99, 102, 241, 0.2)"]
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -right-20 bottom-0 h-[500px] w-[500px] rounded-full blur-[100px]" 
        />
        
        {/* Grid Pattern yang lebih halus */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(14,165,233,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(14,165,233,0.05)_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      {/* --- Main Card --- */}
      <motion.div
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Card Container dengan Border yang "Bernafas" */}
        <motion.div
          initial={{
            borderColor: "rgba(186, 230, 253, 0.5)",
            boxShadow: "0 25px 50px -12px rgba(14, 165, 233, 0.1)",
          }}
          animate={{
            borderColor: [
              "rgba(186, 230, 253, 0.5)",
              "rgba(56, 189, 248, 0.8)",
              "rgba(186, 230, 253, 0.5)",
            ],
            boxShadow: [
              "0 25px 50px -12px rgba(14, 165, 233, 0.1)",
              "0 25px 50px -12px rgba(14, 165, 233, 0.25)",
              "0 25px 50px -12px rgba(14, 165, 233, 0.1)",
            ],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="rounded-[2.5rem] border bg-white/70 p-2 sm:p-8 backdrop-blur-2xl"
        >
          
          {/* Header */}
          <motion.div 
            className="mb-2 text-center"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <motion.div
              animate={{ 
                rotate: [0, 10, -10, 0],
                color: ["#0284c7", "#0ea5e9", "#0284c7"] 
              }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              className="mb-3 inline-block rounded-2xl bg-sky-100/50 p-1 shadow-sm"
            >
              <Calendar size={32} strokeWidth={2} />
            </motion.div>                
          </motion.div>

          {/* Time Display Area */}
          <motion.div 
            className="relative mb-8 overflow-hidden rounded-3xl border border-sky-100 bg-gradient-to-br from-white via-sky-50/50 to-white p-6 shadow-inner"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            {/* Background Glow di dalam Timer */}
            <motion.div 
               animate={{ opacity: [0.3, 0.6, 0.3] }}
               transition={{ duration: 3, repeat: Infinity }}
               className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-sky-300/20 blur-2xl"
            />

            <div className="mb-4 flex items-center justify-center gap-2">
              <Clock className="text-sky-600" size={18} />
              <motion.p 
                animate={{ color: ["#0369a1", "#0284c7", "#0369a1"] }}
                transition={{ duration: 3, repeat: Infinity }}
                className="text-sm font-bold uppercase tracking-widest"
              >
                {currentDay}
              </motion.p>
            </div>
            
            <div className="flex items-baseline justify-center gap-1 sm:gap-2">
              {[time.getHours(), time.getMinutes(), time.getSeconds()].map((unit, index) => (
                <div key={index} className="flex items-center">
                  <motion.div
                    key={unit} // Trigger animation on change
                    initial={{ y: 5, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="relative"
                  >
                    {/* Gradient Text Effect for Numbers */}
                    <span 
                      className={`${index === 2 ? 'text-3xl sm:text-4xl text-sky-600/80 font-bold' : 'text-5xl sm:text-6xl font-black'} tracking-tighter`} 
                      style={{ 
                        fontFamily: "'JetBrains Mono', monospace",
                        background: index !== 2 ? "linear-gradient(135deg, #075985 0%, #0ea5e9 100%)" : undefined,
                        WebkitBackgroundClip: index !== 2 ? "text" : undefined,
                        WebkitTextFillColor: index !== 2 ? "transparent" : undefined
                      }}
                    >
                      {formatUnit(unit)}
                    </span>
                  </motion.div>
                  {index < 2 && (
                    <motion.span 
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      className="mx-1 text-4xl font-light text-sky-400"
                    >
                      :
                    </motion.span>
                  )}
                </div>
              ))}
            </div>
          </motion.div>

          {/* Animated Floating Lock/Icon */}
          <motion.div 
            animate={controls}
            className="relative mb-8 flex justify-center"
          >
            <div className="relative">
              {/* Spinning Ring */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                className="absolute -inset-4 rounded-full border border-dashed border-sky-300/60"
              />
              
              <div className="relative z-10 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-blue-500 shadow-lg shadow-sky-500/30">
                <motion.div
                  animate={{ 
                    scale: [1, 1.15, 1],
                    rotate: [0, -5, 5, 0]
                  }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  <XCircle className="text-white drop-shadow-md" size={36} strokeWidth={2.5} />
                </motion.div>
              </div>

              {/* Ping Animation behind */}
              <motion.div
                animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="absolute inset-0 rounded-full bg-sky-400"
              />
            </div>
          </motion.div>

          {/* Status Section */}
          <motion.div 
            className="overflow-hidden rounded-2xl border border-sky-100 bg-white p-0 shadow-sm"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <div className="bg-sky-50/50 p-4 border-b border-sky-100">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-sky-800/60">Status Absensi</p>
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100">
                  <XCircle className="text-slate-600" size={14} />
                </div>
              </div>
            </div>

            <div className="p-2 text-center">
              <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.6 }}
              >
                <div className="inline-flex items-center justify-center gap-3 rounded-full px-5 py-2 mb-2 bg-slate-100 text-slate-700">
                  <XCircle size={20} />
                  <span className="font-bold">
                    Tidak Wajib Absen
                  </span>
                </div>
              </motion.div>
              
              <motion.p 
                className="mt-2 text-xs text-slate-500"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
              >
                Data user terdaftar tidak wajib absensi.
              </motion.p>
            </div>
          </motion.div>

          {/* Alive Footer Dots */}
          <div className="mt-2 flex justify-center gap-2">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{ 
                  height: [6, 16, 6],
                  backgroundColor: ["#bae6fd", "#0ea5e9", "#bae6fd"]
                }}
                transition={{ 
                  duration: 1.5,
                  repeat: Infinity,
                  delay: i * 0.2,
                  ease: "easeInOut"
                }}
                className="w-1.5 rounded-full"
              />
            ))}
          </div>

        </motion.div>
      </motion.div>
    </motion.div>
  )
}