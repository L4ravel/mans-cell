// Halaman dashboard admin utama dengan style card modern sesuai referensi.
// Menampilkan header dashboard sederhana untuk area admin Mans-Cell.

import { Calendar, Clock } from "lucide-react"

export default function AdminPage() {
  return (
    <div className="space-y-6 w-full">
      <header className="bg-white/80 backdrop-blur-xl rounded-2xl p-6 shadow-lg border border-blue-100">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Dashboard
            </h1>
            <p className="text-gray-600 mt-1 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Halaman Dashboard
            </p>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-600 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-2 rounded-xl">
            <Clock className="w-4 h-4" />
            <span className="whitespace-nowrap">Dashboard Aktif</span>
          </div>
        </div>
      </header>
    </div>
  )
}