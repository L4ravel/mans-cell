"use client";

/*
  Halaman dashboard admin utama dengan akses cepat pemilik dan menu aplikasi bergaya launcher.
  Isi:
  - Header dashboard biru/sky premium.
  - Akses cepat dinamis sesuai role owner/admin/karyawan.
  - Tombol cepat dibuat 4 card utama + 4 icon launcher kecil.
  - Tombol cepat dan menu aplikasi konsisten tanpa border-slate dominan.
  - 5 grup menu dibuat menjadi tab icon.
  - Hanya menu dari tab aktif yang ditampilkan.
  - Semua menu pada tab aktif langsung tampil, tanpa tombol lainnya dan tanpa popup.
  - Shortcut seperti folder aplikasi.
  - Icon dibuat center rapi.
  - Putih dominan, icon soft-blue transparan, spacing rapat.
  - Drag memakai Pointer Events agar jalan di desktop dan mobile Chrome.
  - Drag hanya aktif saat tombol susun diklik pada grup aktif.
  - Saat mode susun aktif, icon bergerak ringan.
  - Urutan menu tersimpan di localStorage.
  - Logic restock dari dashboard lama tetap dipertahankan.
*/

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import {
  AlertTriangle,
  ArrowRightLeft,
  BadgePercent,
  Banknote,
  BarChart3,
  Boxes,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Cpu,
  CreditCard,
  Crown,
  Database,
  FileBarChart,
  FileClock,
  Gauge,
  GripVertical,
  HandCoins,
  History,
  Home,
  KeyRound,
  Layers3,
  LayoutGrid,
  Package,
  PackageCheck,
  PackagePlus,
  PieChart,
  ReceiptText,
  RefreshCw,
  Ruler,
  ScanBarcode,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Store,
  Tags,
  TrendingUp,
  Truck,
  UserCog,
  UserPlus,
  Users,
  UserX,
  Wallet,
  Wifi,
} from "lucide-react";

type MenuItem = {
  href: string;
  label: string;
  icon: any;
};

type MenuGroup = {
  id: string;
  label: string;
  shortLabel: string;
  icon: any;
  items: MenuItem[];
};

type OwnerShortcut = {
  href: string;
  label: string;
  desc: string;
  icon: any;
  tone: "sky" | "blue" | "slate" | "orange";
};

type DragState = {
  groupId: string;
  index: number;
  pointerId: number;
} | null;

type UserRoleTag = "owner" | "admin" | "karyawan";

const ORDER_STORAGE_KEY = "mans_cell_admin_dashboard_menu_order";

const DEFAULT_MENU_GROUPS: MenuGroup[] = [
  {
    id: "data-master",
    label: "Data Master",
    shortLabel: "Master",
    icon: Database,
    items: [
      { href: "/admin/tambah-toko", icon: Store, label: "Toko" },
      { href: "/admin/tambah-karyawan", icon: UserCog, label: "Karyawan" },
      { href: "/admin/tambah-pelanggan", icon: Users, label: "Pelanggan" },
      {
        href: "/admin/akun-pelanggan",
        icon: UserPlus,
        label: "Akun Pelanggan",
      },
      { href: "/admin/buat-akun", icon: KeyRound, label: "Akun Karyawan" },
      { href: "/admin/tambah-kategori", icon: Tags, label: "Kategori" },
      { href: "/admin/tambah-satuan", icon: Ruler, label: "Satuan" },
      { href: "/admin/tambah-supplier", icon: Truck, label: "Supplier" },
      { href: "/admin/tambah-saldo", icon: Wallet, label: "Saldo" },
      { href: "/admin/tambah-provider", icon: Wifi, label: "Provider" },
      { href: "/admin/tambah-barang", icon: Package, label: "Barang" },
      { href: "/admin/tambah-barang-tetap", icon: Building2, label: "Aset" },
    ],
  },
  {
    id: "transaksi-admin",
    label: "Transaksi Admin",
    shortLabel: "Admin",
    icon: Boxes,
    items: [
      { href: "/admin/restock-barang", icon: PackagePlus, label: "Pembelian" },
      {
        href: "/admin/transfer-barang",
        icon: ArrowRightLeft,
        label: "Transfer",
      },
      { href: "/admin/terima-barang", icon: PackageCheck, label: "Terima" },
      { href: "/admin/mutasi-stok", icon: Layers3, label: "Mutasi" },
      { href: "/admin/pengeluaran", icon: HandCoins, label: "Pengeluaran" },
    ],
  },
  {
    id: "transaksi-kasir",
    label: "Transaksi Kasir",
    shortLabel: "Kasir",
    icon: ShoppingCart,
    items: [
      { href: "/admin/transaksi", icon: ScanBarcode, label: "Kasir" },
      { href: "/admin/tambah-diskon", icon: BadgePercent, label: "Diskon" },
      {
        href: "/admin/tambah-metode-pembayaran",
        icon: CreditCard,
        label: "Pembayaran",
      },
      { href: "/admin/riwayat-transaksi", icon: History, label: "Riwayat" },
      { href: "/admin/laporan-harian", icon: FileClock, label: "Harian" },
      { href: "/admin/laporan-bulanan", icon: ReceiptText, label: "Bulanan" },
    ],
  },
  {
    id: "laporan",
    label: "Laporan",
    shortLabel: "Laporan",
    icon: BarChart3,
    items: [
      {
        href: "/admin/laporan-pengeluaran",
        icon: Banknote,
        label: "Pengeluaran",
      },
      {
        href: "/admin/laporan-pembelian-barang",
        icon: ShoppingBag,
        label: "Pembelian",
      },
      {
        href: "/admin/laporan-keuntungan-bulanan",
        icon: PieChart,
        label: "Laba Bulanan",
      },
      {
        href: "/admin/laporan-keuntungan-harian",
        icon: Gauge,
        label: "Laba Harian",
      },
      {
        href: "/admin/laporan-setelah-modal-tetap",
        icon: FileBarChart,
        label: "Modal Tetap",
      },
    ],
  },
  {
    id: "absensi-karyawan",
    label: "Absensi Karyawan",
    shortLabel: "Absensi",
    icon: ClipboardCheck,
    items: [
      { href: "/admin/dashboard-absensi", icon: Home, label: "Dashboard" },
      {
        href: "/admin/laporan-absensi-karyawan",
        icon: ClipboardList,
        label: "Absensi",
      },
      {
        href: "/admin/pengaturan-jam",
        icon: CalendarClock,
        label: "Jam Absen",
      },
      {
        href: "/admin/tidak-wajib-absensi",
        icon: UserX,
        label: "Pengecualian",
      },
      {
        href: "/admin/persetujuan-absensi-karyawan",
        icon: ShieldCheck,
        label: "Persetujuan",
      },
      {
        href: "/admin/laporan-absensi-bulanan",
        icon: BriefcaseBusiness,
        label: "Bulanan",
      },
    ],
  },
];

const OWNER_SHORTCUTS: OwnerShortcut[] = [
  {
    href: "/admin/laporan-keuntungan-harian",
    label: "Laba Hari Ini",
    desc: "Untung bersih harian",
    icon: Gauge,
    tone: "sky",
  },
  {
    href: "/admin/laporan-keuntungan-bulanan",
    label: "Laba Bulanan",
    desc: "Untung bersih bulanan",
    icon: TrendingUp,
    tone: "blue",
  },
  {
    href: "/admin/laporan-harian",
    label: "Omzet Harian",
    desc: "Rekap transaksi harian",
    icon: FileClock,
    tone: "slate",
  },
  {
    href: "/admin/laporan-bulanan",
    label: "Omzet Bulanan",
    desc: "Rekap transaksi bulanan",
    icon: ReceiptText,
    tone: "slate",
  },
  {
    href: "/admin/laporan-pengeluaran",
    label: "Pengeluaran",
    desc: "Pantau biaya keluar",
    icon: Banknote,
    tone: "orange",
  },
  {
    href: "/admin/laporan-pembelian-barang",
    label: "Belanja Stok",
    desc: "Rekap pembelian stok",
    icon: ShoppingBag,
    tone: "blue",
  },
  {
    href: "/admin/laporan-setelah-modal-tetap",
    label: "Laba Bersih",
    desc: "Laba setelah modal",
    icon: FileBarChart,
    tone: "sky",
  },
  {
    href: "/admin/dashboard-absensi",
    label: "Absensi",
    desc: "Pantau kehadiran",
    icon: ClipboardCheck,
    tone: "slate",
  },
];

const ADMIN_SHORTCUTS: OwnerShortcut[] = [
  {
    href: "/admin/transaksi",
    label: "Kasir",
    desc: "Mulai transaksi",
    icon: ScanBarcode,
    tone: "sky",
  },
  {
    href: "/admin/tambah-barang",
    label: "Data Barang",
    desc: "Kelola stok barang",
    icon: Package,
    tone: "blue",
  },
  {
    href: "/admin/transfer-barang",
    label: "Transfer",
    desc: "Pindah stok antar toko",
    icon: ArrowRightLeft,
    tone: "slate",
  },
  {
    href: "/admin/terima-barang",
    label: "Terima",
    desc: "Terima barang masuk",
    icon: PackageCheck,
    tone: "slate",
  },
  {
    href: "/admin/tambah-toko",
    label: "Data Toko",
    desc: "Kelola cabang toko",
    icon: Store,
    tone: "sky",
  },
  {
    href: "/admin/pengaturan-jam",
    label: "Jam Absen",
    desc: "Atur jam karyawan",
    icon: CalendarClock,
    tone: "blue",
  },
  {
    href: "/admin/persetujuan-absensi-karyawan",
    label: "Persetujuan",
    desc: "Approve izin/sakit",
    icon: ShieldCheck,
    tone: "orange",
  },
  {
    href: "/admin/riwayat-transaksi",
    label: "Riwayat",
    desc: "Cek transaksi",
    icon: History,
    tone: "slate",
  },
];

const KASIR_SHORTCUTS: OwnerShortcut[] = [
  {
    href: "/admin/transaksi",
    label: "Kasir",
    desc: "Mulai transaksi",
    icon: ScanBarcode,
    tone: "sky",
  },
  {
    href: "/admin/riwayat-transaksi",
    label: "Riwayat",
    desc: "Cek transaksi",
    icon: History,
    tone: "blue",
  },
  {
    href: "/admin/laporan-harian",
    label: "Omzet Harian",
    desc: "Rekap hari ini",
    icon: FileClock,
    tone: "slate",
  },
  {
    href: "/admin/laporan-bulanan",
    label: "Omzet Bulanan",
    desc: "Rekap bulanan",
    icon: ReceiptText,
    tone: "slate",
  },
];

function normalizeUserRoles(raw: any): UserRoleTag[] {
  const roleItems = [
    ...(Array.isArray(raw?.roles) ? raw.roles : []),
    ...(Array.isArray(raw?.role) ? raw.role : []),
    ...(typeof raw?.role === "string" ? [raw.role] : []),
  ];

  const normalized = roleItems
    .map((role) =>
      String(role || "")
        .trim()
        .toLowerCase(),
    )
    .filter(
      (role): role is UserRoleTag =>
        role === "owner" || role === "admin" || role === "karyawan",
    );

  return Array.from(new Set(normalized));
}

function loadCachedDashboardRoles(): UserRoleTag[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem("mans_cell_session");
    if (!raw) return [];

    return normalizeUserRoles(JSON.parse(raw));
  } catch {
    return [];
  }
}

function reorderItems<T>(list: T[], from: number, to: number) {
  const next = [...list];
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed);
  return next;
}

export default function AdminPage() {
  const [restockCount, setRestockCount] = useState(0);
  const [approvalCount, setApprovalCount] = useState(0);
  const [loadingRestock, setLoadingRestock] = useState(false);
  const [menuGroups, setMenuGroups] =
    useState<MenuGroup[]>(DEFAULT_MENU_GROUPS);
  const [activeGroupId, setActiveGroupId] = useState(DEFAULT_MENU_GROUPS[0].id);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState>(null);
  const [userRoles, setUserRoles] = useState<UserRoleTag[]>(() =>
    loadCachedDashboardRoles(),
  );

  const hasOwnerRole = userRoles.includes("owner");
  const hasAdminRole = userRoles.includes("admin");
  const hasKaryawanRole = userRoles.includes("karyawan");
  const isKaryawanOnly = hasKaryawanRole && !hasAdminRole && !hasOwnerRole;
  const hasFullDashboardAccess = hasOwnerRole || hasAdminRole;
  const roleLabel = hasOwnerRole
    ? "Owner"
    : hasAdminRole
      ? "Admin"
      : "Karyawan";
  const dashboardDescription = hasOwnerRole
    ? "Pusat pantauan owner Mans Cell."
    : hasAdminRole
      ? "Pusat pantauan admin Mans Cell."
      : "Pusat transaksi kasir Mans Cell.";
  const quickAccessTitle = hasOwnerRole
    ? "Akses Cepat Owner"
    : hasAdminRole
      ? "Akses Cepat Admin"
      : "Akses Cepat Kasir";
  const quickAccessDescription = hasOwnerRole
    ? "Laporan utama owner toko"
    : hasAdminRole
      ? "Laporan utama admin toko"
      : "Menu utama transaksi kasir";
  const quickAccessBadge = hasOwnerRole
    ? "Owner"
    : hasAdminRole
      ? "Admin"
      : "Kasir";
  const quickShortcuts = isKaryawanOnly
    ? KASIR_SHORTCUTS
    : hasOwnerRole
      ? OWNER_SHORTCUTS
      : ADMIN_SHORTCUTS;

  const fetchRestockCount = async () => {
    setLoadingRestock(true);

    try {
      const [barangSnap, saldoSnap] = await Promise.all([
        getDocs(query(collection(db, "barang"))),
        getDocs(query(collection(db, "master_saldo_digital"))),
      ]);

      const totalBarangRestock = barangSnap.docs.reduce((sum, d) => {
        const x = d.data() as any;
        const jenisBarang = (x?.jenisBarang || "fisik") as "fisik" | "digital";
        const stok = Number(x?.stok || 0);
        const stokMinimum = Number(x?.stokMinimum || 0);

        if (jenisBarang === "fisik" && stok <= stokMinimum) return sum + 1;
        return sum;
      }, 0);

      const totalSaldoRestock = saldoSnap.docs.reduce((sum, d) => {
        const x = d.data() as any;
        const aktif = x?.aktif !== false;
        const jumlahSaldo = Number(x?.jumlahSaldo || 0);
        const jumlahMinimum = Number(x?.jumlahMinimum || 0);

        if (aktif && jumlahSaldo <= jumlahMinimum) return sum + 1;
        return sum;
      }, 0);

      setRestockCount(totalBarangRestock + totalSaldoRestock);
    } catch (error) {
      console.error("Gagal memuat jumlah restock:", error);
      setRestockCount(0);
    } finally {
      setLoadingRestock(false);
    }
  };

  const fetchApprovalCount = async () => {
    try {
      const snap = await getDocs(
        query(
          collection(db, "absensi_karyawan"),
          where("approvalStatus", "==", "pending"),
          where("status", "in", ["izin", "sakit"]),
        ),
      );

      setApprovalCount(snap.size);
    } catch (error) {
      console.error("Gagal memuat jumlah persetujuan absensi:", error);
      setApprovalCount(0);
    }
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ORDER_STORAGE_KEY);
      if (!raw) return;

      const saved = JSON.parse(raw) as Record<string, string[]>;

      setMenuGroups((prev) =>
        prev.map((group) => {
          const order = saved[group.id];
          if (!Array.isArray(order) || order.length === 0) return group;

          const itemMap = new Map(group.items.map((item) => [item.href, item]));
          const orderedItems = order
            .map((href) => itemMap.get(href))
            .filter(Boolean) as MenuItem[];

          const remainingItems = group.items.filter(
            (item) => !order.includes(item.href),
          );

          return {
            ...group,
            items: [...orderedItems, ...remainingItems],
          };
        }),
      );
    } catch {
      localStorage.removeItem(ORDER_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        if (isMounted) {
          setUserRoles([]);
          setRestockCount(0);
          setApprovalCount(0);
          setApprovalCount(0);
        }
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!isMounted) return;

        const roles = snap.exists() ? normalizeUserRoles(snap.data()) : [];
        setUserRoles(roles);

        if (roles.includes("owner") || roles.includes("admin")) {
          await Promise.all([fetchRestockCount(), fetchApprovalCount()]);
        } else {
          setRestockCount(0);
          setApprovalCount(0);
        }
      } catch (error) {
        console.error("Gagal membaca role dashboard:", error);
        if (isMounted) {
          setUserRoles([]);
          setRestockCount(0);
          setApprovalCount(0);
        }
      }
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, []);

  const visibleMenuGroups = useMemo(() => {
    if (isKaryawanOnly) {
      return menuGroups.filter((group) => group.id === "transaksi-kasir");
    }

    return menuGroups;
  }, [isKaryawanOnly, menuGroups]);

  useEffect(() => {
    if (visibleMenuGroups.length === 0) return;
    if (visibleMenuGroups.some((group) => group.id === activeGroupId)) return;

    setActiveGroupId(visibleMenuGroups[0].id);
  }, [activeGroupId, visibleMenuGroups]);

  const activeGroup = useMemo(
    () =>
      visibleMenuGroups.find((group) => group.id === activeGroupId) ||
      visibleMenuGroups[0] ||
      menuGroups[0],
    [activeGroupId, visibleMenuGroups, menuGroups],
  );

  const isNeedRestock = hasFullDashboardAccess && restockCount > 0;
  const hasPendingApproval = hasFullDashboardAccess && approvalCount > 0;
  const ActiveGroupIcon = activeGroup?.icon || LayoutGrid;

  const persistOrder = (groups: MenuGroup[]) => {
    const payload = groups.reduce<Record<string, string[]>>((acc, group) => {
      acc[group.id] = group.items.map((item) => item.href);
      return acc;
    }, {});

    localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(payload));
  };

  const moveItem = (groupId: string, fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;

    setMenuGroups((prev) => {
      const next = prev.map((group) => {
        if (group.id !== groupId) return group;

        return {
          ...group,
          items: reorderItems(group.items, fromIndex, toIndex),
        };
      });

      persistOrder(next);
      return next;
    });
  };

  const toggleEditGroup = (groupId: string) => {
    setDragState(null);
    setEditingGroupId((prev) => (prev === groupId ? null : groupId));
  };

  const handleOpenGroup = (groupId: string) => {
    setDragState(null);
    setEditingGroupId(null);
    setActiveGroupId(groupId);
  };

  const handlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    groupId: string,
    index: number,
  ) => {
    if (editingGroupId !== groupId) return;

    e.preventDefault();
    e.stopPropagation();

    e.currentTarget.setPointerCapture(e.pointerId);
    setDragState({ groupId, index, pointerId: e.pointerId });
  };

  const handlePointerUp = (
    e: React.PointerEvent<HTMLDivElement>,
    groupId: string,
  ) => {
    if (
      !dragState ||
      dragState.groupId !== groupId ||
      editingGroupId !== groupId
    ) {
      setDragState(null);
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const target = document.elementFromPoint(e.clientX, e.clientY);
    const dropTarget = target?.closest(
      `[data-dashboard-group="${groupId}"][data-dashboard-index]`,
    ) as HTMLElement | null;

    const toIndex = Number(dropTarget?.dataset.dashboardIndex);

    if (Number.isFinite(toIndex)) {
      moveItem(groupId, dragState.index, toIndex);
    }

    setDragState(null);
  };

  const handlePointerCancel = () => {
    setDragState(null);
  };

  const renderLauncherIcon = (
    item: MenuItem,
    groupId: string,
    index: number,
  ) => {
    const Icon = item.icon;
    const canEdit = editingGroupId === groupId;
    const isDragging =
      dragState?.groupId === groupId && dragState.index === index;

    return (
      <div
        key={`${groupId}-${item.href}`}
        data-dashboard-group={groupId}
        data-dashboard-index={index}
        onPointerDown={(e) => handlePointerDown(e, groupId, index)}
        onPointerUp={(e) => handlePointerUp(e, groupId)}
        onPointerCancel={handlePointerCancel}
        className={`group relative flex w-full justify-center rounded-[1.15rem] transition ${
          canEdit
            ? "cursor-grab touch-none select-none active:cursor-grabbing mans-cell-wiggle"
            : ""
        } ${isDragging ? "scale-95 opacity-60" : "hover:bg-sky-50/60"}`}
      >
        <Link
          href={item.href}
          draggable={false}
          onClick={(e) => {
            if (canEdit) e.preventDefault();
          }}
          className="flex min-h-[72px] w-full max-w-[76px] flex-col items-center justify-start px-0.5 py-1 text-center"
        >
          <div className="flex h-[43px] w-[43px] items-center justify-center rounded-[1rem] bg-gradient-to-br from-sky-500/66 via-sky-600/66 to-blue-500/66 text-white shadow-sm shadow-sky-500/10 ring-1 ring-white/70 transition group-hover:scale-[1.035] group-hover:from-sky-500/78 group-hover:via-sky-600/78 group-hover:to-blue-500/78">
            <Icon size={20} strokeWidth={2.45} />
          </div>

          <p className="mt-1 line-clamp-2 max-w-[68px] text-center text-[9px] font-black leading-[1.08] text-slate-700">
            {item.label}
          </p>
        </Link>
      </div>
    );
  };

  const renderEditButton = (groupId: string) => {
    const active = editingGroupId === groupId;

    return (
      <button
        type="button"
        onClick={() => toggleEditGroup(groupId)}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-slate-500 shadow-sm ring-1 transition ${
          active
            ? "bg-sky-100 text-sky-700 ring-sky-200"
            : "bg-white text-slate-400 ring-sky-100/70 hover:bg-sky-50 hover:text-sky-700 hover:ring-sky-200"
        }`}
        title={active ? "Kunci urutan menu" : "Susun urutan menu"}
      >
        <GripVertical size={14} strokeWidth={2.7} />
      </button>
    );
  };

  const renderOwnerShortcut = (
    item: OwnerShortcut,
    variant: "utama" | "mini" = "utama",
  ) => {
    const Icon = item.icon;
    const isApprovalShortcut =
      item.href === "/admin/persetujuan-absensi-karyawan";
    const badgeCount = isApprovalShortcut && hasPendingApproval ? approvalCount : 0;

    const toneClass =
      item.tone === "orange"
        ? "from-orange-500/80 via-orange-500/70 to-amber-500/70 shadow-orange-500/10"
        : item.tone === "blue"
          ? "from-blue-500/80 via-sky-600/70 to-blue-500/70 shadow-blue-500/10"
          : item.tone === "sky"
            ? "from-sky-500/80 via-sky-600/70 to-cyan-500/70 shadow-sky-500/10"
            : "from-slate-500/75 via-slate-600/65 to-slate-500/65 shadow-slate-500/10";

    if (variant === "mini") {
      return (
        <Link
          key={item.href}
          href={item.href}
          className="group relative flex min-h-[88px] flex-col items-center justify-center overflow-hidden rounded-[1.35rem] bg-gradient-to-br from-white via-sky-50/35 to-white px-2 py-2.5 text-center shadow-sm shadow-sky-500/5 ring-1 ring-sky-100/60 transition hover:bg-sky-50/70 hover:shadow-md hover:shadow-sky-500/10"
        >
          {badgeCount > 0 && (
            <span className="absolute right-2 top-2 z-10 inline-flex min-w-[1.35rem] items-center justify-center rounded-full bg-orange-500 px-1.5 py-0.5 text-[9px] font-black text-white shadow-sm shadow-orange-500/20 ring-2 ring-white">
              {badgeCount}
            </span>
          )}

          <div
            className={`flex h-11 w-11 items-center justify-center rounded-[1.05rem] bg-gradient-to-br ${toneClass} text-white shadow-sm ring-1 ring-white/70 transition group-hover:scale-[1.04]`}
          >
            <Icon size={20} strokeWidth={2.55} />
          </div>

          <p className="mt-1.5 line-clamp-2 text-[10px] font-black leading-[1.08] text-slate-700">
            {item.label}
          </p>
        </Link>
      );
    }

    return (
      <Link
        key={item.href}
        href={item.href}
        className="group relative overflow-hidden rounded-[1.45rem] bg-gradient-to-br from-white via-sky-50/35 to-white p-3.5 shadow-sm shadow-sky-500/5 ring-1 ring-sky-100/60 transition hover:bg-sky-50/70 hover:shadow-lg hover:shadow-sky-500/10"
      >
        <div className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full bg-sky-100/60 blur-2xl transition group-hover:bg-sky-200/70" />

        {badgeCount > 0 && (
          <span className="absolute right-3 top-3 z-10 inline-flex min-w-[1.45rem] items-center justify-center rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-black text-white shadow-sm shadow-orange-500/20 ring-2 ring-white">
            {badgeCount}
          </span>
        )}

        <div className="relative flex items-start gap-3">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.2rem] bg-gradient-to-br ${toneClass} text-white shadow-md ring-1 ring-white/70 transition group-hover:scale-[1.04]`}
          >
            <Icon size={22} strokeWidth={2.55} />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-black leading-tight text-slate-800">
              {item.label === "Omzet Harian" ? (
                <>
                  Omzet
                  <br />
                  Harian
                </>
              ) : item.label === "Omzet Bulanan" ? (
                <>
                  Omzet
                  <br />
                  Bulanan
                </>
              ) : (
                item.label
              )}
            </p>
            <p className="mt-1 line-clamp-2 text-[10px] font-semibold leading-relaxed text-slate-400">
              {badgeCount > 0 ? `${badgeCount} pengajuan menunggu` : item.desc}
            </p>
          </div>
        </div>
      </Link>
    );
  };

  return (
    <div className="relative min-h-full overflow-x-hidden bg-transparent text-slate-900">
      <style jsx global>{`
        @keyframes mansCellWiggle {
          0% {
            transform: rotate(-0.75deg) translateY(0);
          }
          50% {
            transform: rotate(0.75deg) translateY(-0.5px);
          }
          100% {
            transform: rotate(-0.75deg) translateY(0);
          }
        }

        .mans-cell-wiggle {
          animation: mansCellWiggle 0.26s ease-in-out infinite;
        }

        .mans-cell-wiggle:nth-child(even) {
          animation-delay: 0.08s;
        }
      `}</style>

      <main className="relative w-full space-y-3 pb-24">
        <section className="relative overflow-hidden rounded-[1.35rem] border border-sky-300/30 bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 px-4 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-18px_42px_rgba(2,132,199,0.24)] sm:px-5 sm:py-5">
          <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20 sm:h-12 sm:w-12">
                <BarChart3
                  size={28}
                  className="text-white sm:h-8 sm:w-8"
                  strokeWidth={2.5}
                />
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                  Dashboard
                </h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  {dashboardDescription}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {hasFullDashboardAccess && (
                <Link
                  href="/admin/restock-barang"
                  className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[10px] font-black uppercase tracking-[0.08em] text-white shadow-sm backdrop-blur-md transition-all ${
                    isNeedRestock
                      ? "border-orange-800/110 bg-orange-200/10 shadow-orange-500/20 hover:bg-orange-500/70"
                      : "border-white/20 bg-white/10 hover:bg-white/15"
                  }`}
                >
                  {isNeedRestock ? (
                    <AlertTriangle size={14} strokeWidth={2.5} />
                  ) : (
                    <CheckCircle2 size={14} strokeWidth={2.5} />
                  )}
                  <span>
                    {isNeedRestock ? `RESTOCK ${restockCount}` : "AMAN"}
                  </span>
                </Link>
              )}
            </div>
          </div>

          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-yellow-300/10 blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-0 opacity-[0.05]">
            <Cpu size={170} className="text-white" strokeWidth={1} />
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.5rem] bg-white p-3 shadow-sm shadow-sky-500/5 ring-1 ring-sky-100/70">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500/80 via-sky-600/75 to-blue-500/75 text-white shadow-sm shadow-sky-500/10 ring-1 ring-white/70">
                <Crown size={19} strokeWidth={2.6} />
              </div>

              <div className="min-w-0">
                <h2 className="text-sm font-black leading-tight text-slate-800">
                  {quickAccessTitle}
                </h2>
                <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  {quickAccessDescription}
                </p>
              </div>
            </div>

            <span className="hidden rounded-full bg-sky-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-sky-700 ring-1 ring-sky-100/70 sm:inline-flex">
              {quickAccessBadge}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {quickShortcuts
              .slice(0, 4)
              .map((item) => renderOwnerShortcut(item, "utama"))}
          </div>

          {quickShortcuts.length > 4 && (
            <div className="mt-2 grid grid-cols-4 gap-1.5 rounded-[1.35rem] bg-sky-50/45 p-1.5 ring-1 ring-sky-100/60">
              {quickShortcuts
                .slice(4)
                .map((item) => renderOwnerShortcut(item, "mini"))}
            </div>
          )}
        </section>

        <section className="rounded-[1.5rem] bg-white p-2.5 shadow-sm shadow-sky-500/5 ring-1 ring-sky-100/70 sm:p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500/80 via-sky-600/75 to-blue-500/75 text-white shadow-sm shadow-sky-500/10 ring-1 ring-white/70">
                <LayoutGrid size={19} strokeWidth={2.6} />
              </div>

              <div className="min-w-0">
                <h2 className="text-sm font-black leading-tight text-slate-800">
                  Menu Aplikasi
                </h2>
                <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  Pilih grup menu
                </p>
              </div>
            </div>

            {activeGroup && renderEditButton(activeGroup.id)}
          </div>

          <div className="mb-2 grid grid-cols-5 gap-1.5 rounded-[1.35rem] bg-sky-50/45 p-1.5 ring-1 ring-sky-100/60">
            {visibleMenuGroups.map((group) => {
              const Icon = group.icon;
              const active = activeGroupId === group.id;

              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => handleOpenGroup(group.id)}
                  className={`flex min-h-[58px] flex-col items-center justify-center rounded-2xl px-1 py-1.5 text-center transition ${
                    active
                      ? "bg-white text-sky-700 shadow-sm shadow-sky-500/5 ring-1 ring-sky-100/80"
                      : "text-slate-400 hover:bg-white/70 hover:text-sky-700"
                  }`}
                >
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-xl transition ${
                      active
                        ? "bg-gradient-to-br from-sky-500/75 via-sky-600/75 to-blue-500/75 text-white shadow-sm shadow-sky-500/10"
                        : "bg-white text-slate-400 ring-1 ring-sky-100/60"
                    }`}
                  >
                    <Icon size={16} strokeWidth={2.5} />
                  </div>

                  <span className="mt-1 line-clamp-1 text-[8.5px] font-black leading-none">
                    {group.shortLabel}
                  </span>
                </button>
              );
            })}
          </div>

          {activeGroup && (
            <div
              className={`relative overflow-hidden rounded-[1.35rem] p-2 transition ${
                editingGroupId === activeGroup.id
                  ? "bg-sky-50/60 ring-2 ring-sky-100"
                  : "bg-gradient-to-br from-white via-sky-50/25 to-white ring-1 ring-sky-100/50"
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-2 px-0.5">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500/70 via-sky-600/70 to-blue-500/70 text-white shadow-sm shadow-sky-500/10">
                    <ActiveGroupIcon size={16} strokeWidth={2.5} />
                  </div>

                  <div className="min-w-0">
                    <h3 className="truncate text-[13px] font-black leading-tight text-slate-800 sm:text-sm">
                      {activeGroup.label}
                    </h3>
                    <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-slate-400">
                      {editingGroupId === activeGroup.id
                        ? "Susun aktif"
                        : `${activeGroup.items.length} menu tersedia`}
                    </p>
                  </div>
                </div>

                <div className="hidden items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] text-sky-700 ring-1 ring-sky-100/70 sm:flex">
                  <LayoutGrid size={10} strokeWidth={2.6} />
                  Daftar Menu
                </div>
              </div>

              <div className="grid grid-cols-4 place-items-center gap-x-0 gap-y-1 sm:gap-x-1.5 sm:gap-y-2">
                {activeGroup.items.map((item, index) =>
                  renderLauncherIcon(item, activeGroup.id, index),
                )}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
