"use client"

/*
  Halaman dashboard admin utama dengan header yang konsisten dengan halaman admin lainnya.
  Revisi:
  - Header memakai tema biru/sky konsisten.
  - Wrapper aman untuk layout/sidebar, tanpa min-h-screen/background fixed.
  - Badge restock tetap di header dan logic tidak diubah.
*/

import Link from "next/link"
import { useEffect, useState } from "react"
import { auth, db } from "@/lib/firebase"
import { collection, getDocs, query } from "firebase/firestore"
import { AlertTriangle, BarChart3, CheckCircle2, Cpu, RefreshCw } from "lucide-react"

export default function AdminPage() {
  const [restockCount, setRestockCount] = useState(0)
  const [loadingRestock, setLoadingRestock] = useState(false)

  const fetchRestockCount = async () => {
    setLoadingRestock(true)

    try {
      const [barangSnap, saldoSnap] = await Promise.all([
        getDocs(query(collection(db, "barang"))),
        getDocs(query(collection(db, "master_saldo_digital"))),
      ])

      const totalBarangRestock = barangSnap.docs.reduce((sum, d) => {
        const x = d.data() as any
        const jenisBarang = (x?.jenisBarang || "fisik") as "fisik" | "digital"
        const stok = Number(x?.stok || 0)
        const stokMinimum = Number(x?.stokMinimum || 0)

        if (jenisBarang === "fisik" && stok <= stokMinimum) return sum + 1
        return sum
      }, 0)

      const totalSaldoRestock = saldoSnap.docs.reduce((sum, d) => {
        const x = d.data() as any
        const aktif = x?.aktif !== false
        const jumlahSaldo = Number(x?.jumlahSaldo || 0)
        const jumlahMinimum = Number(x?.jumlahMinimum || 0)

        if (aktif && jumlahSaldo <= jumlahMinimum) return sum + 1
        return sum
      }, 0)

      setRestockCount(totalBarangRestock + totalSaldoRestock)
    } catch (error) {
      console.error("Gagal memuat jumlah restock:", error)
      setRestockCount(0)
    } finally {
      setLoadingRestock(false)
    }
  }

  useEffect(() => {
    let isMounted = true

    const run = async () => {
      if (!isMounted) return
      await fetchRestockCount()
    }

    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) return
      await run()
    })

    return () => {
      isMounted = false
      unsub()
    }
  }, [])

  const isNeedRestock = restockCount > 0

  return (
    <div className="relative min-h-full overflow-x-hidden bg-transparent text-slate-900">
      <main className="relative w-full space-y-4 pb-28">
        <div className="relative overflow-hidden rounded-2xl border border-sky-300/30 bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 px-4 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-18px_42px_rgba(2,132,199,0.24)] sm:px-5 sm:py-5">
          <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20 sm:h-12 sm:w-12">
                <BarChart3
                  size={28}
                  className="text-white sm:h-8 sm:w-8"
                  strokeWidth={2.5}
                />
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                  Dashboard
                </h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  Halaman utama admin Mans Cell.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <button
                type="button"
                onClick={fetchRestockCount}
                disabled={loadingRestock}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                title="Refresh indikator restock"
              >
                <RefreshCw
                  size={14}
                  className={loadingRestock ? "animate-spin" : ""}
                  strokeWidth={2.5}
                />
              </button>

              <Link
                href="/admin/restock-barang"
                className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[10px] font-black uppercase tracking-[0.08em] text-white shadow-sm backdrop-blur-md transition-all ${
  isNeedRestock
    ? "border-orange-800/110 bg-orange-200/10 shadow-orange-500/20 hover:bg-orange-500/70"
    : "border-white/20 bg-white/10 hover:bg-white/15"
}`}
              >
                {isNeedRestock ? (
                  <AlertTriangle size={14} strokeWidth={2.5} />
                ) : (
                  <CheckCircle2 size={14} strokeWidth={2.5} />
                )}
                <span>{isNeedRestock ? `RESTOCK ${restockCount}` : "AMAN"}</span>
              </Link>
            </div>
          </div>

          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-yellow-300/10 blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-0 opacity-[0.05]">
            <Cpu size={170} className="text-white" strokeWidth={1} />
          </div>
        </div>
      </main>
    </div>
  )
}
