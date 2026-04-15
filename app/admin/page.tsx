// Halaman dashboard admin utama dengan header yang konsisten dengan halaman admin lainnya.

import { BarChart3, Cpu } from "lucide-react"

export default function AdminPage() {
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
            <div className="inline-flex h-8 items-center rounded-full bg-cyan-500 px-3 shadow-sm shadow-cyan-200/50">
              <span className="text-xs font-black text-white">AKTIF</span>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute right-0 top-0 opacity-[0.03]">
          <Cpu size={140} strokeWidth={1} />
        </div>
      </div>
    </div>
  )
}