/* app/admin/transaksi/page.tsx */

"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDocs,
  query,
  orderBy,
  runTransaction,
  serverTimestamp,
  getDoc,
  where,
} from "firebase/firestore";
import {
  ShoppingCart,
  Search,
  Store,
  Percent,
  Wallet,
  Receipt,
  RefreshCw,
  Trash2,
  Plus,
  Minus,
  BadgeDollarSign,
  CircleDollarSign,
  CheckCircle2,
  AlertCircle,
  Boxes,
  Layers3,
  Camera,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Clock,
  Smartphone,
  Wifi,
  Zap,
  Ticket,
  Gamepad2,
  User2,
  Mail,
  Target,
  Cpu,
  X,
  ChevronDown,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  type Toko,
  type Barang,
  type Diskon,
  type MetodePembayaran,
  type CartItem,
  type StrukData,
  type LaporanKategoriBreakdown,
  type MasterSaldoDigital,
  type DigitalSaldoUsage,
  type AddToCartMode,
  formatRupiah,
  formatRibuanInput,
  formatPercent,
  normalizeBarcode,
  hitungHargaSetelahDiskon,
  getBestDiskonForBarang,
  hitungPromoCartItem,
  getTanggalParts,
  buildLaporanPayload,
  formatJenisBarangLabel,
  formatSubJenisDigitalLabel,
  getDigitalIcon,
  digitalButuhTujuan,
  getTujuanLabel,
  FieldLabel,
  ModalStruk,
} from "@/lib/transaksi/route";

type UserProfile = {
  uid: string;
  nama: string;
  email: string;
  role: string;
  roles: string[];
  tokoId: string;
  tokoNama: string;
};

type TransaksiBarang = Omit<Barang, "nominalProduk"> & {
  nominalProduk?: string;
  kodeBarcode?: string;
  barcodeValue?: string;
};

type TransaksiCartItem = Omit<CartItem, "nominalProduk"> & {
  nominalProduk?: string;
  kodeBarcode?: string;
  barcodeValue?: string;
};

type PelangganTransaksi = {
  id: string;
  uid?: string;
  nama: string;
  telepon: string;
  email: string;
  nomorKartu: string;
  kodePelanggan: string;
  aktif: boolean;
  tipeMember: string;
  poin: number;
  totalTransaksi: number;
  diskon: number;
};

type RiwayatTransaksiItem = {
  id: string;
  nomorTransaksi: string;
  tokoId: string;
  tokoNama: string;
  metodePembayaranNama: string;
  metodePembayaranTipe: string;
  metodePembayaranProvider?: string;
  biayaAdminPersen?: number;
  subtotal: number;
  totalDiskon: number;
  totalSetelahDiskon: number;
  biayaAdminNominal: number;
  grandTotal: number;
  totalModal: number;
  estimasiLabaKotor: number;
  uangBayar?: number;
  kembalian?: number;
  pelangganId?: string;
  pelangganNama?: string;
  pelangganKode?: string;
  pelangganTipeMember?: string;
  diskonPelangganPersen?: number;
  diskonPelangganNominal?: number;
  totalItem: number;
  totalJenisBarang: number;
  status: string;
  jenisTransaksi: "fisik" | "digital";
  kasirNama: string;
  kasirEmail: string;
  catatan: string;
  returStatus?: "belum" | "sebagian" | "penuh";
  returQtyByBarangId?: Record<string, number>;
  totalReturQty?: number;
  totalReturNominal?: number;
  totalReturSubtotal?: number;
  totalReturDiskon?: number;
  totalReturSetelahDiskon?: number;
  totalReturModal?: number;
  totalReturBiayaAdmin?: number;
  totalReturLabaKotor?: number;
  subtotalBersih?: number;
  totalDiskonBersih?: number;
  totalSetelahDiskonBersih?: number;
  biayaAdminBersih?: number;
  grandTotalBersih?: number;
  totalModalBersih?: number;
  estimasiLabaKotorBersih?: number;
  totalItemBersih?: number;
  items: Array<any>;
  createdAtMs: number;
  createdAt?: any;
};

type ReturSelectionMap = Record<string, number>;
type MobileKasirStep = "barang" | "keranjang" | "bayar" | "riwayat";

type ReturSelectedRow = {
  item: any;
  index: number;
  key: string;
  qtyRetur: number;
  qtyTerjual: number;
  qtySudahRetur: number;
  qtySisa: number;
};

const getReturKey = (item: any, index: number) =>
  String(item?.barangId || item?.kodeBarang || item?.nama || `item-${index}`);

const getReturQty = (
  trx: RiwayatTransaksiItem | null,
  item: any,
  index: number,
) => {
  if (!trx) return 0;
  const map = trx.returQtyByBarangId || {};
  const key = getReturKey(item, index);
  return Number(map[key] || map[item?.barangId] || 0);
};

const getReturSisaQty = (
  trx: RiwayatTransaksiItem | null,
  item: any,
  index: number,
) => {
  const qty = Number(item?.qty || 0);
  const returQty = getReturQty(trx, item, index);
  return Math.max(0, qty - returQty);
};

const normalizeTransaksiHistory = (
  id: string,
  data: any,
): RiwayatTransaksiItem => ({
  id,
  nomorTransaksi: String(data?.nomorTransaksi || "-"),
  tokoId: String(data?.tokoId || ""),
  tokoNama: String(data?.tokoNama || "-"),
  metodePembayaranNama: String(data?.metodePembayaranNama || "-"),
  metodePembayaranTipe: String(data?.metodePembayaranTipe || ""),
  metodePembayaranProvider: String(data?.metodePembayaranProvider || ""),
  biayaAdminPersen: Number(data?.biayaAdminPersen || 0),
  subtotal: Number(data?.subtotal || 0),
  totalDiskon: Number(data?.totalDiskon || 0),
  totalSetelahDiskon: Number(data?.totalSetelahDiskon || 0),
  biayaAdminNominal: Number(data?.biayaAdminNominal || 0),
  grandTotal: Number(data?.grandTotal || 0),
  totalModal: Number(data?.totalModal || 0),
  estimasiLabaKotor: Number(data?.estimasiLabaKotor || 0),
  uangBayar: Number(data?.uangBayar || 0),
  kembalian: Number(data?.kembalian || 0),
  pelangganId: String(data?.pelangganId || ""),
  pelangganNama: String(data?.pelangganNama || ""),
  pelangganKode: String(data?.pelangganKode || ""),
  pelangganTipeMember: String(data?.pelangganTipeMember || ""),
  diskonPelangganPersen: Number(data?.diskonPelangganPersen || 0),
  diskonPelangganNominal: Number(data?.diskonPelangganNominal || 0),
  totalItem: Number(data?.totalItem || 0),
  totalJenisBarang: Number(data?.totalJenisBarang || 0),
  status: String(data?.status || ""),
  jenisTransaksi: (data?.jenisTransaksi || "fisik") as "fisik" | "digital",
  kasirNama: String(data?.kasirNama || "-"),
  kasirEmail: String(data?.kasirEmail || "-"),
  catatan: String(data?.catatan || ""),
  returStatus: data?.returStatus || "belum",
  returQtyByBarangId:
    data?.returQtyByBarangId && typeof data.returQtyByBarangId === "object"
      ? data.returQtyByBarangId
      : {},
  totalReturQty: Number(data?.totalReturQty || 0),
  totalReturNominal: Number(data?.totalReturNominal || 0),
  totalReturSubtotal: Number(data?.totalReturSubtotal || 0),
  totalReturDiskon: Number(data?.totalReturDiskon || 0),
  totalReturSetelahDiskon: Number(data?.totalReturSetelahDiskon || 0),
  totalReturModal: Number(data?.totalReturModal || 0),
  totalReturBiayaAdmin: Number(data?.totalReturBiayaAdmin || 0),
  totalReturLabaKotor: Number(data?.totalReturLabaKotor || 0),
  subtotalBersih: Number(data?.subtotalBersih ?? data?.subtotal ?? 0),
  totalDiskonBersih: Number(data?.totalDiskonBersih ?? data?.totalDiskon ?? 0),
  totalSetelahDiskonBersih: Number(data?.totalSetelahDiskonBersih ?? data?.totalSetelahDiskon ?? 0),
  biayaAdminBersih: Number(data?.biayaAdminBersih ?? data?.biayaAdminNominal ?? 0),
  grandTotalBersih: Number(data?.grandTotalBersih ?? data?.grandTotal ?? 0),
  totalModalBersih: Number(data?.totalModalBersih ?? data?.totalModal ?? 0),
  estimasiLabaKotorBersih: Number(
    data?.estimasiLabaKotorBersih ?? data?.estimasiLabaKotor ?? 0,
  ),
  totalItemBersih: Number(data?.totalItemBersih ?? data?.totalItem ?? 0),
  items: Array.isArray(data?.items) ? data.items : [],
  createdAtMs: Number(data?.createdAtMs || 0),
  createdAt: data?.createdAt,
});

const formatTanggalJam = (value: number) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

type RiwayatRangeFilter = "today" | "yesterday" | "7d" | "30d" | "90d" | "custom";

const RIWAYAT_TRANSAKSI_LIMIT = 200;

const padDatePart = (value: number) => String(value).padStart(2, "0");

const toDateInputValue = (date = new Date()) => {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(
    date.getDate(),
  )}`;
};

const parseDateInput = (value: string) => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const startOfDayMs = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next.getTime();
};

const endOfDayMs = (date: Date) => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next.getTime();
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const buildRiwayatDateRangeMs = (
  range: RiwayatRangeFilter,
  customStartDate: string,
  customEndDate: string,
) => {
  const now = new Date();

  if (range === "today") {
    return { startMs: startOfDayMs(now), endMs: endOfDayMs(now) };
  }

  if (range === "yesterday") {
    const yesterday = addDays(now, -1);
    return { startMs: startOfDayMs(yesterday), endMs: endOfDayMs(yesterday) };
  }

  if (range === "custom") {
    const startDate = parseDateInput(customStartDate) || now;
    const endDate = parseDateInput(customEndDate) || startDate;
    const startMs = startOfDayMs(startDate);
    const endMs = endOfDayMs(endDate);

    return startMs <= endMs
      ? { startMs, endMs }
      : { startMs: startOfDayMs(endDate), endMs: endOfDayMs(startDate) };
  }

  const days = range === "90d" ? 90 : range === "30d" ? 30 : 7;
  return {
    startMs: startOfDayMs(addDays(now, -(days - 1))),
    endMs: endOfDayMs(now),
  };
};

const normalizeRoles = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) =>
      String(item || "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
};

const isAdminProfile = (profile: UserProfile | null) => {
  if (!profile) return false;
  const role = String(profile.role || "")
    .trim()
    .toLowerCase();
  if (role === "admin" || role === "superadmin") return true;
  return (
    profile.roles.includes("admin") || profile.roles.includes("superadmin")
  );
};

const splitKodeUnikScanValues = (value: unknown) => {
  return String(value || "")
    .split(/[\n\r,;|/]+/g)
    .map((item) => normalizeBarcode(item))
    .filter(Boolean);
};

const SCANNER_MIN_LENGTH = 3;
const SCANNER_IDLE_COMMIT_MS = 950;
const SCANNER_RESET_GAP_MS = 1500;
const SCANNER_DUPLICATE_LOCK_MS = 900;

const normalizeScannerValue = (value: unknown) => {
  return normalizeBarcode(
    String(value || "")
      .replace(/[\t\n\r]/g, "")
      .trim(),
  );
};

const getDigitalNominalPotong = (
  item: Pick<TransaksiCartItem, "jenisBarang" | "hargaModal" | "qty">,
) => {
  if (item.jenisBarang !== "digital") return 0;

  const hargaModal = Number(item.hargaModal || 0);
  const qty = Number(item.qty || 0);

  if (hargaModal <= 0 || qty <= 0) return 0;

  return hargaModal * qty;
};

const buildDigitalSaldoUsageTransaksi = (
  cart: TransaksiCartItem[],
): DigitalSaldoUsage[] => {
  const map = new Map<string, DigitalSaldoUsage>();

  for (const item of cart) {
    if (item.jenisBarang !== "digital") continue;

    const saldoSourceId = String(item.saldoSourceId || "").trim();
    if (!saldoSourceId) continue;

    const totalPotong = getDigitalNominalPotong(item);
    const prev = map.get(saldoSourceId) || {
      saldoSourceId,
      saldoSourceNama:
        String(item.saldoSourceNama || "").trim() || "Tanpa Sumber Saldo",
      totalPotong: 0,
      totalItem: 0,
      totalQty: 0,
      providers: [],
      barangIds: [],
    };

    const provider = String(item.provider || "").trim();
    const barangId = String(item.barangId || "").trim();

    if (provider && !prev.providers.includes(provider)) prev.providers.push(provider);
    if (barangId && !prev.barangIds.includes(barangId)) prev.barangIds.push(barangId);

    prev.totalPotong += totalPotong;
    prev.totalItem += 1;
    prev.totalQty += Number(item.qty || 0);

    if (!prev.saldoSourceNama && item.saldoSourceNama) {
      prev.saldoSourceNama = String(item.saldoSourceNama).trim();
    }

    map.set(saldoSourceId, prev);
  }

  return Array.from(map.values()).sort((a, b) => b.totalPotong - a.totalPotong);
};

const validateDigitalSaldoUsageTransaksi = (cart: TransaksiCartItem[]) => {
  const digitalItems = cart.filter((item) => item.jenisBarang === "digital");

  for (const item of digitalItems) {
    if (!String(item.saldoSourceId || "").trim()) {
      return `Sumber saldo untuk ${item.nama} belum dipilih`;
    }

    if (Number(item.hargaModal || 0) <= 0) {
      return `Harga modal produk digital untuk ${item.nama} tidak valid`;
    }
  }

  return null;
};

const buildDigitalSaldoRingkasanTransaksi = (cart: TransaksiCartItem[]) => {
  return buildDigitalSaldoUsageTransaksi(cart)
    .map((item) => {
      const providerLabel =
        item.providers.length > 0 ? ` · ${item.providers.join(", ")}` : "";
      return `${item.saldoSourceNama}${providerLabel}: ${formatRupiah(
        item.totalPotong,
      )}`;
    })
    .join("");
};

const getPromoReminderText = (diskon?: Diskon | null) => {
  if (!diskon) return "";

  const jenisPromo = String(diskon.jenisPromo || "diskon_langsung");
  const nilaiDiskon = Number(diskon.nilaiDiskon || 0);
  const minimalQty = Number(diskon.minimalQty || 0);
  const gratisQty = Number(diskon.gratisQty || 0);

  if (jenisPromo === "beli_x_gratis_y") {
    if (minimalQty > 0 && gratisQty > 0) {
      return `Ada promo: beli ${minimalQty} gratis ${gratisQty}`;
    }
    return `Ada promo: ${diskon.namaPromo}`;
  }

  if (jenisPromo === "beli_x_diskon_nominal") {
    if (minimalQty > 0 && nilaiDiskon > 0) {
      return `Ada promo: beli ${minimalQty} hemat ${formatRupiah(nilaiDiskon)}`;
    }
    return `Ada promo: ${diskon.namaPromo}`;
  }

  if (nilaiDiskon > 0) {
    return diskon.tipeDiskon === "persen"
      ? `Ada promo: diskon ${nilaiDiskon}%`
      : `Ada promo: diskon ${formatRupiah(nilaiDiskon)}`;
  }

  return `Ada promo: ${diskon.namaPromo}`;
};


export default function TransaksiPage() {
  const [loading, setLoading] = useState(false);
  const [barangLoading, setBarangLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);

  const [tokoList, setTokoList] = useState<Toko[]>([]);
  const [barangList, setBarangList] = useState<TransaksiBarang[]>([]);
  const [diskonList, setDiskonList] = useState<Diskon[]>([]);
  const [metodeList, setMetodeList] = useState<MetodePembayaran[]>([]);
  const [saldoList, setSaldoList] = useState<MasterSaldoDigital[]>([]);
  const [pelangganList, setPelangganList] = useState<PelangganTransaksi[]>([]);
  const [currentUserProfile, setCurrentUserProfile] =
    useState<UserProfile | null>(null);

  const [selectedTokoId, setSelectedTokoId] = useState("");
  const [selectedMetodeId, setSelectedMetodeId] = useState("");
  const [searchBarang, setSearchBarang] = useState("");
  const [uangBayar, setUangBayar] = useState("");
  const [catatan, setCatatan] = useState("");
  const [activeTab, setActiveTab] = useState<"fisik" | "digital">("fisik");
  const [selectedPelangganId, setSelectedPelangganId] = useState("");
  const [cartFisik, setCartFisik] = useState<TransaksiCartItem[]>([]);
  const [cartDigital, setCartDigital] = useState<TransaksiCartItem[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  type StrukDataWithPelanggan = Omit<StrukData, "items"> & {
    items: Array<any>;
    pelangganId?: string;
    pelangganNama?: string;
    pelangganKode?: string;
    pelangganTipeMember?: string;
    diskonPelangganPersen?: number;
    diskonPelangganNominal?: number;
  };

  const [strukModal, setStrukModal] = useState<StrukDataWithPelanggan | null>(
    null,
  );
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);

  const [riwayatTransaksi, setRiwayatTransaksi] = useState<
    RiwayatTransaksiItem[]
  >([]);
  const [riwayatLoading, setRiwayatLoading] = useState(false);
  const [riwayatRange, setRiwayatRange] = useState<RiwayatRangeFilter>("7d");
  const [riwayatStartDate, setRiwayatStartDate] = useState(() =>
    toDateInputValue(addDays(new Date(), -6)),
  );
  const [riwayatEndDate, setRiwayatEndDate] = useState(() =>
    toDateInputValue(new Date()),
  );
  const [returModal, setReturModal] = useState<RiwayatTransaksiItem | null>(
    null,
  );
  const [returSelections, setReturSelections] = useState<ReturSelectionMap>({});
  const [returCatatan, setReturCatatan] = useState("");
  const [returLoading, setReturLoading] = useState(false);

  const [cameraSupported, setCameraSupported] = useState(true);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStatus, setCameraStatus] = useState(
    "Arahkan barcode ke area scan",
  );
  const [lastCameraResult, setLastCameraResult] = useState("");

  const scanBufferRef = useRef("");
  const scanStartedAtRef = useRef(0);
  const scanLastTimeRef = useRef(0);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanLastCommittedRef = useRef("");
  const scanLastCommittedAtRef = useRef(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraDetectorRef = useRef<InstanceType<
    NonNullable<typeof window.BarcodeDetector>
  > | null>(null);
  const cameraRafRef = useRef<number | null>(null);
  const cameraDetectingRef = useRef(false);
  const cameraLastDetectAtRef = useRef(0);
  const cameraCooldownUntilRef = useRef(0);

  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [mobileKasirStep, setMobileKasirStep] = useState<MobileKasirStep>("barang");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(max-width: 639px)");
    const syncMobileLayout = () => setIsMobileLayout(media.matches);

    syncMobileLayout();

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", syncMobileLayout);
      return () => media.removeEventListener("change", syncMobileLayout);
    }

    media.addListener(syncMobileLayout);
    return () => media.removeListener(syncMobileLayout);
  }, []);

  const beepAudioContextRef = useRef<AudioContext | null>(null);

  const playSuccessBeep = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!beepAudioContextRef.current)
        beepAudioContextRef.current = new AudioCtx();
      const ctx = beepAudioContextRef.current;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(1046, ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.11);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.12);
    } catch (e) {
      console.error("Gagal memainkan bunyi scan:", e);
    }
  };

  const fetchCurrentUserProfile = async (
    uid: string,
    emailFallback?: string | null,
  ) => {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const data = snap.data() as any;
        const profile: UserProfile = {
          uid,
          nama: String(data?.nama || "").trim() || "Tanpa Nama",
          email:
            String(data?.email || "").trim() ||
            String(emailFallback || "").trim() ||
            "-",
          role: String(data?.role || "")
            .trim()
            .toLowerCase(),
          roles: normalizeRoles(data?.roles),
          tokoId: String(data?.tokoId || "").trim(),
          tokoNama: String(data?.tokoNama || "").trim(),
        };
        setCurrentUserProfile(profile);
        return profile;
      }
    } catch (e) {
      console.error("Gagal mengambil profil users:", e);
    }

    const fallback: UserProfile = {
      uid,
      nama: "Tanpa Nama",
      email: String(emailFallback || "").trim() || "-",
      role: "",
      roles: [],
      tokoId: "",
      tokoNama: "",
    };
    setCurrentUserProfile(fallback);
    return fallback;
  };

  const fetchToko = async () => {
    const snap = await getDocs(query(collection(db, "toko"), orderBy("nama")));
    const list: Toko[] = snap.docs
      .map((d) => {
        const x = d.data() as any;
        return {
          id: d.id,
          nama: x?.nama || "",
          kode: x?.kode || "",
          pemilik: x?.pemilik || "",
          aktif: Boolean(x?.aktif),
        };
      })
      .filter((item) => item.nama && item.aktif !== false);
    setTokoList(list);
  };

  const fetchBarang = async (tokoId: string) => {
    const safeTokoId = String(tokoId || "").trim();

    if (!safeTokoId) {
      setBarangList([]);
      return;
    }

    setBarangLoading(true);

    try {
      const snap = await getDocs(
        query(collection(db, "barang"), where("tokoId", "==", safeTokoId)),
      );

      const list: TransaksiBarang[] = snap.docs
        .map((d) => {
          const x = d.data() as any;
          return {
            id: d.id,
            kodeBarang: x?.kodeBarang || "",
            kodeBarcode: x?.kodeBarcode || x?.barcodeValue || "",
            barcodeValue: x?.barcodeValue || x?.kodeBarcode || "",
            nama: x?.nama || "",
            kategoriId: x?.kategoriId || "",
            kategoriNama: x?.kategoriNama || "",
            tokoId: x?.tokoId || "",
            tokoNama: x?.tokoNama || "",
            merk: x?.merk || "",
            supplier: x?.supplier || "",
            satuan: x?.satuan || x?.satuanNama || "",
            satuanId: x?.satuanId || "",
            satuanNama: x?.satuanNama || x?.satuan || "",
            hargaModal: Number(x?.hargaModal || 0),
            hargaJual: Number(x?.hargaJual || 0),
            stok: Number(x?.stok || 0),
            stokMinimum: Number(x?.stokMinimum || 0),
            pakaiKodeUnik: Boolean(x?.pakaiKodeUnik),
            jenisKodeUnik: x?.jenisKodeUnik || "",
            kodeUnik: x?.kodeUnik || "",
            jenisBarang: (x?.jenisBarang || "fisik") as "fisik" | "digital",
            subJenisDigital: x?.subJenisDigital || "",
            providerId: x?.providerId || "",
            provider: x?.provider || "",
            saldoSourceId: x?.saldoSourceId || "",
            saldoSourceNama: x?.saldoSourceNama || "",
            nominalProduk: String(x?.nominalProduk || ""),
            aktif: x?.aktif !== false,
            createdAt: Number(x?.createdAt || Date.now()),
            updatedAt: x?.updatedAt ? Number(x.updatedAt) : undefined,
          };
        })
        .filter((item) => item.nama && item.tokoId === safeTokoId)
        .sort((a, b) =>
          a.nama.localeCompare(b.nama, "id-ID", {
            numeric: true,
            sensitivity: "base",
          }),
        );

      setBarangList(list);
    } catch (e) {
      console.error("Gagal memuat barang toko:", e);
      setBarangList([]);
      setError("Gagal memuat barang dari toko yang dipilih");
    } finally {
      setBarangLoading(false);
    }
  };

  const fetchDiskon = async () => {
    const snap = await getDocs(
      query(collection(db, "diskon"), orderBy("namaPromo")),
    );
    const list: Diskon[] = snap.docs.map((d) => {
      const x = d.data() as any;
      return {
        id: d.id,
        namaPromo: x?.namaPromo || "",
        tokoId: x?.tokoId || "",
        tokoNama: x?.tokoNama || "",
        jenisPromo:
          x?.jenisPromo === "beli_x_gratis_y" ||
          x?.jenisPromo === "beli_x_diskon_nominal"
            ? x.jenisPromo
            : "diskon_langsung",
        tipeDiskon: x?.tipeDiskon === "nominal" ? "nominal" : "persen",
        nilaiDiskon: Number(x?.nilaiDiskon || 0),
        minimalQty: Number(x?.minimalQty || 0),
        gratisQty: Number(x?.gratisQty || 0),
        barangIds: Array.isArray(x?.barangIds) ? x.barangIds : [],
        barangRingkas: Array.isArray(x?.barangRingkas)
          ? x.barangRingkas.map((item: any) => ({
              id: item?.id || "",
              nama: item?.nama || "",
              kodeBarang: item?.kodeBarang || "",
              hargaJual: Number(item?.hargaJual || 0),
            }))
          : [],
        isActive: Boolean(x?.isActive),
        createdAt: Number(x?.createdAt || Date.now()),
        updatedAt: x?.updatedAt ? Number(x.updatedAt) : undefined,
      };
    });
    setDiskonList(list);
  };

  const fetchMetode = async () => {
    const snap = await getDocs(
      query(collection(db, "metode_pembayaran"), orderBy("nama")),
    );
    const list: MetodePembayaran[] = snap.docs
      .map((d) => {
        const x = d.data() as any;
        return {
          id: d.id,
          nama: x?.nama || "",
          tipe: (x?.tipe === "Non-Tunai" ? "Non-Tunai" : "Tunai") as
            | "Tunai"
            | "Non-Tunai",
          provider: x?.provider || "",
          biayaAdmin: Number(x?.biayaAdmin || 0),
          nomorRekening: x?.nomorRekening || "",
          namaRekening: x?.namaRekening || "",
          aktif: Boolean(x?.aktif),
          createdAt: Number(x?.createdAt || Date.now()),
          createdBy: x?.createdBy || "",
          updatedAt: x?.updatedAt ? Number(x.updatedAt) : undefined,
          updatedBy: x?.updatedBy || "",
        };
      })
      .filter((item) => item.nama && item.aktif);
    setMetodeList(list);
    const metodeTunai = list.find((item) => item.tipe === "Tunai");
    if (metodeTunai) setSelectedMetodeId((prev) => prev || metodeTunai.id);
  };

  const fetchSaldo = async () => {
    const snap = await getDocs(
      query(collection(db, "master_saldo_digital"), orderBy("namaSaldo")),
    );
    const list: MasterSaldoDigital[] = snap.docs
      .map((d) => {
        const x = d.data() as any;
        return {
          id: d.id,
          namaSaldo: x?.namaSaldo || "",
          jumlahSaldo: Number(x?.jumlahSaldo || 0),
          aktif: x?.aktif !== false,
          keterangan: x?.keterangan || "",
          createdAt:
            typeof x?.createdAt?.toMillis === "function"
              ? x.createdAt.toMillis()
              : Number(x?.createdAt || 0),
          updatedAt:
            typeof x?.updatedAt?.toMillis === "function"
              ? x.updatedAt.toMillis()
              : Number(x?.updatedAt || 0),
        };
      })
      .filter((item) => item.namaSaldo);
    setSaldoList(list);
  };

  const fetchRiwayatTransaksi = async () => {
    setRiwayatLoading(true);

    try {
      const { startMs, endMs } = buildRiwayatDateRangeMs(
        riwayatRange,
        riwayatStartDate,
        riwayatEndDate,
      );

      const snap = await getDocs(
        query(
          collection(db, "transaksi"),
          where("createdAtMs", ">=", startMs),
          where("createdAtMs", "<=", endMs),
          orderBy("createdAtMs", "desc"),
        ),
      );

      const tokoFilterId = String(selectedTokoId || "").trim();
      const tokoIdUser = String(currentUserProfile?.tokoId || "").trim();
      const admin = isAdminProfile(currentUserProfile);

      const rows = snap.docs
        .map((d) => normalizeTransaksiHistory(d.id, d.data()))
        .filter((item) => item.status === "selesai")
        .filter((item) => {
          if (!admin) return !tokoIdUser || item.tokoId === tokoIdUser;
          return !tokoFilterId || item.tokoId === tokoFilterId;
        })
        .slice(0, RIWAYAT_TRANSAKSI_LIMIT);

      setRiwayatTransaksi(rows);
    } catch (e) {
      console.error("Gagal memuat riwayat transaksi:", e);
      setRiwayatTransaksi([]);
      setError(
        "Gagal memuat riwayat transaksi. Pastikan index Firestore untuk createdAtMs sudah tersedia.",
      );
    } finally {
      setRiwayatLoading(false);
    }
  };

  const fetchPelanggan = async () => {
    try {
      const snap = await getDocs(
        query(collection(db, "pelanggan"), orderBy("nama")),
      );
      const list: PelangganTransaksi[] = snap.docs
        .map((d) => {
          const x = d.data() as any;
          return {
            id: d.id,
            uid: String(x?.uid || ""),
            nama: String(x?.nama || ""),
            telepon: String(x?.telepon || ""),
            email: String(x?.email || ""),
            nomorKartu: String(x?.nomorKartu || ""),
            kodePelanggan: String(x?.kodePelanggan || ""),
            aktif: x?.aktif !== false,
            tipeMember: String(x?.tipeMember || "Reguler"),
            poin: Number(x?.poin || 0),
            totalTransaksi: Number(x?.totalTransaksi || 0),
            diskon: Number(x?.diskon || 0),
          };
        })
        .filter((item) => item.nama && item.aktif !== false);

      setPelangganList(list);
    } catch (e) {
      console.error("Gagal memuat pelanggan:", e);
      setPelangganList([]);
    }
  };

  const fetchAll = async () => {
    setLoading(true);
    setError(null);

    try {
      const tokoIdAktif = String(selectedTokoId || "").trim();

      await Promise.all([
        fetchToko(),
        fetchDiskon(),
        fetchMetode(),
        fetchSaldo(),
        fetchPelanggan(),
        tokoIdAktif ? fetchBarang(tokoIdAktif) : Promise.resolve(setBarangList([])),
      ]);

      if (!isAdminProfile(currentUserProfile)) {
        const tokoIdUser = String(currentUserProfile?.tokoId || "").trim();
        if (tokoIdUser) setSelectedTokoId(tokoIdUser);
      }
    } catch (e) {
      console.error(e);
      setError("Gagal memuat data transaksi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (u) {
        const [profile] = await Promise.all([
          fetchCurrentUserProfile(u.uid, u.email),
          fetchAll(),
        ]);

        const admin = isAdminProfile(profile);
        if (!admin) {
          const tokoIdUser = String(profile?.tokoId || "").trim();
          setSelectedTokoId(tokoIdUser);
        }
      } else {
        setCurrentUserProfile(null);
        setSelectedTokoId("");
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const tokoIdAktif = String(selectedTokoId || "").trim();

    setBarangList([]);
    setSearchBarang("");
    setCameraOpen(false);

    if (!tokoIdAktif) return;

    void fetchBarang(tokoIdAktif);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTokoId]);

  useEffect(() => {
    const supported =
      typeof window !== "undefined" &&
      !!window.BarcodeDetector &&
      !!navigator.mediaDevices?.getUserMedia;
    setCameraSupported(supported);
  }, []);

  const isAdminUser = useMemo(
    () => isAdminProfile(currentUserProfile),
    [currentUserProfile],
  );

  useEffect(() => {
    if (!currentUserProfile) return;
    void fetchRiwayatTransaksi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentUserProfile?.uid,
    currentUserProfile?.tokoId,
    selectedTokoId,
    riwayatRange,
    riwayatStartDate,
    riwayatEndDate,
  ]);

  useEffect(() => {
    if (!isAdminUser) {
      const tokoIdUser = String(currentUserProfile?.tokoId || "").trim();
      if (selectedTokoId !== tokoIdUser) {
        setSelectedTokoId(tokoIdUser);
      }
    }
  }, [isAdminUser, currentUserProfile, selectedTokoId]);

  const selectedToko = useMemo(() => {
    const fromList = tokoList.find((t) => t.id === selectedTokoId) || null;
    if (fromList) return fromList;

    if (!isAdminUser && currentUserProfile?.tokoId) {
      return {
        id: currentUserProfile.tokoId,
        nama: currentUserProfile.tokoNama || "Toko Karyawan",
        kode: "",
        pemilik: "",
        aktif: true,
      } as Toko;
    }

    return null;
  }, [tokoList, selectedTokoId, isAdminUser, currentUserProfile]);

  const selectedMetode = useMemo(
    () => metodeList.find((m) => m.id === selectedMetodeId) || null,
    [metodeList, selectedMetodeId],
  );

  const metodeTunaiDefault = useMemo(
    () => metodeList.find((m) => m.tipe === "Tunai") || null,
    [metodeList],
  );

  const filteredPelanggan = useMemo(() => {
    return pelangganList
      .filter((item) => item.aktif !== false)
      .sort((a, b) =>
        a.nama.localeCompare(b.nama, "id-ID", {
          numeric: true,
          sensitivity: "base",
        }),
      );
  }, [pelangganList]);

  const selectedPelanggan = useMemo(
    () => pelangganList.find((item) => item.id === selectedPelangganId) || null,
    [pelangganList, selectedPelangganId],
  );

  const pelangganDiskonPersen = useMemo(() => {
    const diskon = Number(selectedPelanggan?.diskon || 0);
    if (Number.isNaN(diskon) || diskon <= 0) return 0;
    return Math.min(100, Math.max(0, diskon));
  }, [selectedPelanggan]);

  const rawCart = activeTab === "fisik" ? cartFisik : cartDigital;
  const setCart = activeTab === "fisik" ? setCartFisik : setCartDigital;

  const cart = useMemo(() => {
    const activeDiskon = diskonList.filter(
      (d) => d.isActive && (!selectedTokoId || d.tokoId === selectedTokoId),
    );

    return rawCart.map((item) => {
      const diskon = getBestDiskonForBarang(
        item.barangId,
        activeDiskon,
        item.qty,
        item.hargaAsli,
      );

      const promo = hitungPromoCartItem({
        hargaJual: item.hargaAsli,
        qty: item.qty,
        tipeDiskon: diskon?.tipeDiskon,
        nilaiDiskon: diskon?.nilaiDiskon,
        jenisPromo: diskon?.jenisPromo,
        minimalQty: diskon?.minimalQty,
        gratisQty: diskon?.gratisQty,
      });

      const adaPromo = Boolean(diskon);
      const promoAktif = Boolean(diskon && promo.totalDiskon > 0);
      const reminderPromo = getPromoReminderText(diskon);

      return {
        ...item,
        hargaSetelahDiskon: promo.hargaSatuanFinal,
        diskonId: adaPromo ? diskon?.id || "" : "",
        diskonNama: adaPromo ? diskon?.namaPromo || "" : "",
        diskonJenisPromo: adaPromo ? promo.jenisPromo : undefined,
        diskonTipe: adaPromo ? diskon?.tipeDiskon : undefined,
        diskonNilai: adaPromo ? Number(diskon?.nilaiDiskon || 0) : 0,
        diskonMinimalQty: adaPromo ? Number(diskon?.minimalQty || 0) : 0,
        diskonGratisQty: adaPromo ? Number(diskon?.gratisQty || 0) : 0,
        diskonQtyGratis: promoAktif ? Number(promo.qtyGratis || 0) : 0,
        diskonPaketPromo: promoAktif ? Number(promo.paketPromo || 0) : 0,
        diskonDeskripsi: promoAktif && promo.deskripsiPromo ? promo.deskripsiPromo : reminderPromo,
      };
    });
  }, [rawCart, diskonList, selectedTokoId]);

  const barangByToko = useMemo(() => {
    const q = searchBarang.toLowerCase().trim();
    const qScan = normalizeBarcode(searchBarang);

    return barangList.filter((item) => {
      const sameToko = !selectedTokoId || item.tokoId === selectedTokoId;
      const sameJenis = (item.jenisBarang || "fisik") === activeTab;
      const kodeUnikList = splitKodeUnikScanValues(item.kodeUnik);
      const matchSearch =
        !q ||
        item.nama.toLowerCase().includes(q) ||
        item.kodeBarang.toLowerCase().includes(q) ||
        String(item.kodeBarcode || "")
          .toLowerCase()
          .includes(q) ||
        String(item.barcodeValue || "")
          .toLowerCase()
          .includes(q) ||
        item.merk.toLowerCase().includes(q) ||
        item.kategoriNama.toLowerCase().includes(q) ||
        String(item.provider || "")
          .toLowerCase()
          .includes(q) ||
        String(item.kodeUnik || "")
          .toLowerCase()
          .includes(q) ||
        (!!qScan &&
          (normalizeBarcode(item.kodeBarcode || "").includes(qScan) ||
            normalizeBarcode(item.barcodeValue || "").includes(qScan) ||
            kodeUnikList.some((kodeUnik) => kodeUnik.includes(qScan))));

      if (!sameToko || !sameJenis || !matchSearch) return false;
      if (activeTab === "digital") return item.aktif !== false;
      return true;
    });
  }, [barangList, selectedTokoId, searchBarang, activeTab]);

  const barangBarcodeMap = useMemo(() => {
    const map = new Map<
      string,
      {
        barang: TransaksiBarang;
        scanType: "kodeBarcode" | "barcodeValue" | "kodeBarang" | "kodeUnik";
      }
    >();

    const registerScanKey = (
      key: string,
      barang: TransaksiBarang,
      scanType: "kodeBarcode" | "barcodeValue" | "kodeBarang" | "kodeUnik",
    ) => {
      const cleanKey = normalizeBarcode(key);
      if (!cleanKey || map.has(cleanKey)) return;
      map.set(cleanKey, { barang, scanType });
    };

    for (const item of barangList) {
      if (!item?.id) continue;
      if ((item.jenisBarang || "fisik") !== "fisik") continue;
      if (selectedTokoId && item.tokoId !== selectedTokoId) continue;

      registerScanKey(item.kodeBarcode || "", item, "kodeBarcode");
      registerScanKey(item.barcodeValue || "", item, "barcodeValue");
      registerScanKey(item.kodeBarang, item, "kodeBarang");

      for (const kodeUnik of splitKodeUnikScanValues(item.kodeUnik)) {
        registerScanKey(kodeUnik, item, "kodeUnik");
      }
    }

    return map;
  }, [barangList, selectedTokoId]);

  type AddToCartResult = {
    ok: boolean;
    reason?: "no-store" | "out-of-stock";
    status?: "added" | "exists";
  };

  const addToCart = (
    barang: TransaksiBarang,
    mode: AddToCartMode = "manual",
  ): AddToCartResult => {
    if (!selectedTokoId) {
      setError("Pilih toko terlebih dahulu");
      return { ok: false, reason: "no-store" };
    }

    const jenisBarang = (barang.jenisBarang || "fisik") as "fisik" | "digital";
    if (jenisBarang === "fisik" && barang.stok <= 0) {
      setError("Stok barang habis");
      return { ok: false, reason: "out-of-stock" };
    }

    setError(null);
    let status: "added" | "exists" = "added";
    const targetSetter: Dispatch<SetStateAction<TransaksiCartItem[]>> =
      jenisBarang === "fisik" ? setCartFisik : setCartDigital;

    targetSetter((prev) => {
      const found = prev.find((item) => item.barangId === barang.id);
      const diskon = getBestDiskonForBarang(
        barang.id,
        diskonList.filter((d) => d.tokoId === barang.tokoId && d.isActive),
        found ? found.qty : 1,
        barang.hargaJual,
      );
      const promoSatuan = hitungPromoCartItem({
        hargaJual: barang.hargaJual,
        qty: found ? found.qty : 1,
        tipeDiskon: diskon?.tipeDiskon,
        nilaiDiskon: diskon?.nilaiDiskon,
        jenisPromo: diskon?.jenisPromo,
        minimalQty: diskon?.minimalQty,
        gratisQty: diskon?.gratisQty,
      });
      const hargaSetelahDiskon = promoSatuan.hargaSatuanFinal;

      if (found) {
        status = "exists";
        if (mode === "scan") {
          return prev.map((item) =>
            item.barangId === barang.id
              ? {
                  ...item,
                  stok: barang.stok,
                  hargaModal: barang.hargaModal,
                  hargaAsli: barang.hargaJual,
                  hargaSetelahDiskon,
                  pakaiKodeUnik: barang.pakaiKodeUnik,
                  jenisKodeUnik: barang.jenisKodeUnik || "",
                  kodeUnik: barang.kodeUnik || "",
                  kodeBarcode: barang.kodeBarcode || barang.barcodeValue || "",
                  barcodeValue: barang.barcodeValue || barang.kodeBarcode || "",
                  providerId: barang.providerId || "",
                  provider: barang.provider || "",
                  saldoSourceId: barang.saldoSourceId || "",
                  saldoSourceNama: barang.saldoSourceNama || "",
                  nominalProduk: String(barang.nominalProduk || ""),
                  diskonId: diskon?.id,
                  diskonNama: diskon?.namaPromo,
                  diskonJenisPromo: diskon?.jenisPromo,
                  diskonTipe: diskon?.tipeDiskon,
                  diskonNilai: diskon?.nilaiDiskon,
                  diskonMinimalQty: Number(diskon?.minimalQty || 0),
                  diskonGratisQty: Number(diskon?.gratisQty || 0),
                }
              : item,
          );
        }

        const nextQty = found.qty + 1;
        if (jenisBarang === "fisik" && nextQty > barang.stok) return prev;

        return prev.map((item) =>
          item.barangId === barang.id
            ? {
                ...item,
                qty: nextQty,
                stok: barang.stok,
                hargaModal: barang.hargaModal,
                hargaAsli: barang.hargaJual,
                hargaSetelahDiskon,
                kodeBarcode: barang.kodeBarcode || barang.barcodeValue || "",
                barcodeValue: barang.barcodeValue || barang.kodeBarcode || "",
                providerId: barang.providerId || "",
                provider: barang.provider || "",
                saldoSourceId: barang.saldoSourceId || "",
                saldoSourceNama: barang.saldoSourceNama || "",
                nominalProduk: String(barang.nominalProduk || ""),
                diskonId: diskon?.id,
                diskonNama: diskon?.namaPromo,
                diskonJenisPromo: diskon?.jenisPromo,
                diskonTipe: diskon?.tipeDiskon,
                diskonNilai: diskon?.nilaiDiskon,
                diskonMinimalQty: Number(diskon?.minimalQty || 0),
                diskonGratisQty: Number(diskon?.gratisQty || 0),
              }
            : item,
        );
      }

      return [
        ...prev,
        {
          barangId: barang.id,
          kodeBarang: barang.kodeBarang,
          kodeBarcode: barang.kodeBarcode || barang.barcodeValue || "",
          barcodeValue: barang.barcodeValue || barang.kodeBarcode || "",
          nama: barang.nama,
          kategoriId: barang.kategoriId || "",
          kategoriNama: barang.kategoriNama,
          merk: barang.merk,
          satuan: barang.satuan,
          satuanId: barang.satuanId || "",
          satuanNama: barang.satuanNama || barang.satuan || "",
          stok: barang.stok,
          qty: 1,
          hargaModal: barang.hargaModal,
          hargaAsli: barang.hargaJual,
          hargaSetelahDiskon,
          pakaiKodeUnik: barang.pakaiKodeUnik,
          jenisKodeUnik: barang.jenisKodeUnik || "",
          kodeUnik: barang.kodeUnik || "",
          jenisBarang,
          subJenisDigital: barang.subJenisDigital || "",
          providerId: barang.providerId || "",
          provider: barang.provider || "",
          saldoSourceId: barang.saldoSourceId || "",
          saldoSourceNama: barang.saldoSourceNama || "",
          nominalProduk: String(barang.nominalProduk || ""),
          tujuan: "",
          diskonId: diskon?.id,
          diskonNama: diskon?.namaPromo,
          diskonJenisPromo: diskon?.jenisPromo,
          diskonTipe: diskon?.tipeDiskon,
          diskonNilai: diskon?.nilaiDiskon,
          diskonMinimalQty: Number(diskon?.minimalQty || 0),
          diskonGratisQty: Number(diskon?.gratisQty || 0),
        },
      ];
    });

    return { ok: true, status };
  };

  const commitBarcodeValue = (
    rawValue: string,
    source: "scanner" | "camera",
  ) => {
    const kode = normalizeScannerValue(rawValue);
    if (!kode || !selectedTokoId) return { ok: false };

    const now = Date.now();
    if (
      scanLastCommittedRef.current === kode &&
      now - scanLastCommittedAtRef.current < SCANNER_DUPLICATE_LOCK_MS
    ) {
      return { ok: false };
    }

    const directEntry = barangBarcodeMap.get(kode);
    const fallbackEntry = directEntry
      ? null
      : barangList.reduce<{
          barang: TransaksiBarang;
          scanType: "kodeBarcode" | "barcodeValue" | "kodeBarang" | "kodeUnik";
        } | null>((found, item) => {
          if (found) return found;
          if (!item?.id) return null;
          if ((item.jenisBarang || "fisik") !== "fisik") return null;
          if (selectedTokoId && item.tokoId !== selectedTokoId) return null;

          if (normalizeScannerValue(item.kodeBarcode || "") === kode) {
            return { barang: item, scanType: "kodeBarcode" };
          }

          if (normalizeScannerValue(item.barcodeValue || "") === kode) {
            return { barang: item, scanType: "barcodeValue" };
          }

          if (normalizeScannerValue(item.kodeBarang || "") === kode) {
            return { barang: item, scanType: "kodeBarang" };
          }

          if (splitKodeUnikScanValues(item.kodeUnik).some((kodeUnik) => kodeUnik === kode)) {
            return { barang: item, scanType: "kodeUnik" };
          }

          return null;
        }, null);

    const foundEntry = directEntry || fallbackEntry;

    if (!foundEntry) {
      setError(`Barcode/kode ${kode} tidak ditemukan di toko ini`);
      setTimeout(() => setError(null), 1800);
      return { ok: false };
    }

    const found = foundEntry.barang;
    const barangScan =
      foundEntry.scanType === "kodeUnik" ? { ...found, kodeUnik: kode } : found;

    if (Number(found.stok || 0) <= 0) {
      setError(`Stok ${found.nama} habis`);
      setTimeout(() => setError(null), 1800);
      return { ok: false };
    }

    const addMode: AddToCartMode = foundEntry.scanType === "kodeUnik" ? "scan" : "manual";
    const result = addToCart(barangScan, addMode);
    if (!result.ok) return { ok: false };

    scanLastCommittedRef.current = kode;
    scanLastCommittedAtRef.current = Date.now();

    playSuccessBeep();
    setActiveTab("fisik");
    setMobileKasirStep((prev) => (prev === "riwayat" ? "barang" : prev));

    if (source === "camera") {
      const status = result.status ?? "added";
      setSuccessMsg(
        `Scan kamera berhasil: ${
          status === "exists"
            ? `${found.nama} sudah ada di keranjang`
            : found.nama
        }`,
      );
      setTimeout(() => setSuccessMsg(null), 1400);
    }

    return { ok: true, status: result.status ?? "added" };
  };

  useEffect(() => {
    const resetScanBuffer = () => {
      scanBufferRef.current = "";
      scanStartedAtRef.current = 0;
      scanLastTimeRef.current = 0;
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }
    };

    const commitScan = () => {
      const raw = scanBufferRef.current;
      resetScanBuffer();

      const cleanRaw = normalizeScannerValue(raw);
      if (cleanRaw.length < SCANNER_MIN_LENGTH) return;

      commitBarcodeValue(cleanRaw, "scanner");
    };

    const scheduleCommit = () => {
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = setTimeout(() => {
        const cleanRaw = normalizeScannerValue(scanBufferRef.current);
        if (cleanRaw.length >= SCANNER_MIN_LENGTH) commitScan();
        else resetScanBuffer();
      }, SCANNER_IDLE_COMMIT_MS);
    };

    const onPaste = (e: ClipboardEvent) => {
      if (!selectedTokoId) return;
      if (showCheckoutConfirm || strukModal || returModal) return;

      const pasted = normalizeScannerValue(e.clipboardData?.getData("text") || "");
      if (pasted.length < SCANNER_MIN_LENGTH) return;

      if (barangBarcodeMap.has(pasted)) {
        e.preventDefault();
        resetScanBuffer();
        commitBarcodeValue(pasted, "scanner");
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!selectedTokoId) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (showCheckoutConfirm || strukModal || returModal) return;

      const ignoredKeys = [
        "Shift",
        "CapsLock",
        "Tab",
        "Escape",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
        "PageUp",
        "PageDown",
      ];
      if (ignoredKeys.includes(e.key)) return;

      const now = Date.now();
      const diff = now - scanLastTimeRef.current;

      if (!scanBufferRef.current || diff > SCANNER_RESET_GAP_MS) {
        scanBufferRef.current = "";
        scanStartedAtRef.current = now;
      }

      scanLastTimeRef.current = now;

      if (e.key === "Enter") {
        if (scanBufferRef.current.length >= SCANNER_MIN_LENGTH) {
          e.preventDefault();
          e.stopPropagation();
          commitScan();
        } else {
          resetScanBuffer();
        }
        return;
      }

      if (e.key === "Backspace") {
        scanBufferRef.current = scanBufferRef.current.slice(0, -1);
        scheduleCommit();
        return;
      }

      if (e.key.length !== 1) return;

      scanBufferRef.current += e.key;

      const durasiScan = now - scanStartedAtRef.current;
      const isLikelyScanner =
        scanBufferRef.current.length >= 4 &&
        (durasiScan <= 1800 || diff <= 180);

      if (isLikelyScanner) {
        e.preventDefault();
        e.stopPropagation();
      }

      const currentClean = normalizeScannerValue(scanBufferRef.current);
      if (barangBarcodeMap.has(currentClean)) {
        e.preventDefault();
        e.stopPropagation();
        commitScan();
        return;
      }

      scheduleCommit();
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("paste", onPaste, true);

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("paste", onPaste, true);
      resetScanBuffer();
    };
  }, [barangBarcodeMap, barangList, selectedTokoId, showCheckoutConfirm, strukModal, returModal]);

  const stopCameraScanner = () => {
    if (cameraRafRef.current) {
      cancelAnimationFrame(cameraRafRef.current);
      cameraRafRef.current = null;
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    cameraDetectorRef.current = null;
    cameraDetectingRef.current = false;
    setCameraActive(false);
    setCameraLoading(false);
    setCameraStatus("Arahkan barcode ke area scan");
  };

  const startCameraLoop = () => {
    const loop = async () => {
      const video = videoRef.current;
      if (!video || !cameraDetectorRef.current || !cameraStreamRef.current)
        return;

      const now = Date.now();
      const isReady =
        !cameraDetectingRef.current &&
        now - cameraLastDetectAtRef.current >= 220 &&
        now >= cameraCooldownUntilRef.current &&
        video.readyState >= 2;

      if (isReady) {
        cameraDetectingRef.current = true;
        cameraLastDetectAtRef.current = now;
        try {
          const results = await cameraDetectorRef.current.detect(video);
          if (Array.isArray(results) && results.length > 0) {
            const rawValue = normalizeBarcode(results[0]?.rawValue || "");
            if (rawValue) {
              setLastCameraResult(rawValue);
              setCameraStatus(`Terdeteksi: ${rawValue}`);
              const result = commitBarcodeValue(rawValue, "camera");
              if (result.ok) {
                cameraCooldownUntilRef.current = Date.now() + 1200;
                if ("vibrate" in navigator) navigator.vibrate?.(100);
              }
            }
          }
        } catch (error) {
          console.error("Gagal mendeteksi barcode kamera:", error);
        } finally {
          cameraDetectingRef.current = false;
        }
      }
      cameraRafRef.current = requestAnimationFrame(loop);
    };
    cameraRafRef.current = requestAnimationFrame(loop);
  };

  const startCameraScanner = async () => {
    if (!selectedTokoId) {
      setError("Pilih toko terlebih dahulu sebelum membuka kamera");
      return;
    }
    if (!window.BarcodeDetector || !navigator.mediaDevices?.getUserMedia) {
      setCameraSupported(false);
      setError("Browser ini belum mendukung scan barcode kamera");
      return;
    }

    try {
      setCameraLoading(true);
      setError(null);
      setCameraStatus("Menyalakan kamera...");

      const supportedFormats = window.BarcodeDetector.getSupportedFormats
        ? await window.BarcodeDetector.getSupportedFormats()
        : [];
      const preferredFormats = [
        "code_128",
        "ean_13",
        "ean_8",
        "upc_a",
        "upc_e",
        "code_39",
        "codabar",
        "itf",
      ];
      const finalFormats =
        supportedFormats.length > 0
          ? preferredFormats.filter((item) => supportedFormats.includes(item))
          : preferredFormats;

      cameraDetectorRef.current = new window.BarcodeDetector({
        formats: finalFormats.length > 0 ? finalFormats : undefined,
      });

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      cameraStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraActive(true);
      setCameraStatus("Arahkan barcode ke area scan");
      startCameraLoop();
    } catch (error) {
      console.error(error);
      setError("Gagal membuka kamera. Pastikan izin kamera diberikan.");
      stopCameraScanner();
    } finally {
      setCameraLoading(false);
    }
  };

  useEffect(() => {
    if (cameraOpen && activeTab === "fisik") void startCameraScanner();
    else stopCameraScanner();
    return () => {
      stopCameraScanner();
    };
  }, [cameraOpen, activeTab]);

  useEffect(() => {
    return () => {
      stopCameraScanner();
      beepAudioContextRef.current?.close?.();
    };
  }, []);

  const updateQty = (barangId: string, mode: "plus" | "minus") => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.barangId !== barangId) return item;
          const nextQty = mode === "plus" ? item.qty + 1 : item.qty - 1;
          if (item.jenisBarang === "fisik" && nextQty > item.stok) return item;
          return { ...item, qty: nextQty };
        })
        .filter((item) => item.qty > 0),
    );
  };

  const updateTujuan = (barangId: string, value: string) => {
    setCart((prev) =>
      prev.map((item) =>
        item.barangId === barangId ? { ...item, tujuan: value } : item,
      ),
    );
  };

  const removeItem = (barangId: string) =>
    setCart((prev) => prev.filter((item) => item.barangId !== barangId));

  const clearCart = () => {
    if (activeTab === "fisik") setCartFisik([]);
    else setCartDigital([]);
    setUangBayar("");
    setCatatan("");
    setSuccessMsg("Keranjang dikosongkan");
    setTimeout(() => setSuccessMsg(null), 2000);
  };

  const subtotal = useMemo(
    () => cart.reduce((acc, item) => acc + item.hargaAsli * item.qty, 0),
    [cart],
  );
  const totalSetelahDiskonBarang = useMemo(
    () =>
      cart.reduce((acc, item) => {
        const promo = hitungPromoCartItem({
          hargaJual: item.hargaAsli,
          qty: item.qty,
          tipeDiskon: item.diskonTipe,
          nilaiDiskon: item.diskonNilai,
          jenisPromo: item.diskonJenisPromo,
          minimalQty: item.diskonMinimalQty,
          gratisQty: item.diskonGratisQty,
        });
        return acc + promo.subtotalFinal;
      }, 0),
    [cart],
  );
  const totalDiskonBarang = useMemo(
    () => subtotal - totalSetelahDiskonBarang,
    [subtotal, totalSetelahDiskonBarang],
  );
  const pelangganDiskonNominal = useMemo(() => {
    if (
      !selectedPelanggan ||
      pelangganDiskonPersen <= 0 ||
      totalSetelahDiskonBarang <= 0
    )
      return 0;
    return Math.min(
      totalSetelahDiskonBarang,
      Math.round(totalSetelahDiskonBarang * (pelangganDiskonPersen / 100)),
    );
  }, [selectedPelanggan, pelangganDiskonPersen, totalSetelahDiskonBarang]);
  const totalSetelahDiskon = useMemo(
    () => Math.max(0, totalSetelahDiskonBarang - pelangganDiskonNominal),
    [totalSetelahDiskonBarang, pelangganDiskonNominal],
  );
  const totalDiskon = useMemo(
    () => totalDiskonBarang + pelangganDiskonNominal,
    [totalDiskonBarang, pelangganDiskonNominal],
  );

  const biayaAdminNominal = useMemo(() => {
    const persen = Number(selectedMetode?.biayaAdmin || 0);
    if (!selectedMetode || selectedMetode.tipe === "Tunai" || persen <= 0)
      return 0;
    return Math.round(totalSetelahDiskon * (persen / 100));
  }, [selectedMetode, totalSetelahDiskon]);

  const grandTotal = useMemo(
    () => totalSetelahDiskon + biayaAdminNominal,
    [totalSetelahDiskon, biayaAdminNominal],
  );
  const totalModal = useMemo(
    () => cart.reduce((acc, item) => acc + item.hargaModal * item.qty, 0),
    [cart],
  );
  const estimasiLabaKotor = useMemo(
    () => totalSetelahDiskon - totalModal - biayaAdminNominal,
    [totalSetelahDiskon, totalModal, biayaAdminNominal],
  );

  const uangBayarNumber = Number(uangBayar.replace(/\D/g, "") || 0);
  const kembalian = Math.max(0, uangBayarNumber - grandTotal);
  const kurangBayar = Math.max(0, grandTotal - uangBayarNumber);
  const totalItem = useMemo(
    () => cart.reduce((acc, item) => acc + item.qty, 0),
    [cart],
  );
  const totalJenisBarang = cart.length;

  const isBisaCheckout =
    !!selectedTokoId &&
    !!selectedMetodeId &&
    cart.length > 0 &&
    uangBayarNumber >= grandTotal &&
    !submitLoading;

  const fisikCount = useMemo(
    () => cartFisik.reduce((acc, item) => acc + item.qty, 0),
    [cartFisik],
  );
  const digitalCount = useMemo(
    () => cartDigital.reduce((acc, item) => acc + item.qty, 0),
    [cartDigital],
  );

  const digitalSaldoUsage = useMemo<DigitalSaldoUsage[]>(
    () => buildDigitalSaldoUsageTransaksi(cartDigital),
    [cartDigital],
  );

  const digitalSaldoRingkasan = useMemo(
    () => buildDigitalSaldoRingkasanTransaksi(cartDigital),
    [cartDigital],
  );

  const digitalTargetList = useMemo(() => {
    return cart
      .filter((item) => item.jenisBarang === "digital")
      .map((item) => ({
        barangId: item.barangId,
        nama: item.nama,
        tujuan: String(item.tujuan || "").trim(),
        label: getTujuanLabel(item.subJenisDigital),
        subJenisLabel: formatSubJenisDigitalLabel(item.subJenisDigital),
      }));
  }, [cart]);

  const openCheckoutConfirm = () => {
    if (!selectedTokoId) return void setError("Pilih toko terlebih dahulu");
    if (!selectedMetodeId)
      return void setError("Pilih metode pembayaran terlebih dahulu");
    if (cart.length === 0) return void setError("Keranjang masih kosong");
    if (uangBayarNumber < grandTotal)
      return void setError("Uang bayar masih kurang");
    if (!selectedToko) return void setError("Data toko tidak ditemukan");
    if (!selectedMetode)
      return void setError("Data metode pembayaran tidak ditemukan");

    if (activeTab === "digital") {
      const invalidTarget = cart.some(
        (item) =>
          item.jenisBarang === "digital" && !String(item.tujuan || "").trim(),
      );

      if (invalidTarget)
        return void setError("Isi nomor tujuan untuk semua barang digital");

      const digitalSaldoError = validateDigitalSaldoUsageTransaksi(cart);
      if (digitalSaldoError) return void setError(digitalSaldoError);
    }

    setError(null);
    setShowCheckoutConfirm(true);
  };

  const handleProsesTransaksi = async () => {
    const user = auth.currentUser;
    if (!user) return void setError("Sesi login tidak ditemukan");
    if (!selectedTokoId) return void setError("Pilih toko terlebih dahulu");
    if (!selectedMetodeId)
      return void setError("Pilih metode pembayaran terlebih dahulu");
    if (cart.length === 0) return void setError("Keranjang masih kosong");
    if (uangBayarNumber < grandTotal)
      return void setError("Uang bayar masih kurang");
    if (!selectedToko) return void setError("Data toko tidak ditemukan");
    if (!selectedMetode)
      return void setError("Data metode pembayaran tidak ditemukan");

    if (activeTab === "digital") {
      const invalidTarget = cart.some(
        (item) =>
          item.jenisBarang === "digital" && !String(item.tujuan || "").trim(),
      );
      if (invalidTarget)
        return void setError("Isi nomor tujuan untuk semua barang digital");

      const digitalSaldoError = validateDigitalSaldoUsageTransaksi(cart);
      if (digitalSaldoError) return void setError(digitalSaldoError);
    }

    setSubmitLoading(true);
    setShowCheckoutConfirm(false);
    setError(null);
    setSuccessMsg(null);

    try {
      const kasirProfile =
        currentUserProfile ||
        (await fetchCurrentUserProfile(user.uid, user.email));

      const nowMs = Date.now();
      const nomorTransaksi = `TRX-${nowMs}`;
      const { tahun, bulan, hari, tanggalKey, bulanKey } =
        getTanggalParts(nowMs);

      const cartSnapshot = [...cart];
      const grandTotalSnapshot = grandTotal;
      const subtotalSnapshot = subtotal;
      const totalDiskonSnapshot = totalDiskon;
      const totalSetelahDiskonBarangSnapshot = totalSetelahDiskonBarang;
      const pelangganSnapshot = selectedPelanggan;
      const pelangganDiskonPersenSnapshot = pelangganDiskonPersen;
      const pelangganDiskonNominalSnapshot = pelangganDiskonNominal;
      const totalSetelahDiskonSnapshot = totalSetelahDiskon;
      const biayaAdminNominalSnapshot = biayaAdminNominal;
      const totalModalSnapshot = totalModal;
      const estimasiLabaKotorSnapshot = estimasiLabaKotor;
      const uangBayarSnapshot = uangBayarNumber;
      const kembalianSnapshot = kembalian;
      const totalItemSnapshot = totalItem;
      const totalJenisBarangSnapshot = totalJenisBarang;
      const catatanSnapshot = catatan.trim();
      const digitalSaldoUsageSnapshot = buildDigitalSaldoUsageTransaksi(cartSnapshot);

      let savedTransaksiId = "";
      const itemPayload: any[] = [];
      const kategoriAccumulator = new Map<
        string,
        LaporanKategoriBreakdown & {
          kategoriId: string;
          satuanIds?: string[];
          satuanNamaList?: string[];
        }
      >();

      await runTransaction(db, async (transaction) => {
        const transaksiRef = doc(collection(db, "transaksi"));
        savedTransaksiId = transaksiRef.id;

        const laporanHarianRef = doc(
          db,
          "laporan_harian",
          `${tanggalKey}__${selectedToko.id}`,
        );
        const laporanBulananRef = doc(
          db,
          "laporan_bulanan",
          `${bulanKey}__${selectedToko.id}`,
        );

        const barangFisik = cartSnapshot.filter(
          (item) => item.jenisBarang === "fisik",
        );
        const barangReads = await Promise.all(
          barangFisik.map(async (item) => {
            const barangRef = doc(db, "barang", item.barangId);
            const barangSnap = await transaction.get(barangRef);
            if (!barangSnap.exists())
              throw new Error(`Barang ${item.nama} tidak ditemukan`);
            const barangDb = barangSnap.data() as any;
            const stokSekarang = Number(barangDb?.stok || 0);
            if (stokSekarang < item.qty)
              throw new Error(`Stok ${item.nama} tidak cukup`);
            return {
              item,
              barangRef,
              stokSekarang,
              stokSesudah: stokSekarang - item.qty,
            };
          }),
        );

        const saldoReads = await Promise.all(
          digitalSaldoUsageSnapshot.map(async (usage) => {
            const saldoRef = doc(
              db,
              "master_saldo_digital",
              usage.saldoSourceId,
            );
            const saldoSnap = await transaction.get(saldoRef);
            if (!saldoSnap.exists()) {
              throw new Error(
                `Sumber saldo ${usage.saldoSourceNama} tidak ditemukan`,
              );
            }
            const saldoDb = saldoSnap.data() as any;
            const aktif = saldoDb?.aktif !== false;
            const jumlahSaldo = Number(saldoDb?.jumlahSaldo || 0);
            if (!aktif) {
              throw new Error(
                `Sumber saldo ${usage.saldoSourceNama} sedang nonaktif`,
              );
            }
            if (jumlahSaldo < usage.totalPotong) {
              throw new Error(
                `Saldo ${usage.saldoSourceNama} tidak mencukupi. Butuh ${formatRupiah(
                  usage.totalPotong,
                )}, tersedia ${formatRupiah(jumlahSaldo)}`,
              );
            }
            return {
              usage,
              saldoRef,
              jumlahSaldo,
              jumlahSesudah: jumlahSaldo - usage.totalPotong,
            };
          }),
        );

        const laporanHarianSnap = await transaction.get(laporanHarianRef);
        const laporanBulananSnap = await transaction.get(laporanBulananRef);
        const laporanHarianData = laporanHarianSnap.exists()
          ? laporanHarianSnap.data()
          : null;
        const laporanBulananData = laporanBulananSnap.exists()
          ? laporanBulananSnap.data()
          : null;

        const pelangganRef = pelangganSnapshot?.id
          ? doc(db, "pelanggan", pelangganSnapshot.id)
          : null;
        const pelangganSnap = pelangganRef
          ? await transaction.get(pelangganRef)
          : null;

        for (const { barangRef, stokSesudah } of barangReads) {
          transaction.update(barangRef, {
            stok: stokSesudah,
            updatedAt: nowMs,
            updatedBy: user.uid,
          });
        }

        for (const { usage, saldoRef, jumlahSesudah } of saldoReads) {
          transaction.update(saldoRef, {
            jumlahSaldo: jumlahSesudah,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
            lastTransaksiId: transaksiRef.id,
            lastNomorTransaksi: nomorTransaksi,
            lastPotongNominal: usage.totalPotong,
            lastPotongQty: usage.totalQty,
            lastPotongItem: usage.totalItem,
            updatedAtMs: nowMs,
          });
        }

        if (pelangganRef && pelangganSnap?.exists()) {
          const pelangganData = pelangganSnap.data() as any;
          const poinTambah = Math.floor(grandTotalSnapshot / 1000);

          transaction.update(pelangganRef, {
            totalTransaksi:
              Number(pelangganData?.totalTransaksi || 0) + grandTotalSnapshot,
            poin: Number(pelangganData?.poin || 0) + poinTambah,
            lastTransaksiId: transaksiRef.id,
            lastNomorTransaksi: nomorTransaksi,
            lastTransaksiAt: serverTimestamp(),
            lastTransaksiAtMs: nowMs,
            updatedAt: nowMs,
            updatedBy: user.uid,
          });
        }

        for (const item of cartSnapshot) {
          const promoItem = hitungPromoCartItem({
            hargaJual: item.hargaAsli,
            qty: item.qty,
            tipeDiskon: item.diskonTipe,
            nilaiDiskon: item.diskonNilai,
            jenisPromo: item.diskonJenisPromo,
            minimalQty: item.diskonMinimalQty,
            gratisQty: item.diskonGratisQty,
          });
          const subtotalAsliItem = promoItem.subtotalAsli;
          const subtotalFinalSebelumPelanggan = promoItem.subtotalFinal;
          const proporsiDiskonPelanggan =
            totalSetelahDiskonBarangSnapshot > 0
              ? subtotalFinalSebelumPelanggan / totalSetelahDiskonBarangSnapshot
              : 0;
          const diskonPelangganItem = Math.round(
            pelangganDiskonNominalSnapshot * proporsiDiskonPelanggan,
          );
          const subtotalFinalItem = Math.max(
            0,
            subtotalFinalSebelumPelanggan - diskonPelangganItem,
          );
          const totalDiskonItem = subtotalAsliItem - subtotalFinalItem;

          const itemRow = {
            barangId: item.barangId,
            kodeBarang: item.kodeBarang,
            kodeBarcode: item.kodeBarcode || item.barcodeValue || "",
            barcodeValue: item.barcodeValue || item.kodeBarcode || "",
            nama: item.nama,
            kategoriId: item.kategoriId || "",
            kategoriNama: item.kategoriNama,
            merk: item.merk,
            satuan: item.satuan,
            satuanId: item.satuanId || "",
            satuanNama: item.satuanNama || item.satuan || "",
            qty: item.qty,
            hargaModal: item.hargaModal,
            hargaAsli: item.hargaAsli,
            hargaSetelahDiskon: promoItem.hargaSatuanFinal,
            subtotalAsli: subtotalAsliItem,
            subtotalFinal: subtotalFinalItem,
            subtotalFinalSebelumPelanggan,
            diskonPelanggan: diskonPelangganItem,
            totalDiskon: totalDiskonItem,
            pakaiKodeUnik: Boolean(item.pakaiKodeUnik),
            jenisKodeUnik: item.jenisKodeUnik || "",
            kodeUnik: item.kodeUnik || "",
            jenisBarang: item.jenisBarang,
            subJenisDigital: item.subJenisDigital || "",
            providerId: item.providerId || "",
            provider: item.provider || "",
            saldoSourceId: item.saldoSourceId || "",
            saldoSourceNama: item.saldoSourceNama || "",
            nominalProduk: String(item.nominalProduk || ""),
            tujuan: item.tujuan || "",
            diskonId: item.diskonId || "",
            diskonNama: item.diskonNama || "",
            diskonJenisPromo: item.diskonJenisPromo || "",
            diskonTipe: item.diskonTipe || "",
            diskonNilai: Number(item.diskonNilai || 0),
            diskonMinimalQty: Number(item.diskonMinimalQty || 0),
            diskonGratisQty: Number(item.diskonGratisQty || 0),
            diskonQtyGratis: Number(item.diskonQtyGratis || 0),
            diskonPaketPromo: Number(item.diskonPaketPromo || 0),
            diskonDeskripsi: item.diskonDeskripsi || "",
            qtySudahRetur: 0,
            qtyReturTotal: 0,
            qtyBersih: item.qty,
            subtotalAsliBersih: subtotalAsliItem,
            subtotalFinalBersih: subtotalFinalItem,
            totalDiskonBersih: totalDiskonItem,
            totalModalBersih: Number(item.hargaModal || 0) * Number(item.qty || 0),
            returStatusItem: "belum",
          };
          itemPayload.push(itemRow);

          const kategoriId = item.kategoriId?.trim() || "tanpa-kategori";
          const kategoriNama = item.kategoriNama?.trim() || "Tanpa Kategori";
          const totalModalItem =
            Number(item.hargaModal || 0) * Number(item.qty || 0);
          const proporsiOmzet =
            grandTotalSnapshot > 0 ? subtotalFinalItem / grandTotalSnapshot : 0;
          const adminKategori = Math.round(
            biayaAdminNominalSnapshot * proporsiOmzet,
          );
          const labaBersihKategori =
            subtotalFinalItem - totalModalItem - adminKategori;

          const prevKategori = kategoriAccumulator.get(kategoriId);

          const nextSatuanIds = Array.from(
            new Set([
              ...(prevKategori?.satuanIds || []),
              ...(item.satuanId ? [item.satuanId] : []),
            ]),
          );

          const nextSatuanNamaList = Array.from(
            new Set([
              ...(prevKategori?.satuanNamaList || []),
              ...(item.satuanNama || item.satuan
                ? [item.satuanNama || item.satuan]
                : []),
            ]),
          );

          kategoriAccumulator.set(kategoriId, {
            kategoriId,
            nama: kategoriNama,
            jumlahTransaksi: 1,
            qtyTerjual:
              Number(prevKategori?.qtyTerjual || 0) + Number(item.qty || 0),
            omzet:
              Number(prevKategori?.omzet || 0) +
              subtotalFinalItem +
              adminKategori,
            subtotal: Number(prevKategori?.subtotal || 0) + subtotalAsliItem,
            totalDiskon:
              Number(prevKategori?.totalDiskon || 0) + totalDiskonItem,
            totalSetelahDiskon:
              Number(prevKategori?.totalSetelahDiskon || 0) + subtotalFinalItem,
            totalModal: Number(prevKategori?.totalModal || 0) + totalModalItem,
            totalBiayaAdmin:
              Number(prevKategori?.totalBiayaAdmin || 0) + adminKategori,
            labaBersih:
              Number(prevKategori?.labaBersih || 0) + labaBersihKategori,
            satuanIds: nextSatuanIds,
            satuanNamaList: nextSatuanNamaList,
          });
        }

        for (const { item, stokSekarang, stokSesudah } of barangReads) {
          const mutasiRef = doc(collection(db, "mutasi_stok"));
          transaction.set(mutasiRef, {
            id: mutasiRef.id,
            transaksiId: transaksiRef.id,
            nomorTransaksi,
            tipe: "keluar",
            sumber: "transaksi",
            tokoId: selectedToko.id,
            tokoNama: selectedToko.nama,
            barangId: item.barangId,
            kodeBarang: item.kodeBarang,
            namaBarang: item.nama,
            qty: item.qty,
            stokSebelum: stokSekarang,
            stokSesudah,
            keterangan: `Penjualan kasir ${nomorTransaksi}`,
            createdAt: serverTimestamp(),
            createdAtMs: nowMs,
            createdBy: user.uid,
          });
        }

        transaction.set(transaksiRef, {
          id: transaksiRef.id,
          nomorTransaksi,
          tokoId: selectedToko.id,
          tokoNama: selectedToko.nama,
          pelangganId: pelangganSnapshot?.id || "",
          pelangganUid: pelangganSnapshot?.uid || "",
          pelangganNama: pelangganSnapshot?.nama || "",
          pelangganTelepon: pelangganSnapshot?.telepon || "",
          pelangganEmail: pelangganSnapshot?.email || "",
          pelangganKode: pelangganSnapshot?.kodePelanggan || "",
          pelangganTipeMember: pelangganSnapshot?.tipeMember || "",
          diskonPelangganPersen: pelangganDiskonPersenSnapshot,
          diskonPelangganNominal: pelangganDiskonNominalSnapshot,
          totalSetelahDiskonBarang: totalSetelahDiskonBarangSnapshot,
          metodePembayaranId: selectedMetode.id,
          metodePembayaranNama: selectedMetode.nama,
          metodePembayaranTipe: selectedMetode.tipe,
          metodePembayaranProvider: selectedMetode.provider || "",
          biayaAdminPersen: Number(selectedMetode.biayaAdmin || 0),
          biayaAdminNominal: biayaAdminNominalSnapshot,
          subtotal: subtotalSnapshot,
          totalDiskon: totalDiskonSnapshot,
          totalSetelahDiskon: totalSetelahDiskonSnapshot,
          grandTotal: grandTotalSnapshot,
          totalModal: totalModalSnapshot,
          estimasiLabaKotor: estimasiLabaKotorSnapshot,
          returStatus: "belum",
          returQtyByBarangId: {},
          totalReturQty: 0,
          totalReturNominal: 0,
          totalReturSubtotal: 0,
          totalReturDiskon: 0,
          totalReturSetelahDiskon: 0,
          totalReturModal: 0,
          totalReturBiayaAdmin: 0,
          totalReturLabaKotor: 0,
          subtotalBersih: subtotalSnapshot,
          totalDiskonBersih: totalDiskonSnapshot,
          totalSetelahDiskonBersih: totalSetelahDiskonSnapshot,
          biayaAdminBersih: biayaAdminNominalSnapshot,
          grandTotalBersih: grandTotalSnapshot,
          totalModalBersih: totalModalSnapshot,
          estimasiLabaKotorBersih: estimasiLabaKotorSnapshot,
          totalItemBersih: totalItemSnapshot,
          uangBayar: uangBayarSnapshot,
          kembalian: kembalianSnapshot,
          kurangBayar: 0,
          totalItem: totalItemSnapshot,
          totalJenisBarang: totalJenisBarangSnapshot,
          status: "selesai",
          catatan: catatanSnapshot,
          jenisTransaksi: activeTab,
          digitalSaldoUsage: digitalSaldoUsageSnapshot,
          digitalSaldoRingkasan: buildDigitalSaldoRingkasanTransaksi(cartSnapshot),
          items: itemPayload,
          kasirUid: kasirProfile.uid,
          kasirNama: kasirProfile.nama,
          kasirEmail: kasirProfile.email,
          createdAt: serverTimestamp(),
          createdAtMs: nowMs,
          createdBy: user.uid,
          updatedAt: serverTimestamp(),
          updatedAtMs: nowMs,
        });

        const kategoriBreakdownTambah = Array.from(
          kategoriAccumulator.values(),
        ).map((item) => ({
          ...item,
          jumlahTransaksi: 1,
          satuanIds: item.satuanIds || [],
          satuanNamaList: item.satuanNamaList || [],
        }));

        const sharedLaporanArgs = {
          tokoId: selectedToko.id,
          tokoNama: selectedToko.nama,
          metodeNama: selectedMetode.nama,
          omzetTambah: grandTotalSnapshot,
          subtotalTambah: subtotalSnapshot,
          totalDiskonTambah: totalDiskonSnapshot,
          totalSetelahDiskonTambah: totalSetelahDiskonSnapshot,
          totalBiayaAdminTambah: biayaAdminNominalSnapshot,
          totalModalTambah: totalModalSnapshot,
          totalLabaKotorTambah: estimasiLabaKotorSnapshot,
          totalItemTambah: totalItemSnapshot,
          totalJenisBarangTambah: totalJenisBarangSnapshot,
          kategoriBreakdownTambah,
          nowMs,
        };

        transaction.set(
          laporanHarianRef,
          buildLaporanPayload({
            existingData: laporanHarianData,
            id: laporanHarianRef.id,
            periodeKey: tanggalKey,
            tahun,
            bulan,
            hari,
            ...sharedLaporanArgs,
          }),
        );

        transaction.set(
          laporanBulananRef,
          buildLaporanPayload({
            existingData: laporanBulananData,
            id: laporanBulananRef.id,
            periodeKey: bulanKey,
            tahun,
            bulan,
            ...sharedLaporanArgs,
          }),
        );
      });

      const savedSnap = await getDoc(doc(db, "transaksi", savedTransaksiId));
      if (savedSnap.exists()) {
        const x = savedSnap.data() as any;
        const strukFromFirestore: StrukDataWithPelanggan = {
          id: savedSnap.id,
          nomorTransaksi: x?.nomorTransaksi || nomorTransaksi,
          tokoId: x?.tokoId || "",
          tokoNama: x?.tokoNama || selectedToko.nama,
          metodePembayaranNama: x?.metodePembayaranNama || selectedMetode.nama,
          metodePembayaranTipe: x?.metodePembayaranTipe || "",
          metodePembayaranProvider: x?.metodePembayaranProvider || "",
          biayaAdminPersen: Number(x?.biayaAdminPersen || 0),
          biayaAdminNominal: Number(x?.biayaAdminNominal || 0),
          subtotal: Number(x?.subtotal || 0),
          totalDiskon: Number(x?.totalDiskon || 0),
          diskonPelangganPersen: Number(x?.diskonPelangganPersen || 0),
          diskonPelangganNominal: Number(x?.diskonPelangganNominal || 0),
          totalSetelahDiskon: Number(x?.totalSetelahDiskon || 0),
          grandTotal: Number(x?.grandTotal || 0),
          totalModal: Number(x?.totalModal || 0),
          estimasiLabaKotor: Number(x?.estimasiLabaKotor || 0),
          uangBayar: Number(x?.uangBayar || 0),
          kembalian: Number(x?.kembalian || 0),
          totalItem: Number(x?.totalItem || 0),
          totalJenisBarang: Number(x?.totalJenisBarang || 0),
          status: x?.status || "",
          catatan:
            x?.catatan ||
            (Number(x?.diskonPelangganPersen || 0) > 0
              ? `Diskon pelanggan ${Number(x?.diskonPelangganPersen || 0)}%`
              : ""),
          jenisTransaksi: (x?.jenisTransaksi || activeTab) as
            | "fisik"
            | "digital",
          kasirUid: x?.kasirUid || user.uid,
          kasirNama: x?.kasirNama || kasirProfile.nama,
          kasirEmail: x?.kasirEmail || kasirProfile.email,
          pelangganId: x?.pelangganId || "",
          pelangganNama: x?.pelangganNama || "",
          pelangganKode: x?.pelangganKode || "",
          pelangganTipeMember: x?.pelangganTipeMember || "",
          items: Array.isArray(x?.items)
            ? x.items.map((item: any) => ({
                barangId: item?.barangId || "",
                kodeBarang: item?.kodeBarang || "",
                kodeBarcode: item?.kodeBarcode || item?.barcodeValue || "",
                barcodeValue: item?.barcodeValue || item?.kodeBarcode || "",
                nama: item?.nama || "",
                kategoriId: item?.kategoriId || "",
                kategoriNama: item?.kategoriNama || "",
                merk: item?.merk || "",
                satuan: item?.satuan || "",
                satuanId: item?.satuanId || "",
                satuanNama: item?.satuanNama || item?.satuan || "",
                qty: Number(item?.qty || 0),
                hargaModal: Number(item?.hargaModal || 0),
                hargaAsli: Number(item?.hargaAsli || 0),
                hargaSetelahDiskon: Number(item?.hargaSetelahDiskon || 0),
                subtotalAsli: Number(item?.subtotalAsli || 0),
                subtotalFinal: Number(item?.subtotalFinal || 0),
                totalDiskon: Number(item?.totalDiskon || 0),
                pakaiKodeUnik: Boolean(item?.pakaiKodeUnik),
                jenisKodeUnik: item?.jenisKodeUnik || "",
                kodeUnik: item?.kodeUnik || "",
                jenisBarang: (item?.jenisBarang || "fisik") as
                  | "fisik"
                  | "digital",
                subJenisDigital: item?.subJenisDigital || "",
                providerId: item?.providerId || "",
                provider: item?.provider || "",
                saldoSourceId: item?.saldoSourceId || "",
                saldoSourceNama: item?.saldoSourceNama || "",
                nominalProduk: String(item?.nominalProduk || ""),
                tujuan: item?.tujuan || "",
                diskonId: item?.diskonId || "",
                diskonNama: item?.diskonNama || "",
                diskonJenisPromo: item?.diskonJenisPromo || "",
                diskonTipe: item?.diskonTipe || "",
                diskonNilai: Number(item?.diskonNilai || 0),
                diskonMinimalQty: Number(item?.diskonMinimalQty || 0),
                diskonGratisQty: Number(item?.diskonGratisQty || 0),
                diskonQtyGratis: Number(item?.diskonQtyGratis || 0),
                diskonPaketPromo: Number(item?.diskonPaketPromo || 0),
                diskonDeskripsi: item?.diskonDeskripsi || "",
              }))
            : itemPayload,
          createdAtMs: Number(x?.createdAtMs || nowMs),
        };
        setStrukModal(strukFromFirestore);
      }

      await fetchBarang(selectedTokoId);
      await fetchRiwayatTransaksi();
      if (selectedPelanggan) {
        const poinTambah = Math.floor(grandTotalSnapshot / 1000);
        setPelangganList((prev) =>
          prev.map((item) =>
            item.id === selectedPelanggan.id
              ? {
                  ...item,
                  totalTransaksi:
                    Number(item.totalTransaksi || 0) + grandTotalSnapshot,
                  poin: Number(item.poin || 0) + poinTambah,
                }
              : item,
          ),
        );
      }
      if (activeTab === "fisik") setCartFisik([]);
      else setCartDigital([]);
      setUangBayar("");
      setCatatan("");
      setSelectedPelangganId("");
      setSelectedMetodeId(metodeTunaiDefault?.id || "");
      if (isMobileLayout) setMobileKasirStep("riwayat");
      setSuccessMsg(`Transaksi ${activeTab} berhasil! Struk siap dicetak.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Gagal memproses transaksi");
    } finally {
      setSubmitLoading(false);
    }
  };

  const openReturTransaksi = (trx: RiwayatTransaksiItem) => {
    const initialSelections: ReturSelectionMap = {};

    trx.items.forEach((item, index) => {
      const sisa = getReturSisaQty(trx, item, index);
      if (sisa > 0) initialSelections[getReturKey(item, index)] = 0;
    });

    setReturSelections(initialSelections);
    setReturCatatan("");
    setReturModal(trx);
  };

  const updateReturQty = (
    trx: RiwayatTransaksiItem,
    item: any,
    index: number,
    qty: number,
  ) => {
    const key = getReturKey(item, index);
    const sisa = getReturSisaQty(trx, item, index);
    const safeQty = Math.max(0, Math.min(sisa, Number.isNaN(qty) ? 0 : qty));

    setReturSelections((prev) => ({
      ...prev,
      [key]: safeQty,
    }));
  };

  const totalReturQtyDipilih = useMemo(
    () =>
      Object.values(returSelections).reduce<number>(
        (sum, qty) => sum + Number(qty || 0),
        0,
      ),
    [returSelections],
  );

  const totalReturNominalDipilih = useMemo(() => {
    if (!returModal) return 0;

    const subtotalFinalRetur = returModal.items.reduce((sum, item, index) => {
      const key = getReturKey(item, index);
      const qtyRetur = Number(returSelections[key] || 0);
      return sum + Number(item?.hargaSetelahDiskon || 0) * qtyRetur;
    }, 0);

    const biayaAdminRetur =
      returModal.grandTotal > 0
        ? Math.round(
            Number(returModal.biayaAdminNominal || 0) *
              (subtotalFinalRetur / returModal.grandTotal),
          )
        : 0;

    return subtotalFinalRetur + biayaAdminRetur;
  }, [returModal, returSelections]);

  const handleReturTransaksi = async () => {
    const user = auth.currentUser;
    if (!user) return void setError("Sesi login tidak ditemukan");
    if (!returModal) return;
    if (totalReturQtyDipilih <= 0)
      return void setError("Pilih minimal 1 barang untuk retur");

    setReturLoading(true);
    setError(null);

    try {
      const nowMs = Date.now();
      const nomorRetur = `RTR-${nowMs}`;
      const trxId = returModal.id;
      const originalCreatedAtMs = Number(returModal.createdAtMs || nowMs);
      const { tahun, bulan, hari, tanggalKey, bulanKey } =
        getTanggalParts(originalCreatedAtMs);

      let savedReturId = "";

      await runTransaction(db, async (transaction) => {
        const transaksiRef = doc(db, "transaksi", trxId);
        const transaksiSnap = await transaction.get(transaksiRef);

        if (!transaksiSnap.exists())
          throw new Error("Transaksi asal tidak ditemukan");

        const transaksiData = transaksiSnap.data() as any;
        if (String(transaksiData?.status || "") !== "selesai") {
          throw new Error("Transaksi ini tidak bisa diretur");
        }

        const originalItems = Array.isArray(transaksiData?.items)
          ? transaksiData.items
          : [];
        const returQtyByBarangId =
          transaksiData?.returQtyByBarangId &&
          typeof transaksiData.returQtyByBarangId === "object"
            ? { ...transaksiData.returQtyByBarangId }
            : {};

        const selectedItems: ReturSelectedRow[] = [];

        originalItems.forEach((item: any, index: number) => {
          const key = getReturKey(item, index);
          const qtyRetur = Number(returSelections[key] || 0);
          const qtyTerjual = Number(item?.qty || 0);
          const qtySudahRetur = Number(
            returQtyByBarangId[key] || returQtyByBarangId[item?.barangId] || 0,
          );
          const qtySisa = Math.max(0, qtyTerjual - qtySudahRetur);

          if (qtyRetur > 0) {
            selectedItems.push({
              item,
              index,
              key,
              qtyRetur,
              qtyTerjual,
              qtySudahRetur,
              qtySisa,
            });
          }
        });

        if (selectedItems.length === 0) {
          throw new Error("Tidak ada item retur yang dipilih");
        }

        selectedItems.forEach((row: ReturSelectedRow) => {
          if (row.qtyRetur > row.qtySisa) {
            throw new Error(
              `Qty retur ${row.item?.nama || "barang"} melebihi sisa retur`,
            );
          }
        });

        const laporanHarianRef = doc(
          db,
          "laporan_harian",
          `${tanggalKey}__${transaksiData.tokoId}`,
        );
        const laporanBulananRef = doc(
          db,
          "laporan_bulanan",
          `${bulanKey}__${transaksiData.tokoId}`,
        );
        const laporanHarianSnap = await transaction.get(laporanHarianRef);
        const laporanBulananSnap = await transaction.get(laporanBulananRef);
        const laporanHarianData = laporanHarianSnap.exists()
          ? laporanHarianSnap.data()
          : null;
        const laporanBulananData = laporanBulananSnap.exists()
          ? laporanBulananSnap.data()
          : null;

        const returRef = doc(collection(db, "retur_transaksi"));
        savedReturId = returRef.id;

        let subtotalRetur = 0;
        let totalSetelahDiskonRetur = 0;
        let totalDiskonRetur = 0;
        let totalModalRetur = 0;
        let totalItemRetur = 0;

        const kategoriAccumulator = new Map<
          string,
          LaporanKategoriBreakdown & {
            kategoriId: string;
            satuanIds?: string[];
            satuanNamaList?: string[];
          }
        >();

        const returItems: any[] = [];

        for (const row of selectedItems) {
          const item = row.item;
          const qtyRetur = row.qtyRetur;

          const qtyTerjualItem = Math.max(1, Number(item?.qty || 0));
          const hargaAsliReturSatuan =
            Number(item?.subtotalAsli || 0) > 0
              ? Number(item.subtotalAsli) / qtyTerjualItem
              : Number(item?.hargaAsli || 0);
          const hargaFinalReturSatuan =
            Number(item?.subtotalFinal || 0) > 0
              ? Number(item.subtotalFinal) / qtyTerjualItem
              : Number(item?.hargaSetelahDiskon || 0);
          const hargaModalReturSatuan =
            Number(item?.totalModal || 0) > 0
              ? Number(item.totalModal) / qtyTerjualItem
              : Number(item?.hargaModal || 0);

          const subtotalAsliItem = Math.round(hargaAsliReturSatuan * qtyRetur);
          const subtotalFinalItem = Math.round(hargaFinalReturSatuan * qtyRetur);
          const totalDiskonItem = subtotalAsliItem - subtotalFinalItem;
          const totalModalItem = Math.round(hargaModalReturSatuan * qtyRetur);

          subtotalRetur += subtotalAsliItem;
          totalSetelahDiskonRetur += subtotalFinalItem;
          totalDiskonRetur += totalDiskonItem;
          totalModalRetur += totalModalItem;
          totalItemRetur += qtyRetur;

          const kategoriId =
            String(item?.kategoriId || "").trim() || "tanpa-kategori";
          const kategoriNama =
            String(item?.kategoriNama || "").trim() || "Tanpa Kategori";
          const proporsiOmzet =
            Number(transaksiData?.grandTotal || 0) > 0
              ? subtotalFinalItem / Number(transaksiData.grandTotal || 0)
              : 0;
          const adminKategori = Math.round(
            Number(transaksiData?.biayaAdminNominal || 0) * proporsiOmzet,
          );
          const labaBersihKategori =
            subtotalFinalItem - totalModalItem - adminKategori;

          const prevKategori = kategoriAccumulator.get(kategoriId);
          const nextSatuanIds = Array.from(
            new Set([
              ...(prevKategori?.satuanIds || []),
              ...(item?.satuanId ? [item.satuanId] : []),
            ]),
          );
          const nextSatuanNamaList = Array.from(
            new Set([
              ...(prevKategori?.satuanNamaList || []),
              ...(item?.satuanNama || item?.satuan
                ? [item.satuanNama || item.satuan]
                : []),
            ]),
          );

          kategoriAccumulator.set(kategoriId, {
            kategoriId,
            nama: kategoriNama,
            jumlahTransaksi: -1,
            qtyTerjual: Number(prevKategori?.qtyTerjual || 0) - qtyRetur,
            omzet:
              Number(prevKategori?.omzet || 0) -
              (subtotalFinalItem + adminKategori),
            subtotal: Number(prevKategori?.subtotal || 0) - subtotalAsliItem,
            totalDiskon:
              Number(prevKategori?.totalDiskon || 0) - totalDiskonItem,
            totalSetelahDiskon:
              Number(prevKategori?.totalSetelahDiskon || 0) - subtotalFinalItem,
            totalModal: Number(prevKategori?.totalModal || 0) - totalModalItem,
            totalBiayaAdmin:
              Number(prevKategori?.totalBiayaAdmin || 0) - adminKategori,
            labaBersih:
              Number(prevKategori?.labaBersih || 0) - labaBersihKategori,
            satuanIds: nextSatuanIds,
            satuanNamaList: nextSatuanNamaList,
          });

          returItems.push({
            ...item,
            qtyTerjual: Number(item?.qty || 0),
            qtySudahRetur: row.qtySudahRetur,
            qtyRetur,
            subtotalAsliRetur: subtotalAsliItem,
            subtotalFinalRetur: subtotalFinalItem,
            totalDiskonRetur: totalDiskonItem,
            totalModalRetur: totalModalItem,
          });

          if ((item?.jenisBarang || "fisik") === "fisik") {
            const barangRef = doc(db, "barang", item.barangId);
            const barangSnap = await transaction.get(barangRef);
            if (!barangSnap.exists())
              throw new Error(`Barang ${item?.nama || ""} tidak ditemukan`);

            const barangDb = barangSnap.data() as any;
            const stokSebelum = Number(barangDb?.stok || 0);
            const stokSesudah = stokSebelum + qtyRetur;

            transaction.update(barangRef, {
              stok: stokSesudah,
              updatedAt: nowMs,
              updatedBy: user.uid,
              lastReturId: returRef.id,
              lastReturNomor: nomorRetur,
            });

            const mutasiRef = doc(collection(db, "mutasi_stok"));
            transaction.set(mutasiRef, {
              id: mutasiRef.id,
              transaksiId: trxId,
              returId: returRef.id,
              nomorTransaksi: transaksiData.nomorTransaksi || "",
              nomorRetur,
              tipe: "masuk",
              sumber: "retur_transaksi",
              tokoId: transaksiData.tokoId || "",
              tokoNama: transaksiData.tokoNama || "",
              barangId: item.barangId || "",
              kodeBarang: item.kodeBarang || "",
              namaBarang: item.nama || "",
              qty: qtyRetur,
              stokSebelum,
              stokSesudah,
              keterangan: `Retur transaksi ${transaksiData.nomorTransaksi || ""}`,
              createdAt: serverTimestamp(),
              createdAtMs: nowMs,
              createdBy: user.uid,
            });
          }

          if ((item?.jenisBarang || "fisik") === "digital") {
            const saldoSourceId = String(item?.saldoSourceId || "").trim();
            if (saldoSourceId) {
              const saldoRef = doc(db, "master_saldo_digital", saldoSourceId);
              const saldoSnap = await transaction.get(saldoRef);
              if (!saldoSnap.exists())
                throw new Error(
                  `Sumber saldo ${item?.saldoSourceNama || ""} tidak ditemukan`,
                );

              const saldoDb = saldoSnap.data() as any;
              const saldoSebelum = Number(saldoDb?.jumlahSaldo || 0);
              const nominalKembali =
                Number(item?.hargaModal || 0) * qtyRetur;
              const saldoSesudah = saldoSebelum + nominalKembali;

              transaction.update(saldoRef, {
                jumlahSaldo: saldoSesudah,
                updatedAt: serverTimestamp(),
                updatedAtMs: nowMs,
                updatedBy: user.uid,
                lastReturId: returRef.id,
                lastReturNomor: nomorRetur,
                lastReturNominal: nominalKembali,
                lastReturQty: qtyRetur,
              });
            }
          }

          returQtyByBarangId[row.key] =
            Number(returQtyByBarangId[row.key] || 0) + qtyRetur;
        }

        const biayaAdminRetur =
          Number(transaksiData?.grandTotal || 0) > 0
            ? Math.round(
                Number(transaksiData?.biayaAdminNominal || 0) *
                  (totalSetelahDiskonRetur /
                    Number(transaksiData.grandTotal || 0)),
              )
            : 0;

        const grandTotalRetur = totalSetelahDiskonRetur + biayaAdminRetur;
        const labaKotorRetur =
          totalSetelahDiskonRetur - totalModalRetur - biayaAdminRetur;

        const totalQtyTerjual = originalItems.reduce(
          (sum: number, item: any) => sum + Number(item?.qty || 0),
          0,
        );
        const totalQtySudahReturBaru = Object.values(returQtyByBarangId).reduce<number>(
          (sum, qty) => sum + Number(qty || 0),
          0,
        );

        const returStatus =
          totalQtySudahReturBaru >= totalQtyTerjual && totalQtyTerjual > 0
            ? "penuh"
            : totalQtySudahReturBaru > 0
              ? "sebagian"
              : "belum";

        const totalReturNominalBaru =
          Number(transaksiData?.totalReturNominal || 0) + grandTotalRetur;
        const totalReturSubtotalBaru =
          Number(transaksiData?.totalReturSubtotal || 0) + subtotalRetur;
        const totalReturDiskonBaru =
          Number(transaksiData?.totalReturDiskon || 0) + totalDiskonRetur;
        const totalReturSetelahDiskonBaru =
          Number(transaksiData?.totalReturSetelahDiskon || 0) +
          totalSetelahDiskonRetur;
        const totalReturModalBaru =
          Number(transaksiData?.totalReturModal || 0) + totalModalRetur;
        const totalReturBiayaAdminBaru =
          Number(transaksiData?.totalReturBiayaAdmin || 0) + biayaAdminRetur;
        const totalReturLabaKotorBaru =
          Number(transaksiData?.totalReturLabaKotor || 0) + labaKotorRetur;

        const subtotalBersih = Math.max(
          0,
          Number(transaksiData?.subtotal || 0) - totalReturSubtotalBaru,
        );
        const totalDiskonBersih = Math.max(
          0,
          Number(transaksiData?.totalDiskon || 0) - totalReturDiskonBaru,
        );
        const totalSetelahDiskonBersih = Math.max(
          0,
          Number(transaksiData?.totalSetelahDiskon || 0) -
            totalReturSetelahDiskonBaru,
        );
        const biayaAdminBersih = Math.max(
          0,
          Number(transaksiData?.biayaAdminNominal || 0) -
            totalReturBiayaAdminBaru,
        );
        const grandTotalBersih = Math.max(
          0,
          Number(transaksiData?.grandTotal || 0) - totalReturNominalBaru,
        );
        const totalModalBersih = Math.max(
          0,
          Number(transaksiData?.totalModal || 0) - totalReturModalBaru,
        );
        const estimasiLabaKotorBersih =
          Number(transaksiData?.estimasiLabaKotor || 0) -
          totalReturLabaKotorBaru;
        const totalItemBersih = Math.max(0, totalQtyTerjual - totalQtySudahReturBaru);

        const itemsSetelahRetur = originalItems.map((item: any, index: number) => {
          const key = getReturKey(item, index);
          const qtyTerjualItem = Number(item?.qty || 0);
          const qtyReturTotal = Math.min(
            qtyTerjualItem,
            Number(returQtyByBarangId[key] || returQtyByBarangId[item?.barangId] || 0),
          );
          const qtyBersih = Math.max(0, qtyTerjualItem - qtyReturTotal);
          const rasioBersih = qtyTerjualItem > 0 ? qtyBersih / qtyTerjualItem : 0;

          return {
            ...item,
            returKey: key,
            qtySudahRetur: qtyReturTotal,
            qtyReturTotal,
            qtyBersih,
            subtotalAsliBersih: Math.round(Number(item?.subtotalAsli || 0) * rasioBersih),
            subtotalFinalBersih: Math.round(Number(item?.subtotalFinal || 0) * rasioBersih),
            totalDiskonBersih: Math.round(Number(item?.totalDiskon || 0) * rasioBersih),
            totalModalBersih: Math.round(
              Number(item?.hargaModal || 0) * qtyBersih,
            ),
            returStatusItem:
              qtyReturTotal >= qtyTerjualItem && qtyTerjualItem > 0
                ? "penuh"
                : qtyReturTotal > 0
                  ? "sebagian"
                  : "belum",
          };
        });

        const kategoriBreakdownRetur = Array.from(
          kategoriAccumulator.values(),
        ).map((item) => ({
          ...item,
          jumlahTransaksi: -1,
          satuanIds: item.satuanIds || [],
          satuanNamaList: item.satuanNamaList || [],
        }));

        const sharedLaporanArgs = {
          tokoId: transaksiData.tokoId || "",
          tokoNama: transaksiData.tokoNama || "",
          metodeNama: transaksiData.metodePembayaranNama || "",
          omzetTambah: -grandTotalRetur,
          subtotalTambah: -subtotalRetur,
          totalDiskonTambah: -totalDiskonRetur,
          totalSetelahDiskonTambah: -totalSetelahDiskonRetur,
          totalBiayaAdminTambah: -biayaAdminRetur,
          totalModalTambah: -totalModalRetur,
          totalLabaKotorTambah: -labaKotorRetur,
          totalItemTambah: -totalItemRetur,
          totalJenisBarangTambah: -selectedItems.length,
          kategoriBreakdownTambah: kategoriBreakdownRetur,
          nowMs,
        };

        transaction.set(
          laporanHarianRef,
          buildLaporanPayload({
            existingData: laporanHarianData,
            id: laporanHarianRef.id,
            periodeKey: tanggalKey,
            tahun,
            bulan,
            hari,
            ...sharedLaporanArgs,
          }),
        );

        transaction.set(
          laporanBulananRef,
          buildLaporanPayload({
            existingData: laporanBulananData,
            id: laporanBulananRef.id,
            periodeKey: bulanKey,
            tahun,
            bulan,
            ...sharedLaporanArgs,
          }),
        );

        transaction.set(returRef, {
          id: returRef.id,
          nomorRetur,
          transaksiId: trxId,
          nomorTransaksiAsal: transaksiData.nomorTransaksi || "",
          tokoId: transaksiData.tokoId || "",
          tokoNama: transaksiData.tokoNama || "",
          metodePembayaranId: transaksiData.metodePembayaranId || "",
          metodePembayaranNama: transaksiData.metodePembayaranNama || "",
          metodePembayaranTipe: transaksiData.metodePembayaranTipe || "",
          jenisTransaksi: transaksiData.jenisTransaksi || "",
          status: "selesai",
          catatan: returCatatan.trim(),
          items: returItems,
          subtotalRetur,
          totalDiskonRetur,
          totalSetelahDiskonRetur,
          biayaAdminRetur,
          grandTotalRetur,
          totalModalRetur,
          labaKotorRetur,
          totalItemRetur,
          totalJenisBarangRetur: selectedItems.length,
          periodeAsalTanggal: tanggalKey,
          periodeAsalBulan: bulanKey,
          kasirUid: transaksiData.kasirUid || "",
          kasirNama: transaksiData.kasirNama || "",
          kasirEmail: transaksiData.kasirEmail || "",
          returBy: user.uid,
          createdAt: serverTimestamp(),
          createdAtMs: nowMs,
          createdBy: user.uid,
        });

        transaction.update(transaksiRef, {
          returStatus,
          returQtyByBarangId,
          totalReturQty: totalQtySudahReturBaru,
          totalReturNominal: totalReturNominalBaru,
          totalReturSubtotal: totalReturSubtotalBaru,
          totalReturDiskon: totalReturDiskonBaru,
          totalReturSetelahDiskon: totalReturSetelahDiskonBaru,
          totalReturModal: totalReturModalBaru,
          totalReturBiayaAdmin: totalReturBiayaAdminBaru,
          totalReturLabaKotor: totalReturLabaKotorBaru,
          subtotalBersih,
          totalDiskonBersih,
          totalSetelahDiskonBersih,
          biayaAdminBersih,
          grandTotalBersih,
          totalModalBersih,
          estimasiLabaKotorBersih,
          totalItemBersih,
          items: itemsSetelahRetur,
          lastReturId: returRef.id,
          lastReturNomor: nomorRetur,
          lastReturAt: serverTimestamp(),
          lastReturAtMs: nowMs,
          updatedAt: serverTimestamp(),
          updatedAtMs: nowMs,
        });
      });

      await Promise.all([
        fetchBarang(selectedTokoId),
        fetchSaldo(),
        fetchRiwayatTransaksi(),
      ]);

      setReturModal(null);
      setReturSelections({});
      setReturCatatan("");
      setSuccessMsg(
        `Retur berhasil diproses: ${savedReturId ? nomorRetur : "selesai"}`,
      );
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Gagal memproses retur");
    } finally {
      setReturLoading(false);
    }
  };

  const openPrintStrukFromRiwayat = (trx: RiwayatTransaksiItem) => {
    const strukFromRiwayat: StrukDataWithPelanggan = {
      id: trx.id,
      nomorTransaksi: trx.nomorTransaksi,
      tokoId: trx.tokoId,
      tokoNama: trx.tokoNama,
      metodePembayaranNama: trx.metodePembayaranNama,
      metodePembayaranTipe: trx.metodePembayaranTipe,
      metodePembayaranProvider: trx.metodePembayaranProvider || "",
      biayaAdminPersen: Number(trx.biayaAdminPersen || 0),
      biayaAdminNominal: Number(trx.biayaAdminNominal || 0),
      subtotal: Number(trx.subtotal || 0),
      totalDiskon: Number(trx.totalDiskon || 0),
      diskonPelangganPersen: Number(trx.diskonPelangganPersen || 0),
      diskonPelangganNominal: Number(trx.diskonPelangganNominal || 0),
      totalSetelahDiskon: Number(trx.totalSetelahDiskon || 0),
      grandTotal: Number(trx.grandTotal || 0),
      totalModal: Number(trx.totalModal || 0),
      estimasiLabaKotor: Number(trx.estimasiLabaKotor || 0),
      uangBayar: Number(trx.uangBayar || 0),
      kembalian: Number(trx.kembalian || 0),
      totalItem: Number(trx.totalItem || 0),
      totalJenisBarang: Number(trx.totalJenisBarang || 0),
      status: trx.status || "selesai",
      catatan:
        trx.catatan ||
        (Number(trx.diskonPelangganPersen || 0) > 0
          ? `Diskon pelanggan ${Number(trx.diskonPelangganPersen || 0)}%`
          : ""),
      jenisTransaksi: trx.jenisTransaksi,
      kasirUid: "",
      kasirNama: trx.kasirNama || "-",
      kasirEmail: trx.kasirEmail || "-",
      pelangganId: trx.pelangganId || "",
      pelangganNama: trx.pelangganNama || "",
      pelangganKode: trx.pelangganKode || "",
      pelangganTipeMember: trx.pelangganTipeMember || "",
      items: Array.isArray(trx.items)
        ? trx.items.map((item: any) => ({
            barangId: item?.barangId || "",
            kodeBarang: item?.kodeBarang || "",
            kodeBarcode: item?.kodeBarcode || item?.barcodeValue || "",
            barcodeValue: item?.barcodeValue || item?.kodeBarcode || "",
            nama: item?.nama || "",
            kategoriId: item?.kategoriId || "",
            kategoriNama: item?.kategoriNama || "",
            merk: item?.merk || "",
            satuan: item?.satuan || "",
            satuanId: item?.satuanId || "",
            satuanNama: item?.satuanNama || item?.satuan || "",
            qty: Number(item?.qty || 0),
            hargaModal: Number(item?.hargaModal || 0),
            hargaAsli: Number(item?.hargaAsli || 0),
            hargaSetelahDiskon: Number(item?.hargaSetelahDiskon || 0),
            subtotalAsli: Number(item?.subtotalAsli || 0),
            subtotalFinal: Number(item?.subtotalFinal || 0),
            totalDiskon: Number(item?.totalDiskon || 0),
            pakaiKodeUnik: Boolean(item?.pakaiKodeUnik),
            jenisKodeUnik: item?.jenisKodeUnik || "",
            kodeUnik: item?.kodeUnik || "",
            jenisBarang: (item?.jenisBarang || "fisik") as "fisik" | "digital",
            subJenisDigital: item?.subJenisDigital || "",
            providerId: item?.providerId || "",
            provider: item?.provider || "",
            saldoSourceId: item?.saldoSourceId || "",
            saldoSourceNama: item?.saldoSourceNama || "",
            nominalProduk: String(item?.nominalProduk || ""),
            tujuan: item?.tujuan || "",
            diskonId: item?.diskonId || "",
            diskonNama: item?.diskonNama || "",
            diskonJenisPromo: item?.diskonJenisPromo || "",
            diskonTipe: item?.diskonTipe || "",
            diskonNilai: Number(item?.diskonNilai || 0),
            diskonMinimalQty: Number(item?.diskonMinimalQty || 0),
            diskonGratisQty: Number(item?.diskonGratisQty || 0),
            diskonQtyGratis: Number(item?.diskonQtyGratis || 0),
            diskonPaketPromo: Number(item?.diskonPaketPromo || 0),
            diskonDeskripsi: item?.diskonDeskripsi || "",
          }))
        : [],
      createdAtMs: Number(trx.createdAtMs || Date.now()),
    };

    setStrukModal(strukFromRiwayat);
  };

  return (
    <>
      <ModalStruk
        struk={strukModal as StrukData}
        onClose={() => setStrukModal(null)}
      />

      <AnimatePresence>
        {showCheckoutConfirm && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !submitLoading) {
                setShowCheckoutConfirm(false);
              }
            }}
          >
            <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" />

            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-sky-100 bg-white shadow-2xl"
            >
              <div className="relative overflow-hidden bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 px-5 py-4 text-white">
                <div className="relative z-10 flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
                      <Receipt
                        size={23}
                        className="text-white"
                        strokeWidth={2.6}
                      />
                    </div>

                    <div className="min-w-0">
                      <h2 className="text-lg font-black tracking-tight text-white">
                        Konfirmasi Transaksi
                      </h2>
                      <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85">
                        Periksa lagi nominal pembayaran sebelum transaksi
                        disimpan.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowCheckoutConfirm(false)}
                    disabled={submitLoading}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/15 disabled:opacity-50"
                    aria-label="Tutup konfirmasi"
                  >
                    <X size={16} strokeWidth={2.8} />
                  </button>
                </div>

                <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10 blur-3xl" />
                <div className="pointer-events-none absolute right-0 top-0 opacity-[0.06]">
                  <Cpu size={150} className="text-white" strokeWidth={1} />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                      Toko
                    </p>
                    <p className="mt-1 truncate text-sm font-black text-slate-800">
                      {selectedToko?.nama || "-"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                      Metode
                    </p>
                    <p className="mt-1 truncate text-sm font-black text-slate-800">
                      {selectedMetode?.nama || "-"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                      Pelanggan
                    </p>
                    <p className="mt-1 truncate text-sm font-black text-slate-800">
                      {selectedPelanggan?.nama || "Umum"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                      Total Item
                    </p>
                    <p className="mt-1 text-lg font-black text-slate-800">
                      {totalItem}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                      Jenis Transaksi
                    </p>
                    <p className="mt-1 text-lg font-black capitalize text-slate-800">
                      {activeTab}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-3xl border border-sky-100 bg-sky-50/60 p-4">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-slate-500">
                        Subtotal
                      </span>
                      <span className="text-sm font-black text-slate-800">
                        {formatRupiah(subtotal)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-slate-500">
                        Diskon Barang
                      </span>
                      <span className="text-sm font-black text-sky-700">
                        - {formatRupiah(totalDiskonBarang)}
                      </span>
                    </div>

                    {selectedPelanggan && pelangganDiskonNominal > 0 && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-bold text-slate-500">
                          Diskon Member ({pelangganDiskonPersen}%)
                        </span>
                        <span className="text-sm font-black text-sky-700">
                          - {formatRupiah(pelangganDiskonNominal)}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-slate-500">
                        Total Diskon
                      </span>
                      <span className="text-sm font-black text-sky-700">
                        - {formatRupiah(totalDiskon)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-slate-500">
                        Biaya Admin
                      </span>
                      <span className="text-sm font-black text-slate-800">
                        {formatRupiah(biayaAdminNominal)}
                      </span>
                    </div>

                    <div className="my-2 border-t border-sky-200" />

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-black text-slate-700">
                        Grand Total
                      </span>
                      <span className="text-xl font-black text-sky-700">
                        {formatRupiah(grandTotal)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-black text-slate-700">
                        Uang Bayar
                      </span>
                      <span className="text-xl font-black text-slate-900">
                        {formatRupiah(uangBayarNumber)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2">
                      <span className="text-sm font-black text-slate-700">
                        {kurangBayar > 0 ? "Kurang Bayar" : "Kembalian"}
                      </span>
                      <span
                        className={`text-xl font-black ${
                          kurangBayar > 0 ? "text-red-600" : "text-sky-700"
                        }`}
                      >
                        {formatRupiah(
                          kurangBayar > 0 ? kurangBayar : kembalian,
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                      Ringkasan Keranjang
                    </p>
                  </div>

                  <div className="max-h-52 divide-y divide-slate-100 overflow-y-auto">
                    {cart.map((item) => (
                      <div
                        key={item.barangId}
                        className="flex items-start justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-800">
                            {item.nama}
                          </p>
                          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            {item.jenisBarang === "digital"
                              ? `${item.provider || "-"} · ${item.tujuan || "-"}`
                              : `${item.kodeBarang || "-"} · ${item.kategoriNama || "-"}`}
                          </p>
                          {item.diskonDeskripsi && (
                            <p className="mt-1 text-[10px] font-black text-emerald-600">
                              {item.diskonDeskripsi}
                            </p>
                          )}
                        </div>

                        <div className="shrink-0 text-right">
                          <p className="text-sm font-black text-slate-800">
                            {item.qty} × {formatRupiah(item.hargaSetelahDiskon)}
                          </p>
                          <p className="mt-0.5 text-xs font-bold text-sky-700">
                            {formatRupiah(item.qty * item.hargaSetelahDiskon)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {catatan.trim() ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                      Catatan
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">
                      {catatan.trim()}
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-4 py-4 sm:flex-row sm:justify-end sm:px-5">
                <button
                  type="button"
                  onClick={() => setShowCheckoutConfirm(false)}
                  disabled={submitLoading}
                  className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-wide text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Cek Lagi
                </button>

                <button
                  type="button"
                  onClick={handleProsesTransaksi}
                  disabled={submitLoading || kurangBayar > 0}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-5 text-xs font-black uppercase tracking-wide text-white shadow-sm shadow-sky-200/50 transition hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitLoading ? (
                    <>
                      <RefreshCw
                        size={14}
                        className="animate-spin"
                        strokeWidth={2.8}
                      />
                      Memproses...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={15} strokeWidth={2.8} />
                      Yakin Proses
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <ReturTransaksiModal
        trx={returModal}
        selections={returSelections}
        catatan={returCatatan}
        loading={returLoading}
        totalQty={totalReturQtyDipilih}
        totalNominal={totalReturNominalDipilih}
        onClose={() => {
          if (returLoading) return;
          setReturModal(null);
          setReturSelections({});
          setReturCatatan("");
        }}
        onChangeCatatan={setReturCatatan}
        onChangeQty={updateReturQty}
        onSubmit={handleReturTransaksi}
      />

      <AnimatePresence>
        {(error || successMsg) && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="fixed right-3 top-3 z-[9999] w-[calc(100vw-1.5rem)] max-w-sm sm:right-5 sm:top-5 sm:w-full"
          >
            <div
              className={`overflow-hidden rounded-2xl border px-4 py-3 text-sm font-semibold shadow-2xl backdrop-blur-xl ${
                error
                  ? "border-red-200/80 bg-red-50/95 text-red-700 shadow-red-500/10"
                  : "border-sky-200/80 bg-sky-50/95 text-sky-700 shadow-sky-500/10"
              }`}
            >
              <div className="flex items-start gap-2.5">
                <div
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${
                    error ? "bg-red-100 text-red-600" : "bg-sky-100 text-sky-700"
                  }`}
                >
                  {error ? (
                    <AlertCircle size={17} strokeWidth={2.6} />
                  ) : (
                    <CheckCircle2 size={17} strokeWidth={2.6} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-black uppercase tracking-[0.08em]">
                    {error ? "Perhatian" : "Berhasil"}
                  </p>
                  <p className="mt-0.5 text-xs font-bold leading-relaxed sm:text-sm">
                    {error || successMsg}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl transition ${
                    error
                      ? "text-red-500 hover:bg-red-100"
                      : "text-sky-600 hover:bg-sky-100"
                  }`}
                  title="Tutup notifikasi"
                >
                  <X size={15} strokeWidth={2.7} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-4 text-slate-900 sm:space-y-5">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl border border-sky-300/30 bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 px-4 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-18px_42px_rgba(6,78,59,0.24)] sm:px-5 sm:py-5"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4 lg:items-start">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20 sm:h-12 sm:w-12">
                <ShoppingCart
                  size={22}
                  className="text-white"
                  strokeWidth={2.5}
                />
              </div>
              <div className="min-w-0 self-center lg:self-auto">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                  Transaksi Kasir
                </h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  Kasir penjualan, checkout, struk,
                  dan retur transaksi.
                </p>
              </div>
            </div>

            <div className="hidden flex-wrap items-center justify-end gap-2 sm:flex">
             <button
  type="button"
  onClick={() => setActiveTab("fisik")}
  className={`flex h-10 items-center rounded-xl px-4 text-xs font-black uppercase tracking-wide transition ${
    activeTab === "fisik"
      ? "bg-white text-sky-700 shadow-[inset_0_2px_6px_rgba(2,132,199,0.22),inset_0_-1px_0_rgba(255,255,255,0.75),0_8px_18px_rgba(15,23,42,0.10)] ring-1 ring-white/70"
      : "border border-white/20 bg-white/10 text-white shadow-sm hover:bg-white/15"
  }`}
>
  Fisik ({fisikCount})
</button>

<button
  type="button"
  onClick={() => {
    setActiveTab("digital");
    setCameraOpen(false);
  }}
  className={`flex h-10 items-center rounded-xl px-4 text-xs font-black uppercase tracking-wide transition ${
    activeTab === "digital"
      ? "bg-white text-sky-700 shadow-[inset_0_2px_6px_rgba(2,132,199,0.22),inset_0_-1px_0_rgba(255,255,255,0.75),0_8px_18px_rgba(15,23,42,0.10)] ring-1 ring-white/70"
      : "border border-white/20 bg-white/10 text-white shadow-sm hover:bg-white/15"
  }`}
>
  Digital ({digitalCount})
</button>
              <button
                type="button"
                onClick={fetchAll}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white shadow-sm hover:bg-white/15 sm:h-10 sm:w-auto sm:px-4"
                title="Refresh"
              >
                <RefreshCw size={14} strokeWidth={2.5} />
                <span className="hidden text-xs font-black uppercase tracking-wide sm:ml-2 sm:inline">
                  Refresh
                </span>
              </button>
              <button
                type="button"
                onClick={() =>
                  activeTab === "fisik" && setCameraOpen((prev) => !prev)
                }
                disabled={activeTab !== "fisik"}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white shadow-sm hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40 sm:h-10 sm:w-auto sm:px-4"
                title={cameraOpen ? "Tutup Kamera" : "Buka Kamera"}
              >
                <Camera size={14} strokeWidth={2.5} />
                <span className="hidden text-xs font-black uppercase tracking-wide sm:ml-2 sm:inline">
                  {cameraOpen ? "Tutup Kamera" : "Buka Kamera"}
                </span>
              </button>
            </div>
          </div>
        </motion.div>

        <div className="hidden">
          <motion.button
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            type="button"
            onClick={() => setActiveTab("fisik")}
            className={`inline-flex items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-[9px] font-black uppercase tracking-[0.06em] transition ${
              activeTab === "fisik"
                ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-sm shadow-sky-500/15"
                : "border border-slate-200 bg-white text-slate-600"
            }`}
          >
            <Boxes size={13} strokeWidth={2.6} />
            Fisik
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            type="button"
            onClick={() => {
              setActiveTab("digital");
              setCameraOpen(false);
            }}
            className={`inline-flex items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-[9px] font-black uppercase tracking-[0.06em] transition ${
              activeTab === "digital"
                ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-sm shadow-sky-500/15"
                : "border border-slate-200 bg-white text-slate-600"
            }`}
          >
            <Smartphone size={13} strokeWidth={2.6} />
            Digital
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            type="button"
            onClick={fetchAll}
            disabled={loading}
            className="inline-flex items-center justify-center gap-1 rounded-xl border border-sky-200 bg-sky-50 px-2 py-2.5 text-[9px] font-black uppercase tracking-[0.06em] text-sky-700 disabled:opacity-60"
          >
            <RefreshCw
              size={13}
              className={loading ? "animate-spin" : ""}
              strokeWidth={2.6}
            />
            Refresh
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            type="button"
            onClick={() =>
              activeTab === "fisik" && setCameraOpen((prev) => !prev)
            }
            disabled={activeTab !== "fisik"}
            className="inline-flex items-center justify-center gap-1 rounded-xl border border-sky-200 bg-white px-2 py-2.5 text-[9px] font-black uppercase tracking-[0.06em] text-sky-700 disabled:opacity-40"
          >
            <Camera size={13} strokeWidth={2.6} />
            Kamera
          </motion.button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
          <TransaksiStatCard
            icon={Boxes}
            label="Jenis Barang"
            value={String(barangByToko.length)}
            
            tone="sky"
          />
          <TransaksiStatCard
            icon={Layers3}
            label="Isi Keranjang"
            value={String(totalItem)}
            
            tone="blue"
          />
          <TransaksiStatCard
            icon={Percent}
            label="Total Diskon"
            value={formatRupiah(totalDiskon)}
           
            tone="slate"
          />
          <TransaksiStatCard
            icon={CircleDollarSign}
            label="Grand Total"
            value={formatRupiah(grandTotal)}
            
            tone="rose"
          />
        </div>

        {isMobileLayout ? (
          <div className="space-y-3 sm:hidden">
            <MobileKasirStepper
              activeStep={mobileKasirStep}
              setActiveStep={setMobileKasirStep}
              totalItem={totalItem}
              grandTotal={grandTotal}
              riwayatCount={riwayatTransaksi.length}
            />

            <AnimatePresence mode="wait">
              {mobileKasirStep === "barang" && (
                <motion.div
                  key="mobile-step-barang"
                  initial={{ opacity: 0, x: 18 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -18 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="space-y-3"
                >
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-600">
                    Kontrol Transaksi
                  </p>
                  <h2 className="mt-1 text-sm font-black text-slate-800">
                    Pilih toko dan jenis barang
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={fetchAll}
                  disabled={loading}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-700 disabled:opacity-60"
                  title="Refresh"
                >
                  <RefreshCw
                    size={15}
                    className={loading ? "animate-spin" : ""}
                    strokeWidth={2.6}
                  />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <FieldLabel
                    icon={Store}
                    label={isAdminUser ? "Pilih Toko" : "Toko Karyawan"}
                  />
                  {isAdminUser ? (
                    <select
                      value={selectedTokoId}
                      onChange={(e) => setSelectedTokoId(e.target.value)}
                      className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition-all focus:border-blue-500"
                    >
                      <option value="">Pilih toko</option>
                      {tokoList.map((toko) => (
                        <option key={toko.id} value={toko.id}>
                          {toko.nama}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700">
                      {selectedToko?.nama ||
                        currentUserProfile?.tokoNama ||
                        "Toko belum terhubung"}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    transition={{ duration: 0.12, ease: "easeOut" }}
                    type="button"
                    onClick={() => setActiveTab("fisik")}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] transition ${
                      activeTab === "fisik"
                        ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-sm shadow-sky-500/15"
                        : "border border-slate-200 bg-white text-slate-600"
                    }`}
                  >
                    <Boxes size={14} strokeWidth={2.6} />
                    Fisik ({fisikCount})
                  </motion.button>

                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    transition={{ duration: 0.12, ease: "easeOut" }}
                    type="button"
                    onClick={() => {
                      setActiveTab("digital");
                      setCameraOpen(false);
                    }}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] transition ${
                      activeTab === "digital"
                        ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-sm shadow-sky-500/15"
                        : "border border-slate-200 bg-white text-slate-600"
                    }`}
                  >
                    <Smartphone size={14} strokeWidth={2.6} />
                    Digital ({digitalCount})
                  </motion.button>
                </div>

                {activeTab === "fisik" && (
                  <button
                    type="button"
                    onClick={() => setCameraOpen((prev) => !prev)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.08em] text-sky-700"
                  >
                    {cameraOpen ? (
                      <PauseCircle size={14} strokeWidth={2.6} />
                    ) : (
                      <Camera size={14} strokeWidth={2.6} />
                    )}
                    {cameraOpen ? "Tutup Kamera" : "Scan Kamera"}
                  </button>
                )}

                <div>
                  <FieldLabel
                    icon={Search}
                    label={
                      activeTab === "fisik"
                        ? "Cari Barang / Barcode"
                        : "Cari Produk Digital"
                    }
                  />
                  <div className="relative">
                    <Search
                      size={15}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      value={searchBarang}
                      onChange={(e) => setSearchBarang(e.target.value)}
                      placeholder={
                        activeTab === "fisik"
                          ? "Cari nama, barcode, merk..."
                          : "Cari nama, provider, kategori..."
                      }
                      className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300 outline-none transition-all focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            </section>

            {activeTab === "fisik" && cameraOpen && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">
                      Scanner Kamera
                    </h2>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      Arahkan barcode ke area scan.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      stopCameraScanner();
                      void startCameraScanner();
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 text-[10px] font-black uppercase text-sky-700"
                  >
                    <RotateCcw size={13} strokeWidth={2.6} />
                    Restart
                  </button>
                </div>

                {!cameraSupported ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-700">
                    Browser ini belum mendukung scan barcode kamera.
                  </div>
                ) : (
                  <>
                    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-black">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="aspect-video w-full object-cover"
                      />
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div className="h-24 w-[78%] rounded-2xl border-2 border-blue-400/90 shadow-[0_0_0_9999px_rgba(15,23,42,0.28)]" />
                      </div>
                      {cameraLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/55">
                          <div className="flex items-center gap-2 rounded-xl bg-slate-900/90 px-4 py-3 text-sm font-black text-white">
                            <RefreshCw
                              size={16}
                              className="animate-spin"
                              strokeWidth={2.5}
                            />
                            Menyalakan kamera...
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                          Status
                        </p>
                        <p className="mt-1 text-xs font-bold text-slate-800">
                          {cameraStatus}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                          Hasil
                        </p>
                        <p className="mt-1 break-all text-xs font-bold text-blue-700">
                          {lastCameraResult || "-"}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </section>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">
                    Daftar Barang
                  </h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Pilih barang untuk dimasukkan ke keranjang.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                  {barangByToko.length}
                </span>
              </div>

              {barangLoading ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">
                  Memuat barang toko...
                </div>
              ) : !selectedTokoId ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">
                  {isAdminUser
                    ? "Pilih toko terlebih dahulu"
                    : "Akun ini belum memiliki toko"}
                </div>
              ) : barangByToko.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">
                  Barang tidak ditemukan
                </div>
              ) : (
                <div className="space-y-2">
                  {barangByToko.map((barang) => {
                    const diskon = getBestDiskonForBarang(
                      barang.id,
                      diskonList.filter(
                        (d) => d.tokoId === barang.tokoId && d.isActive,
                      ),
                    );
                    const promoLangsung =
                      diskon?.jenisPromo === "diskon_langsung";
                    const hargaPromo = promoLangsung
                      ? hitungHargaSetelahDiskon(
                          barang.hargaJual,
                          diskon?.tipeDiskon,
                          diskon?.nilaiDiskon,
                        )
                      : barang.hargaJual;
                    const promoReminder = getPromoReminderText(diskon);
                    const isOutStock =
                      (barang.jenisBarang || "fisik") === "fisik" &&
                      barang.stok <= 0;
                    const DigitalIcon = getDigitalIcon(barang.subJenisDigital);

                    return (
                      <motion.div
                        key={barang.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-2">
                              <p className="truncate text-sm font-black text-slate-800">
                                {barang.nama}
                              </p>
                              <span className="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-[9px] font-black uppercase text-sky-700">
                                {activeTab === "fisik" ? "Fisik" : "Digital"}
                              </span>
                            </div>
                            <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              {barang.kodeBarang || "-"} ·{" "}
                              {barang.kategoriNama || "-"}
                            </p>
                            {activeTab === "fisik" ? (
                              <p className="mt-1 text-xs font-semibold text-slate-500">
                                {barang.merk || "-"} · stok {barang.stok}
                              </p>
                            ) : (
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                                <span className="inline-flex items-center gap-1">
                                  <DigitalIcon size={12} strokeWidth={2.5} />
                                  {formatSubJenisDigitalLabel(
                                    barang.subJenisDigital,
                                  )}
                                </span>
                                <span>{barang.provider || "-"}</span>
                              </div>
                            )}
                            <div className="mt-2">
                              {promoReminder && (
                                <span className="mb-1.5 inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black text-amber-700">
                                  {promoReminder}
                                </span>
                              )}
                              {promoLangsung && hargaPromo < barang.hargaJual ? (
                                <>
                                  <p className="text-[10px] font-bold text-slate-400 line-through">
                                    {formatRupiah(barang.hargaJual)}
                                  </p>
                                  <p className="text-base font-black text-sky-600">
                                    {formatRupiah(hargaPromo)}
                                  </p>
                                </>
                              ) : (
                                <p className="text-base font-black text-slate-800">
                                  {formatRupiah(barang.hargaJual)}
                                </p>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => addToCart(barang, "manual")}
                            disabled={isOutStock || submitLoading}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Plus size={16} strokeWidth={3} />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </section>

            <div className="sticky bottom-3 z-20 rounded-2xl border border-sky-100 bg-white/95 p-2 shadow-xl shadow-slate-200/80 backdrop-blur">
              <button
                type="button"
                onClick={() => setMobileKasirStep("keranjang")}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-4 text-xs font-black uppercase tracking-[0.08em] text-white shadow-sm shadow-sky-500/20"
              >
                <ShoppingCart size={15} strokeWidth={2.8} />
                Selesai Pilih Barang ({totalItem})
              </button>
            </div>
                </motion.div>
              )}

              {mobileKasirStep === "keranjang" && (
                <motion.div
                  key="mobile-step-keranjang"
                  initial={{ opacity: 0, x: 18 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -18 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="space-y-3"
                >
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">
                    Keranjang
                  </h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Atur jumlah dan nomor tujuan sebelum checkout.
                  </p>
                </div>
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={clearCart}
                    className="rounded-xl border border-rose-300/70 bg-rose-600 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white shadow-sm"
                  >
                    Kosongkan
                  </button>
                )}
              </div>

              {cart.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">
                  Keranjang masih kosong
                </div>
              ) : (
                <div className="space-y-3">
                  {cart.map((item) => (
                    <div
                      key={item.barangId}
                      className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <h3 className="truncate text-sm font-black text-slate-800">
                              {item.nama}
                            </h3>
                            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[9px] font-black uppercase text-sky-700">
                              {formatJenisBarangLabel(item.jenisBarang)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            {item.kodeBarang || item.provider || "-"}
                          </p>
                          {item.diskonNama && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <span className="inline-flex rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-black text-sky-700">
                                {item.diskonNama}
                              </span>
                              {item.diskonDeskripsi && (
                                <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black text-amber-700">
                                  {item.diskonDeskripsi}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeItem(item.barangId)}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-300/70 bg-rose-600 text-white shadow-sm"
                        >
                          <Trash2 size={15} strokeWidth={2.6} />
                        </button>
                      </div>

                      {item.jenisBarang === "digital" && (
                        <div className="mt-3">
                          <FieldLabel label="Nomor Tujuan" />
                          <input
                            value={item.tujuan || ""}
                            onChange={(e) =>
                              updateTujuan(item.barangId, e.target.value)
                            }
                            placeholder="Isi nomor tujuan"
                            className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 outline-none transition-all focus:border-blue-500"
                          />
                        </div>
                      )}

                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateQty(item.barangId, "minus")}
                            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700"
                          >
                            <Minus size={14} strokeWidth={3} />
                          </button>
                          <span className="min-w-[2rem] text-center text-sm font-black text-slate-800">
                            {item.qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQty(item.barangId, "plus")}
                            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700"
                          >
                            <Plus size={14} strokeWidth={3} />
                          </button>
                        </div>
                        <div className="text-right">
                          {item.hargaAsli !== item.hargaSetelahDiskon && (
                            <p className="text-xs font-bold text-slate-400 line-through">
                              {formatRupiah(item.hargaAsli * item.qty)}
                            </p>
                          )}
                          <p className="text-sm font-black text-slate-800">
                            {formatRupiah(item.hargaSetelahDiskon * item.qty)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="sticky bottom-3 z-20 rounded-2xl border border-sky-100 bg-white/95 p-2 shadow-xl shadow-slate-200/80 backdrop-blur">
              <button
                type="button"
                onClick={() => setMobileKasirStep("bayar")}
                disabled={cart.length === 0}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-4 text-xs font-black uppercase tracking-[0.08em] text-white shadow-sm shadow-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Wallet size={15} strokeWidth={2.8} />
                Lanjut Pembayaran
              </button>
            </div>
                </motion.div>
              )}

              {mobileKasirStep === "bayar" && (
                <motion.div
                  key="mobile-step-bayar"
                  initial={{ opacity: 0, x: 18 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -18 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="space-y-3"
                >
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3">
                <h2 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">
                  Pembayaran
                </h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Lengkapi metode, pelanggan, dan uang bayar.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <FieldLabel icon={Wallet} label="Metode Pembayaran" />
                  <select
                    value={selectedMetodeId}
                    onChange={(e) => setSelectedMetodeId(e.target.value)}
                    className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition-all focus:border-blue-500"
                  >
                    <option value="">Pilih metode pembayaran</option>
                    {metodeList.map((metode) => (
                      <option key={metode.id} value={metode.id}>
                        {metode.nama}
                        {metode.biayaAdmin
                          ? ` (${formatPercent(metode.biayaAdmin)})`
                          : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <FieldLabel icon={User2} label="Pelanggan Opsional" />
                  <div className="relative">
                    <select
                      value={selectedPelangganId}
                      onChange={(e) => setSelectedPelangganId(e.target.value)}
                      className={`w-full appearance-none rounded-xl border-2 px-3 py-2.5 pr-9 text-sm font-black outline-none transition-all ${
                        selectedPelanggan
                          ? "border-sky-200 bg-sky-50/70 text-sky-800 focus:border-sky-500"
                          : "border-slate-200 bg-white text-slate-600 focus:border-blue-500"
                      }`}
                    >
                      <option value="">Tanpa Pelanggan</option>
                      {filteredPelanggan.map((pelanggan) => (
                        <option key={pelanggan.id} value={pelanggan.id}>
                          {pelanggan.nama}
                          {pelanggan.diskon
                            ? ` · Diskon ${pelanggan.diskon}%`
                            : ""}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={14}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                      strokeWidth={2.6}
                    />
                  </div>
                </div>

                <div>
                  <FieldLabel icon={Wallet} label="Uang Bayar" />
                  <input
                    value={uangBayar}
                    onChange={(e) =>
                      setUangBayar(formatRibuanInput(e.target.value))
                    }
                    placeholder="Masukkan uang bayar"
                    inputMode="numeric"
                    className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition-all focus:border-blue-500"
                  />
                </div>

                <div>
                  <FieldLabel icon={BadgeDollarSign} label="Catatan" />
                  <textarea
                    value={catatan}
                    onChange={(e) => setCatatan(e.target.value)}
                    rows={3}
                    placeholder="Catatan transaksi (opsional)"
                    className="w-full resize-none rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition-all focus:border-blue-500"
                  />
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-600">
                    <span>Subtotal</span>
                    <span className="font-black text-slate-800">
                      {formatRupiah(subtotal)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold text-slate-600">
                    <span>Total Diskon</span>
                    <span className="font-black text-sky-600">
                      {formatRupiah(totalDiskon)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold text-slate-600">
                    <span>Biaya Admin</span>
                    <span className="font-black text-slate-800">
                      {formatRupiah(biayaAdminNominal)}
                    </span>
                  </div>
                  <div className="mt-3 border-t border-slate-200 pt-3">
                    <div className="flex items-center justify-between gap-3 text-base font-black text-slate-800">
                      <span>Grand Total</span>
                      <span className="text-sky-700">
                        {formatRupiah(grandTotal)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold text-slate-600">
                      <span>
                        {kurangBayar > 0 ? "Kurang Bayar" : "Kembalian"}
                      </span>
                      <span
                        className={`font-black ${kurangBayar > 0 ? "text-red-600" : "text-sky-600"}`}
                      >
                        {formatRupiah(
                          kurangBayar > 0 ? kurangBayar : kembalian,
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!isBisaCheckout}
                  onClick={openCheckoutConfirm}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-4 text-sm font-black uppercase tracking-wide text-white shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitLoading ? (
                    <>
                      <RefreshCw
                        size={16}
                        className="animate-spin"
                        strokeWidth={2.5}
                      />
                      Memproses...
                    </>
                  ) : (
                    <>
                      <Receipt size={16} strokeWidth={2.5} />
                      Proses Transaksi
                    </>
                  )}
                </button>
              </div>
            </section>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMobileKasirStep("keranjang")}
                className="flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600"
              >
                Kembali
              </button>
              <button
                type="button"
                onClick={() => setMobileKasirStep("riwayat")}
                className="flex h-11 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-3 text-[10px] font-black uppercase tracking-[0.08em] text-sky-700"
              >
                Riwayat
              </button>
            </div>
                </motion.div>
              )}

              {mobileKasirStep === "riwayat" && (
                <motion.div
                  key="mobile-step-riwayat"
                  initial={{ opacity: 0, x: 18 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -18 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="space-y-3"
                >
            <RiwayatTransaksiReturPanel
              rows={riwayatTransaksi}
              loading={riwayatLoading}
              range={riwayatRange}
              startDate={riwayatStartDate}
              endDate={riwayatEndDate}
              onChangeRange={setRiwayatRange}
              onChangeStartDate={setRiwayatStartDate}
              onChangeEndDate={setRiwayatEndDate}
              onRefresh={fetchRiwayatTransaksi}
              onPrint={openPrintStrukFromRiwayat}
              onRetur={openReturTransaksi}
            />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-12">
            <div className="space-y-4 xl:col-span-7">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <FieldLabel
                      icon={Store}
                      label={isAdminUser ? "Pilih Toko" : "Toko Karyawan"}
                    />

                    {isAdminUser ? (
                      <select
                        value={selectedTokoId}
                        onChange={(e) => setSelectedTokoId(e.target.value)}
                        className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition-all hover:border-blue-300 focus:border-blue-500"
                      >
                        <option value="">Pilih toko</option>
                        {tokoList.map((toko) => (
                          <option key={toko.id} value={toko.id}>
                            {toko.nama}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700">
                        {selectedToko?.nama ||
                          currentUserProfile?.tokoNama ||
                          "Toko belum terhubung"}
                      </div>
                    )}
                  </div>

                  <div>
                    <FieldLabel icon={Wallet} label="Metode Pembayaran" />
                    <select
                      value={selectedMetodeId}
                      onChange={(e) => setSelectedMetodeId(e.target.value)}
                      className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition-all hover:border-blue-300 focus:border-blue-500"
                    >
                      <option value="">Pilih metode pembayaran</option>
                      {metodeList.map((metode) => (
                        <option key={metode.id} value={metode.id}>
                          {metode.nama}
                          {metode.biayaAdmin
                            ? ` (${formatPercent(metode.biayaAdmin)})`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <FieldLabel icon={User2} label="Pelanggan (Opsional)" />

                    <div className="relative">
                      <select
                        value={selectedPelangganId}
                        onChange={(e) => setSelectedPelangganId(e.target.value)}
                        className={`w-full appearance-none rounded-2xl border-2 px-3 py-2.5 pr-9 text-sm font-black outline-none transition-all ${
                          selectedPelanggan
                            ? "border-sky-200 bg-sky-50/70 text-sky-800 hover:border-sky-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15"
                            : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                        }`}
                      >
                        <option value="">Tanpa Pelanggan</option>
                        {filteredPelanggan.map((pelanggan) => (
                          <option key={pelanggan.id} value={pelanggan.id}>
                            {pelanggan.nama}
                            {pelanggan.diskon
                              ? ` · Diskon ${pelanggan.diskon}%`
                              : ""}
                          </option>
                        ))}
                      </select>

                      <ChevronDown
                        size={14}
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                        strokeWidth={2.6}
                      />
                    </div>

                    {selectedPelanggan ? (
                      <div className="mt-2 flex items-center justify-between gap-2 rounded-2xl border border-sky-100 bg-white px-3 py-2 shadow-sm">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-black text-slate-800">
                            {selectedPelanggan.nama}
                          </p>
                          <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            {selectedPelanggan.tipeMember} ·{" "}
                            {selectedPelanggan.kodePelanggan ||
                              selectedPelanggan.telepon ||
                              "-"}
                          </p>
                        </div>

                        <div className="shrink-0 rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-black text-sky-700">
                          Diskon {pelangganDiskonPersen}%
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4">
                  <FieldLabel
                    icon={Search}
                    label={
                      activeTab === "fisik"
                        ? "Cari Barang / Barcode / Merk"
                        : "Cari Digital / Provider / Merk"
                    }
                  />
                  <div className="relative">
                    <Search
                      size={16}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      value={searchBarang}
                      onChange={(e) => setSearchBarang(e.target.value)}
                      placeholder={
                        activeTab === "fisik"
                          ? "Cari nama barang, barcode, merk..."
                          : "Cari nama digital, provider, kategori..."
                      }
                      className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300 outline-none transition-all hover:border-blue-300 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {activeTab === "fisik" ? (
                cameraOpen ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
                          Panel Scanner Kamera
                        </h2>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          Kamera tetap tampil di halaman, tidak menutupi
                          keranjang
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setCameraOpen(false)}
                          className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black uppercase tracking-wide text-slate-700 hover:bg-slate-50"
                        >
                          <PauseCircle size={15} strokeWidth={2.5} />
                          Tutup
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            stopCameraScanner();
                            void startCameraScanner();
                          }}
                          className="flex h-10 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-black uppercase tracking-wide text-blue-700 hover:bg-blue-100"
                        >
                          <RotateCcw size={15} strokeWidth={2.5} />
                          Restart
                        </button>
                      </div>
                    </div>

                    {!cameraSupported ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-700">
                        Browser ini belum mendukung scan barcode kamera.
                      </div>
                    ) : (
                      <>
                        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-black">
                          <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="aspect-video w-full object-cover"
                          />
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                            <div className="h-24 w-[78%] rounded-2xl border-2 border-blue-400/90 shadow-[0_0_0_9999px_rgba(15,23,42,0.28)]" />
                          </div>
                          {cameraLoading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/55">
                              <div className="flex items-center gap-2 rounded-xl bg-slate-900/90 px-4 py-3 text-sm font-black text-white">
                                <RefreshCw
                                  size={16}
                                  className="animate-spin"
                                  strokeWidth={2.5}
                                />
                                Menyalakan kamera...
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                              Status
                            </p>
                            <p className="mt-2 text-sm font-bold text-slate-800">
                              {cameraStatus}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                              Hasil Terakhir
                            </p>
                            <p className="mt-2 break-all text-sm font-bold text-blue-700">
                              {lastCameraResult || "-"}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                              Kamera
                            </p>
                            <p className="mt-2 text-sm font-bold text-slate-800">
                              {cameraActive ? "Aktif" : "Tidak aktif"}
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm font-black text-slate-700">
                        Scanner kamera belum dibuka
                      </p>
                      <button
                        type="button"
                        onClick={() => setCameraOpen(true)}
                        className="flex h-10 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-xs font-black uppercase tracking-wide text-blue-700 hover:bg-blue-100"
                      >
                        <PlayCircle size={15} strokeWidth={2.5} />
                        Aktifkan Kamera
                      </button>
                    </div>
                  </div>
                )
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-black text-slate-700">
                      Tab digital aktif. Scanner barcode dan kamera
                      non-aktifkan.
                    </p>
                    <div className="flex h-10 items-center gap-2 rounded-xl border border-transparent px-4 text-xs font-black uppercase tracking-wide opacity-0 select-none">
                      <PlayCircle size={15} strokeWidth={2.5} />
                      Aktifkan Kamera
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
                      Daftar Barang
                    </h2>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {activeTab === "fisik"
                        ? "Klik tambah atau scan barcode untuk masuk ke keranjang"
                        : "Klik tambah untuk masuk ke keranjang digital"}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                    {barangByToko.length} barang
                  </span>
                </div>

                {barangLoading ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">
                    Memuat barang toko...
                  </div>
                ) : !selectedTokoId ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">
                    {isAdminUser
                      ? "Pilih toko terlebih dahulu"
                      : "Akun ini belum memiliki toko"}
                  </div>
                ) : barangByToko.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">
                    Barang tidak ditemukan
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {barangByToko.map((barang) => {
                      const diskon = getBestDiskonForBarang(
                        barang.id,
                        diskonList.filter(
                          (d) => d.tokoId === barang.tokoId && d.isActive,
                        ),
                      );
                      const promoLangsung =
                        diskon?.jenisPromo === "diskon_langsung";
                      const hargaPromo = promoLangsung
                        ? hitungHargaSetelahDiskon(
                            barang.hargaJual,
                            diskon?.tipeDiskon,
                            diskon?.nilaiDiskon,
                          )
                        : barang.hargaJual;
                      const promoReminder = getPromoReminderText(diskon);
                      const isOutStock =
                        (barang.jenisBarang || "fisik") === "fisik" &&
                        barang.stok <= 0;
                      const DigitalIcon = getDigitalIcon(
                        barang.subJenisDigital,
                      );

                      return (
                        <motion.div
                          key={barang.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="rounded-2xl border border-slate-200 bg-white p-4 transition-all hover:border-blue-300 hover:shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-black text-slate-800">
                                  {barang.nama}
                                </p>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                                    activeTab === "fisik"
                                      ? "bg-sky-600 text-white"
                                      : "bg-blue-600 text-white"
                                  }`}
                                >
                                  {activeTab === "fisik" ? "FISIK" : "DIGITAL"}
                                </span>
                              </div>
                              <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                {barang.kodeBarang || "-"} ·{" "}
                                {barang.kategoriNama || "-"}
                              </p>
                              {activeTab === "fisik" ? (
                                <p className="mt-1 text-xs font-semibold text-slate-500">
                                  {barang.merk || "-"} · stok {barang.stok}
                                </p>
                              ) : (
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                                  <span className="inline-flex items-center gap-1">
                                    <DigitalIcon size={12} strokeWidth={2.5} />
                                    {formatSubJenisDigitalLabel(
                                      barang.subJenisDigital,
                                    )}
                                  </span>
                                  <span>{barang.provider || "-"}</span>
                                  {barang.nominalProduk ? (
                                    <span>{barang.nominalProduk}</span>
                                  ) : null}
                                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black text-violet-700">
                                    {barang.saldoSourceNama || "Tanpa Saldo"}
                                  </span>
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => addToCart(barang, "manual")}
                              disabled={isOutStock || submitLoading}
                              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-sm transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Plus size={16} strokeWidth={3} />
                            </button>
                          </div>

                          <div className="mt-3">
                            {promoReminder && (
                              <span className="mb-1.5 inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black text-amber-700">
                                {promoReminder}
                              </span>
                            )}
                            {promoLangsung && hargaPromo < barang.hargaJual ? (
                              <>
                                <p className="text-xs font-bold text-slate-400 line-through">
                                  {formatRupiah(barang.hargaJual)}
                                </p>
                                <p className="text-base font-black text-sky-600">
                                  {formatRupiah(hargaPromo)}
                                </p>
                              </>
                            ) : (
                              <p className="text-base font-black text-slate-800">
                                {formatRupiah(barang.hargaJual)}
                              </p>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4 xl:col-span-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
                      Keranjang
                    </h2>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {activeTab === "fisik"
                        ? "Scan untuk menambahkan barang secara otomatis"
                        : "Barang digital dipisah dari fisik"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearCart}
                    className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-600 hover:bg-red-100"
                  >
                    Kosongkan
                  </button>
                </div>

                {cart.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">
                    Keranjang masih kosong
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cart.map((item) => {
                      const DigitalIcon = getDigitalIcon(item.subJenisDigital);
                      return (
                        <div
                          key={item.barangId}
                          className="rounded-2xl border border-slate-200 bg-white p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="truncate text-sm font-black text-slate-800">
                                  {item.nama}
                                </h3>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                                    item.jenisBarang === "fisik"
                                      ? "bg-sky-600 text-white"
                                      : "bg-blue-600 text-white"
                                  }`}
                                >
                                  {formatJenisBarangLabel(item.jenisBarang)}
                                </span>
                              </div>
                              <p className="mt-1 text-xs font-semibold text-slate-500">
                                {item.kodeBarang}
                              </p>
                              {item.jenisBarang === "digital" && (
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                                  <span>{item.provider || "-"}</span>
                                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black text-violet-700">
                                    {item.saldoSourceNama || "Tanpa Saldo"}
                                  </span>
                                </div>
                              )}
                              {item.diskonNama && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  <span className="inline-flex rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-black text-sky-700">
                                    {item.diskonNama}
                                  </span>
                                  {item.diskonDeskripsi && (
                                    <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-black text-emerald-700">
                                      {item.diskonDeskripsi}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => removeItem(item.barangId)}
                              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                            >
                              <Trash2 size={15} strokeWidth={2.5} />
                            </button>
                          </div>
                          {item.jenisBarang === "digital" && (
                            <div className="mt-3">
                              <FieldLabel label="Nomor Tujuan" />
                              <input
                                value={item.tujuan || ""}
                                onChange={(e) =>
                                  updateTujuan(item.barangId, e.target.value)
                                }
                                placeholder="Isi nomor tujuan"
                                className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 outline-none transition-all hover:border-blue-300 focus:border-blue-500"
                              />
                            </div>
                          )}

                          <div className="mt-3 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  updateQty(item.barangId, "minus")
                                }
                                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                              >
                                <Minus size={14} strokeWidth={3} />
                              </button>
                              <span className="min-w-[2rem] text-center text-sm font-black text-slate-800">
                                {item.qty}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateQty(item.barangId, "plus")}
                                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                              >
                                <Plus size={14} strokeWidth={3} />
                              </button>
                            </div>

                            <div className="text-right">
                              {item.hargaAsli !== item.hargaSetelahDiskon && (
                                <p className="text-xs font-bold text-slate-400 line-through">
                                  {formatRupiah(item.hargaAsli * item.qty)}
                                </p>
                              )}
                              <p className="text-sm font-black text-slate-800">
                                {formatRupiah(
                                  item.hargaSetelahDiskon * item.qty,
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4">
                  <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
                    Konfirmasi Pembayaran
                  </h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Pastikan data transaksi sudah benar sebelum diproses
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500 text-white">
                        <User2 size={15} strokeWidth={2.5} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">
                          Akun Konfirmasi
                        </p>
                        <p className="text-sm font-black text-slate-800">
                          {currentUserProfile?.nama || "Tanpa Nama"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                      <Mail size={12} strokeWidth={2.5} />
                      {currentUserProfile?.email || "-"}
                    </div>
                  </div>

                  {selectedPelanggan && (
                    <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">
                        Pelanggan Member
                      </p>
                      <div className="mt-2 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-800">
                            {selectedPelanggan.nama}
                          </p>
                          <p className="mt-0.5 text-xs font-semibold text-slate-500">
                            {selectedPelanggan.tipeMember} ·{" "}
                            {selectedPelanggan.kodePelanggan ||
                              selectedPelanggan.telepon ||
                              "-"}
                          </p>
                        </div>
                        <div className="shrink-0 rounded-xl bg-white px-3 py-1.5 text-right ring-1 ring-sky-100">
                          <p className="text-[9px] font-black uppercase tracking-widest text-sky-500">
                            Diskon
                          </p>
                          <p className="text-sm font-black text-sky-700">
                            {pelangganDiskonPersen}%
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === "digital" && digitalTargetList.length > 0 && (
                    <div className="rounded-2xl border border-sky-100 bg-sky-50 p-3">
                      <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-sky-600">
                        Nomor Tujuan Digital
                      </p>
                      <div className="space-y-2">
                        {digitalTargetList.map((item) => (
                          <div
                            key={item.barangId}
                            className="rounded-xl border border-sky-200 bg-white/70 px-3 py-2"
                          >
                            <p className="text-xs font-black text-slate-800">
                              {item.nama}
                            </p>
                            <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-sky-700">
                              <Target size={11} strokeWidth={2.5} />
                              {item.label}: {item.tujuan || "-"}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeTab === "digital" && digitalSaldoUsage.length > 0 && (
                    <div className="rounded-2xl border border-violet-100 bg-violet-50 p-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-violet-600">
                        Potongan Saldo Digital
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-700">
                        {digitalSaldoRingkasan || "-"}
                      </p>
                    </div>
                  )}

                  <div>
                    <FieldLabel icon={Wallet} label="Uang Bayar" />
                    <input
                      value={uangBayar}
                      onChange={(e) =>
                        setUangBayar(formatRibuanInput(e.target.value))
                      }
                      placeholder="Masukkan uang bayar"
                      inputMode="numeric"
                      className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition-all hover:border-blue-300 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <FieldLabel icon={BadgeDollarSign} label="Catatan" />
                    <textarea
                      value={catatan}
                      onChange={(e) => setCatatan(e.target.value)}
                      rows={3}
                      placeholder="Catatan transaksi (opsional)"
                      className="w-full resize-none rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition-all hover:border-blue-300 focus:border-blue-500"
                    />
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-600">
                      <span>Subtotal</span>
                      <span className="font-black text-slate-800">
                        {formatRupiah(subtotal)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold text-slate-600">
                      <span>Diskon Barang</span>
                      <span className="font-black text-sky-600">
                        {formatRupiah(totalDiskonBarang)}
                      </span>
                    </div>
                    {selectedPelanggan && pelangganDiskonNominal > 0 && (
                      <div className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold text-slate-600">
                        <span>Diskon Member ({pelangganDiskonPersen}%)</span>
                        <span className="font-black text-sky-600">
                          {formatRupiah(pelangganDiskonNominal)}
                        </span>
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold text-slate-600">
                      <span>Total Diskon</span>
                      <span className="font-black text-sky-600">
                        {formatRupiah(totalDiskon)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold text-slate-600">
                      <span>Biaya Admin</span>
                      <span className="font-black text-slate-800">
                        {formatRupiah(biayaAdminNominal)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-base font-black text-slate-800">
                      <span>Grand Total</span>
                      <span>{formatRupiah(grandTotal)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold text-slate-600">
                      <span>Uang Bayar</span>
                      <span className="font-black text-slate-800">
                        {formatRupiah(uangBayarNumber)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold text-slate-600">
                      <span>Kembalian</span>
                      <span className="font-black text-sky-600">
                        {formatRupiah(kembalian)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold text-slate-600">
                      <span>Kurang Bayar</span>
                      <span className="font-black text-red-600">
                        {formatRupiah(kurangBayar)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold text-slate-600">
                      <span>Estimasi Laba Kotor</span>
                      <span className="font-black text-slate-800">
                        {formatRupiah(estimasiLabaKotor)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!isBisaCheckout}
                    onClick={openCheckoutConfirm}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-4 text-sm font-black uppercase tracking-wide text-white shadow-sm transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitLoading ? (
                      <>
                        <RefreshCw
                          size={16}
                          className="animate-spin"
                          strokeWidth={2.5}
                        />
                        Memproses...
                      </>
                    ) : (
                      <>
                        <Receipt size={16} strokeWidth={2.5} />
                        Proses Transaksi{" "}
                        {activeTab === "digital" ? "Digital" : "Fisik"}
                      </>
                    )}
                  </button>
                </div>
              </div>

              <RiwayatTransaksiReturPanel
                rows={riwayatTransaksi}
                loading={riwayatLoading}
                range={riwayatRange}
                startDate={riwayatStartDate}
                endDate={riwayatEndDate}
                onChangeRange={setRiwayatRange}
                onChangeStartDate={setRiwayatStartDate}
                onChangeEndDate={setRiwayatEndDate}
                onRefresh={fetchRiwayatTransaksi}
                onPrint={openPrintStrukFromRiwayat}
                onRetur={openReturTransaksi}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}


function MobileKasirStepper({
  activeStep,
  setActiveStep,
  totalItem,
  grandTotal,
  riwayatCount,
}: {
  activeStep: MobileKasirStep;
  setActiveStep: (step: MobileKasirStep) => void;
  totalItem: number;
  grandTotal: number;
  riwayatCount: number;
}) {
  const steps: Array<{
    key: MobileKasirStep;
    label: string;
    sub: string;
    icon: any;
  }> = [
    { key: "barang", label: "Barang", sub: "Pilih", icon: Boxes },
    { key: "keranjang", label: "Keranjang", sub: `${totalItem} item`, icon: ShoppingCart },
    { key: "bayar", label: "Bayar", sub: formatRupiah(grandTotal), icon: Wallet },
    { key: "riwayat", label: "Riwayat", sub: `${riwayatCount} trx`, icon: Clock },
  ];

  return (
    <div className="sticky top-2 z-30 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-lg shadow-slate-200/70 backdrop-blur">
      <div className="grid grid-cols-4 gap-1.5">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const active = activeStep === step.key;

          return (
            <motion.button
              key={step.key}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              type="button"
              onClick={() => setActiveStep(step.key)}
              className={`relative flex min-w-0 flex-col items-center justify-center rounded-xl px-1.5 pb-2 pt-3.5 text-center transition ${
                active
                  ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-sm shadow-sky-500/20"
                  : "bg-slate-50 text-slate-500 hover:bg-sky-50 hover:text-sky-700"
              }`}
            >
              <span
                className={`absolute left-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black shadow-sm ${
                  active ? "bg-white/20 text-white" : "bg-white text-slate-400 ring-1 ring-slate-100"
                }`}
              >
                {index + 1}
              </span>

              <Icon size={13} strokeWidth={2.6} />

              <span className="mt-1 truncate text-[8px] font-black uppercase tracking-[0.04em]">
                {step.label}
              </span>
              <span className={`mt-0.5 max-w-full truncate text-[7px] font-bold ${active ? "text-sky-50/85" : "text-slate-400"}`}>
                {step.sub}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function TransaksiStatCard({
  icon: Icon,
  label,
  value,
  subValue,
  tone,
}: {
  icon: any;
  label: string;
  value: string;
  subValue?: string;
  tone: "slate" | "sky" | "blue" | "rose";
}) {
  const toneClass =
    tone === "sky"
      ? "bg-sky-50 text-sky-600 ring-sky-100"
      : tone === "blue"
        ? "bg-blue-50 text-blue-600 ring-blue-100"
        : tone === "rose"
          ? "bg-rose-50 text-rose-600 ring-rose-100"
          : "bg-slate-100 text-slate-500 ring-slate-200";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <div
          className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-2xl ring-1 sm:flex sm:h-11 sm:w-11 ${toneClass}`}
        >
          <Icon
            size={18}
            strokeWidth={2.5}
            className="sm:h-[21px] sm:w-[21px]"
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[7px] font-black uppercase tracking-[0.05em] text-slate-400 sm:text-[10px] sm:tracking-widest">
            {label}
          </p>
          <p className="mt-0.5 truncate text-[13px] font-black leading-tight text-slate-800 sm:text-xl">
            {value}
          </p>
          {subValue && (
            <p className="mt-0.5 truncate text-[7px] font-black uppercase tracking-[0.04em] text-slate-400 sm:text-[9px]">
              {subValue}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function RiwayatTransaksiReturPanel({
  rows,
  loading,
  range,
  startDate,
  endDate,
  onChangeRange,
  onChangeStartDate,
  onChangeEndDate,
  onRefresh,
  onPrint,
  onRetur,
}: {
  rows: RiwayatTransaksiItem[];
  loading: boolean;
  range: RiwayatRangeFilter;
  startDate: string;
  endDate: string;
  onChangeRange: (value: RiwayatRangeFilter) => void;
  onChangeStartDate: (value: string) => void;
  onChangeEndDate: (value: string) => void;
  onRefresh: () => void;
  onPrint: (trx: RiwayatTransaksiItem) => void;
  onRetur: (trx: RiwayatTransaksiItem) => void;
}) {
  const rangeOptions: Array<{ value: RiwayatRangeFilter; label: string }> = [
    { value: "today", label: "Hari Ini" },
    { value: "yesterday", label: "Kemarin" },
    { value: "7d", label: "7 Hari" },
    { value: "30d", label: "30 Hari" },
    { value: "90d", label: "90 Hari" },
    { value: "custom", label: "Tanggal" },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
            Riwayat & Retur Transaksi
          </h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            Retur akan mengembalikan stok/saldo dan membalik laporan.
          </p>
        </div>
      </div>

      <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <FieldLabel icon={Clock} label="Filter Riwayat" />
            <div className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap">
              {rangeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onChangeRange(option.value)}
                  className={`h-9 rounded-xl px-2 text-[10px] font-black uppercase tracking-wide transition-all ${
                    range === option.value
                      ? "bg-sky-600 text-white shadow-sm shadow-sky-500/20"
                      : "border border-slate-200 bg-white text-slate-500 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="flex h-9 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-white px-3 text-xs font-black uppercase tracking-wide text-sky-700 transition-colors hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <motion.span
              animate={loading ? { rotate: 360 } : {}}
              transition={
                loading ? { duration: 0.8, repeat: Infinity, ease: "linear" } : {}
              }
            >
              <RefreshCw size={14} strokeWidth={2.5} />
            </motion.span>
            Refresh
          </button>
        </div>

        {range === "custom" && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <FieldLabel icon={Clock} label="Dari Tanggal" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => onChangeStartDate(e.target.value)}
                className="h-10 w-full rounded-xl border-2 border-slate-200 bg-white px-3 text-xs font-black text-slate-700 outline-none transition-all focus:border-sky-500"
              />
            </div>
            <div>
              <FieldLabel icon={Clock} label="Sampai Tanggal" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => onChangeEndDate(e.target.value)}
                className="h-10 w-full rounded-xl border-2 border-slate-200 bg-white px-3 text-xs font-black text-slate-700 outline-none transition-all focus:border-sky-500"
              />
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">
          Memuat riwayat transaksi...
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">
          Belum ada transaksi selesai
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((trx) => {
            const canRetur = trx.items.some(
              (item, index) => getReturSisaQty(trx, item, index) > 0,
            );

            return (
              <motion.div
                key={trx.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-slate-200 bg-white p-3 transition-all hover:border-sky-300 hover:shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-black text-slate-800">
                        {trx.nomorTransaksi}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                          trx.jenisTransaksi === "digital"
                            ? "bg-blue-600 text-white"
                            : "bg-sky-600 text-white"
                        }`}
                      >
                        {trx.jenisTransaksi === "digital" ? "Digital" : "Fisik"}
                      </span>
                      {trx.returStatus && trx.returStatus !== "belum" ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                            trx.returStatus === "penuh"
                              ? "bg-red-100 text-red-700"
                              : "bg-orange-100 text-orange-700"
                          }`}
                        >
                          Retur {trx.returStatus}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-slate-500">
                      <span>{trx.tokoNama}</span>
                      <span>{formatTanggalJam(trx.createdAtMs)}</span>
                      <span>{trx.kasirNama}</span>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                          Total
                        </p>
                        <p className="mt-0.5 text-xs font-black text-slate-800">
                          {formatRupiah(trx.grandTotal)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                          Item
                        </p>
                        <p className="mt-0.5 text-xs font-black text-slate-800">
                          {trx.totalItem} barang
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                          Retur
                        </p>
                        <p className="mt-0.5 text-xs font-black text-slate-800">
                          {Number(trx.totalReturQty || 0)} barang
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                          Nominal Retur
                        </p>
                        <p className="mt-0.5 text-xs font-black text-slate-800">
                          {formatRupiah(Number(trx.totalReturNominal || 0))}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => onPrint(trx)}
                      className="flex h-10 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 text-xs font-black uppercase tracking-wide text-sky-700 shadow-sm transition-all hover:bg-sky-100"
                    >
                      <Receipt size={14} strokeWidth={2.5} />
                      Print
                    </button>

                    <button
                      type="button"
                      onClick={() => onRetur(trx)}
                      disabled={!canRetur}
                      className="flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-4 text-xs font-black uppercase tracking-wide text-white shadow-sm transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:from-slate-200 disabled:via-slate-200 disabled:to-slate-200 disabled:text-slate-400"
                    >
                      <RotateCcw size={14} strokeWidth={2.5} />
                      {canRetur ? "Retur" : "Sudah Retur"}
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReturTransaksiModal({
  trx,
  selections,
  catatan,
  loading,
  totalQty,
  totalNominal,
  onClose,
  onChangeCatatan,
  onChangeQty,
  onSubmit,
}: {
  trx: RiwayatTransaksiItem | null;
  selections: ReturSelectionMap;
  catatan: string;
  loading: boolean;
  totalQty: number;
  totalNominal: number;
  onClose: () => void;
  onChangeCatatan: (value: string) => void;
  onChangeQty: (
    trx: RiwayatTransaksiItem,
    item: any,
    index: number,
    qty: number,
  ) => void;
  onSubmit: () => void;
}) {
  if (!trx) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[80] flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="absolute inset-0 bg-slate-900/45 backdrop-blur-sm" />

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        >
          <div className="relative overflow-hidden bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 px-5 py-4 text-white">
            <div className="relative z-10 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
                    <RotateCcw size={18} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h2 className="text-base font-black leading-none">
                      Retur Transaksi
                    </h2>
                    <p className="mt-1 text-xs font-semibold text-sky-50/85">
                      {trx.nomorTransaksi} · {trx.tokoNama}
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 text-white transition-colors hover:bg-white/25 disabled:opacity-50"
              >
                ×
              </button>
            </div>

            <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10 blur-3xl" />
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  Total Transaksi
                </p>
                <p className="mt-1 text-sm font-black text-slate-800">
                  {formatRupiah(trx.grandTotal)}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  Item Terjual
                </p>
                <p className="mt-1 text-sm font-black text-slate-800">
                  {trx.totalItem}
                </p>
              </div>
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-sky-500">
                  Qty Retur
                </p>
                <p className="mt-1 text-sm font-black text-sky-700">
                  {totalQty}
                </p>
              </div>
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-sky-500">
                  Nominal Retur
                </p>
                <p className="mt-1 text-sm font-black text-sky-700">
                  {formatRupiah(totalNominal)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {trx.items.map((item, index) => {
                const key = getReturKey(item, index);
                const sisa = getReturSisaQty(trx, item, index);
                const qtyValue = Number(selections[key] || 0);
                const disabled = sisa <= 0;

                return (
                  <div
                    key={key}
                    className={`rounded-2xl border p-3 ${
                      disabled
                        ? "border-slate-200 bg-slate-50 opacity-70"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-black text-slate-800">
                            {item?.nama || "-"}
                          </p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                              (item?.jenisBarang || "fisik") === "digital"
                                ? "bg-blue-600 text-white"
                                : "bg-sky-600 text-white"
                            }`}
                          >
                            {(item?.jenisBarang || "fisik") === "digital"
                              ? "Digital"
                              : "Fisik"}
                          </span>
                        </div>

                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          Terjual {Number(item?.qty || 0)} · Sudah retur{" "}
                          {getReturQty(trx, item, index)} · Sisa {sisa}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {formatRupiah(Number(item?.hargaSetelahDiskon || 0))}{" "}
                          / item
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={disabled || loading}
                          onClick={() => onChangeQty(trx, item, index, 0)}
                          className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          0
                        </button>
                        <input
                          type="number"
                          min={0}
                          max={sisa}
                          value={qtyValue}
                          disabled={disabled || loading}
                          onChange={(e) =>
                            onChangeQty(
                              trx,
                              item,
                              index,
                              Number(e.target.value),
                            )
                          }
                          className="h-9 w-20 rounded-xl border-2 border-slate-200 bg-white px-2 text-center text-sm font-black text-slate-700 outline-none transition-all focus:border-sky-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                        />
                        <button
                          type="button"
                          disabled={disabled || loading}
                          onClick={() => onChangeQty(trx, item, index, sisa)}
                          className="h-9 rounded-xl border border-sky-200 bg-sky-50 px-3 text-xs font-black text-sky-700 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Semua
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
                Catatan Retur
              </label>
              <textarea
                value={catatan}
                onChange={(e) => onChangeCatatan(e.target.value)}
                disabled={loading}
                rows={3}
                placeholder="Contoh: barang rusak, pelanggan batal, salah input..."
                className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition-all placeholder:text-slate-300 focus:border-sky-500 disabled:bg-slate-100"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={loading || totalQty <= 0}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-5 text-sm font-black uppercase tracking-wide text-white transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw
                    size={16}
                    className="animate-spin"
                    strokeWidth={2.5}
                  />
                  Memproses Retur...
                </>
              ) : (
                <>
                  <RotateCcw size={16} strokeWidth={2.5} />
                  Proses Retur
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
