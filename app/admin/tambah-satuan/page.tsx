// Halaman admin satuan barang untuk CRUD satuan barang.
// Layout diseragamkan dengan halaman Tambah Karyawan: tema biru muda, card mobile, toast fixed, modal rapi, dan update local state tanpa reload penuh.

"use client";

import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import {
  Ruler,
  Cpu,
  Plus,
  Pencil,
  Trash2,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Package,
  Boxes,
  Loader2,
  ListFilter,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type SatuanBarang = {
  id: string;
  nama: string;
  createdAt: number;
  updatedAt?: number;
};

type FormState = {
  nama: string;
};

const ITEMS_OPTIONS = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: 0, label: "ALL" },
];

const EMPTY_FORM: FormState = {
  nama: "",
};

const normalizeText = (value: unknown) => String(value || "").trim();

export default function SatuanBarangPage() {
  const router = useRouter();

  const [data, setData] = useState<SatuanBarang[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SatuanBarang | null>(null);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filterMobileOpen, setFilterMobileOpen] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [page, setPage] = useState(1);

  const isEdit = !!editId;

  const showSuccess = (message: string) => {
    setSuccessMsg(message);
    setErrorMsg(null);
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  const showError = (message: string) => {
    setErrorMsg(message);
    setSuccessMsg(null);
    setTimeout(() => setErrorMsg(null), 3500);
  };

  const fetchData = async () => {
    const user = auth.currentUser;
    if (!user) return;

    setLoading(true);

    try {
      const qRef = query(collection(db, "satuan_barang"), orderBy("nama"));
      const snap = await getDocs(qRef);

      setData(
        snap.docs.map((item) => {
          const x = item.data() as any;
          return {
            id: item.id,
            nama: normalizeText(x?.nama),
            createdAt: Number(x?.createdAt || Date.now()),
            updatedAt: x?.updatedAt ? Number(x.updatedAt) : undefined,
          };
        }),
      );
    } catch (e) {
      console.error(e);
      setData([]);
      showError("Gagal memuat data satuan");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (user) await fetchData();
      else setLoading(false);
    });

    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return data;
    return data.filter((item) => item.nama.toLowerCase().includes(q));
  }, [data, search]);

  const stats = useMemo(() => {
    const total = data.length;
    const hasilFilter = filtered.length;
    const pernahUpdate = data.filter((item) => item.updatedAt).length;

    return { total, hasilFilter, pernahUpdate };
  }, [data, filtered]);

  const totalPages =
    itemsPerPage === 0
      ? 1
      : Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const paged =
    itemsPerPage === 0
      ? filtered
      : filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage);
  const goPage = (targetPage: number) =>
    setPage(Math.max(1, Math.min(totalPages, targetPage)));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditId(null);
    setError(null);
  };

  const closeModal = () => {
    if (submitLoading) return;
    setShowModal(false);
    resetForm();
  };

  const openAdd = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (item: SatuanBarang) => {
    setForm({ nama: item.nama });
    setEditId(item.id);
    setError(null);
    setShowModal(true);
  };

  const validateForm = () => {
    const nama = form.nama.trim();

    if (!nama) return "Nama satuan wajib diisi";

    const duplicate = data.find((item) => {
      const sameName = item.nama.trim().toLowerCase() === nama.toLowerCase();
      const notSelf = !editId || item.id !== editId;
      return sameName && notSelf;
    });

    if (duplicate) return "Nama satuan sudah ada";

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const user = auth.currentUser;
    if (!user || submitLoading) return;

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitLoading(true);
    setError(null);

    try {
      const nama = form.nama.trim();
      const now = Date.now();

      if (isEdit && editId) {
        await updateDoc(doc(db, "satuan_barang", editId), {
          nama,
          updatedAt: now,
          updatedBy: user.uid,
        });
        setData((prev) =>
          prev
            .map((item) =>
              item.id === editId
                ? {
                    ...item,
                    nama,
                    updatedAt: now,
                  }
                : item,
            )
            .sort((a, b) => a.nama.localeCompare(b.nama, "id")),
        );

        showSuccess("Satuan berhasil diperbarui");
      } else {
        const newRef = doc(collection(db, "satuan_barang"));
        const newItem: SatuanBarang = {
          id: newRef.id,
          nama,
          createdAt: now,
        };

        await setDoc(newRef, {
          ...newItem,
          createdBy: user.uid,
        });

        setData((prev) =>
          [newItem, ...prev].sort((a, b) => a.nama.localeCompare(b.nama, "id")),
        );
        showSuccess("Satuan berhasil ditambahkan");
      }

      closeModal();
    } catch (e) {
      console.error(e);
      setError("Gagal menyimpan satuan");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleteLoading) return;

    setDeleteLoading(true);

    try {
      await deleteDoc(doc(db, "satuan_barang", deleteTarget.id));
      setData((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      showSuccess("Satuan berhasil dihapus");
    } catch (e) {
      console.error(e);
      showError("Gagal menghapus satuan");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="relative min-h-full overflow-x-hidden bg-transparent text-slate-900">
      <main className="relative w-full space-y-4 pb-28">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="relative overflow-hidden rounded-2xl border border-sky-300/30 bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 px-4 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-18px_42px_rgba(6,78,59,0.24)] sm:px-5 sm:py-5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20 sm:h-12 sm:w-12">
                <Ruler
                  size={28}
                  className="text-white sm:h-8 sm:w-8"
                  strokeWidth={2.5}
                />
              </div>

              <div className="min-w-0">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                  Satuan Barang
                </h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  Kelola master satuan produk untuk stok, transaksi, dan laporan
                  barang.
                </p>
              </div>
            </div>

            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <HeaderButton
                onClick={() => router.push("/admin/tambah-barang")}
                icon={Package}
                label="Barang"
              />
              <HeaderButton onClick={openAdd} icon={Plus} label="Tambah" />
              <button
                type="button"
                onClick={fetchData}
                disabled={loading}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 text-[9px] font-black uppercase tracking-[0.06em] text-white transition-colors hover:bg-white/15 disabled:opacity-60"
                title="Refresh"
              >
                <RefreshCw
                  size={12}
                  strokeWidth={2.8}
                  className={loading ? "animate-spin" : ""}
                />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          <div className="pointer-events-none absolute right-0 top-0 opacity-[0.04]">
            <Cpu size={150} className="text-white" strokeWidth={1} />
          </div>
        </motion.div>

        <AnimatePresence>
          {(successMsg || errorMsg) && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`fixed right-4 top-4 z-[70] flex items-center gap-2 rounded-2xl border px-4 py-3 shadow-lg ${
                successMsg
                  ? "border-sky-200 bg-sky-50"
                  : "border-red-200 bg-red-50"
              }`}
            >
              {successMsg ? (
                <CheckCircle2
                  size={16}
                  className="text-sky-600"
                  strokeWidth={2.5}
                />
              ) : (
                <AlertCircle
                  size={16}
                  className="text-red-600"
                  strokeWidth={2.5}
                />
              )}
              <p
                className={`max-w-xs text-xs font-black ${successMsg ? "text-sky-700" : "text-red-700"}`}
              >
                {successMsg || errorMsg}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <StatCard
            label="Total Satuan"
            value={stats.total}
            icon={Boxes}
            tone="slate"
          />
          <StatCard
            label="Hasil Filter"
            value={stats.hasilFilter}
            icon={Search}
            tone="sky"
          />
          <StatCard
            label="Pernah Update"
            value={stats.pernahUpdate}
            icon={Pencil}
            tone="blue"
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08 }}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                Cari Satuan
              </p>
              <div className="relative">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  strokeWidth={2.5}
                />
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Nama satuan..."
                  className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-4 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                />
              </div>
            </div>

            <div className="hidden sm:block">
              <FilterSelect
                label="Tampilkan"
                value={itemsPerPage}
                onChange={(value) => {
                  setItemsPerPage(Number(value));
                  setPage(1);
                }}
              >
                {ITEMS_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </FilterSelect>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 sm:hidden">
            <motion.button
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              onClick={() => router.push("/admin/tambah-barang")}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-sky-700"
              type="button"
            >
              <Package size={14} strokeWidth={2.5} />
              Barang
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              onClick={openAdd}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-white shadow-sm shadow-sky-500/15"
              type="button"
            >
              <Plus size={14} strokeWidth={2.5} />
              Tambah
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              onClick={() => setFilterMobileOpen((prev) => !prev)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] transition ${
                filterMobileOpen
                  ? "border-sky-200 bg-sky-100 text-sky-700"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
              type="button"
            >
              <ListFilter size={14} strokeWidth={2.5} />
              Filter
            </motion.button>
          </div>

          <AnimatePresence initial={false}>
            {filterMobileOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: -4 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={{ opacity: 0, height: 0, y: -4 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="overflow-hidden sm:hidden"
              >
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                  <FilterSelect
                    label="Tampilkan"
                    value={itemsPerPage}
                    onChange={(value) => {
                      setItemsPerPage(Number(value));
                      setPage(1);
                    }}
                  >
                    {ITEMS_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </FilterSelect>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <SatuanSection
          loading={loading}
          paged={paged}
          filtered={filtered}
          page={page}
          totalPages={totalPages}
          itemsPerPage={itemsPerPage}
          goPage={goPage}
          openAdd={openAdd}
          openEdit={openEdit}
          setDeleteTarget={setDeleteTarget}
        />

        <SatuanFormModal
          show={showModal}
          isEdit={isEdit}
          form={form}
          error={error}
          submitLoading={submitLoading}
          setForm={setForm}
          closeModal={closeModal}
          handleSubmit={handleSubmit}
        />

        <DeleteModal
          target={deleteTarget}
          loading={deleteLoading}
          onClose={() => setDeleteTarget(null)}
          onDelete={handleDelete}
        />
      </main>
    </div>
  );
}

function HeaderButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: any;
  label: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      onClick={onClick}
      className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 text-[9px] font-black uppercase tracking-[0.06em] text-white transition-colors hover:bg-white/15"
      title={label}
      type="button"
    >
      <Icon size={12} strokeWidth={2.8} />
      <span>{label}</span>
    </motion.button>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: any;
  tone: "slate" | "sky" | "blue";
}) {
  const cls =
    tone === "sky"
      ? "bg-sky-50 text-sky-600"
      : tone === "blue"
        ? "bg-blue-50 text-blue-600"
        : "bg-slate-100 text-slate-500";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-4">
      <div className="flex flex-col items-center gap-1.5 text-center sm:flex-row sm:gap-3 sm:text-left">
        <div
          className={`hidden h-9 w-9 items-center justify-center rounded-2xl sm:flex sm:h-11 sm:w-11 ${cls}`}
        >
          <Icon
            size={18}
            strokeWidth={2.5}
            className="sm:h-[21px] sm:w-[21px]"
          />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[8px] font-black uppercase tracking-[0.08em] text-slate-400 sm:text-[10px] sm:tracking-widest">
            {label}
          </p>
          <p className="text-lg font-black leading-tight text-slate-800 sm:text-2xl">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

function FieldBox({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </p>
      {children}
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  children,
  label,
}: {
  value: string | number;
  onChange: (value: string) => void;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <FieldBox label={label}>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 pr-8 text-sm font-semibold text-slate-700 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
        >
          {children}
        </select>
        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
          strokeWidth={2.5}
        />
      </div>
    </FieldBox>
  );
}

function SatuanSection({
  loading,
  paged,
  filtered,
  page,
  totalPages,
  itemsPerPage,
  goPage,
  openAdd,
  openEdit,
  setDeleteTarget,
}: {
  loading: boolean;
  paged: SatuanBarang[];
  filtered: SatuanBarang[];
  page: number;
  totalPages: number;
  itemsPerPage: number;
  goPage: (page: number) => void;
  openAdd: () => void;
  openEdit: (item: SatuanBarang) => void;
  setDeleteTarget: (item: SatuanBarang) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-sky-500"
          />
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Memuat data satuan...
          </p>
        </div>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
          <Boxes size={28} className="text-slate-300" strokeWidth={2} />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Satuan barang belum tersedia
        </p>
        <motion.button
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          onClick={openAdd}
          className="flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-4 py-2 text-xs font-black text-white shadow-sm shadow-sky-500/15"
          type="button"
        >
          <Plus size={13} strokeWidth={2.5} />
          Tambah Satuan
        </motion.button>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2 sm:hidden">
        {paged.map((item, idx) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: idx * 0.03 }}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm ring-1 ring-slate-100/70"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
                <Ruler size={20} strokeWidth={2.5} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black leading-tight text-slate-800">
                      {item.nama}
                    </p>
                    <p className="mt-1 truncate text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                      Master Satuan
                    </p>
                  </div>

                  <span className="inline-flex shrink-0 rounded-full bg-sky-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-sky-700">
                    Aktif
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    transition={{ duration: 0.12, ease: "easeOut" }}
                    onClick={() => openEdit(item)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-sky-700 shadow-sm transition hover:bg-sky-100"
                    type="button"
                  >
                    <Pencil size={13} strokeWidth={2.6} />
                    Edit
                  </motion.button>

                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    transition={{ duration: 0.12, ease: "easeOut" }}
                    onClick={() => setDeleteTarget(item)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-300/70 bg-rose-600 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white shadow-sm shadow-rose-500/15 transition hover:bg-rose-700"
                    type="button"
                  >
                    <Trash2 size={13} strokeWidth={2.6} />
                    Hapus
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:block"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-slate-100 bg-slate-50/70">
              <tr>
                {["No", "Nama Satuan", "Aksi"].map((head) => (
                  <th
                    key={head}
                    className={`whitespace-nowrap px-3 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 ${
                      head === "No" || head === "Aksi"
                        ? "text-center"
                        : "text-left"
                    }`}
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((item, index) => (
                <tr
                  key={item.id}
                  className="border-t border-slate-100 transition-colors hover:bg-sky-50/40"
                >
                  <td className="px-3 py-3 text-center font-bold text-slate-400">
                    {itemsPerPage === 0
                      ? index + 1
                      : (page - 1) * itemsPerPage + index + 1}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-black text-slate-800">
                    {item.nama}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <div className="flex justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="flex h-8 w-8 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-700 shadow-sm transition hover:bg-sky-100"
                        title="Edit satuan"
                      >
                        <Pencil size={13} strokeWidth={2.6} />
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeleteTarget(item)}
                        className="flex h-8 w-8 items-center justify-center rounded-xl border border-rose-300/70 bg-rose-600 text-white shadow-sm shadow-rose-500/15 transition hover:bg-rose-700"
                        title="Hapus satuan"
                      >
                        <Trash2 size={13} strokeWidth={2.6} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      {itemsPerPage !== 0 && totalPages > 1 && (
        <div className="flex justify-center gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => goPage(page - 1)}
            disabled={page === 1}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeft size={14} strokeWidth={2.5} />
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(
              (p) =>
                totalPages <= 7 ||
                p === 1 ||
                p === totalPages ||
                Math.abs(p - page) <= 2,
            )
            .reduce<(number | "...")[]>((acc, p, idx, arr) => {
              if (
                idx > 0 &&
                typeof arr[idx - 1] === "number" &&
                p - (arr[idx - 1] as number) > 1
              )
                acc.push("...");
              acc.push(p);
              return acc;
            }, [])
            .map((p, idx) =>
              p === "..." ? (
                <span
                  key={`e-${idx}`}
                  className="px-1 text-xs font-bold text-slate-400"
                >
                  ···
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => goPage(p)}
                  className={`h-8 min-w-8 rounded-xl px-2 text-xs font-black transition ${
                    page === p
                      ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-sm shadow-sky-500/15"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {p}
                </button>
              ),
            )}

          <button
            type="button"
            onClick={() => goPage(page + 1)}
            disabled={page === totalPages}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight size={14} strokeWidth={2.5} />
          </button>
        </div>
      )}
    </>
  );
}

function SatuanFormModal({
  show,
  isEdit,
  form,
  error,
  submitLoading,
  setForm,
  closeModal,
  handleSubmit,
}: {
  show: boolean;
  isEdit: boolean;
  form: FormState;
  error: string | null;
  submitLoading: boolean;
  setForm: (form: FormState) => void;
  closeModal: () => void;
  handleSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && !submitLoading) closeModal();
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="max-h-[88vh] w-full max-w-lg overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">
                  {isEdit ? "Edit Satuan Barang" : "Tambah Satuan Barang"}
                </p>
                <h2 className="truncate text-base font-black text-slate-800">
                  {form.nama || "Satuan Baru"}
                </h2>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={submitLoading}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
              >
                <X size={17} strokeWidth={2.5} />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="max-h-[calc(88vh-65px)] overflow-y-auto p-4 sm:p-5"
            >
              <div className="space-y-3">
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2.5"
                    >
                      <AlertCircle
                        size={15}
                        className="mt-0.5 shrink-0 text-red-600"
                        strokeWidth={2.5}
                      />
                      <p className="text-[11px] font-bold text-red-700">
                        {error}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <FieldInput
                  label="Nama Satuan"
                  value={form.nama}
                  onChange={(value) => setForm({ nama: value })}
                  icon={Ruler}
                  placeholder="Contoh: Pcs, Box, Unit, Pack"
                />

                <div className="grid grid-cols-2 gap-2 pt-1 sm:flex sm:justify-end">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={submitLoading}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <X size={16} strokeWidth={2.5} />
                    Batal
                  </button>

                  <button
                    type="submit"
                    disabled={submitLoading}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-4 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-lg shadow-sky-500/15 transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitLoading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : isEdit ? (
                      <Pencil size={16} strokeWidth={2.5} />
                    ) : (
                      <Plus size={16} strokeWidth={2.5} />
                    )}
                    {submitLoading ? "Proses" : isEdit ? "Update" : "Simpan"}
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  icon: Icon,
  className = "",
  ...props
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  icon?: any;
  className?: string;
  [key: string]: any;
}) {
  return (
    <div className={className}>
      <label className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
        {Icon && <Icon size={11} strokeWidth={2.5} />}
        {label}
      </label>
      <input
        {...props}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
      />
    </div>
  );
}

function DeleteModal({
  target,
  loading,
  onClose,
  onDelete,
}: {
  target: SatuanBarang | null;
  loading: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <AnimatePresence>
      {target && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="relative overflow-hidden bg-gradient-to-br from-rose-500 to-red-600 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20">
                  <Trash2 size={20} className="text-white" strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="text-base font-black leading-none tracking-tight text-white">
                    Hapus Satuan
                  </h2>
                  <p className="mt-0.5 max-w-[220px] truncate text-[10px] font-bold uppercase tracking-[0.15em] text-white/70">
                    {target.nama}
                  </p>
                </div>
              </div>
              <div className="pointer-events-none absolute right-0 top-0 opacity-10">
                <Cpu size={100} strokeWidth={1} className="text-white" />
              </div>
            </div>

            <div className="space-y-3 p-5">
              <p className="text-[11px] font-semibold text-slate-600">
                Anda yakin mau menghapus satuan ini?
              </p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-black text-slate-800">
                  {target.nama}
                </p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Master Satuan Barang
                </p>
              </div>
            </div>

            <div className="flex gap-2 px-5 pb-5">
              <motion.button
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                onClick={onClose}
                disabled={loading}
                className="flex-1 rounded-full border border-slate-200 bg-white py-2.5 text-sm font-bold text-slate-600 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-60"
              >
                Batal
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                onClick={onDelete}
                disabled={loading}
                className="flex-1 rounded-full bg-gradient-to-r from-rose-500 to-red-600 py-2.5 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-lg shadow-rose-200/50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    Menghapus...
                  </span>
                ) : (
                  "Hapus"
                )}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
