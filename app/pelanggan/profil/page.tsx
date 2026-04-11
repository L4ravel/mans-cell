/* 
  Halaman profil pelanggan.
  Masih dummy untuk placeholder data akun dan profil pelanggan.
*/

"use client"

import { motion } from "framer-motion"
import { Mail, Phone, UserRound } from "lucide-react"

const profilItems = [
  { label: "Nama", value: "Belum tersedia", icon: UserRound },
  { label: "Email", value: "Belum tersedia", icon: Mail },
  { label: "Telepon", value: "Belum tersedia", icon: Phone },
]

export default function ProfilPelangganPage() {
  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-100">
            <UserRound size={28} strokeWidth={2.5} />
          </div>

          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">
              Profil Saya
            </p>
            <h1 className="mt-1 text-2xl font-black text-slate-800">
              Data profil pelanggan
            </h1>
            <p className="mt-2 text-sm font-medium text-slate-500">
              Halaman ini masih dummy. Nanti di sini tampil data akun pelanggan
              dan pengaturan profil.
            </p>
          </div>
        </div>
      </motion.div>

      <div className="grid gap-4">
        {profilItems.map((item, index) => {
          const Icon = item.icon

          return (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06 }}
              className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                  <Icon size={22} strokeWidth={2.5} />
                </div>

                <div>
                  <p className="text-sm font-bold text-slate-500">{item.label}</p>
                  <h2 className="text-base font-black text-slate-800">
                    {item.value}
                  </h2>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}