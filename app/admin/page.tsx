// Halaman dashboard admin utama dengan header yang konsisten dengan halaman admin lainnya.
// Revisi: badge aktif diganti indikator restock di header.

"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { auth, db } from "@/lib/firebase"
import { collection, getDocs, query } from "firebase/firestore"
import { AlertTriangle, BarChart3, Cpu } from "lucide-react"

export default function AdminPage() {
  const [restockCount, setRestockCount] = useState(0)

  useEffect(() => {
    let isMounted = true

    const fetchRestockCount = async () => {
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

        if (!isMounted) return
        setRestockCount(totalBarangRestock + totalSaldoRestock)
      } catch (error) {
        console.error("Gagal memuat jumlah restock:", error)
        if (!isMounted) return
        setRestockCount(0)
      }
    }

    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) return
      await fetchRestockCount()
    })

    return () => {
      isMounted = false
      unsub()
    }
  }, [])

  return (
    <div className="space-y-4 text-slate-900 sm:space-y-5">
      <div className="relative overflow-hidden rounded-xl border border-slate-200 border-l-4 border-l-cyan-500 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-center gap-3 sm:items-start sm:gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 shadow-lg shadow-cyan-200/50 sm:h-14 sm:w-14">
              <BarChart3
                size={22}
                className="text-white sm:h-7 sm:w-7"
                strokeWidth={2.5}
              />
            </div>

            <div className="min-w-0 self-center sm:self-auto">
              <h1 className="text-lg font-black leading-none tracking-tight text-slate-800 sm:text-2xl">
                Dashboard
              </h1>
              <p className="mt-1 hidden text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 sm:block">
                Halaman utama admin mans-cell
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 sm:flex-shrink-0">
            <Link
              href="/admin/restock-barang"
              className={`inline-flex h-8 items-center gap-2 rounded-full px-3 shadow-sm transition-all ${
                restockCount > 0
                  ? "bg-orange-500 text-white shadow-orange-200/60 hover:bg-orange-600"
                  : "bg-emerald-500 text-white shadow-emerald-200/60 hover:bg-emerald-600"
              }`}
            >
              <AlertTriangle size={14} strokeWidth={2.5} />
              <span className="text-xs font-black">
                {restockCount > 0 ? `RESTOCK ${restockCount}` : "AMAN"}
              </span>
            </Link>
          </div>
        </div>

        <div className="pointer-events-none absolute right-0 top-0 opacity-[0.03]">
          <Cpu size={140} strokeWidth={1} />
        </div>
      </div>
    </div>
  )
}