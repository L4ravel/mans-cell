/* 
  Halaman login Mans Cell dengan layout 2 kolom sesuai template.
  Sisi kiri berisi penjelasan aplikasi, sisi kanan berisi form login.
  Notifikasi error dibuat fixed toast agar tidak menggeser layout.
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
  Store,
  Boxes,
  BarChart3,
  X,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

type UserRole = "owner" | "admin" | "karyawan" | "pelanggan"

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
  if (roles.includes("owner")) {
    return { role: "owner", redirectTo: "/admin" }
  }

  if (roles.includes("admin")) {
    return { role: "admin", redirectTo: "/karyawan" }
  }

  if (roles.includes("karyawan")) {
    return { role: "karyawan", redirectTo: "/karyawan" }
  }

  if (roles.includes("pelanggan")) {
    return { role: "pelanggan", redirectTo: "/pelanggan" }
  }

  return null
}

function ToastError({
  message,
  onClose,
}: {
  message: string | null
  onClose: () => void
}) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -14, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -14, scale: 0.96 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="fixed right-4 top-4 z-[9999] w-[calc(100%-2rem)] max-w-sm overflow-hidden rounded-2xl bg-white shadow-[0_20px_55px_rgba(15,23,42,0.18)] ring-1 ring-red-100"
        >
          <div className="flex items-start gap-3 p-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600 ring-1 ring-red-100">
              <X size={17} strokeWidth={2.8} />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-black text-slate-800">Login gagal</p>
              <p className="mt-0.5 text-[11px] font-semibold leading-relaxed text-slate-500">
                {message}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
              aria-label="Tutup notifikasi"
            >
              <X size={15} strokeWidth={2.6} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
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

  useEffect(() => {
    if (!error) return

    const timer = setTimeout(() => {
      setError(null)
    }, 3200)

    return () => clearTimeout(timer)
  }, [error])

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
          uid,
          role: target.role,
          roles,
          redirectTo: target.redirectTo,
          checkedAt: Date.now(),
        }),
      )

      router.replace(target.redirectTo)
    } catch (err) {
      console.error(err)
      setError("Email atau kata sandi salah. Silakan coba lagi.")
    } finally {
      setLoading(false)
    }
  }

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="flex flex-col items-center gap-3 rounded-[1.5rem] bg-white px-6 py-5 shadow-sm shadow-sky-500/5 ring-1 ring-sky-100">
          <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
          <p className="text-sm font-semibold text-slate-500">Memeriksa sesi akun...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-white font-sans text-slate-900">
      <ToastError message={error} onClose={() => setError(null)} />

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-32 -top-32 h-80 w-80 rounded-full bg-sky-200/35 blur-3xl" />
        <div className="absolute -bottom-36 right-1/4 h-96 w-96 rounded-full bg-blue-200/25 blur-3xl" />
      </div>

      <div className="relative grid min-h-screen lg:grid-cols-[60%_40%]">
        <section className="relative hidden overflow-hidden bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 px-10 py-10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-18px_42px_rgba(2,132,199,0.24)] lg:flex lg:flex-col lg:justify-between xl:px-16">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-28 -top-28 h-72 w-72 rounded-full border-[3px] border-white/22" />
            <div className="absolute -left-10 top-16 h-64 w-64 rounded-full border-[3px] border-white/16" />
            <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full border-[3px] border-white/18" />
            <div className="absolute right-8 top-24 h-48 w-48 rounded-full border-[3px] border-white/14" />
            <div className="absolute -bottom-28 -left-24 h-72 w-72 rounded-full border-[3px] border-white/18" />
            <div className="absolute bottom-16 right-20 h-40 w-40 rounded-full bg-cyan-300/18 blur-3xl" />
            <div className="absolute left-12 top-1/2 h-52 w-52 rounded-full bg-white/10 blur-3xl" />
          </div>

          <div className="relative z-10 flex items-center gap-4">
            <div className="flex h-20 w-44 items-center justify-center rounded-[1.35rem] bg-white px-5 shadow-lg shadow-slate-900/10 ring-1 ring-white/80">
              <Image
                src="/logo.png"
                alt="Logo Mans Cell"
                width={1000}
                height={500}
                className="h-auto w-full object-contain drop-shadow-[0_8px_18px_rgba(2,132,199,0.10)]"
                priority
              />
            </div>

            <div>
              <p className="text-base font-black leading-none tracking-tight">Mans Cell</p>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.18em] text-sky-50/70">
                Panel Operasional
              </p>
            </div>
          </div>

          <div className="relative z-10 max-w-lg">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full bg-white/12 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-sky-50 ring-1 ring-white/18">
  <ShieldCheck size={14} strokeWidth={2.7} />
  Sistem Operasional
</div>

            <h1 className="text-5xl font-black leading-[1.02] tracking-tight xl:text-6xl">
              Kelola operasional Mans Cell lebih rapi.
            </h1>

            <p className="mt-5 max-w-md text-sm font-semibold leading-relaxed text-sky-50/84 xl:text-base">
              Sistem ini membantu Mans Cell mengatur transaksi kasir, stok barang,
              saldo digital, laporan omzet, laba, dan absensi karyawan dengan tampilan yang ringkas.
            </p>

            <div className="mt-8 grid max-w-md grid-cols-3 gap-3">
              <div className="rounded-[1.25rem] bg-white/12 p-3 ring-1 ring-white/16 backdrop-blur">
                <Boxes className="h-5 w-5 text-cyan-100" strokeWidth={2.7} />
                <p className="mt-2 text-[11px] font-black leading-tight text-white">
                  Stok Barang
                </p>                
              </div>

              <div className="rounded-[1.25rem] bg-white/12 p-3 ring-1 ring-white/16 backdrop-blur">
                <ShieldCheck className="h-5 w-5 text-cyan-100" strokeWidth={2.7} />
                <p className="mt-2 text-[11px] font-black leading-tight text-white">
                  Akses Role
                </p>               
              </div>

              <div className="rounded-[1.25rem] bg-white/12 p-3 ring-1 ring-white/16 backdrop-blur">
                <BarChart3 className="h-5 w-5 text-cyan-100" strokeWidth={2.7} />
                <p className="mt-2 text-[11px] font-black leading-tight text-white">
                  Laporan
                </p>              
              </div>
            </div>
          </div>

          <div className="relative z-10 text-xs font-semibold text-sky-50/70">
            © 2026 Mans Cell Panel. Hak cipta dilindungi.
          </div>
        </section>

        <section className="relative flex min-h-screen items-center justify-center px-5 py-8 sm:px-8 lg:px-8">
          <div className="w-full max-w-[390px]">
                        <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="mb-5 overflow-hidden rounded-[1.65rem] bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 p-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-18px_42px_rgba(2,132,199,0.24),0_18px_45px_rgba(14,165,233,0.18)] ring-1 ring-sky-200/40 lg:hidden"
            >
              <div className="relative">
                <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-white/12 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-16 -left-10 h-36 w-36 rounded-full bg-cyan-200/14 blur-3xl" />

                <div className="relative flex items-center gap-3">
                  <div className="flex h-16 w-36 shrink-0 items-center justify-center rounded-[1.25rem] bg-white px-4 shadow-lg shadow-slate-900/10 ring-1 ring-white/80">
                    <Image
                      src="/logo.png"
                      alt="Logo Mans Cell"
                      width={1000}
                      height={500}
                      className="h-auto w-full object-contain drop-shadow-[0_8px_18px_rgba(2,132,199,0.10)]"
                      priority
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h1 className="text-xl font-black leading-tight tracking-tight text-white">
                      Mans Cell
                    </h1>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-sky-50/75">
                      Panel Operasional
                    </p>
                  </div>
                </div>

                <p className="relative mx-auto mt-4 max-w-[340px] text-center text-xs font-semibold leading-relaxed text-sky-50/86">
  Kelola transaksi, stok, laporan, dan akses Mans Cell dari satu tempat.
</p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.32, ease: "easeOut" }}
              className="rounded-[2rem] bg-white p-5 shadow-sm shadow-sky-500/5 ring-1 ring-sky-100/70 sm:p-6"
            >
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-slate-800 sm:text-[1.65rem]">
                    Selamat Datang
                  </h2>
                  <p className="mt-1 text-xs font-semibold text-slate-400">
                    Masuk untuk melanjutkan ke panel.
                  </p>
                </div>

                <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 ring-1 ring-sky-100 sm:flex">
                  <ShieldCheck size={22} strokeWidth={2.7} />
                </div>
              </div>
          
              <form onSubmit={handleLogin} className="space-y-3.5">
                <div>
                  <label className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-sky-500" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="h-12 w-full rounded-2xl border border-sky-100/80 bg-sky-50/35 pl-11 pr-4 text-sm font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100/60"
                      placeholder="Masukkan email"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                    Kata Sandi
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-sky-500" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      placeholder="Masukkan kata sandi"
                      className="h-12 w-full rounded-2xl border border-sky-100/80 bg-sky-50/35 pl-11 pr-12 text-sm font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100/60"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white hover:text-sky-700"
                      aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                    >
                      {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                    </button>
                  </div>
                </div>               

                <motion.button
                  type="submit"
                  disabled={loading}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-sm font-black text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl hover:shadow-sky-500/25 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Memverifikasi...</span>
                    </>
                  ) : (
                    <>
                      <span>Masuk</span>
                      <ArrowRight className="h-5 w-5" />
                    </>
                  )}
                </motion.button>
              </form>
            </motion.div>

            <p className="mt-5 text-center text-[11px] font-semibold leading-relaxed text-slate-400 lg:hidden">
              © 2026 Mans Cell Panel. Hak cipta dilindungi.
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
