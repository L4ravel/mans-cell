/* 
  Halaman login Mans-Cell dengan redirect berbasis role.
  Jika role admin masuk ke /admin, karyawan ke /karyawan, pelanggan ke /pelanggan.
*/

"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth"
import { doc, getDoc } from "firebase/firestore"
import { auth, db } from "@/lib/firebase"
import {
  Lock,
  Mail,
  Loader2,
  ArrowRight,
  EyeOff,
  Eye,
  ShieldCheck,
} from "lucide-react"
import { motion } from "framer-motion"

type UserRole = "admin" | "karyawan" | "pelanggan"

function extractRoles(raw: any): string[] {
  if (Array.isArray(raw?.roles)) {
    return raw.roles
      .map((r: unknown) => (typeof r === "string" ? r.toLowerCase().trim() : ""))
      .filter(Boolean)
  }

  if (Array.isArray(raw?.role)) {
    return raw.role
      .map((r: unknown) => (typeof r === "string" ? r.toLowerCase().trim() : ""))
      .filter(Boolean)
  }

  if (typeof raw?.role === "string") {
    return [raw.role.toLowerCase().trim()]
  }

  return []
}

function getRedirectByRoles(roles: string[]): { role: UserRole; redirectTo: string } | null {
  if (roles.includes("admin")) {
    return { role: "admin", redirectTo: "/admin" }
  }

  if (roles.includes("karyawan")) {
    return { role: "karyawan", redirectTo: "/karyawan" }
  }

  if (roles.includes("pelanggan")) {
    return { role: "pelanggan", redirectTo: "/pelanggan" }
  }

  return null
}

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setCheckingSession(false)
        return
      }

      try {
        const snap = await getDoc(doc(db, "users", user.uid))

        if (!snap.exists()) {
          await signOut(auth)
          setCheckingSession(false)
          return
        }

        const raw = snap.data()
        const roles = extractRoles(raw)
        const target = getRedirectByRoles(roles)

        if (target) {
          router.replace(target.redirectTo)
          return
        }

        await signOut(auth)
        setError("Akun ini tidak punya akses ke panel.")
      } catch (err) {
        console.error(err)
        setError("Gagal memeriksa sesi akun.")
      } finally {
        setCheckingSession(false)
      }
    })

    return () => unsub()
  }, [router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password)
      const uid = cred.user.uid

      const snap = await getDoc(doc(db, "users", uid))
      if (!snap.exists()) {
        await signOut(auth)
        setError("Akun tidak terdaftar.")
        return
      }

      const raw = snap.data()
      const roles = extractRoles(raw)
      const target = getRedirectByRoles(roles)

      if (!target) {
        await signOut(auth)
        setError("Akun ini tidak punya akses ke panel.")
        return
      }

      localStorage.setItem(
        "mans_cell_session",
        JSON.stringify({
          role: target.role,
          redirectTo: target.redirectTo,
        })
      )

      router.replace(target.redirectTo)
    } catch (err) {
      console.error(err)
      setError("Email atau password salah. Silakan coba lagi.")
    } finally {
      setLoading(false)
    }
  }

  if (checkingSession) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-sm font-semibold text-slate-500">Memeriksa sesi akun...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="h-screen overflow-hidden flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-white relative font-sans">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-20 -left-20 w-72 h-72 bg-blue-300/25 rounded-full blur-[100px]"
        />
        <motion.div
          animate={{ x: [0, -40, 0], y: [0, 30, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -bottom-20 -right-20 w-96 h-96 bg-cyan-200/20 rounded-full blur-[120px]"
        />
        <motion.div
          animate={{ x: [0, 20, 0], y: [0, -15, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/2 left-1/2 w-80 h-80 bg-indigo-200/20 rounded-full blur-[110px]"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-5xl max-h-full"
      >
        <div className="flex flex-col lg:flex-row bg-white rounded-2xl sm:rounded-[2.5rem] shadow-[0_10px_30px_rgba(59,130,246,0.20)] sm:shadow-[0_20px_60px_rgba(59,130,246,0.15)] overflow-hidden border border-blue-100/50">
          <div className="w-full lg:w-1/2 px-6 py-8 sm:p-12 lg:p-16 flex flex-col justify-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-[0.02] pointer-events-none">
              <motion.div
                animate={{ x: [0, 100, 0] }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              >
                <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <pattern id="grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                      <circle cx="20" cy="20" r="1" fill="currentColor" className="text-blue-600" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" />
                </svg>
              </motion.div>
            </div>

            <div className="flex justify-center lg:justify-start mb-4 sm:mb-8">
              <motion.div
                whileHover={{ scale: 1.03, y: -2 }}
                transition={{ type: "spring", stiffness: 220, damping: 18 }}
                className="group relative"
              >
                <div className="absolute inset-0 bg-blue-500/10 blur-2xl rounded-[1.75rem] scale-105 group-hover:bg-cyan-400/15 transition-all duration-500" />

                <div className="relative w-[220px] sm:w-[280px] aspect-[2/1] rounded-[1.5rem] bg-white/80 backdrop-blur-xl border border-blue-100 shadow-[0_15px_40px_rgba(37,99,235,0.12)] flex items-center justify-center px-5 sm:px-6">
                  <Image
                    src="/logo.png"
                    alt="Mans-Cell Logo"
                    width={1000}
                    height={500}
                    className="w-full h-auto object-contain drop-shadow-[0_8px_20px_rgba(37,99,235,0.18)]"
                    priority
                  />
                </div>
              </motion.div>
            </div>

            <div className="mb-4">
              <h1 className="text-2xl sm:text-4xl font-black text-slate-800 mb-1 leading-tight tracking-tight">
                Login Mans-Cell
              </h1>
              <p className="text-slate-500 text-xs sm:text-sm font-medium leading-snug">
                Silakan login menggunakan akun yang terdaftar
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600 mb-2 block">Email</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="w-full pl-11 pr-4 py-2.5 sm:py-3.5 rounded-xl border-2 border-slate-200 bg-slate-50/50 text-slate-800 font-medium placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                    placeholder="Masukkan email"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 mb-2 block">Kata Sandi</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="Masukkan password"
                    className="w-full pl-12 pr-12 py-3.5 rounded-xl border-2 border-slate-200 bg-slate-50/50 text-slate-800 font-medium placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 transition"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm font-semibold border border-red-100"
                >
                  {error}
                </motion.div>
              )}

              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full mt-7 sm:mt-8 py-3 sm:py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-700 text-white font-bold text-sm hover:from-blue-700 hover:to-indigo-800 transition-all disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-blue-500/30 flex items-center justify-center gap-1 relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-400/0 via-cyan-400/10 to-cyan-400/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Memverifikasi...</span>
                  </>
                ) : (
                  <>
                    <span>LOGIN</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </motion.button>
            </form>
          </div>

          <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-blue-600 via-indigo-700 to-slate-900 p-16 flex-col justify-start items-center pt-24 text-white relative overflow-hidden rounded-l-[11rem]">
            <div className="absolute inset-0 overflow-hidden opacity-10">
              <motion.div
                animate={{ rotate: [0, 360], scale: [1, 1.2, 1] }}
                transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                className="absolute top-10 right-10 w-64 h-64"
              >
                <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                  <path
                    fill="white"
                    d="M47.3,-78.7C61.1,-71.4,72.1,-58.3,78.8,-43.2C85.5,-28.1,87.9,-11,86.8,5.7C85.7,22.4,81.1,38.7,72.4,52.3C63.7,65.9,51,76.8,36.8,82.5C22.6,88.2,6.9,88.7,-9.2,87.3C-25.3,85.9,-41.9,82.6,-56.2,75.4C-70.5,68.2,-82.5,57.1,-88.4,43.2C-94.3,29.3,-94.1,12.7,-90.6,-2.8C-87.1,-18.3,-80.3,-32.7,-70.8,-45.3C-61.3,-57.9,-49.1,-68.7,-35.3,-76.1C-21.5,-83.5,-6.1,-87.5,8.3,-86.2C22.7,-84.9,33.5,-86,47.3,-78.7Z"
                    transform="translate(100 100)"
                  />
                </svg>
              </motion.div>

              <motion.div
                animate={{ rotate: [360, 0], scale: [1, 1.1, 1] }}
                transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                className="absolute bottom-10 left-10 w-72 h-72"
              >
                <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                  <path
                    fill="white"
                    d="M44.7,-76.4C58.8,-69.2,71.8,-59.1,79.6,-45.8C87.4,-32.6,90,-16.3,88.5,-0.9C87,14.6,81.4,29.2,73.1,42.8C64.8,56.4,53.8,69,39.8,76.8C25.8,84.6,8.8,87.6,-7.1,87.1C-23,86.6,-37.9,82.6,-51.8,75.4C-65.7,68.2,-78.6,57.8,-85.4,44.2C-92.2,30.6,-92.9,13.8,-90.3,-2.1C-87.7,-18,-81.8,-33,-72.8,-46.3C-63.8,-59.6,-51.7,-71.2,-37.8,-78.5C-23.9,-85.8,-8.2,-88.8,5.4,-87.3C19,-85.8,30.6,-83.6,44.7,-76.4Z"
                    transform="translate(100 100)"
                  />
                </svg>
              </motion.div>
            </div>

            <div className="absolute inset-0 overflow-hidden opacity-5">
              <motion.div
                animate={{ rotate: [0, -360], scale: [1, 1.15, 1] }}
                transition={{ duration: 35, repeat: Infinity, ease: "linear" }}
                className="absolute top-1/3 left-1/3 w-48 h-48"
              >
                <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                  <path
                    fill="#67e8f9"
                    d="M39.5,-65.5C51.4,-58.1,61.4,-47.4,67.8,-34.8C74.2,-22.2,77,-7.7,75.3,6.3C73.6,20.3,67.4,33.8,58.6,45.2C49.8,56.6,38.4,66,25.3,70.8C12.2,75.6,-2.6,75.8,-16.8,72.3C-31,68.8,-44.6,61.6,-55.4,51.2C-66.2,40.8,-74.2,27.2,-76.8,12.4C-79.4,-2.4,-76.6,-18.4,-69.5,-32.1C-62.4,-45.8,-51,-57.2,-37.8,-64.2C-24.6,-71.2,-9.6,-73.8,3.7,-79.3C17,-84.8,27.6,-72.9,39.5,-65.5Z"
                    transform="translate(100 100)"
                  />
                </svg>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="relative z-10 text-center flex flex-col items-center"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 180, damping: 14, delay: 0.45 }}
                className="mb-8"
              >
                <div className="relative group">
                  <div className="absolute inset-0 bg-cyan-300/20 blur-3xl rounded-[2rem] scale-110" />

                  <div className="relative w-[260px] xl:w-[320px] aspect-[2/1] rounded-[2rem] bg-white/10 backdrop-blur-md border border-white/15 shadow-[0_20px_60px_rgba(0,0,0,0.25)] flex items-center justify-center px-6 xl:px-8">
                    <Image
                      src="/logo.png"
                      alt="Mans-Cell Logo"
                      width={1000}
                      height={500}
                      className="w-full h-auto object-contain drop-shadow-[0_10px_30px_rgba(255,255,255,0.18)]"
                      priority
                    />
                  </div>
                </div>
              </motion.div>

              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="text-3xl xl:text-5xl font-black mb-3 leading-tight tracking-tight"
              >
                Mans-Cell
              </motion.h2>

              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.7 }}
                className="h-1 w-20 bg-gradient-to-r from-cyan-300 via-blue-300 to-cyan-300 rounded-full mx-auto mb-6 shadow-lg shadow-cyan-500/20"
              />

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className="text-base xl:text-lg text-blue-50/90 font-medium mb-8 max-w-md mx-auto leading-relaxed"
              >
                Panel untuk mengelola data toko, master data, dan operasional Mans-Cell secara digital.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 }}
                className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 backdrop-blur-sm rounded-full border border-cyan-300/20 text-sm font-semibold shadow-lg shadow-slate-900/10"
              >
                <ShieldCheck className="w-4 h-4 text-cyan-300" />
                <span>Akses Sesuai Role</span>
              </motion.div>
            </motion.div>

            <motion.div
              animate={{ y: [0, -20, 0], opacity: [0.2, 0.3, 0.2] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              className="absolute top-1/4 right-1/4 w-32 h-32 bg-white/20 rounded-full blur-[60px]"
            />
            <motion.div
              animate={{ y: [0, 20, 0], opacity: [0.15, 0.25, 0.15] }}
              transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
              className="absolute bottom-1/4 left-1/4 w-40 h-40 bg-cyan-300/20 rounded-full blur-[80px]"
            />
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="absolute bottom-6 left-0 right-0 text-center"
      >
        <p className="text-xs text-slate-500 font-medium leading-snug text-center">
          <span className="block sm:inline">&copy; 2026 Mans-Cell </span>
          <span className="block sm:inline">Panel. All rights reserved.</span>
        </p>
      </motion.div>
    </main>
  )
}