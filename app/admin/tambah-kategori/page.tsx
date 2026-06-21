// app/admin/tambah-kategori/page.tsx
// Halaman admin kategori barang + pengaturan kelompok laporan kategori per toko.

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
  Tag,
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
  Layers3,
  Loader2,
  ListFilter,
  Store,
  FolderKanban,
  Check,
  Copy,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type KategoriBarang = {
  id: string;
  nama: string;
  createdAt: number;
  updatedAt?: number;
};

type Toko = {
  id: string;
  nama: string;
  kode?: string;
  aktif?: boolean;
};

type KelompokLaporanKategori = {
  id: string;
  tokoId: string;
  tokoNama: string;
  namaKelompok: string;
  urutan: number;
  kategoriIds: string[];
  kategoriNama: string[];
  aktif: boolean;
  createdAt: number;
  updatedAt?: number;
};

type FormState = {
  nama: string;
};

type KelompokFormState = {
  tokoId: string;
  namaKelompok: string;
  urutan: string;
  kategoriIds: string[];
  aktif: boolean;
};

type CopyKelompokFormState = {
  sumberTokoId: string;
  tujuanTokoId: string;
  replaceExisting: boolean;
};

type DeleteTarget =
  | { type: "kategori"; item: KategoriBarang }
  | { type: "kelompok"; item: KelompokLaporanKategori }
  | null;

type ActiveTab = "kategori" | "kelompok";

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

const EMPTY_KELOMPOK_FORM: KelompokFormState = {
  tokoId: "",
  namaKelompok: "",
  urutan: "1",
  kategoriIds: [],
  aktif: true,
};

const EMPTY_COPY_KELOMPOK_FORM: CopyKelompokFormState = {
  sumberTokoId: "",
  tujuanTokoId: "",
  replaceExisting: false,
};

const normalizeText = (value: unknown) => String(value || "").trim();

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
};

export default function KategoriBarangPage() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<ActiveTab>("kategori");

  const [data, setData] = useState<KategoriBarang[]>([]);
  const [tokoList, setTokoList] = useState<Toko[]>([]);
  const [kelompokList, setKelompokList] = useState<KelompokLaporanKategori[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [kelompokSubmitLoading, setKelompokSubmitLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [copyKelompokLoading, setCopyKelompokLoading] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [showKelompokModal, setShowKelompokModal] = useState(false);
  const [showCopyKelompokModal, setShowCopyKelompokModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editKelompokId, setEditKelompokId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [kelompokForm, setKelompokForm] = useState<KelompokFormState>(EMPTY_KELOMPOK_FORM);
  const [copyKelompokForm, setCopyKelompokForm] = useState<CopyKelompokFormState>(EMPTY_COPY_KELOMPOK_FORM);
  const [error, setError] = useState<string | null>(null);
  const [kelompokError, setKelompokError] = useState<string | null>(null);
  const [copyKelompokError, setCopyKelompokError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [searchKelompok, setSearchKelompok] = useState("");
  const [filterTokoKelompok, setFilterTokoKelompok] = useState("");
  const [filterMobileOpen, setFilterMobileOpen] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [kelompokItemsPerPage, setKelompokItemsPerPage] = useState(10);
  const [page, setPage] = useState(1);
  const [kelompokPage, setKelompokPage] = useState(1);

  const isEdit = !!editId;
  const isKelompokEdit = !!editKelompokId;

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
      const [kategoriSnap, tokoSnap, kelompokSnap] = await Promise.all([
        getDocs(query(collection(db, "kategori_barang"), orderBy("nama"))),
        getDocs(query(collection(db, "toko"), orderBy("nama"))),
        getDocs(query(collection(db, "kelompok_laporan_kategori"), orderBy("urutan"))),
      ]);

      const kategoriData = kategoriSnap.docs.map((item) => {
        const x = item.data() as any;
        return {
          id: item.id,
          nama: normalizeText(x?.nama),
          createdAt: Number(x?.createdAt || Date.now()),
          updatedAt: x?.updatedAt ? Number(x.updatedAt) : undefined,
        };
      });

      const tokoData = tokoSnap.docs
        .map((item) => {
          const x = item.data() as any;
          return {
            id: item.id,
            nama: normalizeText(x?.nama),
            kode: normalizeText(x?.kode),
            aktif: x?.aktif !== false,
          };
        })
        .filter((item) => item.nama && item.aktif !== false)
        .sort((a, b) => a.nama.localeCompare(b.nama, "id"));

      const kelompokData = kelompokSnap.docs
        .map((item) => {
          const x = item.data() as any;
          return {
            id: item.id,
            tokoId: normalizeText(x?.tokoId),
            tokoNama: normalizeText(x?.tokoNama),
            namaKelompok: normalizeText(x?.namaKelompok),
            urutan: Number(x?.urutan || 1),
            kategoriIds: normalizeStringArray(x?.kategoriIds),
            kategoriNama: normalizeStringArray(x?.kategoriNama),
            aktif: x?.aktif !== false,
            createdAt: Number(x?.createdAt || Date.now()),
            updatedAt: x?.updatedAt ? Number(x.updatedAt) : undefined,
          };
        })
        .filter((item) => item.namaKelompok)
        .sort((a, b) => {
          const tokoCompare = a.tokoNama.localeCompare(b.tokoNama, "id");
          if (tokoCompare !== 0) return tokoCompare;
          return a.urutan - b.urutan;
        });

      setData(kategoriData);
      setTokoList(tokoData);
      setKelompokList(kelompokData);
    } catch (e) {
      console.error(e);
      setData([]);
      setTokoList([]);
      setKelompokList([]);
      showError("Gagal memuat data kategori");
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

  const filteredKelompok = useMemo(() => {
    const q = searchKelompok.toLowerCase().trim();

    return kelompokList.filter((item) => {
      const matchSearch =
        !q ||
        item.namaKelompok.toLowerCase().includes(q) ||
        item.tokoNama.toLowerCase().includes(q) ||
        item.kategoriNama.some((nama) => nama.toLowerCase().includes(q));

      const matchToko = !filterTokoKelompok || item.tokoId === filterTokoKelompok;

      return matchSearch && matchToko;
    });
  }, [kelompokList, searchKelompok, filterTokoKelompok]);

  const stats = useMemo(() => {
    const total = data.length;
    const hasilFilter = filtered.length;
    const totalKelompok = kelompokList.length;
    const tokoKelompok = new Set(kelompokList.map((item) => item.tokoId).filter(Boolean)).size;

    return { total, hasilFilter, totalKelompok, tokoKelompok };
  }, [data, filtered, kelompokList]);

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

  const totalKelompokPages =
    kelompokItemsPerPage === 0
      ? 1
      : Math.max(1, Math.ceil(filteredKelompok.length / kelompokItemsPerPage));
  const pagedKelompok =
    kelompokItemsPerPage === 0
      ? filteredKelompok
      : filteredKelompok.slice(
          (kelompokPage - 1) * kelompokItemsPerPage,
          kelompokPage * kelompokItemsPerPage,
        );
  const goKelompokPage = (targetPage: number) =>
    setKelompokPage(Math.max(1, Math.min(totalKelompokPages, targetPage)));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (kelompokPage > totalKelompokPages) setKelompokPage(totalKelompokPages);
  }, [kelompokPage, totalKelompokPages]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditId(null);
    setError(null);
  };

  const resetKelompokForm = () => {
    setKelompokForm({
      ...EMPTY_KELOMPOK_FORM,
      tokoId: filterTokoKelompok || "",
      urutan: String((kelompokList.filter((item) => !filterTokoKelompok || item.tokoId === filterTokoKelompok).length || 0) + 1),
    });
    setEditKelompokId(null);
    setKelompokError(null);
  };

  const closeModal = () => {
    if (submitLoading) return;
    setShowModal(false);
    resetForm();
  };

  const closeKelompokModal = () => {
    if (kelompokSubmitLoading) return;
    setShowKelompokModal(false);
    resetKelompokForm();
  };

  const resetCopyKelompokForm = () => {
    setCopyKelompokForm({
      ...EMPTY_COPY_KELOMPOK_FORM,
      sumberTokoId: filterTokoKelompok || "",
    });
    setCopyKelompokError(null);
  };

  const closeCopyKelompokModal = () => {
    if (copyKelompokLoading) return;
    setShowCopyKelompokModal(false);
    resetCopyKelompokForm();
  };

  const openCopyKelompok = () => {
    resetCopyKelompokForm();
    setShowCopyKelompokModal(true);
  };

  const openAdd = () => {
    resetForm();
    setShowModal(true);
  };

  const openKelompokAdd = () => {
    resetKelompokForm();
    setShowKelompokModal(true);
  };

  const openEdit = (item: KategoriBarang) => {
    setForm({ nama: item.nama });
    setEditId(item.id);
    setError(null);
    setShowModal(true);
  };

  const openKelompokEdit = (item: KelompokLaporanKategori) => {
    setKelompokForm({
      tokoId: item.tokoId,
      namaKelompok: item.namaKelompok,
      urutan: String(item.urutan || 1),
      kategoriIds: item.kategoriIds || [],
      aktif: item.aktif !== false,
    });
    setEditKelompokId(item.id);
    setKelompokError(null);
    setShowKelompokModal(true);
  };

  const validateForm = () => {
    const nama = form.nama.trim();

    if (!nama) return "Nama kategori wajib diisi";

    const duplicate = data.find((item) => {
      const sameName = item.nama.trim().toLowerCase() === nama.toLowerCase();
      const notSelf = !editId || item.id !== editId;
      return sameName && notSelf;
    });

    if (duplicate) return "Nama kategori sudah dipakai";

    return null;
  };

  const validateKelompokForm = () => {
    const tokoId = kelompokForm.tokoId.trim();
    const namaKelompok = kelompokForm.namaKelompok.trim();
    const urutan = Number(kelompokForm.urutan || 0);

    if (!tokoId) return "Toko wajib dipilih";
    if (!namaKelompok) return "Nama kelompok wajib diisi";
    if (Number.isNaN(urutan) || urutan <= 0) return "Urutan wajib lebih dari 0";
    if (kelompokForm.kategoriIds.length === 0) return "Pilih minimal satu kategori";

    const duplicate = kelompokList.find((item) => {
      const sameToko = item.tokoId === tokoId;
      const sameName = item.namaKelompok.trim().toLowerCase() === namaKelompok.toLowerCase();
      const notSelf = !editKelompokId || item.id !== editKelompokId;
      return sameToko && sameName && notSelf;
    });

    if (duplicate) return "Nama kelompok sudah dipakai di toko ini";

    return null;
  };

  const validateCopyKelompokForm = () => {
    const sumberTokoId = copyKelompokForm.sumberTokoId.trim();
    const tujuanTokoId = copyKelompokForm.tujuanTokoId.trim();

    if (!sumberTokoId) return "Toko sumber wajib dipilih";
    if (!tujuanTokoId) return "Toko tujuan wajib dipilih";
    if (sumberTokoId === tujuanTokoId) return "Toko sumber dan tujuan tidak boleh sama";

    const sumberKelompok = kelompokList.filter((item) => item.tokoId === sumberTokoId);
    if (sumberKelompok.length === 0) return "Toko sumber belum memiliki kelompok laporan";

    const tokoTujuan = tokoList.find((item) => item.id === tujuanTokoId);
    if (!tokoTujuan) return "Toko tujuan tidak ditemukan";

    if (!copyKelompokForm.replaceExisting) {
      const existingNama = new Set(
        kelompokList
          .filter((item) => item.tokoId === tujuanTokoId)
          .map((item) => item.namaKelompok.trim().toLowerCase()),
      );
      const bisaDicopy = sumberKelompok.some(
        (item) => !existingNama.has(item.namaKelompok.trim().toLowerCase()),
      );

      if (!bisaDicopy) {
        return "Semua kelompok dari toko sumber sudah ada di toko tujuan. Aktifkan timpa data jika ingin mengganti.";
      }
    }

    return null;
  };

  const handleCopyKelompokSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const user = auth.currentUser;
    if (!user || copyKelompokLoading) return;

    const validationError = validateCopyKelompokForm();
    if (validationError) {
      setCopyKelompokError(validationError);
      return;
    }

    setCopyKelompokLoading(true);
    setCopyKelompokError(null);

    try {
      const now = Date.now();
      const sumberTokoId = copyKelompokForm.sumberTokoId.trim();
      const tujuanTokoId = copyKelompokForm.tujuanTokoId.trim();
      const tokoTujuan = tokoList.find((item) => item.id === tujuanTokoId);
      const targetNama = tokoTujuan?.nama || "Tanpa Toko";

      const sumberKelompok = kelompokList
        .filter((item) => item.tokoId === sumberTokoId)
        .sort((a, b) => a.urutan - b.urutan);

      const kelompokTujuan = kelompokList.filter((item) => item.tokoId === tujuanTokoId);
      const existingNama = new Set(
        kelompokTujuan.map((item) => item.namaKelompok.trim().toLowerCase()),
      );

      const kelompokUntukDicopy = copyKelompokForm.replaceExisting
        ? sumberKelompok
        : sumberKelompok.filter(
            (item) => !existingNama.has(item.namaKelompok.trim().toLowerCase()),
          );

      if (kelompokUntukDicopy.length === 0) {
        setCopyKelompokError("Tidak ada kelompok baru yang bisa dicopy");
        return;
      }

      if (copyKelompokForm.replaceExisting && kelompokTujuan.length > 0) {
        await Promise.all(
          kelompokTujuan.map((item) => deleteDoc(doc(db, "kelompok_laporan_kategori", item.id))),
        );
      }

      const newItems: KelompokLaporanKategori[] = kelompokUntukDicopy.map((item) => {
        const newRef = doc(collection(db, "kelompok_laporan_kategori"));
        return {
          id: newRef.id,
          tokoId: tujuanTokoId,
          tokoNama: targetNama,
          namaKelompok: item.namaKelompok,
          urutan: item.urutan,
          kategoriIds: item.kategoriIds || [],
          kategoriNama: item.kategoriNama || [],
          aktif: item.aktif !== false,
          createdAt: now,
        };
      });

      await Promise.all(
        newItems.map((item) =>
          setDoc(doc(db, "kelompok_laporan_kategori", item.id), {
            ...item,
            copiedFromTokoId: sumberTokoId,
            copiedFromKelompokId: sumberKelompok.find(
              (source) => source.namaKelompok === item.namaKelompok && source.urutan === item.urutan,
            )?.id || "",
            createdBy: user.uid,
          }),
        ),
      );

      setKelompokList((prev) => {
        const base = copyKelompokForm.replaceExisting
          ? prev.filter((item) => item.tokoId !== tujuanTokoId)
          : prev;

        return [...base, ...newItems].sort((a, b) => {
          const tokoCompare = a.tokoNama.localeCompare(b.tokoNama, "id");
          if (tokoCompare !== 0) return tokoCompare;
          return a.urutan - b.urutan;
        });
      });

      setFilterTokoKelompok(tujuanTokoId);
      setKelompokPage(1);
      showSuccess(`${kelompokUntukDicopy.length} kelompok berhasil dicopy ke ${targetNama}`);
      closeCopyKelompokModal();
    } catch (e) {
      console.error(e);
      setCopyKelompokError("Gagal copy kelompok laporan");
    } finally {
      setCopyKelompokLoading(false);
    }
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
        await updateDoc(doc(db, "kategori_barang", editId), {
          nama,
          updatedAt: now,
          updatedBy: user.uid,
        });

        const response = await fetch("/api/sinkron-kategori", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kategoriId: editId,
            kategoriNama: nama,
            adminUid: user.uid,
          }),
        });

        const result = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(result?.message || "Gagal sinkron kategori");

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

        setKelompokList((prev) =>
          prev.map((item) => {
            if (!item.kategoriIds.includes(editId)) return item;

            const nextKategoriNama = item.kategoriIds.map((id) => {
              if (id === editId) return nama;
              const existingIndex = item.kategoriIds.indexOf(id);
              return item.kategoriNama[existingIndex] || "";
            }).filter(Boolean);

            return {
              ...item,
              kategoriNama: nextKategoriNama,
              updatedAt: now,
            };
          }),
        );

        showSuccess("Kategori berhasil diperbarui");
      } else {
        const newRef = doc(collection(db, "kategori_barang"));
        const newItem: KategoriBarang = {
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
        showSuccess("Kategori berhasil ditambahkan");
      }

      closeModal();
    } catch (e) {
      console.error(e);
      setError("Gagal menyimpan kategori");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleKelompokSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const user = auth.currentUser;
    if (!user || kelompokSubmitLoading) return;

    const validationError = validateKelompokForm();
    if (validationError) {
      setKelompokError(validationError);
      return;
    }

    setKelompokSubmitLoading(true);
    setKelompokError(null);

    try {
      const now = Date.now();
      const toko = tokoList.find((item) => item.id === kelompokForm.tokoId);
      const selectedKategori = data.filter((item) => kelompokForm.kategoriIds.includes(item.id));

      const payload = {
        tokoId: kelompokForm.tokoId,
        tokoNama: toko?.nama || "Tanpa Toko",
        namaKelompok: kelompokForm.namaKelompok.trim(),
        urutan: Number(kelompokForm.urutan || 1),
        kategoriIds: selectedKategori.map((item) => item.id),
        kategoriNama: selectedKategori.map((item) => item.nama),
        aktif: kelompokForm.aktif,
      };

      if (isKelompokEdit && editKelompokId) {
        await updateDoc(doc(db, "kelompok_laporan_kategori", editKelompokId), {
          ...payload,
          updatedAt: now,
          updatedBy: user.uid,
        });

        setKelompokList((prev) =>
          prev
            .map((item) =>
              item.id === editKelompokId
                ? {
                    ...item,
                    ...payload,
                    updatedAt: now,
                  }
                : item,
            )
            .sort((a, b) => {
              const tokoCompare = a.tokoNama.localeCompare(b.tokoNama, "id");
              if (tokoCompare !== 0) return tokoCompare;
              return a.urutan - b.urutan;
            }),
        );

        showSuccess("Kelompok laporan berhasil diperbarui");
      } else {
        const newRef = doc(collection(db, "kelompok_laporan_kategori"));
        const newItem: KelompokLaporanKategori = {
          id: newRef.id,
          ...payload,
          createdAt: now,
        };

        await setDoc(newRef, {
          ...newItem,
          createdBy: user.uid,
        });

        setKelompokList((prev) =>
          [newItem, ...prev].sort((a, b) => {
            const tokoCompare = a.tokoNama.localeCompare(b.tokoNama, "id");
            if (tokoCompare !== 0) return tokoCompare;
            return a.urutan - b.urutan;
          }),
        );

        showSuccess("Kelompok laporan berhasil ditambahkan");
      }

      closeKelompokModal();
    } catch (e) {
      console.error(e);
      setKelompokError("Gagal menyimpan kelompok laporan");
    } finally {
      setKelompokSubmitLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleteLoading) return;

    setDeleteLoading(true);

    try {
      if (deleteTarget.type === "kategori") {
        await deleteDoc(doc(db, "kategori_barang", deleteTarget.item.id));
        setData((prev) => prev.filter((item) => item.id !== deleteTarget.item.id));
        setKelompokList((prev) =>
          prev.map((kelompok) => {
            if (!kelompok.kategoriIds.includes(deleteTarget.item.id)) return kelompok;

            const nextIds = kelompok.kategoriIds.filter((id) => id !== deleteTarget.item.id);
            const nextNama = kelompok.kategoriNama.filter((_, index) => kelompok.kategoriIds[index] !== deleteTarget.item.id);

            return {
              ...kelompok,
              kategoriIds: nextIds,
              kategoriNama: nextNama,
              updatedAt: Date.now(),
            };
          }),
        );
        showSuccess("Kategori berhasil dihapus");
      } else {
        await deleteDoc(doc(db, "kelompok_laporan_kategori", deleteTarget.item.id));
        setKelompokList((prev) => prev.filter((item) => item.id !== deleteTarget.item.id));
        showSuccess("Kelompok laporan berhasil dihapus");
      }

      setDeleteTarget(null);
    } catch (e) {
      console.error(e);
      showError("Gagal menghapus data");
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
                <Tag
                  size={28}
                  className="text-white sm:h-8 sm:w-8"
                  strokeWidth={2.5}
                />
              </div>

              <div className="min-w-0">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                  Kategori Barang
                </h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  Kelola master kategori dan kelompok laporan per toko.
                </p>
              </div>
            </div>

            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <HeaderButton
                onClick={() => router.push("/admin/tambah-barang")}
                icon={Package}
                label="Barang"
              />
              <HeaderButton
                onClick={activeTab === "kategori" ? openAdd : openKelompokAdd}
                icon={Plus}
                label={activeTab === "kategori" ? "Tambah" : "Kelompok"}
              />
              {activeTab === "kelompok" && (
                <HeaderButton
                  onClick={openCopyKelompok}
                  icon={Copy}
                  label="Copy"
                />
              )}
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

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <StatCard
            label="Total Kategori"
            value={stats.total}
            icon={Layers3}
            tone="slate"
          />
          <StatCard
            label="Hasil Filter"
            value={stats.hasilFilter}
            icon={Search}
            tone="sky"
          />
          <StatCard
            label="Kelompok"
            value={stats.totalKelompok}
            icon={FolderKanban}
            tone="blue"
          />
          <StatCard
            label="Toko Diatur"
            value={stats.tokoKelompok}
            icon={Store}
            tone="rose"
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
        >
          <div className="grid grid-cols-2 gap-2">
            <TabButton
              active={activeTab === "kategori"}
              icon={Tag}
              label="Kategori Barang"
              onClick={() => setActiveTab("kategori")}
            />
            <TabButton
              active={activeTab === "kelompok"}
              icon={FolderKanban}
              label="Kelompok Laporan"
              onClick={() => setActiveTab("kelompok")}
            />
          </div>
        </motion.div>

        {activeTab === "kategori" ? (
          <>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.08 }}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FieldBox label="Cari Kategori">
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
                      placeholder="Nama kategori..."
                      className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-4 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                    />
                  </div>
                </FieldBox>

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
                <ActionButton icon={Package} label="Barang" onClick={() => router.push("/admin/tambah-barang")} tone="soft" />
                <ActionButton icon={Plus} label="Tambah" onClick={openAdd} tone="primary" />
                <ActionButton icon={ListFilter} label="Filter" onClick={() => setFilterMobileOpen((prev) => !prev)} tone={filterMobileOpen ? "active" : "white"} />
              </div>

              <MobileFilter open={filterMobileOpen}>
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
              </MobileFilter>
            </motion.div>

            <KategoriSection
              loading={loading}
              paged={paged}
              filtered={filtered}
              page={page}
              totalPages={totalPages}
              itemsPerPage={itemsPerPage}
              goPage={goPage}
              openAdd={openAdd}
              openEdit={openEdit}
              setDeleteTarget={(item) => setDeleteTarget({ type: "kategori", item })}
            />
          </>
        ) : (
          <>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.08 }}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-1">
                  <FieldBox label="Cari Kelompok">
                    <div className="relative">
                      <Search
                        size={14}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                        strokeWidth={2.5}
                      />
                      <input
                        value={searchKelompok}
                        onChange={(e) => {
                          setSearchKelompok(e.target.value);
                          setKelompokPage(1);
                        }}
                        placeholder="Kelompok, toko, kategori..."
                        className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-4 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                      />
                    </div>
                  </FieldBox>
                </div>

                <div className="hidden sm:contents">
                  <FilterSelect
                    label="Filter Toko"
                    value={filterTokoKelompok}
                    onChange={(value) => {
                      setFilterTokoKelompok(value);
                      setKelompokPage(1);
                    }}
                  >
                    <option value="">Semua Toko</option>
                    {tokoList.map((item) => (
                      <option key={item.id} value={item.id}>{item.nama}</option>
                    ))}
                  </FilterSelect>

                  <FilterSelect
                    label="Tampilkan"
                    value={kelompokItemsPerPage}
                    onChange={(value) => {
                      setKelompokItemsPerPage(Number(value));
                      setKelompokPage(1);
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

              <div className="mt-3 grid grid-cols-4 gap-2 sm:hidden">
                <ActionButton icon={Plus} label="Kelompok" onClick={openKelompokAdd} tone="primary" />
                <ActionButton icon={Copy} label="Copy" onClick={openCopyKelompok} tone="soft" />
                <ActionButton icon={Store} label={`${tokoList.length} Toko`} onClick={() => setFilterMobileOpen((prev) => !prev)} tone="soft" />
                <ActionButton icon={ListFilter} label="Filter" onClick={() => setFilterMobileOpen((prev) => !prev)} tone={filterMobileOpen ? "active" : "white"} />
              </div>

              <MobileFilter open={filterMobileOpen}>
                <FilterSelect
                  label="Filter Toko"
                  value={filterTokoKelompok}
                  onChange={(value) => {
                    setFilterTokoKelompok(value);
                    setKelompokPage(1);
                  }}
                >
                  <option value="">Semua Toko</option>
                  {tokoList.map((item) => (
                    <option key={item.id} value={item.id}>{item.nama}</option>
                  ))}
                </FilterSelect>

                <FilterSelect
                  label="Tampilkan"
                  value={kelompokItemsPerPage}
                  onChange={(value) => {
                    setKelompokItemsPerPage(Number(value));
                    setKelompokPage(1);
                  }}
                >
                  {ITEMS_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </FilterSelect>
              </MobileFilter>
            </motion.div>

            <KelompokSection
              loading={loading}
              paged={pagedKelompok}
              filtered={filteredKelompok}
              page={kelompokPage}
              totalPages={totalKelompokPages}
              itemsPerPage={kelompokItemsPerPage}
              goPage={goKelompokPage}
              openAdd={openKelompokAdd}
              openEdit={openKelompokEdit}
              setDeleteTarget={(item) => setDeleteTarget({ type: "kelompok", item })}
            />
          </>
        )}

        <KategoriFormModal
          show={showModal}
          isEdit={isEdit}
          form={form}
          error={error}
          submitLoading={submitLoading}
          setForm={setForm}
          closeModal={closeModal}
          handleSubmit={handleSubmit}
        />

        <KelompokFormModal
          show={showKelompokModal}
          isEdit={isKelompokEdit}
          form={kelompokForm}
          error={kelompokError}
          submitLoading={kelompokSubmitLoading}
          tokoList={tokoList}
          kategoriList={data}
          setForm={setKelompokForm}
          closeModal={closeKelompokModal}
          handleSubmit={handleKelompokSubmit}
        />

        <CopyKelompokModal
          show={showCopyKelompokModal}
          form={copyKelompokForm}
          error={copyKelompokError}
          loading={copyKelompokLoading}
          tokoList={tokoList}
          kelompokList={kelompokList}
          setForm={setCopyKelompokForm}
          closeModal={closeCopyKelompokModal}
          handleSubmit={handleCopyKelompokSubmit}
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

function TabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: any;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-[11px] font-black uppercase tracking-[0.08em] transition sm:text-xs ${
        active
          ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-lg shadow-sky-500/15"
          : "border-2 border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      <Icon size={15} strokeWidth={2.5} />
      {label}
    </button>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  tone,
}: {
  icon: any;
  label: string;
  onClick: () => void;
  tone: "primary" | "soft" | "white" | "active";
}) {
  const cls =
    tone === "primary"
      ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-sm shadow-sky-500/15"
      : tone === "soft"
        ? "border border-sky-200 bg-sky-50 text-sky-700"
        : tone === "active"
          ? "border border-sky-200 bg-sky-100 text-sky-700"
          : "border border-slate-200 bg-white text-slate-600";

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] ${cls}`}
      type="button"
    >
      <Icon size={14} strokeWidth={2.5} />
      {label}
    </motion.button>
  );
}

function MobileFilter({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0, y: -4 }}
          animate={{ opacity: 1, height: "auto", y: 0 }}
          exit={{ opacity: 0, height: 0, y: -4 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="overflow-hidden sm:hidden"
        >
          <div className="mt-3 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
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
  tone: "slate" | "sky" | "blue" | "rose";
}) {
  const cls =
    tone === "sky"
      ? "bg-sky-50 text-sky-600"
      : tone === "blue"
        ? "bg-blue-50 text-blue-600"
        : tone === "rose"
          ? "bg-rose-50 text-rose-600"
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

function Pagination({
  page,
  totalPages,
  goPage,
}: {
  page: number;
  totalPages: number;
  goPage: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
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
  );
}

function KategoriSection({
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
  paged: KategoriBarang[];
  filtered: KategoriBarang[];
  page: number;
  totalPages: number;
  itemsPerPage: number;
  goPage: (page: number) => void;
  openAdd: () => void;
  openEdit: (item: KategoriBarang) => void;
  setDeleteTarget: (item: KategoriBarang) => void;
}) {
  if (loading) {
    return <LoadingState label="Memuat data kategori..." />;
  }

  if (filtered.length === 0) {
    return (
      <EmptyState
        icon={Layers3}
        label="Kategori barang belum tersedia"
        actionLabel="Tambah Kategori"
        onAction={openAdd}
      />
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
                <Tag size={20} strokeWidth={2.5} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black leading-tight text-slate-800">
                      {item.nama}
                    </p>
                    <p className="mt-1 truncate text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                      Master Kategori
                    </p>
                  </div>

                  <span className="inline-flex shrink-0 rounded-full bg-sky-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-sky-700">
                    Aktif
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                  <CardButton icon={Pencil} label="Edit" onClick={() => openEdit(item)} tone="sky" />
                  <CardButton icon={Trash2} label="Hapus" onClick={() => setDeleteTarget(item)} tone="rose" />
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
                {["No", "Nama Kategori", "Aksi"].map((head) => (
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
                      <IconButton icon={Pencil} title="Edit kategori" onClick={() => openEdit(item)} tone="sky" />
                      <IconButton icon={Trash2} title="Hapus kategori" onClick={() => setDeleteTarget(item)} tone="rose" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      <Pagination page={page} totalPages={totalPages} goPage={goPage} />
    </>
  );
}

function KelompokSection({
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
  paged: KelompokLaporanKategori[];
  filtered: KelompokLaporanKategori[];
  page: number;
  totalPages: number;
  itemsPerPage: number;
  goPage: (page: number) => void;
  openAdd: () => void;
  openEdit: (item: KelompokLaporanKategori) => void;
  setDeleteTarget: (item: KelompokLaporanKategori) => void;
}) {
  if (loading) {
    return <LoadingState label="Memuat kelompok laporan..." />;
  }

  if (filtered.length === 0) {
    return (
      <EmptyState
        icon={FolderKanban}
        label="Kelompok laporan belum tersedia"
        actionLabel="Tambah Kelompok"
        onAction={openAdd}
      />
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
                <FolderKanban size={20} strokeWidth={2.5} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black leading-tight text-slate-800">
                      {item.namaKelompok}
                    </p>
                    <p className="mt-1 truncate text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                      {item.tokoNama} · Urutan {item.urutan}
                    </p>
                  </div>

                  <span className={`inline-flex shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${
                    item.aktif ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-500"
                  }`}>
                    {item.aktif ? "Aktif" : "Nonaktif"}
                  </span>
                </div>

                <p className="mt-3 line-clamp-2 border-t border-slate-100 pt-3 text-xs font-semibold leading-relaxed text-slate-600">
                  {item.kategoriNama.length > 0 ? item.kategoriNama.join(", ") : "-"}
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <CardButton icon={Pencil} label="Edit" onClick={() => openEdit(item)} tone="sky" />
                  <CardButton icon={Trash2} label="Hapus" onClick={() => setDeleteTarget(item)} tone="rose" />
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
                {["No", "Toko", "Kelompok", "Kategori", "Status", "Aksi"].map((head) => (
                  <th
                    key={head}
                    className={`whitespace-nowrap px-3 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 ${
                      head === "No" || head === "Aksi" ? "text-center" : "text-left"
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
                    {item.tokoNama || "-"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <p className="font-black text-slate-800">{item.namaKelompok}</p>
                    <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Urutan {item.urutan}
                    </p>
                  </td>
                  <td className="max-w-[360px] px-3 py-3 font-semibold text-slate-600">
                    <p className="line-clamp-2">
                      {item.kategoriNama.length > 0 ? item.kategoriNama.join(", ") : "-"}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`whitespace-nowrap rounded-lg px-2 py-1 text-[10px] font-black ${
                      item.aktif ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-500"
                    }`}>
                      {item.aktif ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <div className="flex justify-center gap-1.5">
                      <IconButton icon={Pencil} title="Edit kelompok" onClick={() => openEdit(item)} tone="sky" />
                      <IconButton icon={Trash2} title="Hapus kelompok" onClick={() => setDeleteTarget(item)} tone="rose" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      <Pagination page={page} totalPages={totalPages} goPage={goPage} />
    </>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="flex flex-col items-center gap-3">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-sky-500"
        />
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          {label}
        </p>
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  label,
  actionLabel,
  onAction,
}: {
  icon: any;
  label: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
        <Icon size={28} className="text-slate-300" strokeWidth={2} />
      </div>
      <p className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
        {label}
      </p>
      <motion.button
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.12, ease: "easeOut" }}
        onClick={onAction}
        className="flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-4 py-2 text-xs font-black text-white shadow-sm shadow-sky-500/15"
        type="button"
      >
        <Plus size={13} strokeWidth={2.5} />
        {actionLabel}
      </motion.button>
    </div>
  );
}

function IconButton({
  icon: Icon,
  title,
  onClick,
  tone,
}: {
  icon: any;
  title: string;
  onClick: () => void;
  tone: "sky" | "rose";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-xl border shadow-sm transition ${
        tone === "sky"
          ? "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
          : "border-rose-300/70 bg-rose-600 text-white shadow-rose-500/15 hover:bg-rose-700"
      }`}
      title={title}
    >
      <Icon size={13} strokeWidth={2.6} />
    </button>
  );
}

function CardButton({
  icon: Icon,
  label,
  onClick,
  tone,
}: {
  icon: any;
  label: string;
  onClick: () => void;
  tone: "sky" | "rose";
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-wide shadow-sm transition ${
        tone === "sky"
          ? "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
          : "border-rose-300/70 bg-rose-600 text-white shadow-rose-500/15 hover:bg-rose-700"
      }`}
      type="button"
    >
      <Icon size={13} strokeWidth={2.6} />
      {label}
    </motion.button>
  );
}

function KategoriFormModal({
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
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
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
                  {isEdit ? "Edit Kategori Barang" : "Tambah Kategori Barang"}
                </p>
                <h2 className="truncate text-base font-black text-slate-800">
                  {form.nama || "Kategori Baru"}
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
                <ErrorBox error={error} />

                <FieldInput
                  label="Nama Kategori"
                  value={form.nama}
                  onChange={(value) => setForm((prev) => ({ ...prev, nama: value }))}
                  icon={Tag}
                  placeholder="Contoh: HP, Aksesoris, Laptop"
                />

                <div className="grid grid-cols-2 gap-2 pt-1 sm:flex sm:justify-end">
                  <ModalCancelButton onClick={closeModal} disabled={submitLoading} />
                  <ModalSubmitButton loading={submitLoading} isEdit={isEdit} />
                </div>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function KelompokFormModal({
  show,
  isEdit,
  form,
  error,
  submitLoading,
  tokoList,
  kategoriList,
  setForm,
  closeModal,
  handleSubmit,
}: {
  show: boolean;
  isEdit: boolean;
  form: KelompokFormState;
  error: string | null;
  submitLoading: boolean;
  tokoList: Toko[];
  kategoriList: KategoriBarang[];
  setForm: React.Dispatch<React.SetStateAction<KelompokFormState>>;
  closeModal: () => void;
  handleSubmit: (e: React.FormEvent) => void;
}) {
  const toggleKategori = (kategoriId: string) => {
    setForm((prev) => {
      const exists = prev.kategoriIds.includes(kategoriId);
      return {
        ...prev,
        kategoriIds: exists
          ? prev.kategoriIds.filter((id) => id !== kategoriId)
          : [...prev.kategoriIds, kategoriId],
      };
    });
  };

  const selectedCount = form.kategoriIds.length;

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
            className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">
                  {isEdit ? "Edit Kelompok Laporan" : "Tambah Kelompok Laporan"}
                </p>
                <h2 className="truncate text-base font-black text-slate-800">
                  {form.namaKelompok || "Kelompok Baru"}
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
              className="max-h-[calc(90vh-65px)] overflow-y-auto p-4 sm:p-5"
            >
              <div className="space-y-3">
                <ErrorBox error={error} />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <FieldSelect
                    label="Toko"
                    value={form.tokoId}
                    onChange={(value) => setForm((prev) => ({ ...prev, tokoId: value }))}
                    icon={Store}
                  >
                    <option value="">Pilih Toko</option>
                    {tokoList.map((item) => (
                      <option key={item.id} value={item.id}>{item.nama}</option>
                    ))}
                  </FieldSelect>

                  <FieldInput
                    label="Nama Kelompok"
                    value={form.namaKelompok}
                    onChange={(value) => setForm((prev) => ({ ...prev, namaKelompok: value }))}
                    icon={FolderKanban}
                    placeholder="Contoh: Kelompok 1"
                    className="sm:col-span-1"
                  />

                  <FieldInput
                    label="Urutan"
                    value={form.urutan}
                    onChange={(value) =>
                      setForm((prev) => ({ ...prev, urutan: value.replace(/[^\d]/g, "") }))
                    }
                    icon={Layers3}
                    inputMode="numeric"
                    placeholder="1"
                  />

                  <FieldSelect
                    label="Status"
                    value={String(form.aktif)}
                    onChange={(value) => setForm((prev) => ({ ...prev, aktif: value === "true" }))}
                    icon={CheckCircle2}
                  >
                    <option value="true">Aktif</option>
                    <option value="false">Nonaktif</option>
                  </FieldSelect>

                  <div className="rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2.5 sm:col-span-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">
                      Kategori Dipilih
                    </p>
                    <p className="mt-1 text-xs font-black text-sky-700">
                      {selectedCount} kategori masuk ke kelompok ini
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Pilih Kategori
                      </p>
                      <p className="mt-0.5 text-xs font-semibold text-slate-500">
                        Centang kategori yang akan dihitung dalam kelompok ini.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          kategoriIds:
                            prev.kategoriIds.length === kategoriList.length
                              ? []
                              : kategoriList.map((item) => item.id),
                        }))
                      }
                      className="rounded-full border border-sky-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-sky-700 shadow-sm"
                    >
                      {form.kategoriIds.length === kategoriList.length ? "Kosongkan" : "Pilih Semua"}
                    </button>
                  </div>

                  {kategoriList.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-white p-5 text-center text-xs font-bold text-slate-400">
                      Kategori belum tersedia.
                    </div>
                  ) : (
                    <div className="grid max-h-[280px] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                      {kategoriList.map((item) => {
                        const active = form.kategoriIds.includes(item.id);

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => toggleKategori(item.id)}
                            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                              active
                                ? "border-sky-200 bg-sky-50 text-sky-800"
                                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            <span
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-lg border ${
                                active
                                  ? "border-sky-500 bg-sky-500 text-white"
                                  : "border-slate-300 bg-white text-transparent"
                              }`}
                            >
                              <Check size={13} strokeWidth={3} />
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm font-black">
                              {item.nama}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 sm:flex sm:justify-end">
                  <ModalCancelButton onClick={closeModal} disabled={submitLoading} />
                  <ModalSubmitButton loading={submitLoading} isEdit={isEdit} />
                </div>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}


function CopyKelompokModal({
  show,
  form,
  error,
  loading,
  tokoList,
  kelompokList,
  setForm,
  closeModal,
  handleSubmit,
}: {
  show: boolean;
  form: CopyKelompokFormState;
  error: string | null;
  loading: boolean;
  tokoList: Toko[];
  kelompokList: KelompokLaporanKategori[];
  setForm: React.Dispatch<React.SetStateAction<CopyKelompokFormState>>;
  closeModal: () => void;
  handleSubmit: (e: React.FormEvent) => void;
}) {
  const sumberKelompok = kelompokList.filter((item) => item.tokoId === form.sumberTokoId);
  const tujuanKelompok = kelompokList.filter((item) => item.tokoId === form.tujuanTokoId);
  const sumberTokoNama = tokoList.find((item) => item.id === form.sumberTokoId)?.nama || "Toko sumber";
  const tujuanTokoNama = tokoList.find((item) => item.id === form.tujuanTokoId)?.nama || "Toko tujuan";

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && !loading) closeModal();
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">
                  Copy Kelompok Laporan
                </p>
                <h2 className="truncate text-base font-black text-slate-800">
                  Dari {sumberTokoNama} ke {tujuanTokoNama}
                </h2>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={loading}
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
                <ErrorBox error={error} />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FieldSelect
                    label="Toko Sumber"
                    value={form.sumberTokoId}
                    onChange={(value) =>
                      setForm((prev) => ({
                        ...prev,
                        sumberTokoId: value,
                        tujuanTokoId: prev.tujuanTokoId === value ? "" : prev.tujuanTokoId,
                      }))
                    }
                    icon={Store}
                  >
                    <option value="">Pilih toko sumber</option>
                    {tokoList.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nama}
                      </option>
                    ))}
                  </FieldSelect>

                  <FieldSelect
                    label="Toko Tujuan"
                    value={form.tujuanTokoId}
                    onChange={(value) =>
                      setForm((prev) => ({
                        ...prev,
                        tujuanTokoId: value,
                        sumberTokoId: prev.sumberTokoId === value ? "" : prev.sumberTokoId,
                      }))
                    }
                    icon={Store}
                  >
                    <option value="">Pilih toko tujuan</option>
                    {tokoList.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nama}
                      </option>
                    ))}
                  </FieldSelect>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-2xl border border-sky-100 bg-sky-50/70 px-3 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">
                      Kelompok Sumber
                    </p>
                    <p className="mt-1 text-lg font-black text-sky-700">
                      {sumberKelompok.length}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Kelompok Tujuan
                    </p>
                    <p className="mt-1 text-lg font-black text-slate-700">
                      {tujuanKelompok.length}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      replaceExisting: !prev.replaceExisting,
                    }))
                  }
                  className={`flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                    form.replaceExisting
                      ? "border-rose-200 bg-rose-50 text-rose-800"
                      : "border-slate-200 bg-slate-50 text-slate-700"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-lg border ${
                      form.replaceExisting
                        ? "border-rose-500 bg-rose-500 text-white"
                        : "border-slate-300 bg-white text-transparent"
                    }`}
                  >
                    <Check size={13} strokeWidth={3} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-black">
                      Timpa kelompok yang sudah ada di toko tujuan
                    </span>
                    <span className="mt-1 block text-xs font-semibold leading-relaxed opacity-75">
                      Jika aktif, semua kelompok lama di toko tujuan akan diganti dengan salinan dari toko sumber.
                      Jika nonaktif, sistem hanya menyalin kelompok yang namanya belum ada.
                    </span>
                  </span>
                </button>

                {sumberKelompok.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                    <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Daftar Kelompok Yang Akan Dicopy
                    </p>
                    <div className="max-h-[210px] space-y-2 overflow-y-auto pr-1">
                      {sumberKelompok
                        .sort((a, b) => a.urutan - b.urutan)
                        .map((item) => (
                          <div key={item.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <div className="flex items-center justify-between gap-3">
                              <p className="truncate text-sm font-black text-slate-800">{item.namaKelompok}</p>
                              <span className="shrink-0 rounded-lg bg-sky-50 px-2 py-1 text-[9px] font-black uppercase text-sky-700">
                                Urutan {item.urutan}
                              </span>
                            </div>
                            <p className="mt-1 line-clamp-1 text-[11px] font-semibold text-slate-500">
                              {item.kategoriNama.length > 0 ? item.kategoriNama.join(", ") : "-"}
                            </p>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 pt-1 sm:flex sm:justify-end">
                  <ModalCancelButton onClick={closeModal} disabled={loading} />
                  <ModalSubmitButton loading={loading} isEdit={false} label="Copy Kelompok" />
                </div>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}


function ErrorBox({ error }: { error: string | null }) {
  return (
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
  );
}

function ModalCancelButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <X size={16} strokeWidth={2.5} />
      Batal
    </button>
  );
}

function ModalSubmitButton({
  loading,
  isEdit,
  label,
}: {
  loading: boolean;
  isEdit: boolean;
  label?: string;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-4 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-lg shadow-sky-500/15 transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? (
        <Loader2 size={16} className="animate-spin" />
      ) : isEdit ? (
        <Pencil size={16} strokeWidth={2.5} />
      ) : label ? (
        <Copy size={16} strokeWidth={2.5} />
      ) : (
        <Plus size={16} strokeWidth={2.5} />
      )}
      {loading ? "Proses" : label || (isEdit ? "Update" : "Simpan")}
    </button>
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

function FieldSelect({
  label,
  value,
  onChange,
  children,
  icon: Icon,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  icon?: any;
}) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
        {Icon && <Icon size={11} strokeWidth={2.5} />}
        {label}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 pr-8 text-sm font-semibold text-slate-700 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
        >
          {children}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
      </div>
    </div>
  );
}

function DeleteModal({
  target,
  loading,
  onClose,
  onDelete,
}: {
  target: DeleteTarget;
  loading: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  const title = target?.type === "kelompok" ? "Hapus Kelompok" : "Hapus Kategori";
  const name =
    target?.type === "kelompok"
      ? target.item.namaKelompok
      : target?.type === "kategori"
        ? target.item.nama
        : "";
  const subtitle =
    target?.type === "kelompok"
      ? `${target.item.tokoNama} · ${target.item.kategoriNama.length} kategori`
      : "Master Kategori Barang";

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
                    {title}
                  </h2>
                  <p className="mt-0.5 max-w-[220px] truncate text-[10px] font-bold uppercase tracking-[0.15em] text-white/70">
                    {name}
                  </p>
                </div>
              </div>
              <div className="pointer-events-none absolute right-0 top-0 opacity-10">
                <Cpu size={100} strokeWidth={1} className="text-white" />
              </div>
            </div>

            <div className="space-y-3 p-5">
              <p className="text-[11px] font-semibold text-slate-600">
                Anda yakin mau menghapus data ini?
              </p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-black text-slate-800">
                  {name}
                </p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {subtitle}
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
