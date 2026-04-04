"use client"

/*
  Komponen animasi status absensi di luar jam aktif / hari libur.
  Revisi ini menyamakan logika waktu dengan halaman absensi: buka 1 jam sebelum jam masuk dan tutup 4 jam setelah jam pulang.
*/

import { motion, useAnimation } from "framer-motion"
import { useEffect, useMemo, useState } from "react"
import { Clock, Calendar, CheckCircle2, Coffee, Lock } from "lucide-react"

type AnimasiWaktuProps = {
  jamMasuk?: string
  jamPulang?: string
  hariLibur?: Array<number | string>
}

const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"]

export default function AbsensiProfessionalAlive({
  jamMasuk = "06:00",
  jamPulang = "14:00",
  hariLibur = [5],
}: AnimasiWaktuProps) {
  const [time, setTime] = useState(new Date())
  const controls = useAnimation()

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    controls.start({
      y: [0, -12, 0],
      transition: {
        duration: 3,
        repeat: Infinity,
        ease: "easeInOut",
      },
    })
  }, [controls])

  const currentDayIndex = time.getDay()
  const currentDay = NAMA_HARI[currentDayIndex]

  const formatUnit = (unit: number) => unit.toString().padStart(2, "0")

  const toMinutes = (value: string) => {
    const [h, m] = value.split(":").map(Number)
    return h * 60 + m
  }

  const toTimeString = (totalMinutes: number) => {
    const normalized = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60)
    const h = Math.floor(normalized / 60)
    const m = normalized % 60
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
  }

  const normalizedHariLibur = useMemo(() => {
    if (!Array.isArray(hariLibur)) return []
    return hariLibur
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6)
  }, [hariLibur])

  const nowMinutes = time.getHours() * 60 + time.getMinutes()
  const mulaiMinutes = toMinutes(jamMasuk) - 60
  const jamMasukMinutes = toMinutes(jamMasuk)
  const batasPulangMinutes = toMinutes(jamPulang)
  const tutupPenuhMinutes = batasPulangMinutes + 4 * 60

  const isHariLibur = normalizedHariLibur.includes(currentDayIndex)
  const isSebelumMulai = nowMinutes < mulaiMinutes
  const isDalamJamAbsensi = nowMinutes >= mulaiMinutes && nowMinutes <= tutupPenuhMinutes
  const isSebelumJamMasuk = nowMinutes >= mulaiMinutes && nowMinutes < jamMasukMinutes
  const isSetelahJamPulang = nowMinutes > batasPulangMinutes && nowMinutes <= tutupPenuhMinutes
  const isSudahTutupPenuh = nowMinutes > tutupPenuhMinutes

  const statusInfo = useMemo(() => {
    if (isHariLibur) {
      return {
        label: "Jadwal Libur",        
        icon: "libur" as const,
        pillClass: "bg-green-100 text-green-700",
      }
    }

    if (isSebelumMulai) {
      return {
        label: "Belum Dibuka",        
        icon: "waktu" as const,
        pillClass: "bg-orange-100 text-orange-700",
      }
    }

    if (isDalamJamAbsensi) {
      if (isSebelumJamMasuk) {
        return {
          label: "Absensi Sedang Berlangsung",        
          icon: "aktif" as const,
          pillClass: "bg-emerald-100 text-emerald-700",
        }
      }

      if (isSetelahJamPulang) {
        return {
          label: "Absensi Sedang Berlangsung",          
          icon: "aktif" as const,
          pillClass: "bg-emerald-100 text-emerald-700",
        }
      }

      return {
        label: "Absensi Sedang Berlangsung",      
        icon: "aktif" as const,
        pillClass: "bg-emerald-100 text-emerald-700",
      }
    }

    if (isSudahTutupPenuh) {
      return {
        label: "Absensi Sudah Ditutup",       
        icon: "tutup" as const,
        pillClass: "bg-slate-100 text-slate-700",
      }
    }

    return {
      label: "Di Luar Waktu Absensi",      
      icon: "waktu" as const,
      pillClass: "bg-orange-100 text-orange-700",
    }
  }, [
    currentDay,
    isHariLibur,
    isSebelumMulai,
    isDalamJamAbsensi,
    isSebelumJamMasuk,
    isSetelahJamPulang,
    isSudahTutupPenuh,
    jamMasuk,
    mulaiMinutes,
    tutupPenuhMinutes,
  ])

  return (
    <motion.div
      animate={{
        background: [
          "linear-gradient(to bottom right, #ecfdf5, #f0fdf4, #ecfdf5)",
          "linear-gradient(to bottom right, #f0fdf4, #d1fae5, #f0fdf4)",
          "linear-gradient(to bottom right, #ecfdf5, #ccfbf1, #ecfdf5)",
        ],
      }}
      transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
      className="relative flex min-h-screen w-full items-center justify-center overflow-hidden p-2 font-sans"
    >
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{
            x: [0, 80, 0],
            y: [0, 40, 0],
            scale: [1, 1.3, 1],
            backgroundColor: [
              "rgba(52, 211, 153, 0.2)",
              "rgba(16, 185, 129, 0.3)",
              "rgba(132, 204, 22, 0.2)",
            ],
          }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -left-20 top-0 h-[500px] w-[500px] rounded-full blur-[100px]"
        />

        <motion.div
          animate={{
            x: [0, -80, 0],
            y: [0, -40, 0],
            scale: [1, 1.2, 1],
            backgroundColor: [
              "rgba(45, 212, 191, 0.2)",
              "rgba(14, 165, 233, 0.2)",
              "rgba(45, 212, 191, 0.2)",
            ],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -right-20 bottom-0 h-[500px] w-[500px] rounded-full blur-[100px]"
        />

        <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.05)_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      <motion.div
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md"
      >
        <motion.div
          initial={{
            borderColor: "rgba(167, 243, 208, 0.5)",
            boxShadow: "0 25px 50px -12px rgba(16, 185, 129, 0.1)",
          }}
          animate={{
            borderColor: [
              "rgba(167, 243, 208, 0.5)",
              "rgba(52, 211, 153, 0.8)",
              "rgba(167, 243, 208, 0.5)",
            ],
            boxShadow: [
              "0 25px 50px -12px rgba(16, 185, 129, 0.1)",
              "0 25px 50px -12px rgba(16, 185, 129, 0.25)",
              "0 25px 50px -12px rgba(16, 185, 129, 0.1)",
            ],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="rounded-[2.5rem] border bg-white/70 p-2 sm:p-8 backdrop-blur-2xl"
        >
          <motion.div
            className="mb-2 text-center"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <motion.div
              animate={{
                rotate: [0, 10, -10, 0],
                color: ["#059669", "#10b981", "#059669"],
              }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              className="mb-3 inline-block rounded-2xl bg-emerald-100/50 p-1 shadow-sm"
            >
              <Calendar size={32} strokeWidth={2} />
            </motion.div>
          </motion.div>

          <motion.div
            className="relative mb-8 overflow-hidden rounded-3xl border border-emerald-100 bg-gradient-to-br from-white via-emerald-50/50 to-white p-6 shadow-inner"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            <motion.div
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-emerald-300/20 blur-2xl"
            />

            <div className="mb-4 flex items-center justify-center gap-2">
              <Clock className="text-emerald-600" size={18} />
              <motion.p
                animate={{ color: ["#047857", "#059669", "#047857"] }}
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
                    key={unit}
                    initial={{ y: 5, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="relative"
                  >
                    <span
                      className={`${
                        index === 2
                          ? "text-3xl sm:text-4xl text-emerald-600/80 font-bold"
                          : "text-5xl sm:text-6xl font-black"
                      } tracking-tighter`}
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        background:
                          index !== 2
                            ? "linear-gradient(135deg, #065f46 0%, #10b981 100%)"
                            : undefined,
                        WebkitBackgroundClip: index !== 2 ? "text" : undefined,
                        WebkitTextFillColor: index !== 2 ? "transparent" : undefined,
                      }}
                    >
                      {formatUnit(unit)}
                    </span>
                  </motion.div>
                  {index < 2 && (
                    <motion.span
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      className="mx-1 text-4xl font-light text-emerald-400"
                    >
                      :
                    </motion.span>
                  )}
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div animate={controls} className="relative mb-8 flex justify-center">
            <div className="relative">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                className="absolute -inset-4 rounded-full border border-dashed border-emerald-300/60"
              />

              <div className="relative z-10 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 shadow-lg shadow-emerald-500/30">
                <motion.div
                  animate={{
                    scale: [1, 1.15, 1],
                    rotate: [0, -5, 5, 0],
                  }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Lock className="text-white drop-shadow-md" size={36} strokeWidth={2.5} />
                </motion.div>
              </div>

              <motion.div
                animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="absolute inset-0 rounded-full bg-emerald-400"
              />
            </div>
          </motion.div>

          <motion.div
            className="overflow-hidden rounded-2xl border border-emerald-100 bg-white p-0 shadow-sm"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <div className="bg-emerald-50/50 p-4 border-b border-emerald-100">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-800/60">
                  Status Absensi
                </p>
                {statusInfo.icon === "libur" ? (
                  <Calendar className="text-green-500" size={18} />
                ) : statusInfo.icon === "aktif" ? (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100">
                    <CheckCircle2 className="text-emerald-600" size={14} />
                  </div>
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100">
                    <Clock className="text-amber-600" size={14} />
                  </div>
                )}
              </div>
            </div>

            <div className="p-2 text-center">
              <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.6 }}
              >
                <div
                  className={`inline-flex items-center justify-center gap-3 rounded-full px-5 py-2 mb-2 ${statusInfo.pillClass}`}
                >
                  {statusInfo.icon === "libur" ? <Coffee size={20} /> : <Clock size={20} />}
                  <span className="font-bold">{statusInfo.label}</span>
                </div>
              </motion.div>             

              <motion.div
                className="mt-2 grid grid-cols-3 gap-2 text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
              >
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="text-[10px] text-slate-400">MULAI</p>
                  <p className="font-mono font-bold text-slate-700">{toTimeString(mulaiMinutes)}</p>
                </div>
                <div className="flex items-center justify-center">
                  <div className="h-px w-full bg-slate-200" />
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="text-[10px] text-slate-400">TUTUP</p>
                  <p className="font-mono font-bold text-slate-700">
                    {toTimeString(tutupPenuhMinutes)}
                  </p>
                </div>
              </motion.div>
            </div>
          </motion.div>

          <div className="mt-2 flex justify-center gap-2">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{
                  height: [6, 16, 6],
                  backgroundColor: ["#d1fae5", "#10b981", "#d1fae5"],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  delay: i * 0.2,
                  ease: "easeInOut",
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