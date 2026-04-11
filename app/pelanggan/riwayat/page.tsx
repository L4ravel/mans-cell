/* 
  Halaman riwayat belanja pelanggan.
  Masih dummy untuk placeholder daftar transaksi pelanggan.
*/

"use client"

import { motion } from "framer-motion"
import { ReceiptText, ShoppingBag } from "lucide-react"

const dummyRows = [
  { tanggal: "-", invoice: "-", total: "-" },
  { tanggal: "-", invoice: "-", total: "-" },
  { tanggal: "-", invoice: "-", total: "-" },
]

export default function RiwayatPelangganPage() {
  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 text-white shadow-lg shadow-emerald-100">
            <ReceiptText size={28} strokeWidth={2.5} />
          </div>

          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">
              Riwayat Belanja
            </p>
            <h1 className="mt-1 text-2xl font-black text-slate-800">
              Riwayat transaksi pelanggan
            </h1>
            <p className="mt-2 text-sm font-medium text-slate-500">
              Halaman ini masih dummy. Nanti di sini tampil daftar transaksi
              pembelian pelanggan lengkap dengan detail belanjanya.
            </p>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06 }}
        className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2 text-slate-800">
            <ShoppingBag size={18} strokeWidth={2.5} />
            <h2 className="text-base font-black">Daftar Riwayat</h2>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-slate-50">
              <tr className="text-xs uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3 font-black">Tanggal</th>
                <th className="px-5 py-3 font-black">Invoice</th>
                <th className="px-5 py-3 font-black">Total</th>
              </tr>
            </thead>
            <tbody>
              {dummyRows.map((row, index) => (
                <tr key={index} className="border-t border-slate-100">
                  <td className="px-5 py-4 text-sm font-semibold text-slate-700">
                    {row.tanggal}
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-slate-700">
                    {row.invoice}
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-slate-700">
                    {row.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  )
}