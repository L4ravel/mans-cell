// Halaman admin untuk mengatur jam absensi default, per toko, dan per karyawan.
// Revisi:
// - Layout disamakan dengan pengaturan jam PTK.
// - Mendukung effectiveSchedules agar perubahan jadwal per hari berlaku mulai tanggal tertentu.
// - Tanggal sebelum effectiveFrom tetap mengikuti jadwal lama.
// - Jadwal per tanggal disimpan ke monthlyOverrides karena hanya berlaku pada tanggal spesifik.
// - Pilihan Jadwal Per Hari / Per Tanggal karyawan disimpan sebagai jenisPengaturan.
// - Popup hanya muncul jika karyawan belum punya jenisPengaturan.
// - Reset karyawan menghapus dokumen individu, sehingga popup akan muncul lagi saat dipilih ulang.
// - Karyawan yang ada di karyawan_tidak_wajib_absen aktif disembunyikan dari pemilihan individu.

"use client";

import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Cpu,
  History,
  Info,
  Loader2,
  Moon,
  RotateCcw,
  Save,
  Search,
  Store,
  UserCog,
  X,
} from "lucide-react";

type Karyawan = {
  id: string;
  uid: string;
  nama: string;
  tokoId: string;
  tokoNama: string;
  email?: string;
};

type KaryawanActiveItem = {
  karyawanId: string;
  nama: string;
  tokoId: string;
  tokoNama: string;
};

type TokoItem = {
  id: string;
  nama: string;
};

type DaySchedule = {
  enabled: boolean;
  jamMasuk: string;
  jamPulang: string;
  lintasTanggal?: boolean;
};

type JadwalForm = {
  weeklySchedule: Record<number, DaySchedule>;
  monthlyOverrides: Record<string, Record<string, DaySchedule>>;
};

type EffectiveSchedule = {
  effectiveFrom: string;
  weeklySchedule?: Record<string | number, Partial<DaySchedule>>;
  monthlyOverrides?: Record<string, Record<string, Partial<DaySchedule>>>;
  note?: string;
  createdAt?: any;
  createdBy?: string;
};

type TouchedWeeklyMap = Record<number, boolean>;
type TouchedMonthlyMap = Record<string, Record<string, boolean>>;

type TargetInfo = {
  saved: boolean;
  label: string;
  description: string;
};

const HARI = ["Ahad", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

function getTodayDateString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const createDefaultWeeklySchedule = (): Record<number, DaySchedule> => ({
  0: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00", lintasTanggal: false },
  1: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00", lintasTanggal: false },
  2: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00", lintasTanggal: false },
  3: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00", lintasTanggal: false },
  4: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00", lintasTanggal: false },
  5: { enabled: false, jamMasuk: "07:30", jamPulang: "14:00", lintasTanggal: false },
  6: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00", lintasTanggal: false },
});

function cloneDefaultForm(): JadwalForm {
  return {
    weeklySchedule: createDefaultWeeklySchedule(),
    monthlyOverrides: {},
  };
}

function createEmptyTouchedWeekly(): TouchedWeeklyMap {
  return {
    0: false,
    1: false,
    2: false,
    3: false,
    4: false,
    5: false,
    6: false,
  };
}

function createAllTouchedWeekly(): TouchedWeeklyMap {
  return {
    0: true,
    1: true,
    2: true,
    3: true,
    4: true,
    5: true,
    6: true,
  };
}

function getCurrentMonthValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function createDefaultDateSchedule(fromWeekly?: DaySchedule): DaySchedule {
  return {
    enabled: fromWeekly?.enabled ?? true,
    jamMasuk: fromWeekly?.jamMasuk ?? "07:30",
    jamPulang: fromWeekly?.jamPulang ?? "14:00",
    lintasTanggal: fromWeekly?.lintasTanggal ?? false,
  };
}

function normalizeWeeklySchedule(data: any): Record<number, DaySchedule> {
  const defaultWeekly = createDefaultWeeklySchedule();

  if (data?.weeklySchedule && typeof data.weeklySchedule === "object") {
    const normalized: Record<number, DaySchedule> = { ...defaultWeekly };

    for (let i = 0; i < 7; i++) {
      const raw = data.weeklySchedule?.[i] ?? data.weeklySchedule?.[String(i)];

      if (raw) {
        normalized[i] = {
          enabled:
            typeof raw.enabled === "boolean"
              ? raw.enabled
              : defaultWeekly[i].enabled,
          jamMasuk: raw.jamMasuk || defaultWeekly[i].jamMasuk,
          jamPulang: raw.jamPulang || defaultWeekly[i].jamPulang,
          lintasTanggal:
            typeof raw.lintasTanggal === "boolean" ? raw.lintasTanggal : false,
        };
      }
    }

    return normalized;
  }

  const jamMasuk = data?.jamMasuk || "07:30";
  const jamPulang = data?.jamPulang || "14:00";
  const hariLibur = Array.isArray(data?.hariLibur) ? data.hariLibur : [5];

  const migrated: Record<number, DaySchedule> = {};

  for (let i = 0; i < 7; i++) {
    migrated[i] = {
      enabled: !hariLibur.includes(i),
      jamMasuk,
      jamPulang,
      lintasTanggal: false,
    };
  }

  return migrated;
}

function getDaysInMonth(monthValue: string) {
  const [yearStr, monthStr] = monthValue.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);

  if (!year || !month) return [];

  const totalDays = new Date(year, month, 0).getDate();
  const dates: Array<{
    dateKey: string;
    dayNumber: number;
    dayIndex: number;
    dayName: string;
  }> = [];

  for (let day = 1; day <= totalDays; day++) {
    const date = new Date(year, month - 1, day);
    const dayIndex = date.getDay();
    const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    dates.push({
      dateKey,
      dayNumber: day,
      dayIndex,
      dayName: HARI[dayIndex],
    });
  }

  return dates;
}

function getHariLiburFromWeeklySchedule(
  weeklySchedule: Record<number, DaySchedule>,
): number[] {
  return Array.from({ length: 7 }, (_, index) => index).filter(
    (dayIndex) => !weeklySchedule[dayIndex]?.enabled,
  );
}

function getTanggalShiftLintasTanggal(
  monthlyOverrides: Record<string, Record<string, DaySchedule>>,
): string[] {
  const dates: string[] = [];

  Object.entries(monthlyOverrides).forEach(([, monthDates]) => {
    Object.entries(monthDates || {}).forEach(([dateKey, schedule]) => {
      if (schedule?.enabled && schedule?.lintasTanggal) {
        dates.push(dateKey);
      }
    });
  });

  return dates.sort();
}

function mergeScheduleData(baseData: any, overrideData: any) {
  const merged = {
    ...(baseData || {}),
    ...(overrideData || {}),
    weeklySchedule: {
      ...(baseData?.weeklySchedule || {}),
      ...(overrideData?.weeklySchedule || {}),
    },
    monthlyOverrides: {
      ...(baseData?.monthlyOverrides || {}),
      ...(overrideData?.monthlyOverrides || {}),
    },
  };

  Object.entries(overrideData?.monthlyOverrides || {}).forEach(
    ([monthKey, dates]) => {
      merged.monthlyOverrides[monthKey] = {
        ...(baseData?.monthlyOverrides?.[monthKey] || {}),
        ...(dates as Record<string, any>),
      };
    },
  );

  return merged;
}

function normalizeEffectiveSchedules(data: any): EffectiveSchedule[] {
  if (!Array.isArray(data?.effectiveSchedules)) return [];

  return data.effectiveSchedules
    .filter((item: any) => {
      return (
        item &&
        typeof item === "object" &&
        typeof item.effectiveFrom === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(item.effectiveFrom)
      );
    })
    .sort((a: EffectiveSchedule, b: EffectiveSchedule) =>
      a.effectiveFrom.localeCompare(b.effectiveFrom),
    );
}

function removeEffectiveMeta(data: any) {
  const { effectiveSchedules, ...rest } = data || {};
  return rest;
}

function resolveEffectiveDataForDate(data: any, dateKey: string) {
  if (!data) return null;

  const base = removeEffectiveMeta(data);
  const schedules = normalizeEffectiveSchedules(data);

  let resolved = { ...base };

  schedules.forEach((entry) => {
    if (entry.effectiveFrom <= dateKey) {
      resolved = mergeScheduleData(resolved, {
        weeklySchedule: entry.weeklySchedule || {},
        monthlyOverrides: entry.monthlyOverrides || {},
      });
    }
  });

  return resolved;
}

function mergeFormWithData(baseForm: JadwalForm, data: any): JadwalForm {
  const nextForm: JadwalForm = {
    weeklySchedule: { ...baseForm.weeklySchedule },
    monthlyOverrides: { ...baseForm.monthlyOverrides },
  };

  if (data?.weeklySchedule && typeof data.weeklySchedule === "object") {
    for (let i = 0; i < 7; i++) {
      const raw = data.weeklySchedule?.[i] ?? data.weeklySchedule?.[String(i)];
      if (!raw) continue;

      nextForm.weeklySchedule[i] = {
        enabled:
          typeof raw.enabled === "boolean"
            ? raw.enabled
            : (nextForm.weeklySchedule[i]?.enabled ?? true),
        jamMasuk:
          raw.jamMasuk || nextForm.weeklySchedule[i]?.jamMasuk || "07:30",
        jamPulang:
          raw.jamPulang || nextForm.weeklySchedule[i]?.jamPulang || "14:00",
        lintasTanggal:
          typeof raw.lintasTanggal === "boolean" ? raw.lintasTanggal : false,
      };
    }
  } else if (
    data &&
    (typeof data?.jamMasuk === "string" ||
      typeof data?.jamPulang === "string" ||
      Array.isArray(data?.hariLibur))
  ) {
    const legacyWeekly = normalizeWeeklySchedule(data);

    for (let i = 0; i < 7; i++) {
      nextForm.weeklySchedule[i] = legacyWeekly[i];
    }
  }

  if (data?.monthlyOverrides && typeof data.monthlyOverrides === "object") {
    Object.entries(data.monthlyOverrides).forEach(([monthKey, dates]) => {
      if (!dates || typeof dates !== "object") return;

      nextForm.monthlyOverrides[monthKey] = {
        ...(nextForm.monthlyOverrides[monthKey] || {}),
      };

      Object.entries(dates as Record<string, any>).forEach(([dateKey, raw]) => {
        const fallbackDayIndex = new Date(`${dateKey}T00:00:00`).getDay();
        const fallbackBase =
          nextForm.monthlyOverrides[monthKey]?.[dateKey] ||
          createDefaultDateSchedule(nextForm.weeklySchedule[fallbackDayIndex]);

        nextForm.monthlyOverrides[monthKey][dateKey] = {
          enabled:
            typeof raw?.enabled === "boolean"
              ? raw.enabled
              : fallbackBase.enabled,
          jamMasuk: raw?.jamMasuk || fallbackBase.jamMasuk,
          jamPulang: raw?.jamPulang || fallbackBase.jamPulang,
          lintasTanggal:
            typeof raw?.lintasTanggal === "boolean" ? raw.lintasTanggal : false,
        };
      });
    });
  }

  return nextForm;
}

function getTouchedWeeklyFromData(data: any): TouchedWeeklyMap {
  const touched = createEmptyTouchedWeekly();

  if (data?.weeklySchedule && typeof data.weeklySchedule === "object") {
    for (let i = 0; i < 7; i++) {
      const raw = data.weeklySchedule?.[i] ?? data.weeklySchedule?.[String(i)];
      touched[i] = !!raw;
    }

    return touched;
  }

  if (
    data &&
    (typeof data?.jamMasuk === "string" ||
      typeof data?.jamPulang === "string" ||
      Array.isArray(data?.hariLibur))
  ) {
    for (let i = 0; i < 7; i++) touched[i] = true;
  }

  return touched;
}

function getTouchedMonthlyFromData(data: any): TouchedMonthlyMap {
  const touched: TouchedMonthlyMap = {};

  if (!data?.monthlyOverrides || typeof data.monthlyOverrides !== "object") {
    return touched;
  }

  Object.entries(data.monthlyOverrides).forEach(([monthKey, dates]) => {
    if (!dates || typeof dates !== "object") return;

    touched[monthKey] = {};

    Object.keys(dates as Record<string, any>).forEach((dateKey) => {
      touched[monthKey][dateKey] = true;
    });
  });

  return touched;
}

function getWeeklyCardClass(enabled: boolean, touched: boolean) {
  if (!enabled) return "border-slate-200 bg-slate-50";
  if (touched) return "border-emerald-200 bg-emerald-50/60";
  return "border-emerald-200 bg-emerald-50/40";
}

function getDateCardClass(
  enabled: boolean,
  touched: boolean,
  lintasTanggal?: boolean,
) {
  if (!enabled) return "border-slate-200 bg-slate-50";
  if (lintasTanggal) return "border-violet-200 bg-violet-50/60";
  if (touched) return "border-emerald-200 bg-emerald-50/60";
  return "border-emerald-200 bg-emerald-50/40";
}

function getStatusText(enabled: boolean, touched: boolean) {
  if (!enabled) return "Libur";
  if (touched) return "Diatur di level ini";
  return "Belum disimpan di level ini";
}

function getStatusTextClass(
  enabled: boolean,
  touched: boolean,
  lintasTanggal?: boolean,
) {
  if (!enabled) return "text-slate-400";
  if (lintasTanggal) return "text-violet-500";
  if (touched) return "text-emerald-500";
  return "text-emerald-500";
}

function getFieldClass(
  enabled: boolean,
  touched: boolean,
  disabled: boolean,
  lintasTanggal?: boolean,
) {
  if (disabled) {
    return "w-full rounded-xl border-2 border-slate-200 bg-slate-100 px-3 py-2.5 text-sm font-semibold text-slate-400 disabled:cursor-not-allowed";
  }

  if (lintasTanggal) {
    return "w-full rounded-xl border-2 border-violet-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 transition-all focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/20";
  }

  if (touched) {
    return "w-full rounded-xl border-2 border-emerald-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 transition-all focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20";
  }

  if (enabled) {
    return "w-full rounded-xl border-2 border-emerald-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 transition-all focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20";
  }

  return "w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 transition-all focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20";
}

export default function PengaturanJamPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [jenisLoading, setJenisLoading] = useState(false);
  const [karyawanActiveLoading, setKaryawanActiveLoading] = useState(false);

  const [karyawanList, setKaryawanList] = useState<Karyawan[]>([]);
  const [tokoList, setTokoList] = useState<TokoItem[]>([]);
  const [karyawanActiveList, setKaryawanActiveList] = useState<
    KaryawanActiveItem[]
  >([]);
  const [tidakWajibAbsensiIds, setTidakWajibAbsensiIds] = useState<string[]>([]);

  const [mode, setMode] = useState<"default" | "toko" | "karyawan">("default");
  const [selectedTokoId, setSelectedTokoId] = useState("");
  const [selectedKaryawanId, setSelectedKaryawanId] = useState("");
  const [search, setSearch] = useState("");

  const [jenisKaryawan, setJenisKaryawan] = useState<"hari" | "tanggal" | null>(
    null,
  );
  const [showJenisModal, setShowJenisModal] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthValue());
  const [effectiveFrom, setEffectiveFrom] = useState(getTodayDateString());

  const [form, setForm] = useState<JadwalForm>(cloneDefaultForm());
  const [weeklyTouched, setWeeklyTouched] = useState<TouchedWeeklyMap>(
    createEmptyTouchedWeekly(),
  );
  const [monthlyTouched, setMonthlyTouched] = useState<TouchedMonthlyMap>({});
  const [targetInfo, setTargetInfo] = useState<TargetInfo>({
    saved: false,
    label: "Default sistem",
    description:
      "Default sistem menjadi jadwal dasar. Toko mengikuti default ini, dan karyawan mengikuti toko jika tidak punya pengaturan individu.",
  });

  const [toast, setToast] = useState<{
    type: "ok" | "err";
    msg: string;
  } | null>(null);

  const showToast = (type: "ok" | "err", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 2400);
  };

  const selectedToko = useMemo(
    () => tokoList.find((t) => t.id === selectedTokoId) || null,
    [tokoList, selectedTokoId],
  );

  const selectedKaryawan = useMemo(
    () => karyawanList.find((k) => k.id === selectedKaryawanId) || null,
    [karyawanList, selectedKaryawanId],
  );

  const filteredKaryawan = useMemo(() => {
    const keyword = search.toLowerCase();

    return karyawanList.filter((k) => {
      if (tidakWajibAbsensiIds.includes(k.id)) return false;
      return k.nama.toLowerCase().includes(keyword);
    });
  }, [karyawanList, search, tidakWajibAbsensiIds]);

  const filteredKaryawanActiveList = useMemo(() => {
    const keyword = search.toLowerCase();

    return karyawanActiveList.filter((item) => {
      if (tidakWajibAbsensiIds.includes(item.karyawanId)) return false;

      const matchToko = selectedTokoId ? item.tokoId === selectedTokoId : true;
      const matchNama = item.nama.toLowerCase().includes(keyword);

      return matchToko && matchNama;
    });
  }, [karyawanActiveList, selectedTokoId, search, tidakWajibAbsensiIds]);

  const monthDates = useMemo(
    () => getDaysInMonth(selectedMonth),
    [selectedMonth],
  );

  const currentMonthOverrides = useMemo(() => {
    return form.monthlyOverrides[selectedMonth] || {};
  }, [form.monthlyOverrides, selectedMonth]);

  const currentMonthTouched = useMemo(() => {
    return monthlyTouched[selectedMonth] || {};
  }, [monthlyTouched, selectedMonth]);

  const isWeeklyEditor =
    mode === "default" ||
    mode === "toko" ||
    (mode === "karyawan" && jenisKaryawan === "hari");

  const updateWeeklySchedule = (
    dayIndex: number,
    key: keyof DaySchedule,
    value: boolean | string,
  ) => {
    setForm((prev) => ({
      ...prev,
      weeklySchedule: {
        ...prev.weeklySchedule,
        [dayIndex]: {
          ...prev.weeklySchedule[dayIndex],
          [key]: value,
        },
      },
    }));

    setWeeklyTouched((prev) => ({
      ...prev,
      [dayIndex]: true,
    }));
  };

  const updateDateSchedule = (
    dateKey: string,
    key: keyof DaySchedule,
    value: boolean | string,
  ) => {
    setForm((prev) => {
      const fallbackDayIndex = new Date(`${dateKey}T00:00:00`).getDay();
      const base =
        prev.monthlyOverrides[selectedMonth]?.[dateKey] ||
        createDefaultDateSchedule(prev.weeklySchedule[fallbackDayIndex]);

      return {
        ...prev,
        monthlyOverrides: {
          ...prev.monthlyOverrides,
          [selectedMonth]: {
            ...(prev.monthlyOverrides[selectedMonth] || {}),
            [dateKey]: {
              ...base,
              [key]: value,
            },
          },
        },
      };
    });

    setMonthlyTouched((prev) => ({
      ...prev,
      [selectedMonth]: {
        ...(prev[selectedMonth] || {}),
        [dateKey]: true,
      },
    }));
  };

  const fetchTokoList = async () => {
    try {
      const qRef = query(collection(db, "toko"), orderBy("nama"));
      const snap = await getDocs(qRef);

      const list: TokoItem[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();

        return {
          id: docSnap.id,
          nama: d.nama || d.kode || docSnap.id,
        };
      });

      setTokoList(list);
    } catch (error) {
      console.error("Gagal fetch toko:", error);
      setTokoList([]);
    }
  };

  const fetchTidakWajibAbsensiIds = async () => {
    try {
      const snap = await getDocs(collection(db, "karyawan_tidak_wajib_absen"));

      const ids = snap.docs
        .map((docSnap) => {
          const d = docSnap.data() as any;
          const status = String(d?.status || "").toLowerCase();
          const aktif =
            d?.aktif === true ||
            d?.isActive === true ||
            status === "aktif" ||
            status === "active" ||
            !status;

          return aktif ? d?.karyawanId || "" : "";
        })
        .filter(Boolean);

      setTidakWajibAbsensiIds(Array.from(new Set(ids)));
    } catch (error) {
      console.error("Gagal fetch tidak wajib absensi:", error);
      setTidakWajibAbsensiIds([]);
    }
  };

  const fetchKaryawanByToko = async (tokoId?: string) => {
    try {
      if (!tokoId) {
        setKaryawanList([]);
        return;
      }

      const tokoNama = tokoList.find((t) => t.id === tokoId)?.nama || "";

      let snap;

      try {
        const qRef = query(
          collection(db, "users"),
          where("tokoId", "==", tokoId),
          where("role", "==", "karyawan"),
          orderBy("nama"),
        );
        snap = await getDocs(qRef);
      } catch {
        const fallbackQRef = query(
          collection(db, "users"),
          where("tokoId", "==", tokoId),
          orderBy("nama"),
        );
        snap = await getDocs(fallbackQRef);
      }

      const list: Karyawan[] = snap.docs
        .map((docSnap) => {
          const d = docSnap.data();

          const isKaryawan =
            d.role === "karyawan" ||
            (Array.isArray(d.roles) && d.roles.includes("karyawan"));

          const karyawanId =
            d.karyawanId ||
            d.permissions?.karyawanId ||
            d.permissions?.karyawanid ||
            "";

          const userTokoId = d.tokoId || d.permissions?.tokoId || d.toko?.id || "";
          const userTokoNama = d.tokoNama || d.toko?.nama || tokoNama;

          if (!isKaryawan || !karyawanId) return null;

          return {
            id: karyawanId,
            uid: d.uid || docSnap.id,
            nama: d.nama || "",
            tokoId: userTokoId,
            tokoNama: userTokoNama,
            email: d.email || "",
          };
        })
        .filter(Boolean) as Karyawan[];

      setKaryawanList(list);
    } catch (error) {
      console.error("Gagal fetch karyawan by toko:", error);
      setKaryawanList([]);
    }
  };

  const fetchKaryawanActiveList = async () => {
    setKaryawanActiveLoading(true);

    try {
      const qRef = query(
        collection(db, "pengaturan_jam_absensi"),
        where("scope", "==", "karyawan"),
        orderBy("nama"),
      );
      const snap = await getDocs(qRef);

      const list: KaryawanActiveItem[] = snap.docs
        .map((docSnap) => {
          const d = docSnap.data();

          return {
            karyawanId: d.karyawanId || "",
            nama: d.nama || "",
            tokoId: d.tokoId || "",
            tokoNama: d.tokoNama || "",
          };
        })
        .filter((item) => item.karyawanId);

      setKaryawanActiveList(list);
    } catch (error) {
      console.error("Gagal fetch karyawan aktif:", error);
      setKaryawanActiveList([]);
    } finally {
      setKaryawanActiveLoading(false);
    }
  };

  const loadJenisPengaturanFromDb = async (karyawanId: string) => {
    setJenisLoading(true);

    try {
      const snap = await getDoc(
        doc(db, "pengaturan_jam_absensi", `karyawan_${karyawanId}`),
      );
      const data = snap.exists() ? snap.data() : null;
      const savedJenis = data?.jenisPengaturan;

      if (savedJenis === "hari" || savedJenis === "tanggal") {
        setJenisKaryawan(savedJenis);
        setShowJenisModal(false);
        return;
      }

      setJenisKaryawan(null);
      setShowJenisModal(true);
    } catch (error) {
      console.error("Gagal membaca jenis pengaturan karyawan:", error);
      setJenisKaryawan(null);
      setShowJenisModal(true);
    } finally {
      setJenisLoading(false);
    }
  };

  const loadTargetData = async () => {
    setLoading(true);

    try {
      const defaultSnap = await getDoc(
        doc(db, "pengaturan_jam_absensi", "default"),
      );
      const defaultData = defaultSnap.exists() ? defaultSnap.data() : null;
      const defaultEffectiveData = defaultData
        ? resolveEffectiveDataForDate(defaultData, effectiveFrom) || defaultData
        : null;

      let resolvedForm = cloneDefaultForm();

      if (defaultEffectiveData) {
        resolvedForm = mergeFormWithData(resolvedForm, defaultEffectiveData);
      }

      if (mode === "default") {
        setForm(resolvedForm);
        setWeeklyTouched(
          defaultData
            ? getTouchedWeeklyFromData(defaultEffectiveData)
            : createEmptyTouchedWeekly(),
        );
        setMonthlyTouched(
          defaultData ? getTouchedMonthlyFromData(defaultEffectiveData) : {},
        );
        setTargetInfo({
          saved: defaultSnap.exists(),
          label: defaultSnap.exists()
            ? "Jadwal default sistem"
            : "Jadwal default sistem belum disimpan",
          description: defaultSnap.exists()
            ? `Jadwal yang tampil adalah jadwal yang berlaku pada ${effectiveFrom}. Jika disimpan, perubahan berlaku mulai tanggal tersebut.`
            : "Form dimulai dari jadwal awal sistem. Simpan agar toko dan karyawan punya jadwal dasar yang jelas.",
        });
        return;
      }

      if (!selectedTokoId) {
        setForm(resolvedForm);
        setWeeklyTouched(createEmptyTouchedWeekly());
        setMonthlyTouched({});
        setTargetInfo({
          saved: defaultSnap.exists(),
          label:
            mode === "toko" ? "Pilih toko" : "Pilih toko dan karyawan",
          description:
            mode === "toko"
              ? "Pilih toko untuk membuat jadwal toko. Jika toko belum diatur, toko akan mengikuti default sistem."
              : "Pilih toko dulu untuk menampilkan karyawan. Karyawan mengikuti jadwal toko jika belum punya jadwal individu.",
        });
        return;
      }

      const tokoSnap = await getDoc(
        doc(db, "pengaturan_jam_absensi", `toko_${selectedTokoId}`),
      );
      const tokoData = tokoSnap.exists() ? tokoSnap.data() : null;
      const tokoEffectiveData = tokoData
        ? resolveEffectiveDataForDate(tokoData, effectiveFrom) || tokoData
        : null;

      if (tokoEffectiveData) {
        resolvedForm = mergeFormWithData(resolvedForm, tokoEffectiveData);
      }

      if (mode === "toko") {
        setForm(resolvedForm);
        setWeeklyTouched(
          tokoData
            ? getTouchedWeeklyFromData(tokoEffectiveData)
            : createEmptyTouchedWeekly(),
        );
        setMonthlyTouched(
          tokoData ? getTouchedMonthlyFromData(tokoEffectiveData) : {},
        );
        setTargetInfo({
          saved: tokoSnap.exists(),
          label: tokoSnap.exists()
            ? `Jadwal toko ${selectedToko?.nama || selectedTokoId}`
            : `Jadwal toko ${selectedToko?.nama || selectedTokoId} belum disimpan`,
          description: tokoSnap.exists()
            ? `Jadwal yang tampil adalah jadwal yang berlaku pada ${effectiveFrom}. Jika disimpan, perubahan toko berlaku mulai tanggal tersebut.`
            : "Toko ini masih mengikuti default sistem. Atur hari kerja dan jam kerja, lalu simpan agar karyawan di toko ini punya jadwal dasar.",
        });
        return;
      }

      if (mode === "karyawan") {
        if (!selectedKaryawanId) {
          setForm(resolvedForm);
          setWeeklyTouched(createEmptyTouchedWeekly());
          setMonthlyTouched({});
          setTargetInfo({
            saved: tokoSnap.exists(),
            label: tokoSnap.exists()
              ? `Mengikuti jadwal toko ${selectedToko?.nama || selectedTokoId}`
              : `Toko ${selectedToko?.nama || selectedTokoId} belum punya jadwal`,
            description: tokoSnap.exists()
              ? "Pilih karyawan untuk membuat jadwal individu. Jika karyawan belum punya jenis pengaturan, popup akan muncul."
              : "Simpan jadwal toko dulu agar karyawan punya fallback jadwal yang jelas sebelum dibuatkan jadwal individu.",
          });
          return;
        }

        const karyawanSnap = await getDoc(
          doc(db, "pengaturan_jam_absensi", `karyawan_${selectedKaryawanId}`),
        );
        const karyawanData = karyawanSnap.exists() ? karyawanSnap.data() : null;
        const karyawanEffectiveData = karyawanData
          ? resolveEffectiveDataForDate(karyawanData, effectiveFrom) ||
            karyawanData
          : null;

        if (karyawanEffectiveData) {
          resolvedForm = mergeFormWithData(resolvedForm, karyawanEffectiveData);

          const savedJenis = karyawanData?.jenisPengaturan;
          if (savedJenis === "hari" || savedJenis === "tanggal") {
            setJenisKaryawan(savedJenis);
            setShowJenisModal(false);
          }
        }

        setForm(resolvedForm);
        setWeeklyTouched(
          karyawanData
            ? getTouchedWeeklyFromData(karyawanEffectiveData)
            : createEmptyTouchedWeekly(),
        );
        setMonthlyTouched(
          karyawanData ? getTouchedMonthlyFromData(karyawanEffectiveData) : {},
        );
        setTargetInfo({
          saved: karyawanSnap.exists(),
          label: karyawanSnap.exists()
            ? `Jadwal karyawan ${selectedKaryawan?.nama || ""}`
            : `Jadwal karyawan ${selectedKaryawan?.nama || ""} belum disimpan`,
          description: karyawanSnap.exists()
            ? `Karyawan ini memakai jadwal individu. Jadwal yang tampil berlaku pada ${effectiveFrom}.`
            : tokoSnap.exists()
              ? "Karyawan ini masih mengikuti jadwal toko. Pilih jenis jadwal melalui popup untuk membuat pengaturan khusus."
              : "Toko belum punya jadwal. Simpan jadwal toko dulu agar fallback jadwalnya jelas.",
        });
      }
    } catch (error) {
      console.error("Gagal load pengaturan jam:", error);
      setForm(cloneDefaultForm());
      setWeeklyTouched(createEmptyTouchedWeekly());
      setMonthlyTouched({});
      setTargetInfo({
        saved: false,
        label: "Gagal memuat jadwal",
        description: "Terjadi kesalahan saat membaca pengaturan jam absensi.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) return;

      await Promise.all([
        fetchTokoList(),
        fetchKaryawanActiveList(),
        fetchTidakWajibAbsensiIds(),
      ]);
      await loadTargetData();
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode !== "karyawan") return;

    if (!selectedTokoId) {
      setKaryawanList([]);
      return;
    }

    fetchKaryawanByToko(selectedTokoId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedTokoId, tokoList]);

  useEffect(() => {
    loadTargetData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedTokoId, selectedKaryawanId, effectiveFrom]);

  useEffect(() => {
    if (
      selectedKaryawanId &&
      tidakWajibAbsensiIds.includes(selectedKaryawanId)
    ) {
      setSelectedKaryawanId("");
      setJenisKaryawan(null);
      setShowJenisModal(false);
    }
  }, [selectedKaryawanId, tidakWajibAbsensiIds]);

  const handlePilihKaryawan = async (karyawanId: string) => {
    if (tidakWajibAbsensiIds.includes(karyawanId)) return;

    setSelectedKaryawanId(karyawanId);
    setJenisKaryawan(null);
    setShowJenisModal(false);
    await loadJenisPengaturanFromDb(karyawanId);
  };

  const handleSelectActiveKaryawan = async (item: KaryawanActiveItem) => {
    if (tidakWajibAbsensiIds.includes(item.karyawanId)) return;

    setMode("karyawan");
    setSelectedTokoId(item.tokoId);
    setSelectedKaryawanId(item.karyawanId);
    setSearch("");
    setJenisKaryawan(null);
    setShowJenisModal(false);

    await fetchKaryawanByToko(item.tokoId);
    await loadJenisPengaturanFromDb(item.karyawanId);
  };

  const handlePilihJenisKaryawan = async (jenis: "hari" | "tanggal") => {
    if (!selectedKaryawanId || !selectedKaryawan) return;

    setJenisKaryawan(jenis);
    setShowJenisModal(false);

    await setDoc(
      doc(db, "pengaturan_jam_absensi", `karyawan_${selectedKaryawanId}`),
      {
        scope: "karyawan",
        karyawanId: selectedKaryawan.id,
        nama: selectedKaryawan.nama,
        tokoId: selectedKaryawan.tokoId,
        tokoNama: selectedKaryawan.tokoNama,
        uid: selectedKaryawan.uid,
        email: selectedKaryawan.email || null,
        jenisPengaturan: jenis,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    await setDoc(
      doc(db, "jadwal_karyawan", selectedKaryawan.id),
      {
        karyawanId: selectedKaryawan.id,
        nama: selectedKaryawan.nama,
        tokoId: selectedKaryawan.tokoId,
        tokoNama: selectedKaryawan.tokoNama,
        uid: selectedKaryawan.uid,
        email: selectedKaryawan.email || null,
        jenisPengaturan: jenis,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    await fetchKaryawanActiveList();
  };

  const handleResetKaryawan = async () => {
    if (!selectedKaryawanId || !selectedKaryawan) return;

    const confirmed = window.confirm(
      `Reset pengaturan karyawan untuk ${selectedKaryawan.nama}?\n\nSetelah di-reset, karyawan ini akan mengikuti jadwal toko. Jika toko belum punya pengaturan, maka akan mengikuti default sistem. Pilihan jenis jadwal juga akan dihapus, sehingga popup akan muncul lagi saat karyawan dipilih.`,
    );

    if (!confirmed) return;

    setSaving(true);

    try {
      await deleteDoc(
        doc(db, "pengaturan_jam_absensi", `karyawan_${selectedKaryawanId}`),
      );
      await deleteDoc(doc(db, "jadwal_karyawan", selectedKaryawanId));

      await fetchKaryawanActiveList();
      setSelectedKaryawanId("");
      setJenisKaryawan(null);
      setShowJenisModal(false);
      setWeeklyTouched(createEmptyTouchedWeekly());
      setMonthlyTouched({});

      showToast("ok", "Pengaturan karyawan berhasil di-reset");
    } catch (error) {
      console.error("Gagal reset pengaturan karyawan:", error);
      showToast("err", "Gagal reset pengaturan karyawan");
    } finally {
      setSaving(false);
    }
  };

  const handleSimpan = async () => {
    setSaving(true);

    try {
      const user = auth.currentUser;
      let refId = "default";
      let payload: Record<string, any> = {
        scope: "default",
      };

      if (mode === "toko") {
        if (!selectedTokoId || !selectedToko) {
          showToast("err", "Pilih toko dulu");
          setSaving(false);
          return;
        }

        refId = `toko_${selectedTokoId}`;
        payload = {
          scope: "toko",
          tokoId: selectedToko.id,
          tokoNama: selectedToko.nama,
        };
      }

      if (mode === "karyawan") {
        if (!selectedTokoId) {
          showToast("err", "Pilih toko dulu");
          setSaving(false);
          return;
        }

        if (!selectedKaryawanId || !selectedKaryawan) {
          showToast("err", "Pilih karyawan dulu");
          setSaving(false);
          return;
        }

        if (!jenisKaryawan) {
          await loadJenisPengaturanFromDb(selectedKaryawanId);
          setSaving(false);
          return;
        }

        refId = `karyawan_${selectedKaryawanId}`;
        payload = {
          scope: "karyawan",
          karyawanId: selectedKaryawan.id,
          nama: selectedKaryawan.nama,
          tokoId: selectedKaryawan.tokoId,
          tokoNama: selectedKaryawan.tokoNama,
          uid: selectedKaryawan.uid,
          email: selectedKaryawan.email || null,
          jenisPengaturan: jenisKaryawan,
        };
      }

      const targetRef = doc(db, "pengaturan_jam_absensi", refId);
      const existingSnap = await getDoc(targetRef);
      const existingSnapExists = existingSnap.exists();
      const existingData = existingSnapExists ? existingSnap.data() : null;

      const hariLibur = getHariLiburFromWeeklySchedule(form.weeklySchedule);
      const tanggalShiftLintasTanggal = getTanggalShiftLintasTanggal(
        form.monthlyOverrides,
      );

      const isTanggalMode = mode === "karyawan" && jenisKaryawan === "tanggal";

      if (isTanggalMode) {
        await setDoc(
          targetRef,
          {
            ...payload,
            monthlyOverrides: form.monthlyOverrides,
            tanggalShiftLintasTanggal,
            hasOvernightShift: tanggalShiftLintasTanggal.length > 0,
            updatedAt: serverTimestamp(),
            updatedBy: user?.uid ?? null,
          },
          { merge: true },
        );
      } else {
        if (!effectiveFrom) {
          showToast("err", "Tanggal berlaku mulai wajib diisi");
          setSaving(false);
          return;
        }

        const newEffectiveEntry: EffectiveSchedule = {
          effectiveFrom,
          weeklySchedule: form.weeklySchedule,
          note:
            mode === "default"
              ? "Perubahan jadwal default sistem"
              : mode === "toko"
                ? `Perubahan jadwal toko ${selectedToko?.nama || ""}`
                : `Perubahan jadwal karyawan ${selectedKaryawan?.nama || ""}`,
          createdAt: new Date(),
          createdBy: user?.uid ?? undefined,
        };

        const previousEffectiveSchedules = normalizeEffectiveSchedules(existingData);
        const cleanedEffectiveSchedules = previousEffectiveSchedules.filter(
          (entry) => entry.effectiveFrom !== effectiveFrom,
        );
        const nextEffectiveSchedules = [
          ...cleanedEffectiveSchedules,
          newEffectiveEntry,
        ].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

        if (!existingSnapExists) {
          await setDoc(
            targetRef,
            {
              ...payload,
              weeklySchedule: form.weeklySchedule,
              monthlyOverrides: form.monthlyOverrides,
              effectiveSchedules: nextEffectiveSchedules,
              hariLibur,
              jamMasuk: form.weeklySchedule[1]?.jamMasuk || "07:30",
              jamPulang: form.weeklySchedule[1]?.jamPulang || "14:00",
              tanggalShiftLintasTanggal:
                mode === "karyawan" ? tanggalShiftLintasTanggal : [],
              hasOvernightShift:
                mode === "karyawan"
                  ? tanggalShiftLintasTanggal.length > 0
                  : false,
              updatedAt: serverTimestamp(),
              updatedBy: user?.uid ?? null,
            },
            { merge: true },
          );
        } else {
          await setDoc(
            targetRef,
            {
              ...payload,
              effectiveSchedules: nextEffectiveSchedules,
              hariLibur,
              jamMasuk: form.weeklySchedule[1]?.jamMasuk || "07:30",
              jamPulang: form.weeklySchedule[1]?.jamPulang || "14:00",
              updatedAt: serverTimestamp(),
              updatedBy: user?.uid ?? null,
            },
            { merge: true },
          );
        }
      }

      if (mode === "karyawan" && selectedKaryawan) {
        await setDoc(
          doc(db, "jadwal_karyawan", selectedKaryawan.id),
          {
            karyawanId: selectedKaryawan.id,
            nama: selectedKaryawan.nama,
            tokoId: selectedKaryawan.tokoId,
            tokoNama: selectedKaryawan.tokoNama,
            uid: selectedKaryawan.uid,
            email: selectedKaryawan.email || null,
            hariLibur,
            tanggalShiftLintasTanggal,
            hasOvernightShift: tanggalShiftLintasTanggal.length > 0,
            jenisPengaturan: jenisKaryawan,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );

        await fetchKaryawanActiveList();
      }

      setWeeklyTouched(createAllTouchedWeekly());
      setTargetInfo({
        saved: true,
        label:
          mode === "default"
            ? "Jadwal default sistem"
            : mode === "toko"
              ? `Jadwal toko ${selectedToko?.nama || ""}`
              : `Jadwal karyawan ${selectedKaryawan?.nama || ""}`,
        description: isTanggalMode
          ? "Jadwal per tanggal dan shift lintas tanggal sudah tersimpan."
          : `Perubahan jadwal per hari sudah tersimpan dan berlaku mulai ${effectiveFrom}.`,
      });

      showToast(
        "ok",
        isTanggalMode
          ? "Pengaturan tanggal berhasil disimpan"
          : `Pengaturan jam absensi berhasil disimpan mulai ${effectiveFrom}`,
      );
    } catch (error) {
      console.error("Gagal simpan:", error);
      showToast("err", "Gagal menyimpan pengaturan jam absensi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-white text-slate-900">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-white/70 blur-[110px]" />
        <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-slate-100/70 blur-[120px]" />
        <div className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-zinc-50/80 blur-[110px]" />
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`fixed right-4 top-4 z-[80] rounded-2xl border px-4 py-3 shadow-lg ${
              toast.type === "ok"
                ? "border-emerald-200 bg-emerald-50"
                : "border-red-200 bg-red-50"
            }`}
          >
            <div className="flex items-start gap-2">
              {toast.type === "ok" ? (
                <CheckCircle2
                  size={16}
                  className="mt-0.5 text-emerald-600"
                  strokeWidth={2.5}
                />
              ) : (
                <AlertCircle
                  size={16}
                  className="mt-0.5 text-red-600"
                  strokeWidth={2.5}
                />
              )}
              <p
                className={`max-w-xs text-xs font-black leading-relaxed ${
                  toast.type === "ok" ? "text-emerald-700" : "text-red-700"
                }`}
              >
                {toast.msg}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="relative z-10 w-full space-y-4 p-3 pb-28 sm:p-4 lg:p-5">
        <AnimatePresence>
          {showJenisModal &&
            mode === "karyawan" &&
            selectedKaryawanId &&
            selectedKaryawan && (
              <motion.div
                className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 20, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                  className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
                >
                  <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-500">
                        Pilih Jenis Jadwal
                      </p>
                      <h3 className="mt-1 text-xl font-black text-slate-800">
                        {selectedKaryawan.nama}
                      </h3>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        Pilihan ini akan disimpan ke database, jadi popup tidak
                        muncul lagi kecuali jadwal karyawan di-reset.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setShowJenisModal(false);
                        if (!jenisKaryawan) setSelectedKaryawanId("");
                      }}
                      className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                    >
                      <X size={16} strokeWidth={2.5} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
                    <button
                      type="button"
                      disabled={jenisLoading}
                      onClick={() => handlePilihJenisKaryawan("hari")}
                      className="group rounded-2xl border-2 border-emerald-100 bg-emerald-50/70 p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 transition group-hover:scale-105">
                        <CalendarClock size={22} strokeWidth={2.5} />
                      </div>
                      <p className="mt-3 text-sm font-black text-slate-800">
                        Jadwal Per Hari
                      </p>
                      <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
                        Cocok untuk pola tetap. Perubahan bisa dibuat berlaku
                        mulai tanggal tertentu.
                      </p>
                    </button>

                    <button
                      type="button"
                      disabled={jenisLoading}
                      onClick={() => handlePilihJenisKaryawan("tanggal")}
                      className="group rounded-2xl border-2 border-violet-100 bg-violet-50/70 p-4 text-left transition hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 transition group-hover:scale-105">
                        <CalendarDays size={22} strokeWidth={2.5} />
                      </div>
                      <p className="mt-3 text-sm font-black text-slate-800">
                        Jadwal Per Tanggal
                      </p>
                      <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
                        Cocok untuk karyawan dengan jadwal berubah-ubah,
                        termasuk shift lintas tanggal.
                      </p>
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative overflow-hidden rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-800 px-4 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-18px_42px_rgba(6,78,59,0.24)] sm:px-5 sm:py-5"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20 sm:h-12 sm:w-12">
              <Clock3
                size={28}
                className="text-white sm:h-8 sm:w-8"
                strokeWidth={2.5}
              />
            </div>

            <div>
              <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                Pengaturan Jam Absensi
              </h1>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-emerald-50/85 sm:text-sm">
                Default sistem, per toko, dan per karyawan
              </p>
            </div>
          </div>

          <div className="pointer-events-none absolute right-0 top-0 opacity-[0.03]">
            <Cpu size={140} strokeWidth={1} />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="grid grid-cols-1 gap-4 lg:grid-cols-3"
        >
          <div className="space-y-4 lg:col-span-1">
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Level Pengaturan
              </p>

              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode("default");
                    setSelectedKaryawanId("");
                    setJenisKaryawan(null);
                    setShowJenisModal(false);
                  }}
                  className={`flex items-center gap-2 rounded-xl px-3 py-3 text-sm font-black transition-all ${
                    mode === "default"
                      ? "bg-gradient-to-r from-emerald-600 via-emerald-700 to-emerald-800 text-white shadow-lg shadow-emerald-500/15"
                      : "border-2 border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  <CalendarClock size={16} strokeWidth={2.5} />
                  Default Sistem
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode("toko");
                    setSelectedKaryawanId("");
                    setJenisKaryawan(null);
                    setShowJenisModal(false);
                  }}
                  className={`flex items-center gap-2 rounded-xl px-3 py-3 text-sm font-black transition-all ${
                    mode === "toko"
                      ? "bg-gradient-to-r from-emerald-600 via-emerald-700 to-emerald-800 text-white shadow-lg shadow-emerald-500/15"
                      : "border-2 border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  <Store size={16} strokeWidth={2.5} />
                  Per Toko
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode("karyawan");
                    if (selectedKaryawanId && !jenisKaryawan) {
                      loadJenisPengaturanFromDb(selectedKaryawanId);
                    }
                  }}
                  className={`flex items-center gap-2 rounded-xl px-3 py-3 text-sm font-black transition-all ${
                    mode === "karyawan"
                      ? "bg-gradient-to-r from-emerald-600 via-emerald-700 to-emerald-800 text-white shadow-lg shadow-emerald-500/15"
                      : "border-2 border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  <UserCog size={16} strokeWidth={2.5} />
                  Per Karyawan
                </button>
              </div>

              {mode === "karyawan" && (
                <div className="mt-3 space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
                      Karyawan Aktif
                    </p>
                    {karyawanActiveLoading && (
                      <Loader2
                        size={14}
                        className="animate-spin text-emerald-600"
                      />
                    )}
                  </div>

                  <div className="relative">
                    <select
                      value={selectedTokoId}
                      onChange={(e) => {
                        setSelectedTokoId(e.target.value);
                        setSelectedKaryawanId("");
                        setJenisKaryawan(null);
                        setShowJenisModal(false);
                      }}
                      className="w-full appearance-none rounded-xl border-2 border-emerald-100 bg-white py-2.5 pl-3 pr-8 text-sm font-semibold text-slate-700 transition-all focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
                    >
                      <option value="">Semua Toko</option>
                      {tokoList.map((toko) => (
                        <option key={toko.id} value={toko.id}>
                          {toko.nama}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={14}
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                      strokeWidth={2.5}
                    />
                  </div>

                  <div className="relative">
                    <Search
                      size={14}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      strokeWidth={2.5}
                    />
                    <input
                      placeholder="Cari nama override karyawan..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full rounded-xl border-2 border-emerald-100 bg-white py-2.5 pl-8 pr-4 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
                    />
                  </div>

                  <div className="max-h-72 overflow-y-auto rounded-xl border border-emerald-100 bg-white">
                    {filteredKaryawanActiveList.length === 0 ? (
                      <div className="px-3 py-4 text-xs font-semibold text-slate-400">
                        Belum ada karyawan yang aktif mode individu.
                      </div>
                    ) : (
                      filteredKaryawanActiveList.map((item) => (
                        <button
                          key={item.karyawanId}
                          type="button"
                          onClick={() => handleSelectActiveKaryawan(item)}
                          className={`w-full border-b border-slate-100 px-3 py-3 text-left transition-colors last:border-b-0 ${
                            selectedKaryawanId === item.karyawanId
                              ? "bg-emerald-50"
                              : "bg-white hover:bg-slate-50"
                          }`}
                        >
                          <p className="text-sm font-black text-slate-800">
                            {item.nama}
                          </p>
                          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            {item.tokoNama || "-"}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {(mode === "toko" || mode === "karyawan") && (
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Target Jadwal
                </p>

                <div className="relative">
                  <select
                    value={selectedTokoId}
                    onChange={(e) => {
                      setSelectedTokoId(e.target.value);
                      setSelectedKaryawanId("");
                      setJenisKaryawan(null);
                      setShowJenisModal(false);
                    }}
                    className="w-full appearance-none rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-3 pr-8 text-sm font-semibold text-slate-700 transition-all focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
                  >
                    <option value="">Pilih Toko</option>
                    {tokoList.map((toko) => (
                      <option key={toko.id} value={toko.id}>
                        {toko.nama}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                    strokeWidth={2.5}
                  />
                </div>

                {mode === "karyawan" && (
                  <>
                    {!selectedTokoId ? (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs font-semibold text-slate-400">
                        Pilih toko dulu untuk menampilkan daftar karyawan.
                      </div>
                    ) : (
                      <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200">
                        {filteredKaryawan.length === 0 ? (
                          <div className="px-3 py-4 text-xs font-semibold text-slate-400">
                            Data karyawan tidak ditemukan.
                          </div>
                        ) : (
                          filteredKaryawan.map((karyawan) => (
                            <button
                              key={karyawan.id}
                              type="button"
                              onClick={() => handlePilihKaryawan(karyawan.id)}
                              className={`w-full border-b border-slate-100 px-3 py-3 text-left transition-colors last:border-b-0 ${
                                selectedKaryawanId === karyawan.id
                                  ? "bg-emerald-50"
                                  : "bg-white hover:bg-slate-50"
                              }`}
                            >
                              <p className="text-sm font-black text-slate-800">
                                {karyawan.nama}
                              </p>
                              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                {karyawan.tokoNama || "-"}
                              </p>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black tracking-tight text-slate-800">
                  Form Jam Absensi
                </h2>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  {mode === "default"
                    ? "Sedang mengatur default sistem"
                    : mode === "toko"
                      ? `Sedang mengatur toko: ${selectedToko?.nama || "-"}`
                      : `Sedang mengatur karyawan: ${selectedKaryawan?.nama || "-"}`}
                </p>
              </div>

              {mode === "karyawan" && selectedKaryawanId && jenisKaryawan && (
                <button
                  type="button"
                  onClick={() => setShowJenisModal(true)}
                  className="inline-flex items-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-700 transition hover:bg-slate-50"
                >
                  {jenisKaryawan === "hari" ? (
                    <CalendarClock size={14} strokeWidth={2.5} />
                  ) : (
                    <CalendarDays size={14} strokeWidth={2.5} />
                  )}
                  {jenisKaryawan === "hari"
                    ? "Jadwal Per Hari"
                    : "Jadwal Per Tanggal"}
                </button>
              )}
            </div>

            <div
              className={`rounded-2xl border p-3 ${
                targetInfo.saved
                  ? "border-emerald-200 bg-emerald-50/60"
                  : "border-amber-200 bg-amber-50/70"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                    targetInfo.saved
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  <Info size={16} strokeWidth={2.5} />
                </div>
                <div>
                  <p
                    className={`text-sm font-black ${
                      targetInfo.saved ? "text-emerald-800" : "text-amber-800"
                    }`}
                  >
                    {targetInfo.label}
                  </p>
                  <p
                    className={`mt-1 text-xs font-semibold leading-relaxed ${
                      targetInfo.saved
                        ? "text-emerald-700/80"
                        : "text-amber-700/80"
                    }`}
                  >
                    {targetInfo.description}
                  </p>
                </div>
              </div>
            </div>

            {isWeeklyEditor && (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                      <History size={17} strokeWidth={2.5} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-emerald-800">
                        Berlaku Mulai Tanggal
                      </p>
                      <p className="mt-1 text-xs font-semibold leading-relaxed text-emerald-700/80">
                        Perubahan jadwal per hari tidak mengubah tanggal
                        sebelumnya. Jadwal lama tetap berlaku untuk tanggal yang
                        lebih awal.
                      </p>
                    </div>
                  </div>

                  <div className="w-full sm:w-56">
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-emerald-700">
                      Effective From
                    </label>
                    <input
                      type="date"
                      value={effectiveFrom}
                      onChange={(e) => setEffectiveFrom(e.target.value)}
                      className="w-full rounded-xl border-2 border-emerald-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 transition-all focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Sudah diatur
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Belum disimpan
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600">
                <span className="h-2 w-2 rounded-full bg-slate-400" />
                Libur
              </span>
              {mode === "karyawan" && jenisKaryawan === "tanggal" && (
                <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-violet-700">
                  <span className="h-2 w-2 rounded-full bg-violet-500" />
                  Shift lintas tanggal
                </span>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={24} className="animate-spin text-emerald-500" />
              </div>
            ) : (
              <>
                {mode === "karyawan" && selectedKaryawanId && !jenisKaryawan ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center">
                    <p className="text-sm font-black text-slate-700">
                      Pilih jenis jadwal terlebih dahulu.
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      Pilihan akan disimpan ke database agar popup tidak muncul
                      terus.
                    </p>
                    <button
                      type="button"
                      onClick={() => loadJenisPengaturanFromDb(selectedKaryawanId)}
                      className="mt-4 rounded-full bg-gradient-to-r from-emerald-600 via-emerald-700 to-emerald-800 px-5 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-lg shadow-emerald-500/15"
                    >
                      {jenisLoading ? "Memeriksa..." : "Pilih Jenis Jadwal"}
                    </button>
                  </div>
                ) : (
                  <>
                    {(mode === "default" ||
                      mode === "toko" ||
                      (mode === "karyawan" && jenisKaryawan === "hari")) && (
                      <div className="space-y-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          Jadwal Per Hari
                        </p>

                        <div className="space-y-3">
                          {HARI.map((hari, index) => {
                            const item = form.weeklySchedule[index];
                            const touched = !!weeklyTouched[index];

                            return (
                              <div
                                key={index}
                                className={`rounded-2xl border p-3 transition-all sm:p-4 ${getWeeklyCardClass(
                                  item.enabled,
                                  touched,
                                )}`}
                              >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                  <div className="sm:w-40">
                                    <label className="inline-flex cursor-pointer items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={item.enabled}
                                        onChange={(e) =>
                                          updateWeeklySchedule(
                                            index,
                                            "enabled",
                                            e.target.checked,
                                          )
                                        }
                                        className="accent-emerald-500"
                                      />
                                      <span className="text-sm font-black text-slate-800">
                                        {hari}
                                      </span>
                                    </label>
                                    <p
                                      className={`mt-1 text-[10px] font-bold uppercase tracking-wide ${getStatusTextClass(
                                        item.enabled,
                                        touched,
                                      )}`}
                                    >
                                      {getStatusText(item.enabled, touched)}
                                    </p>
                                  </div>

                                  <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                                    <FieldTime
                                      label="Jam Masuk"
                                      value={item.jamMasuk}
                                      onChange={(v) =>
                                        updateWeeklySchedule(
                                          index,
                                          "jamMasuk",
                                          v,
                                        )
                                      }
                                      disabled={!item.enabled}
                                      touched={touched}
                                    />
                                    <FieldTime
                                      label="Jam Pulang"
                                      value={item.jamPulang}
                                      onChange={(v) =>
                                        updateWeeklySchedule(
                                          index,
                                          "jamPulang",
                                          v,
                                        )
                                      }
                                      disabled={!item.enabled}
                                      touched={touched}
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {mode === "karyawan" && jenisKaryawan === "tanggal" && (
                      <div className="space-y-4">
                        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                              Override Per Tanggal
                            </p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              Atur jadwal khusus berdasarkan tanggal. Aktifkan
                              shift lintas tanggal jika karyawan masuk pada
                              tanggal ini dan pulang besok pagi.
                            </p>
                          </div>

                          <div className="w-full sm:w-56">
                            <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">
                              Bulan
                            </label>
                            <input
                              type="month"
                              value={selectedMonth}
                              onChange={(e) => setSelectedMonth(e.target.value)}
                              className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 transition-all focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
                            />
                          </div>
                        </div>

                        <div className="space-y-3">
                          {monthDates.map((item) => {
                            const baseWeekly =
                              form.weeklySchedule[item.dayIndex];
                            const schedule =
                              currentMonthOverrides[item.dateKey] ||
                              createDefaultDateSchedule(baseWeekly);
                            const touched = !!currentMonthTouched[item.dateKey];
                            const lintasTanggal = !!schedule.lintasTanggal;

                            return (
                              <div
                                key={item.dateKey}
                                className={`rounded-2xl border p-3 transition-all sm:p-4 ${getDateCardClass(
                                  schedule.enabled,
                                  touched,
                                  lintasTanggal,
                                )}`}
                              >
                                <div className="flex flex-col gap-3">
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <CalendarDays
                                          size={16}
                                          className={
                                            lintasTanggal
                                              ? "text-violet-600"
                                              : "text-emerald-600"
                                          }
                                        />
                                        <p className="text-sm font-black text-slate-800">
                                          {item.dayName}, {item.dayNumber}
                                        </p>
                                      </div>
                                      <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                        {item.dateKey}
                                      </p>
                                    </div>

                                    <div className="flex flex-col items-start gap-2 sm:items-end">
                                      <label className="inline-flex cursor-pointer items-center gap-2">
                                        <input
                                          type="checkbox"
                                          checked={schedule.enabled}
                                          onChange={(e) =>
                                            updateDateSchedule(
                                              item.dateKey,
                                              "enabled",
                                              e.target.checked,
                                            )
                                          }
                                          className={
                                            lintasTanggal
                                              ? "accent-violet-500"
                                              : "accent-emerald-500"
                                          }
                                        />
                                        <span className="text-sm font-bold text-slate-700">
                                          {schedule.enabled ? "Masuk" : "Libur"}
                                        </span>
                                      </label>

                                      <label
                                        className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide transition ${
                                          schedule.enabled
                                            ? lintasTanggal
                                              ? "border-violet-200 bg-violet-100 text-violet-700"
                                              : "border-slate-200 bg-white text-slate-500"
                                            : "border-slate-200 bg-slate-100 text-slate-400"
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={lintasTanggal}
                                          disabled={!schedule.enabled}
                                          onChange={(e) =>
                                            updateDateSchedule(
                                              item.dateKey,
                                              "lintasTanggal",
                                              e.target.checked,
                                            )
                                          }
                                          className="accent-violet-500 disabled:cursor-not-allowed"
                                        />
                                        <Moon size={12} strokeWidth={2.5} />
                                        Shift lintas tanggal
                                      </label>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <FieldTime
                                      label={
                                        lintasTanggal
                                          ? "Jam Masuk Shift"
                                          : "Jam Masuk"
                                      }
                                      value={schedule.jamMasuk}
                                      onChange={(v) =>
                                        updateDateSchedule(
                                          item.dateKey,
                                          "jamMasuk",
                                          v,
                                        )
                                      }
                                      disabled={!schedule.enabled}
                                      touched={touched}
                                      lintasTanggal={lintasTanggal}
                                    />
                                    <FieldTime
                                      label={
                                        lintasTanggal
                                          ? "Jam Pulang Besok"
                                          : "Jam Pulang"
                                      }
                                      value={schedule.jamPulang}
                                      onChange={(v) =>
                                        updateDateSchedule(
                                          item.dateKey,
                                          "jamPulang",
                                          v,
                                        )
                                      }
                                      disabled={!schedule.enabled}
                                      touched={touched}
                                      lintasTanggal={lintasTanggal}
                                    />
                                  </div>

                                  <div className="text-[11px] font-semibold text-slate-500">
                                    Status tanggal ini:{" "}
                                    <span
                                      className={getStatusTextClass(
                                        schedule.enabled,
                                        touched,
                                        lintasTanggal,
                                      )}
                                    >
                                      {schedule.enabled
                                        ? lintasTanggal
                                          ? "Shift lintas tanggal"
                                          : getStatusText(
                                              schedule.enabled,
                                              touched,
                                            )
                                        : "Libur"}
                                    </span>
                                    <span className="text-slate-400"> · </span>
                                    Jadwal dasar hari ini:{" "}
                                    {baseWeekly.enabled
                                      ? `${baseWeekly.jamMasuk} - ${baseWeekly.jamPulang}`
                                      : "Libur"}
                                  </div>

                                  {schedule.enabled && lintasTanggal && (
                                    <div className="rounded-xl border border-violet-100 bg-white/75 px-3 py-2 text-[11px] font-semibold text-violet-700">
                                      Tanggal kerja tetap {item.dateKey}. Jika
                                      karyawan pulang besok pagi, absensi pulang
                                      tetap dihitung ke tanggal ini.
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleSimpan}
                    disabled={
                      saving ||
                      (mode === "toko" && !selectedTokoId) ||
                      (mode === "karyawan" &&
                        (!selectedTokoId || !selectedKaryawanId))
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-600 via-emerald-700 to-emerald-800 px-5 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-lg shadow-emerald-500/15 transition-all hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <Save size={16} strokeWidth={2.5} />
                        Simpan Pengaturan
                      </>
                    )}
                  </button>

                  {mode === "karyawan" && selectedKaryawanId && (
                    <button
                      type="button"
                      onClick={handleResetKaryawan}
                      disabled={saving}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-rose-200 bg-white px-5 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-rose-600 shadow-sm transition-all hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <RotateCcw size={16} strokeWidth={2.5} />
                      Reset ke Default
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </motion.div>
      </main>
    </div>
  );
}

function FieldTime({
  label,
  value,
  onChange,
  disabled = false,
  touched = false,
  lintasTanggal = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  touched?: boolean;
  lintasTanggal?: boolean;
}) {
  return (
    <div>
      <label
        className={`mb-1 block text-[10px] font-black uppercase tracking-widest ${
          lintasTanggal
            ? "text-violet-500"
            : touched
              ? "text-emerald-500"
              : "text-slate-400"
        }`}
      >
        {label}
      </label>
      <input
        type="time"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={getFieldClass(!disabled, touched, disabled, lintasTanggal)}
      />
    </div>
  );
}
