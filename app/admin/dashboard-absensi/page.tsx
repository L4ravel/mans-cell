// Dashboard absensi admin karyawan.
// Revisi:
// - Filter Semua Toko / per toko ditambahkan agar konsisten dengan dashboard PTK.
// // - Jika filter Semua Toko, dashboard menghitung semua karyawan aktif.
// - Jika filter toko dipilih, dashboard hanya menghitung karyawan aktif dari toko tersebut.
// - Summary per toko dihitung dari absensi_karyawan bulan berjalan agar tidak mengambil summary global yang salah.
// - Layout disamakan dengan dashboard absensi PTK.
// - Tampilan mobile disamakan dengan pola dashboard PTK: header, filter collapse, summary 2 kolom, donut, dan grafik tap-to-change.
// - Cache localStorage dihapus; data selalu diambil fresh dari Firestore.
// - Wajib absen dihitung per tanggal dari karyawan aktif + pengaturan_jam_absensi.
// - Mendukung effectiveSchedules, monthlyOverrides, dan shift lintas tanggal.
// - Fallback jadwal: default sistem -> toko -> karyawan.
// - Karyawan tidak wajib absen difilter dari awal.
// - Tanggal tetap tampil penuh sampai akhir bulan.
// - Grafik hanya berjalan sampai tanggal yang sudah terjadi.
// - Tema disesuaikan ke emerald/hijau.
// - REVISI LAYOUT: tampilan desktop dan mobile kini 100% identik.
// - Saat Semua Toko dipilih: tampil TokoComparisonDashboard (peringkat kehadiran per toko) + toggle rekap harian.
// - Saat toko dipilih: tampil detail summary cards + donut + line/bar chart.
// - Komponen MobileSimpleDashboard dihapus, diganti dengan satu alur render tunggal.

"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { auth, db } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import {
  Activity,
  AlertCircle,
  BarChart3,
  Building2,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  Clock,
  Cpu,
  Hand,
  HeartPulse,
  House,
  LineChart as LineChartIcon,
  Percent,
  PieChart as PieChartIcon,
  RefreshCw,
  Store,
  Timer,
  UserX,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/* ═══════════════════════════════════════
   TYPES
═══════════════════════════════════════ */
type DailySummary = {
  id: string;
  tanggal: string;
  tahun?: number;
  bulan?: number;
  hadir: number;
  izin: number;
  sakit: number;
  terlambat: number;
  pulangCepat: number;
  kedatangan: number;
};

type KaryawanItem = {
  id: string;
  nama: string;
  tokoId: string;
  tokoNama: string;
  aktif: boolean;
};

type TokoOption = {
  id: string;
  nama: string;
};

type DaySchedule = {
  enabled: boolean;
  jamMasuk: string;
  jamPulang: string;
  lintasTanggal?: boolean;
};

type EffectiveSchedule = {
  effectiveFrom: string;
  weeklySchedule?: Record<string | number, Partial<DaySchedule>>;
  monthlyOverrides?: Record<string, Record<string, Partial<DaySchedule>>>;
  note?: string;
  createdAt?: any;
  createdBy?: string;
};

type ChartDayItem = {
  tanggalKey: string;
  dayNumber: number;
  isFuture: boolean;

  totalKaryawan: number;
  wajibAbsen: number;
  hadir: number;
  izin: number;
  sakit: number;
  alfa: number;
  terlambat: number;
  pulangCepat: number;
  kedatangan: number;

  grafikWajibAbsen: number | null;
  grafikHadir: number | null;
  grafikIzin: number | null;
  grafikSakit: number | null;
  grafikAlfa: number | null;
  grafikTerlambat: number | null;
  grafikPulangCepat: number | null;
  grafikKedatangan: number | null;
};

type ChartMode =
  | "hadir"
  | "alfa"
  | "izin"
  | "sakit"
  | "terlambat"
  | "pulangCepat"
  | "kedatangan";

type SummaryCardColor = keyof typeof colorConfig;

type SummaryCardItem = {
  label: string;
  value: number;
  icon: LucideIcon;
  color: SummaryCardColor;
};

type DonutSegment = {
  label: string;
  value: number;
  color: string;
};

/* Toko comparison (mirip InstansiDayChartItem di PTK) */
type TokoDayChartItem = {
  id: string;
  tokoId: string;
  tokoNama: string;

  totalKaryawan: number;
  wajibAbsen: number;
  hadir: number;
  izin: number;
  sakit: number;
  alfa: number;
  terlambat: number;
  pulangCepat: number;
  kedatangan: number;
  totalRekam: number;
  persenHadir: number;
  persenIzin: number;
  persenSakit: number;
  persenAlfa: number;
};


/* ═══════════════════════════════════════
   CONFIG
═══════════════════════════════════════ */
const bulanOptions = [
  { value: 1, label: "Januari" },
  { value: 2, label: "Februari" },
  { value: 3, label: "Maret" },
  { value: 4, label: "April" },
  { value: 5, label: "Mei" },
  { value: 6, label: "Juni" },
  { value: 7, label: "Juli" },
  { value: 8, label: "Agustus" },
  { value: 9, label: "September" },
  { value: 10, label: "Oktober" },
  { value: 11, label: "November" },
  { value: 12, label: "Desember" },
];

const CHART_MODES: {
  key: ChartMode;
  label: string;
  color: string;
  icon: LucideIcon;
}[] = [
  { key: "hadir", label: "Hadir", color: "#10b981", icon: CheckCircle2 },
  { key: "alfa", label: "Alfa", color: "#ef4444", icon: UserX },
  { key: "izin", label: "Izin", color: "#3b82f6", icon: Hand },
  { key: "sakit", label: "Sakit", color: "#a855f7", icon: HeartPulse },
  { key: "terlambat", label: "Terlambat", color: "#f97316", icon: Clock },
  { key: "pulangCepat", label: "Pulang Cepat", color: "#eab308", icon: Timer },
  {
    key: "kedatangan",
    label: "Tidak Absen Pulang",
    color: "#64748b",
    icon: AlertCircle,
  },
];

const currentDate = new Date();
const defaultMonth = currentDate.getMonth() + 1;
const defaultYear = currentDate.getFullYear();

const PIE_COLORS = ["#10b981", "#f43f5e"];

/* ═══════════════════════════════════════
   HELPERS
═══════════════════════════════════════ */
const pad2 = (value: number | string) => String(value).padStart(2, "0");

function num(value: any) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function getLocalDateKey(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  return `${yyyy}-${mm}-${dd}`;
}

function getMonthKeyFromDateKey(dateKey: string) {
  return String(dateKey || "").slice(0, 7);
}

function getBulanLabel(bulan: number) {
  return (
    bulanOptions.find((item) => item.value === Number(bulan))?.label || "-"
  );
}

function getPersen(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

function formatTanggalIndonesia(value: string) {
  const parts = String(value || "").split("-");
  if (parts.length !== 3) return value || "-";
  const [year, month, day] = parts.map(Number);
  if (!year || !month || !day) return value || "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function getDateKeysInMonth(year: number, month: number) {
  const total = new Date(year, month, 0).getDate();
  return Array.from({ length: total }, (_, index) => {
    const day = index + 1;
    return `${year}-${pad2(month)}-${pad2(day)}`;
  });
}

function isFutureDateKey(dateKey: string) {
  return dateKey > getLocalDateKey(new Date());
}

function createEmptyFutureDay(
  tanggalKey: string,
  dayNumber: number,
): ChartDayItem {
  return {
    tanggalKey,
    dayNumber,
    isFuture: true,
    totalKaryawan: 0,
    wajibAbsen: 0,
    hadir: 0,
    izin: 0,
    sakit: 0,
    alfa: 0,
    terlambat: 0,
    pulangCepat: 0,
    kedatangan: 0,
    grafikWajibAbsen: null,
    grafikHadir: null,
    grafikIzin: null,
    grafikSakit: null,
    grafikAlfa: null,
    grafikTerlambat: null,
    grafikPulangCepat: null,
    grafikKedatangan: null,
  };
}

function createEmptyWeeklySchedule(): Record<number, DaySchedule> {
  return {
    0: { enabled: false, jamMasuk: "", jamPulang: "", lintasTanggal: false },
    1: { enabled: false, jamMasuk: "", jamPulang: "", lintasTanggal: false },
    2: { enabled: false, jamMasuk: "", jamPulang: "", lintasTanggal: false },
    3: { enabled: false, jamMasuk: "", jamPulang: "", lintasTanggal: false },
    4: { enabled: false, jamMasuk: "", jamPulang: "", lintasTanggal: false },
    5: { enabled: false, jamMasuk: "", jamPulang: "", lintasTanggal: false },
    6: { enabled: false, jamMasuk: "", jamPulang: "", lintasTanggal: false },
  };
}

function normalizeWeeklySchedule(data: any): Record<number, DaySchedule> {
  const empty = createEmptyWeeklySchedule();
  if (data?.weeklySchedule && typeof data.weeklySchedule === "object") {
    const normalized: Record<number, DaySchedule> = { ...empty };
    for (let i = 0; i < 7; i++) {
      const raw = data.weeklySchedule?.[i] ?? data.weeklySchedule?.[String(i)];
      if (raw) {
        normalized[i] = {
          enabled: typeof raw.enabled === "boolean" ? raw.enabled : false,
          jamMasuk: raw.jamMasuk || "",
          jamPulang: raw.jamPulang || "",
          lintasTanggal:
            typeof raw.lintasTanggal === "boolean" ? raw.lintasTanggal : false,
        };
      }
    }
    return normalized;
  }
  const hasLegacy =
    typeof data?.jamMasuk === "string" ||
    typeof data?.jamPulang === "string" ||
    Array.isArray(data?.hariLibur);
  if (!hasLegacy) return empty;
  const jamMasuk = data?.jamMasuk || "";
  const jamPulang = data?.jamPulang || "";
  const hariLibur = Array.isArray(data?.hariLibur) ? data.hariLibur : [];
  const migrated: Record<number, DaySchedule> = { ...empty };
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

function getFinalScheduleForDate(
  data: any,
  dateKey: string,
): DaySchedule | null {
  if (!data) return null;
  const resolvedData = resolveEffectiveDataForDate(data, dateKey);
  if (!resolvedData) return null;
  const weeklySchedule = normalizeWeeklySchedule(resolvedData);
  const date = new Date(`${dateKey}T00:00:00`);
  const dayIndex = date.getDay();
  const monthKey = getMonthKeyFromDateKey(dateKey);
  const dateOverride =
    resolvedData?.monthlyOverrides?.[monthKey]?.[dateKey] ||
    resolvedData?.monthlyOverrides?.[monthKey]?.[String(dateKey)];
  if (dateOverride && typeof dateOverride === "object") {
    const base =
      weeklySchedule[dayIndex] || createEmptyWeeklySchedule()[dayIndex];
    return {
      enabled:
        typeof dateOverride.enabled === "boolean"
          ? dateOverride.enabled
          : base.enabled,
      jamMasuk: dateOverride.jamMasuk || base.jamMasuk || "",
      jamPulang: dateOverride.jamPulang || base.jamPulang || "",
      lintasTanggal:
        typeof dateOverride.lintasTanggal === "boolean"
          ? dateOverride.lintasTanggal
          : (base.lintasTanggal ?? false),
    };
  }
  return weeklySchedule[dayIndex] || createEmptyWeeklySchedule()[dayIndex];
}

function isValidWorkSchedule(schedule: DaySchedule | null) {
  return !!schedule?.enabled && !!schedule?.jamMasuk && !!schedule?.jamPulang;
}

function getResolvedScheduleDataForKaryawan(params: {
  karyawan: KaryawanItem;
  pengaturanMap: Map<string, any>;
}) {
  const { karyawan, pengaturanMap } = params;
  const defaultData = pengaturanMap.get("default");
  const tokoData = karyawan.tokoId
    ? pengaturanMap.get(`toko_${karyawan.tokoId}`)
    : null;
  const tokoByNameData = karyawan.tokoNama
    ? pengaturanMap.get(`toko_${karyawan.tokoNama}`)
    : null;
  const finalTokoData = tokoData || tokoByNameData;
  const karyawanData = pengaturanMap.get(`karyawan_${karyawan.id}`);
  let resolvedData: any = defaultData || null;
  if (resolvedData && finalTokoData) {
    resolvedData = mergeScheduleData(resolvedData, finalTokoData);
  } else if (finalTokoData) {
    resolvedData = finalTokoData;
  }
  if (resolvedData && karyawanData) {
    resolvedData = mergeScheduleData(resolvedData, karyawanData);
  } else if (karyawanData) {
    resolvedData = karyawanData;
  }
  return resolvedData;
}

function isKaryawanWajibAbsen(params: {
  karyawan: KaryawanItem;
  dateKey: string;
  pengaturanMap: Map<string, any>;
}) {
  const { karyawan, dateKey, pengaturanMap } = params;
  const resolvedData = getResolvedScheduleDataForKaryawan({
    karyawan,
    pengaturanMap,
  });
  if (!resolvedData) return false;
  const schedule = getFinalScheduleForDate(resolvedData, dateKey);
  return isValidWorkSchedule(schedule);
}

function getTokoIdFromData(data: any) {
  return String(data?.tokoNama || "").trim();
}

function buildTokoOptions(params: { karyawanList: KaryawanItem[] }) {
  const map = new Map<string, TokoOption>();
  params.karyawanList.forEach((item) => {
    const tokoNama = String(item.tokoNama || "").trim();
    if (!tokoNama) return;
    map.set(tokoNama, { id: tokoNama, nama: tokoNama });
  });
  return Array.from(map.values()).sort((a, b) =>
    a.nama.localeCompare(b.nama, "id"),
  );
}

function buildSummaryMapFromAbsensiDocs(params: {
  docs: any[];
  filterTokoId: string;
  karyawanById: Map<string, KaryawanItem>;
}) {
  const { docs, filterTokoId, karyawanById } = params;
  const map = new Map<string, DailySummary>();
  docs.forEach((docSnap) => {
    const d = docSnap.data() as any;
    const tanggal = String(d?.tanggalKerja || d?.tanggal || "").trim();
    if (!tanggal) return;
    const karyawanId = String(d?.karyawanId || "").trim();
    const tokoId =
      getTokoIdFromData(d) || karyawanById.get(karyawanId)?.tokoId || "";
    if (filterTokoId && tokoId !== filterTokoId) return;
    const prev = map.get(tanggal) || {
      id: tanggal,
      tanggal,
      tahun: d?.tahun ? num(d.tahun) : undefined,
      bulan: d?.bulan ? num(d.bulan) : undefined,
      hadir: 0,
      izin: 0,
      sakit: 0,
      terlambat: 0,
      pulangCepat: 0,
      kedatangan: 0,
    };
    const status = String(d?.status || "").toLowerCase();
    const approvalStatus = String(d?.approvalStatus || "approved").toLowerCase();
    const hasMasuk = !!d?.jamMasuk;
    const hasPulang = !!d?.jamPulang;
    if (status === "izin" || status === "sakit") {
      if (approvalStatus !== "approved") {
        map.set(tanggal, prev);
        return;
      }
      if (status === "izin") prev.izin += 1;
      if (status === "sakit") prev.sakit += 1;
      map.set(tanggal, prev);
      return;
    }
    if (hasMasuk) {
      prev.hadir += 1;
      if (!hasPulang) prev.kedatangan += 1;
    }
    if (status.includes("terlambat")) prev.terlambat += 1;
    if (status.includes("pulang_cepat")) prev.pulangCepat += 1;
    map.set(tanggal, prev);
  });
  return map;
}

function pickBestSelectedDate(params: {
  data: ChartDayItem[];
  currentSelectedDateKey: string;
  selectedMonth: number;
  selectedYear: number;
  todayStr: string;
}) {
  const { data, currentSelectedDateKey, selectedMonth, selectedYear, todayStr } = params;
  if (!data.length) return "";
  const currentStillValid = data.some(
    (item) => item.tanggalKey === currentSelectedDateKey && !item.isFuture,
  );
  if (currentStillValid) return currentSelectedDateKey;
  const isCurrentMonth = selectedMonth === defaultMonth && selectedYear === defaultYear;
  if (isCurrentMonth && data.some((item) => item.tanggalKey === todayStr && !item.isFuture)) {
    return todayStr;
  }
  return (
    [...data].reverse().find(
      (item) =>
        !item.isFuture &&
        (item.hadir > 0 || item.izin > 0 || item.sakit > 0 || item.alfa > 0 ||
          item.terlambat > 0 || item.pulangCepat > 0),
    )?.tanggalKey ||
    [...data].reverse().find((item) => !item.isFuture)?.tanggalKey ||
    data[0]?.tanggalKey ||
    ""
  );
}

function getGraphKey(mode: ChartMode) {
  const map: Record<ChartMode, keyof ChartDayItem> = {
    hadir: "grafikHadir",
    alfa: "grafikAlfa",
    izin: "grafikIzin",
    sakit: "grafikSakit",
    terlambat: "grafikTerlambat",
    pulangCepat: "grafikPulangCepat",
    kedatangan: "grafikKedatangan",
  };
  return map[mode];
}

function buildDashboardRows(params: {
  dateKeys: string[];
  summaryMap: Map<string, DailySummary>;
  karyawanList: KaryawanItem[];
  tidakWajibKaryawanIds: Set<string>;
  pengaturanMap: Map<string, any>;
}) {
  const { dateKeys, summaryMap, karyawanList, tidakWajibKaryawanIds, pengaturanMap } = params;
  const activeKaryawan = karyawanList.filter(
    (karyawan) => karyawan.aktif && !tidakWajibKaryawanIds.has(karyawan.id),
  );
  return dateKeys.map((dateKey) => {
    const dayNumber = Number(dateKey.slice(8, 10));
    const future = isFutureDateKey(dateKey);
    if (future) return createEmptyFutureDay(dateKey, dayNumber);
    const wajibAbsen = activeKaryawan.reduce((total, karyawan) => {
      const wajib = isKaryawanWajibAbsen({ karyawan, dateKey, pengaturanMap });
      return total + (wajib ? 1 : 0);
    }, 0);
    const row = summaryMap.get(dateKey);
    const hadir = num(row?.hadir);
    const izin = num(row?.izin);
    const sakit = num(row?.sakit);
    const terlambat = num(row?.terlambat);
    const pulangCepat = num(row?.pulangCepat);
    const kedatangan = num(row?.kedatangan);
    const alfa = Math.max(wajibAbsen - (hadir + izin + sakit), 0);
    return {
      tanggalKey: dateKey,
      dayNumber,
      isFuture: false,
      totalKaryawan: activeKaryawan.length,
      wajibAbsen,
      hadir,
      izin,
      sakit,
      alfa,
      terlambat,
      pulangCepat,
      kedatangan,
      grafikWajibAbsen: wajibAbsen,
      grafikHadir: hadir,
      grafikIzin: izin,
      grafikSakit: sakit,
      grafikAlfa: alfa,
      grafikTerlambat: terlambat,
      grafikPulangCepat: pulangCepat,
      grafikKedatangan: kedatangan,
    } satisfies ChartDayItem;
  });
}

/* ─── Build toko comparison rows (mirip buildInstansiDailyRows di PTK) ─── */
function buildTokoDailyRows(params: {
  dateKey: string;
  karyawanList: KaryawanItem[];
  pengaturanMap: Map<string, any>;
  summaryByTokoDate: Map<string, DailySummary>;
  tokoOptions: TokoOption[];
}): TokoDayChartItem[] {
  const { dateKey, karyawanList, pengaturanMap, summaryByTokoDate, tokoOptions } = params;

  const totalMap = new Map<string, number>();
  const wajibMap = new Map<string, number>();
  const namaMap = new Map<string, string>();

  karyawanList.forEach((k) => {
    const key = k.tokoId || k.tokoNama;
    if (!key) return;
    totalMap.set(key, (totalMap.get(key) || 0) + 1);
    namaMap.set(key, k.tokoNama || key);
    if (isKaryawanWajibAbsen({ karyawan: k, dateKey, pengaturanMap })) {
      wajibMap.set(key, (wajibMap.get(key) || 0) + 1);
    }
  });

  tokoOptions.forEach((t) => namaMap.set(t.id, t.nama));

  const keys = new Set<string>([...namaMap.keys(), ...totalMap.keys()]);

  return Array.from(keys)
    .map((key) => {
      const summary = summaryByTokoDate.get(`${key}__${dateKey}`);
      const hadir = num(summary?.hadir);
      const izin = num(summary?.izin);
      const sakit = num(summary?.sakit);
      const terlambat = num(summary?.terlambat);
      const pulangCepat = num(summary?.pulangCepat);
      const kedatangan = num(summary?.kedatangan);
      const wajibAbsen = num(wajibMap.get(key));
      const alfa = Math.max(wajibAbsen - (hadir + izin + sakit), 0);
      const totalRekam = hadir + izin + sakit;
      const totalKaryawan = num(totalMap.get(key));

      return {
        id: key,
        tokoId: key,
        tokoNama: namaMap.get(key) || key,
        totalKaryawan,
        wajibAbsen,
        hadir,
        izin,
        sakit,
        alfa,
        terlambat,
        pulangCepat,
        kedatangan,
        totalRekam,
        persenHadir: getPersen(hadir, wajibAbsen),
        persenIzin: getPersen(izin, wajibAbsen),
        persenSakit: getPersen(sakit, wajibAbsen),
        persenAlfa: getPersen(alfa, wajibAbsen),
      } satisfies TokoDayChartItem;
    })
    .filter((r) => r.totalKaryawan > 0 || r.wajibAbsen > 0 || r.hadir > 0)
    .sort((a, b) => {
      if (b.persenHadir !== a.persenHadir) return b.persenHadir - a.persenHadir;
      return b.wajibAbsen - a.wajibAbsen;
    });
}

/* ═══════════════════════════════════════
   UI COMPONENTS
═══════════════════════════════════════ */

/* ── Mini Info Card ── */
function MiniInfoCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/80 px-3 py-2.5 shadow-sm">
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-emerald-600" strokeWidth={2.5} />
        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
          {label}
        </p>
      </div>
      <p className="mt-1 text-lg font-black text-slate-800">{value}</p>
    </div>
  );
}

/* ── Toko Comparison Dashboard (mirip InstansiComparisonDashboard di PTK) ── */
function TokoComparisonDashboard({
  data,
  periodeLabel,
}: {
  data: TokoDayChartItem[];
  periodeLabel: string;
}) {
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      if (b.persenHadir !== a.persenHadir) return b.persenHadir - a.persenHadir;
      return b.wajibAbsen - a.wajibAbsen;
    });
  }, [data]);

  const total = useMemo(() => {
    return sortedData.reduce(
      (acc, row) => {
        acc.toko += 1;
        acc.karyawan += row.totalKaryawan;
        acc.wajibAbsen += row.wajibAbsen;
        acc.hadir += row.hadir;
        acc.izin += row.izin;
        acc.sakit += row.sakit;
        acc.alfa += row.alfa;
        return acc;
      },
      { toko: 0, karyawan: 0, wajibAbsen: 0, hadir: 0, izin: 0, sakit: 0, alfa: 0 },
    );
  }, [sortedData]);

  const rataKehadiran =
    total.wajibAbsen > 0 ? Math.round((total.hadir / total.wajibAbsen) * 100) : 0;

  const highestRow = sortedData[0];
  const lowestRow = sortedData.length > 1 ? sortedData[sortedData.length - 1] : null;

  function getRankStyle(persen: number) {
    if (persen >= 90) return {
      badge: "bg-emerald-500 text-white shadow-emerald-200",
      bar: "from-emerald-500 to-green-500",
      text: "text-emerald-600",
      label: "Tinggi",
    };
    if (persen >= 70) return {
      badge: "bg-amber-400 text-white shadow-amber-200",
      bar: "from-amber-400 to-orange-500",
      text: "text-orange-500",
      label: "Sedang",
    };
    return {
      badge: "bg-rose-500 text-white shadow-rose-200",
      bar: "from-rose-500 to-red-500",
      text: "text-rose-500",
      label: "Perlu Perhatian",
    };
  }

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {/* HEADER */}
        <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <BarChart3 size={20} strokeWidth={2.7} />
              </div>
              <div className="min-w-0">
                <p className="text-base font-black text-slate-800">
                  Peringkat Kehadiran per Toko
                </p>
                <p className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                  Tanggal aktif · {periodeLabel}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[520px]">
              <MiniInfoCard label="Toko" value={total.toko} icon={Store} />
              <MiniInfoCard label="Wajib" value={total.wajibAbsen} icon={Users} />
              <MiniInfoCard label="Hadir" value={total.hadir} icon={CheckCircle2} />
              <MiniInfoCard label="Rata" value={`${rataKehadiran}%`} icon={Percent} />
            </div>
          </div>
        </div>

        {/* EMPTY */}
        {sortedData.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <BarChart3 size={28} className="text-slate-300" strokeWidth={2} />
            </div>
            <p className="mt-3 text-sm font-black text-slate-700">Belum ada data toko</p>
            <p className="mt-1 max-w-md text-xs font-semibold leading-relaxed text-slate-400">
              Data akan muncul setelah ada karyawan yang absen pada tanggal aktif.
            </p>
          </div>
        ) : (
          <>
            {/* RANKING LIST */}
            <div className="divide-y divide-slate-100 px-3 py-1.5 sm:px-5 sm:py-2">
              {sortedData.map((row, index) => {
                const style = getRankStyle(row.persenHadir);
                const isHighest = highestRow?.id === row.id;
                const isLowest = lowestRow?.id === row.id;

                return (
                  <div
                    key={row.id}
                    className="grid grid-cols-1 gap-2 py-2 lg:grid-cols-[minmax(260px,0.48fr)_minmax(260px,1fr)_110px_140px] lg:items-center"
                  >
                    {/* LEFT */}
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-black shadow-md ${style.badge}`}
                      >
                        {index + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black uppercase tracking-tight text-slate-800 sm:text-base">
                          {row.tokoNama}
                        </p>
                        <p className="mt-0.5 text-xs font-bold text-slate-500">
                          {row.wajibAbsen} karyawan wajib absensi
                        </p>
                      </div>
                    </div>

                    {/* PROGRESS */}
                    <div className="min-w-0 lg:border-l lg:border-slate-200 lg:pl-5">
                      {/* Mobile stat pill */}
                      <div className="mb-1.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2 lg:hidden">
                        <div />
                        <div className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 shadow-[0_10px_24px_rgba(15,23,42,0.08)] ring-1 ring-white">
                          <span className="text-[10px] font-black uppercase tracking-[0.08em] text-green-600">
                            H {row.hadir}
                          </span>
                          <span className="h-3 w-px bg-slate-200" />
                          <span className="text-[10px] font-black uppercase tracking-[0.08em] text-red-600">
                            A {row.alfa}
                          </span>
                          <span className="h-3 w-px bg-slate-200" />
                          <span className="text-[10px] font-black uppercase tracking-[0.08em] text-blue-600">
                            I {row.izin}
                          </span>
                          <span className="h-3 w-px bg-slate-200" />
                          <span className="text-[10px] font-black uppercase tracking-[0.08em] text-purple-600">
                            S {row.sakit}
                          </span>
                        </div>
                        <p className={`justify-self-end text-2xl font-black leading-none ${style.text}`}>
                          {row.persenHadir}%
                        </p>
                      </div>

                      {/* Progress bar */}
                      <div className="flex h-4 gap-0.5 overflow-hidden rounded-full bg-slate-100 p-[2px] shadow-inner ring-1 ring-slate-200/70">
                        {row.persenHadir > 0 && (
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-700"
                            style={{ width: `${row.persenHadir}%` }}
                            title={`Hadir: ${row.hadir}`}
                          />
                        )}
                        {row.persenAlfa > 0 && (
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-rose-400 to-red-500 transition-all duration-700"
                            style={{ width: `${row.persenAlfa}%` }}
                            title={`Alfa: ${row.alfa}`}
                          />
                        )}
                        {row.persenIzin > 0 && (
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-sky-400 to-blue-500 transition-all duration-700"
                            style={{ width: `${row.persenIzin}%` }}
                            title={`Izin: ${row.izin}`}
                          />
                        )}
                        {row.persenSakit > 0 && (
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-violet-400 to-purple-500 transition-all duration-700"
                            style={{ width: `${row.persenSakit}%` }}
                            title={`Sakit: ${row.sakit}`}
                          />
                        )}
                      </div>

                      {/* Desktop badges */}
                      <div className="mt-2 hidden flex-wrap gap-2 sm:flex">
                        <span className="rounded-full border border-green-100 bg-green-50/80 px-2.5 py-1 text-[10px] font-black text-green-700">
                          Hadir {row.hadir}
                        </span>
                        <span className="rounded-full border border-red-100 bg-red-50/80 px-2.5 py-1 text-[10px] font-black text-red-700">
                          Alfa {row.alfa}
                        </span>
                        <span className="rounded-full border border-blue-100 bg-blue-50/80 px-2.5 py-1 text-[10px] font-black text-blue-700">
                          Izin {row.izin}
                        </span>
                        <span className="rounded-full border border-purple-100 bg-purple-50/80 px-2.5 py-1 text-[10px] font-black text-purple-700">
                          Sakit {row.sakit}
                        </span>
                      </div>
                    </div>

                    {/* PERCENT (desktop only) */}
                    <div className="hidden items-center justify-end gap-3 lg:flex">
                      <p className={`text-3xl font-black leading-none ${style.text}`}>
                        {row.persenHadir}%
                      </p>
                    </div>

                    {/* BADGE (desktop only) */}
                    <div className="hidden lg:flex lg:justify-end">
                      {isHighest ? (
                        <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
                          ★ Tertinggi
                        </span>
                      ) : isLowest ? (
                        <span className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-600">
                          ↓ Terendah
                        </span>
                      ) : (
                        <span className="inline-flex rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-400">
                          {style.label}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* LEGEND */}
            <div className="border-t border-slate-100 px-3 pb-3 pt-2 sm:px-5 sm:pb-4 sm:pt-3">
              <div className="mx-auto grid max-w-4xl grid-cols-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex min-w-0 items-center justify-center gap-1.5 border-r border-slate-100 px-2 py-2 sm:gap-3 sm:px-4 sm:py-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 sm:h-4 sm:w-4" />
                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-black text-slate-800 sm:text-sm">Tinggi</p>
                    <p className="truncate text-[9px] font-bold text-slate-500 sm:text-xs">≥ 90%</p>
                  </div>
                </div>
                <div className="flex min-w-0 items-center justify-center gap-1.5 border-r border-slate-100 px-2 py-2 sm:gap-3 sm:px-4 sm:py-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-orange-400 sm:h-4 sm:w-4" />
                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-black text-slate-800 sm:text-sm">Sedang</p>
                    <p className="truncate text-[9px] font-bold text-slate-500 sm:text-xs">70% – 89%</p>
                  </div>
                </div>
                <div className="flex min-w-0 items-center justify-center gap-1.5 px-2 py-2 sm:gap-3 sm:px-4 sm:py-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500 sm:h-4 sm:w-4" />
                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-black text-slate-800 sm:text-sm">Perlu Perhatian</p>
                    <p className="truncate text-[9px] font-bold text-slate-500 sm:text-xs">&lt; 70%</p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Donut Chart Card ── */
function DonutChartCard({
  icon,
  title,
  subtitle,
  segments,
  centerLabel,
  centerValue,
  footerRows,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  segments: DonutSegment[];
  centerLabel: string;
  centerValue: string;
  footerRows: { label: string; value: string; valueClassName?: string }[];
}) {
  const total = segments.reduce((sum, item) => sum + Number(item.value || 0), 0);

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-50 text-slate-700">
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-slate-800">{title}</p>
            <p className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
              {subtitle}
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 pt-5 sm:px-5">
        <div className="grid min-w-0 grid-cols-1 gap-4 2xl:grid-cols-[minmax(170px,220px)_minmax(0,1fr)]">
          <div className="relative mx-auto h-[220px] w-full max-w-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPieChart>
                <Pie
                  data={segments}
                  dataKey="value"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={68}
                  outerRadius={96}
                  paddingAngle={3}
                  cornerRadius={6}
                  stroke="none"
                >
                  {segments.map((item) => (
                    <Cell key={item.label} fill={item.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    fontSize: "12px",
                    fontWeight: 700,
                  }}
                  formatter={(value) => {
                    const n = Number(value || 0);
                    const pct = total > 0 ? ((n / total) * 100).toFixed(1) : "0.0";
                    return [`${n} (${pct}%)`];
                  }}
                />
              </RechartsPieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                {centerLabel}
              </span>
              <span className="mt-1 text-center text-xl font-black text-slate-800">
                {centerValue}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid gap-2">
              {segments.map((segment) => (
                <div
                  key={segment.label}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: segment.color }} />
                    <span className="text-xs font-bold text-slate-700">{segment.label}</span>
                  </div>
                  <span className="text-sm font-black text-slate-800">{segment.value || 0}</span>
                </div>
              ))}
            </div>
            <div className="grid gap-2 border-t border-slate-100 pt-3">
              {footerRows.map((row) => (
                <div key={row.label} className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500">{row.label}</span>
                  <span className={`text-sm font-black ${row.valueClassName || "text-slate-800"}`}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Line Status Chart ── */
function LineStatusChart({
  data,
  selectedDateKey,
  onSelectDate,
}: {
  data: ChartDayItem[];
  selectedDateKey: string;
  onSelectDate: (dateKey: string) => void;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <LineChartIcon size={17} strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <p className="text-base font-black text-slate-800">Grafik Absensi per Hari</p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Tanggal tetap penuh, garis grafik terputus untuk tanggal yang belum berjalan
              </p>
            </div>
          </div>
          <div className="w-fit rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">Tanggal Aktif</p>
            <p className="text-sm font-black leading-tight text-slate-800">
              {selectedDateKey ? formatTanggalIndonesia(selectedDateKey) : "-"}
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 pt-5 sm:px-5">
        <div className="h-[320px] min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="4 8" stroke="rgba(148,163,184,0.25)" />
              <XAxis dataKey="dayNumber" tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 700 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 700 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "12px", fontWeight: 700 }}
                labelFormatter={(label) => `Tanggal ${label}`}
              />
              <Legend wrapperStyle={{ fontSize: "11px", fontWeight: 700 }} />
              <Line type="monotone" dataKey="grafikHadir" name="Hadir" stroke="#10b981" strokeWidth={2.2} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="grafikAlfa" name="Alfa" stroke="#ef4444" strokeWidth={2.2} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="grafikIzin" name="Izin" stroke="#3b82f6" strokeWidth={1.8} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="grafikSakit" name="Sakit" stroke="#a855f7" strokeWidth={1.8} dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {data.map((item) => {
            const active = item.tanggalKey === selectedDateKey;
            return (
              <button
                key={item.tanggalKey}
                type="button"
                onClick={() => { if (!item.isFuture) onSelectDate(item.tanggalKey); }}
                disabled={item.isFuture}
                className={`flex h-10 min-w-10 items-center justify-center rounded-xl border text-xs font-black transition ${
                  active
                    ? "border-emerald-300 bg-emerald-500 text-white shadow-sm shadow-emerald-200"
                    : item.isFuture
                      ? "border-slate-200 bg-slate-50 text-slate-300"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-white"
                }`}
              >
                {item.dayNumber}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════ */
export default function DashboardAbsensiAdminPage() {
  const [data, setData] = useState<ChartDayItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [jumlahKaryawan, setJumlahKaryawan] = useState(0);
  const [tokoNama, setTokoNama] = useState("Semua Toko");
  const [tokoOptions, setTokoOptions] = useState<TokoOption[]>([]);

  /* state untuk perbandingan toko */
  const [allKaryawanList, setAllKaryawanList] = useState<KaryawanItem[]>([]);
  const [pengaturanMap, setPengaturanMap] = useState<Map<string, any>>(new Map());
  const [tokoDailyData, setTokoDailyData] = useState<TokoDayChartItem[]>([]);

  const [selectedDateKey, setSelectedDateKey] = useState("");
  const [filterBulan, setFilterBulan] = useState(String(defaultMonth));
  const [filterTahun, setFilterTahun] = useState(String(defaultYear));
  const [filterTokoId, setFilterTokoId] = useState("");
  const [barChartMode, setBarChartMode] = useState<ChartMode>("hadir");
  const [showMobileFilter, setShowMobileFilter] = useState(false);
  const [showTanggalDropdown, setShowTanggalDropdown] = useState(false);

  const selectedMonth = Number(filterBulan) || defaultMonth;
  const selectedYear = Number(filterTahun) || defaultYear;
  const todayStr = getLocalDateKey(new Date());

  const showTokoComparison = !filterTokoId;

  const selectedDay = useMemo(() => {
    return (
      data.find((item) => item.tanggalKey === selectedDateKey) ||
      data.find((item) => item.tanggalKey === todayStr) ||
      data.find((item) => !item.isFuture) ||
      data[0] ||
      createEmptyFutureDay(todayStr, Number(todayStr.slice(8, 10)))
    );
  }, [data, selectedDateKey, todayStr]);

  const barModeConfig = CHART_MODES.find((item) => item.key === barChartMode) || CHART_MODES[0];
  const ChartModeIcon = barModeConfig.icon;

  const periodeLabel = `${getBulanLabel(selectedMonth)} ${selectedYear}`;
  const selectedTokoLabel =
    tokoOptions.find((item) => item.id === filterTokoId)?.nama || tokoNama || "Semua Toko";
  const hadirPct = getPersen(selectedDay.hadir, selectedDay.wajibAbsen);

  const summaryCards: SummaryCardItem[] = useMemo(() => [
    { label: "Wajib Absen", value: selectedDay.wajibAbsen, icon: Users, color: "blue" },
    { label: "Hadir", value: selectedDay.hadir, icon: CheckCircle2, color: "green" },
    { label: "Alfa", value: selectedDay.alfa, icon: UserX, color: "red" },
    { label: "Izin", value: selectedDay.izin, icon: Hand, color: "blue" },
    { label: "Sakit", value: selectedDay.sakit, icon: HeartPulse, color: "purple" },
    { label: "Terlambat", value: selectedDay.terlambat, icon: Clock, color: "orange" },
    { label: "Pulang Cepat", value: selectedDay.pulangCepat, icon: Timer, color: "yellow" },
    { label: "Tidak Absen Pulang", value: selectedDay.kedatangan, icon: AlertCircle, color: "slate" },
  ], [selectedDay]);

  const cycleBarChartMode = () => {
    const currentIdx = CHART_MODES.findIndex((m) => m.key === barChartMode);
    setBarChartMode(CHART_MODES[(currentIdx + 1) % CHART_MODES.length].key);
  };

  /* Reload toko comparison saat selectedDateKey berubah (hanya saat Semua Toko) */
  const reloadTokoDailyData = (
    dateKey: string,
    karyawanList: KaryawanItem[],
    pengMap: Map<string, any>,
    absensiDocs: any[],
    tokoOpts: TokoOption[],
  ) => {
    if (!dateKey || filterTokoId) {
      setTokoDailyData([]);
      return;
    }

    /* Bangun summary per toko per tanggal dari docs */
    const summaryByTokoDate = new Map<string, DailySummary>();
    absensiDocs.forEach((docSnap) => {
      const d = docSnap.data?.() ?? docSnap;
      const tanggal = String(d?.tanggalKerja || d?.tanggal || "").trim();
      if (!tanggal || tanggal !== dateKey) return;
      const tokoId = String(d?.tokoNama || "").trim();
      if (!tokoId) return;
      const compositeKey = `${tokoId}__${tanggal}`;
      const prev = summaryByTokoDate.get(compositeKey) || {
        id: compositeKey, tanggal, hadir: 0, izin: 0, sakit: 0, terlambat: 0, pulangCepat: 0, kedatangan: 0,
      };
      const status = String(d?.status || "").toLowerCase();
      const approvalStatus = String(d?.approvalStatus || "approved").toLowerCase();
      const hasMasuk = !!d?.jamMasuk;
      const hasPulang = !!d?.jamPulang;
      if (status === "izin" || status === "sakit") {
        if (approvalStatus === "approved") {
          if (status === "izin") prev.izin += 1;
          if (status === "sakit") prev.sakit += 1;
        }
      } else if (hasMasuk) {
        prev.hadir += 1;
        if (!hasPulang) prev.kedatangan += 1;
        if (status.includes("terlambat")) prev.terlambat += 1;
        if (status.includes("pulang_cepat")) prev.pulangCepat += 1;
      }
      summaryByTokoDate.set(compositeKey, prev);
    });

    const rows = buildTokoDailyRows({
      dateKey,
      karyawanList,
      pengaturanMap: pengMap,
      summaryByTokoDate,
      tokoOptions: tokoOpts,
    });
    setTokoDailyData(rows);
  };

  /* Simpan absensi docs di ref agar bisa dipakai ulang saat tanggal ganti */
  const absensiDocsRef = useRef<any[]>([]);

  const loadDashboardData = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    setLoading(true);

    try {
      const dateKeys = getDateKeysInMonth(selectedYear, selectedMonth);
      const start = dateKeys[0];
      const end = dateKeys[dateKeys.length - 1];

      const [
        karyawanSnap,
        pengaturanSnap,
        tidakWajibSnap,
        absensiByTanggalKerjaSnap,
        absensiByTanggalSnap,
      ] = await Promise.all([
        getDocs(query(collection(db, "karyawan"), where("aktif", "==", true))),
        getDocs(collection(db, "pengaturan_jam_absensi")),
        getDocs(collection(db, "karyawan_tidak_wajib_absen")),
        getDocs(query(collection(db, "absensi_karyawan"), where("tanggalKerja", ">=", start), where("tanggalKerja", "<=", end))),
        getDocs(query(collection(db, "absensi_karyawan"), where("tanggal", ">=", start), where("tanggal", "<=", end))),
      ]);

      const nextTidakWajibKaryawanIds = new Set<string>();
      tidakWajibSnap.docs.forEach((docSnap) => {
        const d = docSnap.data() as any;
        const status = String(d?.status || "").toLowerCase();
        const aktif =
          d?.aktif === true || d?.isActive === true || status === "aktif" || status === "active" || !status;
        const karyawanId = String(d?.karyawanId || docSnap.id || "").trim();
        if (aktif && karyawanId) nextTidakWajibKaryawanIds.add(karyawanId);
      });

      const baseKaryawanList: KaryawanItem[] = karyawanSnap.docs
        .map((docSnap) => {
          const d = docSnap.data() as any;
          const tokoNama = String(d?.tokoNama || "").trim();
          return {
            id: String(d?.karyawanId || docSnap.id || "").trim(),
            nama: String(d?.nama || "").trim(),
            tokoId: tokoNama,
            tokoNama,
            aktif: d?.aktif !== false,
          };
        })
        .filter(
          (item) => item.id && item.aktif && item.tokoNama && !nextTidakWajibKaryawanIds.has(item.id),
        );

      const nextTokoOptions = buildTokoOptions({ karyawanList: baseKaryawanList });

      const nextKaryawanList = filterTokoId
        ? baseKaryawanList.filter((item) => item.tokoId === filterTokoId)
        : baseKaryawanList;

      const nextTokoNama =
        nextTokoOptions.find((item) => item.id === filterTokoId)?.nama || "Semua Toko";

      const nextPengaturanMap = new Map<string, any>();
      pengaturanSnap.docs.forEach((docSnap) => {
        const d = docSnap.data() as any;
        if (docSnap.id === "default" || d?.scope === "default") { nextPengaturanMap.set("default", d); return; }
        if (d?.scope === "toko" && d?.tokoId) { nextPengaturanMap.set(`toko_${d.tokoId}`, d); return; }
        if (d?.scope === "toko" && d?.tokoNama) { nextPengaturanMap.set(`toko_${d.tokoNama}`, d); return; }
        if (d?.scope === "karyawan" && d?.karyawanId) { nextPengaturanMap.set(`karyawan_${d.karyawanId}`, d); return; }
        nextPengaturanMap.set(docSnap.id, d);
      });

      const absensiDocMap = new Map<string, any>();
      absensiByTanggalKerjaSnap.docs.forEach((docSnap) => absensiDocMap.set(docSnap.id, docSnap));
      absensiByTanggalSnap.docs.forEach((docSnap) => absensiDocMap.set(docSnap.id, docSnap));
      const allAbsensiDocs = Array.from(absensiDocMap.values());
      absensiDocsRef.current = allAbsensiDocs;

      const karyawanById = new Map<string, KaryawanItem>();
      baseKaryawanList.forEach((item) => karyawanById.set(item.id, item));

      const summaryMap = buildSummaryMapFromAbsensiDocs({
        docs: allAbsensiDocs,
        filterTokoId,
        karyawanById,
      });

      const nextData = buildDashboardRows({
        dateKeys,
        summaryMap,
        karyawanList: nextKaryawanList,
        tidakWajibKaryawanIds: nextTidakWajibKaryawanIds,
        pengaturanMap: nextPengaturanMap,
      });

      const nextSelectedDateKey = pickBestSelectedDate({
        data: nextData,
        currentSelectedDateKey: selectedDateKey,
        selectedMonth,
        selectedYear,
        todayStr,
      });

      setTokoNama(nextTokoNama);
      setTokoOptions(nextTokoOptions);
      setJumlahKaryawan(nextKaryawanList.length);
      setData(nextData);
      setSelectedDateKey(nextSelectedDateKey);
      setAllKaryawanList(baseKaryawanList);
      setPengaturanMap(nextPengaturanMap);

      /* Reload perbandingan toko */
      reloadTokoDailyData(
        nextSelectedDateKey,
        baseKaryawanList,
        nextPengaturanMap,
        allAbsensiDocs,
        nextTokoOptions,
      );

    } catch (err) {
      console.error("Gagal load dashboard absensi karyawan:", err);
      setData([]);
      setJumlahKaryawan(0);
      setTokoNama("Semua Toko");
      setTokoOptions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      setCurrentUserId(user?.uid || "");
      setAuthReady(true);

      if (!user) {
        setData([]);
        setJumlahKaryawan(0);
        setTokoNama("Semua Toko");
        setTokoOptions([]);
        setAllKaryawanList([]);
        setPengaturanMap(new Map());
        setTokoDailyData([]);
        absensiDocsRef.current = [];
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady || !currentUserId) return;
    loadDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, currentUserId, filterBulan, filterTahun, filterTokoId]);

  /* Reload toko comparison saat selectedDateKey berubah */
  useEffect(() => {
    if (!showTokoComparison || !selectedDateKey || allKaryawanList.length === 0) return;
    reloadTokoDailyData(selectedDateKey, allKaryawanList, pengaturanMap, absensiDocsRef.current, tokoOptions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDateKey]);

  const handleFilterChange = (next: { bulan?: string; tahun?: string; tokoId?: string }) => {
    if (next.bulan !== undefined) setFilterBulan(next.bulan);
    if (next.tahun !== undefined) setFilterTahun(next.tahun);
    if (next.tokoId !== undefined) {
      setFilterTokoId(next.tokoId);
      setTokoDailyData([]);
    }
  };

  const totalBulan = useMemo(() => {
    return data.reduce(
      (acc, item) => {
        if (item.isFuture) return acc;
        acc.wajibAbsen += item.wajibAbsen;
        acc.hadir += item.hadir;
        acc.izin += item.izin;
        acc.sakit += item.sakit;
        acc.alfa += item.alfa;
        acc.terlambat += item.terlambat;
        acc.pulangCepat += item.pulangCepat;
        acc.kedatangan += item.kedatangan;
        return acc;
      },
      { wajibAbsen: 0, hadir: 0, izin: 0, sakit: 0, alfa: 0, terlambat: 0, pulangCepat: 0, kedatangan: 0 },
    );
  }, [data]);

  const kehadiranSegments = useMemo<DonutSegment[]>(() => [
    { label: "Hadir", value: selectedDay.hadir, color: "#10b981" },
    { label: "Tidak Hadir", value: Math.max(selectedDay.wajibAbsen - selectedDay.hadir, 0), color: "#f43f5e" },
  ], [selectedDay]);

  const statusTidakHadirSegments = useMemo<DonutSegment[]>(() => [
    { label: "Alfa", value: selectedDay.alfa, color: "#ef4444" },
    { label: "Izin", value: selectedDay.izin, color: "#3b82f6" },
    { label: "Sakit", value: selectedDay.sakit, color: "#a855f7" },
  ], [selectedDay]);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-white text-slate-900">
      <main className="relative z-10 w-full space-y-4 p-3 pb-28 sm:p-4 lg:p-5">

        {/* ── HEADER ── */}
        <div className="relative overflow-hidden rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-800 px-4 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-18px_42px_rgba(6,78,59,0.24)] sm:px-5 sm:py-5">
          <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20 sm:h-12 sm:w-12">
                <House size={28} className="text-white sm:h-8 sm:w-8" strokeWidth={2.5} />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                  Dashboard Absensi
                </h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-emerald-50/85 sm:text-sm">
                  Rekap absensi harian khusus karyawan.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => loadDashboardData()}
                disabled={loading}
                className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                title="Refresh data"
              >
                <RefreshCw size={15} strokeWidth={2.5} className={loading ? "animate-spin" : ""} />
              </button>
            </div>
          </div>
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-yellow-300/10 blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-0 opacity-[0.05]">
            <Cpu size={170} className="text-white" strokeWidth={1} />
          </div>
        </div>

        {/* ── FILTER ── */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setShowMobileFilter((prev) => !prev)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 lg:hidden"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <CalendarRange size={17} strokeWidth={2.5} />
              </div>
              <div className="min-w-0 text-left">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                  Filter Dashboard
                </p>
                <p className="truncate text-sm font-black text-slate-800">
                  {selectedTokoLabel} ·{" "}
                  {selectedDateKey ? formatTanggalIndonesia(selectedDateKey) : `${getBulanLabel(selectedMonth)} ${selectedYear}`}
                </p>
              </div>
            </div>
            <ChevronDown
              size={18}
              strokeWidth={2.5}
              className={`shrink-0 text-slate-400 transition-transform ${showMobileFilter ? "rotate-180" : "rotate-0"}`}
            />
          </button>

          <div className={`border-t border-slate-100 p-4 lg:block lg:border-t-0 ${showMobileFilter ? "block" : "hidden"}`}>
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-5">
              {/* Toko */}
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  Toko Harian
                </label>
                <div className="relative">
                  <Store size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2.5} />
                  <select
                    value={filterTokoId}
                    onChange={(e) => handleFilterChange({ tokoId: e.target.value })}
                    className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm font-bold text-slate-700 outline-none focus:border-emerald-400"
                  >
                    <option value="">Semua Toko</option>
                    {tokoOptions.map((item) => (
                      <option key={item.id} value={item.id}>{item.nama}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2.5} />
                </div>
              </div>

              {/* Bulan */}
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  Bulan
                </label>
                <div className="relative">
                  <select
                    value={filterBulan}
                    onChange={(e) => handleFilterChange({ bulan: e.target.value })}
                    className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-9 text-sm font-bold text-slate-700 outline-none focus:border-emerald-400"
                  >
                    {bulanOptions.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2.5} />
                </div>
              </div>

              {/* Tahun */}
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  Tahun
                </label>
                <input
                  inputMode="numeric"
                  value={filterTahun}
                  onChange={(e) => handleFilterChange({ tahun: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-emerald-400"
                  placeholder="2026"
                />
              </div>

              {/* Grafik mode */}
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  Grafik Batang Harian
                </label>
                <button
                  type="button"
                  onClick={cycleBarChartMode}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-black text-slate-700 outline-none hover:bg-slate-50"
                >
                  <span className="inline-flex items-center gap-2">
                    <ChartModeIcon size={16} style={{ color: barModeConfig.color }} strokeWidth={2.5} />
                    {barModeConfig.label}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Ganti</span>
                </button>
              </div>

              {/* Tanggal aktif */}
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  Tanggal Aktif
                </label>
                {showTokoComparison ? (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowTanggalDropdown((prev) => !prev)}
                      className="flex w-full items-center justify-between rounded-xl border border-emerald-300 bg-white px-3 py-2.5 text-sm font-black text-slate-700 outline-none ring-2 ring-emerald-500/10"
                    >
                      <span>{selectedDateKey ? formatTanggalIndonesia(selectedDateKey) : "Pilih tanggal"}</span>
                      <ChevronDown
                        size={14}
                        className={`text-slate-400 transition-transform ${showTanggalDropdown ? "rotate-180" : "rotate-0"}`}
                        strokeWidth={2.5}
                      />
                    </button>
                    {showTanggalDropdown && (
                      <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 max-h-[320px] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
                        <div className="grid grid-cols-2 gap-1">
                          {data.filter((item) => !item.isFuture).map((item) => {
                            const active = selectedDateKey === item.tanggalKey;
                            return (
                              <button
                                key={item.tanggalKey}
                                type="button"
                                onClick={() => { setSelectedDateKey(item.tanggalKey); setShowTanggalDropdown(false); }}
                                className={`rounded-xl px-2.5 py-2 text-left text-xs font-black transition ${
                                  active
                                    ? "bg-emerald-600 text-white"
                                    : "text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
                                }`}
                              >
                                {formatTanggalIndonesia(item.tanggalKey)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex h-[42px] items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-black text-slate-700">
                    {selectedDateKey ? formatTanggalIndonesia(selectedDateKey) : `${getBulanLabel(selectedMonth)} ${selectedYear}`}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── LOADING ── */}
        {loading && data.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="flex justify-center py-16"
          >
            <div className="flex flex-col items-center gap-3">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
                className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-emerald-500"
              />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Memuat data...</p>
            </div>
          </motion.div>
        )}

        {/* ── EMPTY ── */}
        {!loading && data.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <Activity size={28} className="text-slate-300" strokeWidth={2} />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Belum ada data absensi pada periode ini
            </p>
          </div>
        )}

        {/* ── CONTENT ── */}
        {data.length > 0 && (
          <>
            {/* ══ SEMUA TOKO: Toko Comparison ══ */}
            {showTokoComparison && (
              <TokoComparisonDashboard
                data={tokoDailyData}
                periodeLabel={
                  selectedDateKey ? formatTanggalIndonesia(selectedDateKey) : periodeLabel
                }
              />
            )}

            {/* ══ TOKO DIPILIH: Detail Dashboard ══ */}
            {!showTokoComparison && (
              <>
                {/* Summary cards — 2 kolom di mobile, 4 kolom di desktop */}
                <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
                  {summaryCards.map((card) => (
                    <SummaryCard key={card.label} {...card} />
                  ))}
                </div>

                {/* Donuts */}
                <div className="grid min-w-0 grid-cols-1 gap-4 2xl:grid-cols-2">
                  <DonutChartCard
                    icon={<PieChartIcon size={18} strokeWidth={2.5} />}
                    title="Kehadiran per Tanggal"
                    subtitle={`Tanggal aktif: ${selectedDateKey ? formatTanggalIndonesia(selectedDateKey) : "-"} • ${selectedTokoLabel}`}
                    segments={kehadiranSegments}
                    centerLabel="Hadir"
                    centerValue={`${hadirPct}%`}
                    footerRows={[
                      { label: "Wajib Absen", value: String(selectedDay.wajibAbsen), valueClassName: "text-blue-700" },
                      { label: "Jumlah Karyawan", value: String(jumlahKaryawan) },
                    ]}
                  />
                  <DonutChartCard
                    icon={<CalendarRange size={18} strokeWidth={2.5} />}
                    title="Status Tidak Hadir"
                    subtitle={`Tanggal aktif: ${selectedDateKey ? formatTanggalIndonesia(selectedDateKey) : "-"} • ${selectedTokoLabel}`}
                    segments={statusTidakHadirSegments}
                    centerLabel="Total"
                    centerValue={String(selectedDay.alfa + selectedDay.izin + selectedDay.sakit)}
                    footerRows={[
                      { label: "Izin/Sakit Approved", value: `${selectedDay.izin} / ${selectedDay.sakit}`, valueClassName: "text-sky-700" },
                      { label: "Alfa", value: String(selectedDay.alfa), valueClassName: "text-red-700" },
                    ]}
                  />
                </div>

                {/* Line chart */}
                <LineStatusChart
                  data={data}
                  selectedDateKey={selectedDateKey}
                  onSelectDate={setSelectedDateKey}
                />

                {/* Bar chart */}
                <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-2xl"
                          style={{ backgroundColor: `${barModeConfig.color}18`, color: barModeConfig.color }}
                        >
                          <ChartModeIcon size={18} strokeWidth={2.5} />
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-800">{barModeConfig.label} per Hari</p>
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                            Tanggal penuh, batang grafik kosong untuk tanggal yang belum berjalan
                          </p>
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Total Periode Ini</p>
                        <p className="text-sm font-black text-slate-800">{totalBulan[barChartMode]}</p>
                      </div>
                    </div>
                  </div>

                  <div className="h-[320px] min-w-0 p-4 sm:p-5">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data} margin={{ top: 6, right: 10, left: -14, bottom: 0 }} barCategoryGap="20%">
                        <CartesianGrid strokeDasharray="4 8" stroke="rgba(148,163,184,0.25)" />
                        <XAxis dataKey="dayNumber" tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 700 }} axisLine={false} tickLine={false} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 700 }} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "12px", fontWeight: 700 }}
                          cursor={{ fill: "#f1f5f9" }}
                          formatter={(value) => [`${value} karyawan`, barModeConfig.label]}
                          labelFormatter={(label) => `Tanggal ${label}`}
                        />
                        <Bar dataKey={getGraphKey(barChartMode)} fill={barModeConfig.color} radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════
   COLOR CONFIG & SUMMARY CARD
═══════════════════════════════════════ */
const colorConfig = {
  green: { border: "border-l-green-500", iconBg: "bg-green-500/10", iconColor: "text-green-600", watermark: "text-green-500/5" },
  blue: { border: "border-l-blue-500", iconBg: "bg-blue-500/10", iconColor: "text-blue-600", watermark: "text-blue-500/5" },
  red: { border: "border-l-red-500", iconBg: "bg-red-500/10", iconColor: "text-red-600", watermark: "text-red-500/5" },
  orange: { border: "border-l-orange-500", iconBg: "bg-orange-500/10", iconColor: "text-orange-600", watermark: "text-orange-500/5" },
  yellow: { border: "border-l-yellow-500", iconBg: "bg-yellow-500/10", iconColor: "text-yellow-600", watermark: "text-yellow-500/5" },
  slate: { border: "border-l-slate-400", iconBg: "bg-slate-100", iconColor: "text-slate-600", watermark: "text-slate-400/5" },
  purple: { border: "border-l-purple-500", iconBg: "bg-purple-500/10", iconColor: "text-purple-600", watermark: "text-purple-500/5" },
};

function SummaryCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  color: SummaryCardColor;
}) {
  const c = colorConfig[color];
  return (
    <div className={`group relative overflow-hidden rounded-xl border-l-4 ${c.border} border-t border-r border-b border-slate-200 bg-white p-3 transition-all duration-300 hover:shadow-md sm:p-4`}>
      <div className="flex items-center gap-2 sm:gap-3">
        <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${c.iconBg} transition-transform duration-300 group-hover:scale-105 sm:h-10 sm:w-10`}>
          <Icon size={17} className={`sm:h-[19px] sm:w-[19px] ${c.iconColor}`} strokeWidth={2.5} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[9px] font-bold uppercase leading-tight tracking-wide text-slate-400 sm:text-[10px]">
            {label}
          </p>
          <p className="text-xl font-black leading-tight text-slate-800 sm:text-2xl">{value}</p>
        </div>
      </div>
      <div className="pointer-events-none absolute -bottom-4 -right-4">
        <Icon size={68} className={c.watermark} strokeWidth={1.5} />
      </div>
    </div>
  );
}