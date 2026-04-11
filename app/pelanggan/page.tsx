/* 
  Halaman beranda pelanggan.
  Sementara masih dummy sebagai landing utama setelah login pelanggan.
*/

"use client"

import { motion } from "framer-motion"
import { CreditCard, ReceiptText, UserRound, Sparkles } from "lucide-react"

const cards = [
  {
    title: "Status Member",
    desc: "Nanti di sini tampil level member, poin, dan benefit pelanggan.",
    icon: CreditCard,
  },
  {
    title: "Riwayat Belanja",
    desc: "Nanti di sini tampil daftar transaksi dan detail pembelian pelanggan.",
    icon: ReceiptText,
  },
  {
    title: "Profil Saya",
    desc: "Nanti di sini tampil data akun pelanggan dan pengaturan profil.",
    icon: UserRound,
  },
]

export default function PelangganPage() {
  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-cyan-500 via-sky-500 to-indigo-600 p-6 text-white shadow-xl shadow-cyan-100"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
            <Sparkles size={28} strokeWidth={2.5} />
          </div>

          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.25em] text-cyan-100">
              Dashboard Pelanggan
            </p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">
              Selamat datang di akun pelanggan
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-medium text-cyan-50/90">
              Halaman ini masih dummy dulu. Nanti di sini kita isi info member,
              poin, riwayat belanja, promo, dan profil pelanggan.
            </p>
          </div>
        </div>
      </motion.div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card, index) => {
          const Icon = card.icon

          return (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06 }}
              className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-100">
                <Icon size={22} strokeWidth={2.5} />
              </div>

              <h2 className="mt-4 text-lg font-black text-slate-800">
                {card.title}
              </h2>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
                {card.desc}
              </p>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}