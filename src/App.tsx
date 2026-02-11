import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User
} from "firebase/auth";
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { auth, db } from "./firebase";

type Member = {
  id: string;
  name: string;
};

type Expense = {
  id: string;
  title: string;
  amount: number;
  currency?: string;
  originalAmount?: number;
  fxRate?: number;
  paidBy: string;
  splitBetween: string[];
  splitMode?: "equal" | "custom";
  splitAmounts?: Record<string, number>;
  createdAt: string;
};

type Group = {
  id: string;
  name: string;
  currency: string;
  inviteCode: string;
  ownerId: string;
  collaborators: string[];
  members: Member[];
  expenses: Expense[];
};

type AppState = {
  groups: Group[];
  activeGroupId: string | null;
};

const INITIAL_STATE: AppState = {
  groups: [],
  activeGroupId: null
};

type Settlement = {
  from: Member;
  to: Member;
  amount: number;
};

type MasterExpense = Expense & {
  groupId: string;
  groupName: string;
  groupCurrency: string;
};

const createId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const createInviteCode = () =>
  Math.random().toString(36).slice(2, 8).toUpperCase();

const currencyOptions = [
  { code: "USD", label: "US Dollar", symbol: "$" },
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "GBP", label: "British Pound", symbol: "£" },
  { code: "INR", label: "Indian Rupee", symbol: "₹" },
  { code: "AED", label: "UAE Dirham", symbol: "د.إ" },
  { code: "SGD", label: "Singapore Dollar", symbol: "$" },
  { code: "JPY", label: "Japanese Yen", symbol: "¥" },
  { code: "AUD", label: "Australian Dollar", symbol: "$" },
  { code: "CAD", label: "Canadian Dollar", symbol: "$" }
];

const getCurrencySymbol = (code: string) => {
  return currencyOptions.find((option) => option.code === code)?.symbol || "$";
};

const Icon = ({
  name,
  className
}: {
  name:
    | "spark"
    | "users"
    | "wallet"
    | "balance"
    | "receipt"
    | "crown"
    | "list"
    | "key"
    | "shield"
    | "chart"
    | "share"
    | "settings"
    | "home"
    | "plus"
    | "download"
    | "printer";
  className?: string;
}) => {
  const shared = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true
  };

  switch (name) {
    case "spark":
      return (
        <svg {...shared}>
          <path d="M12 3l1.9 4.8L19 9l-5.1 1.2L12 15l-1.9-4.8L5 9l5.1-1.2L12 3z" />
          <path d="M4 18l.8 2L7 21l-2.2.6L4 24l-.8-2L1 20l2.2-.6L4 18z" />
        </svg>
      );
    case "users":
      return (
        <svg {...shared}>
          <circle cx="8" cy="9" r="3.2" />
          <circle cx="16.5" cy="10" r="2.5" />
          <path d="M2.5 19.5c1.2-3 4-4.5 6.5-4.5s5.3 1.5 6.5 4.5" />
          <path d="M13 18.8c.7-2 2.5-3.3 4.8-3.3 1.6 0 2.9.6 3.7 1.6" />
        </svg>
      );
    case "wallet":
      return (
        <svg {...shared}>
          <path d="M3.5 7.5h15a2 2 0 012 2v6.5a2 2 0 01-2 2h-15a2 2 0 01-2-2V7.5a3 3 0 013-3h11.5" />
          <path d="M16.5 12.5h4" />
        </svg>
      );
    case "balance":
      return (
        <svg {...shared}>
          <path d="M12 4v16" />
          <path d="M5 7h14" />
          <path d="M7 7l-3 6h6l-3-6z" />
          <path d="M17 7l-3 6h6l-3-6z" />
        </svg>
      );
    case "receipt":
      return (
        <svg {...shared}>
          <path d="M7 3h10a2 2 0 012 2v16l-3-2-3 2-3-2-3 2-3-2V5a2 2 0 012-2z" />
          <path d="M9 8h6" />
          <path d="M9 12h6" />
        </svg>
      );
    case "crown":
      return (
        <svg {...shared}>
          <path d="M4 8l4 4 4-6 4 6 4-4-2 10H6L4 8z" />
          <path d="M7 18h10" />
        </svg>
      );
    case "list":
      return (
        <svg {...shared}>
          <path d="M7 6h12" />
          <path d="M7 12h12" />
          <path d="M7 18h12" />
          <circle cx="3.5" cy="6" r="1" />
          <circle cx="3.5" cy="12" r="1" />
          <circle cx="3.5" cy="18" r="1" />
        </svg>
      );
    case "key":
      return (
        <svg {...shared}>
          <circle cx="8" cy="10" r="3.5" />
          <path d="M11 10h9" />
          <path d="M17 10v3" />
          <path d="M20 10v3" />
        </svg>
      );
    case "shield":
      return (
        <svg {...shared}>
          <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3z" />
          <path d="M9.5 12l2 2 3-3" />
        </svg>
      );
    case "chart":
      return (
        <svg {...shared}>
          <path d="M4 19h16" />
          <path d="M7 15v-4" />
          <path d="M12 15v-7" />
          <path d="M17 15v-2" />
        </svg>
      );
    case "share":
      return (
        <svg {...shared}>
          <circle cx="6" cy="12" r="2.5" />
          <circle cx="18" cy="6" r="2.5" />
          <circle cx="18" cy="18" r="2.5" />
          <path d="M8.2 11L15.8 7" />
          <path d="M8.2 13L15.8 17" />
        </svg>
      );
    case "settings":
      return (
        <svg {...shared}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M4 12h2" />
          <path d="M18 12h2" />
          <path d="M12 4v2" />
          <path d="M12 18v2" />
          <path d="M6.5 6.5l1.5 1.5" />
          <path d="M16 16l1.5 1.5" />
          <path d="M6.5 17.5l1.5-1.5" />
          <path d="M16 8l1.5-1.5" />
        </svg>
      );
    case "home":
      return (
        <svg {...shared}>
          <path d="M4 11l8-6 8 6" />
          <path d="M6 10v9h12v-9" />
        </svg>
      );
    case "plus":
      return (
        <svg {...shared}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case "download":
      return (
        <svg {...shared}>
          <path d="M12 3v12" />
          <path d="M7 10l5 5 5-5" />
          <path d="M5 20h14" />
        </svg>
      );
    case "printer":
      return (
        <svg {...shared}>
          <path d="M7 8V4h10v4" />
          <path d="M7 16h10v4H7z" />
          <rect x="4" y="8" width="16" height="8" rx="2" />
        </svg>
      );
    default:
      return null;
  }
};

const roundToCents = (value: number) => Math.round(value * 100) / 100;

const parseAmount = (value: string) => {
  const normalized = value.replace(/[^0-9.]/g, "");
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const formatMoney = (value: number) => {
  const rounded = roundToCents(value);
  return rounded.toFixed(2);
};

const formatCurrencyValue = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency
    }).format(value);
  } catch {
    return `${getCurrencySymbol(currency)}${formatMoney(value)}`;
  }
};

const escapeCsvValue = (value: string | number) => {
  const raw = String(value ?? "");
  return `"${raw.replace(/"/g, "\"\"")}"`;
};

const buildCsv = (rows: (string | number)[][]) =>
  rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");

const downloadCsv = (filename: string, rows: (string | number)[][]) => {
  const csv = buildCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const buildEqualCustomAmounts = (memberIds: string[], total: number) => {
  if (memberIds.length === 0 || total <= 0) return {};
  const share = roundToCents(total / memberIds.length);
  let remaining = roundToCents(total);
  const amounts: Record<string, string> = {};

  memberIds.forEach((id, index) => {
    const value = index === memberIds.length - 1 ? remaining : share;
    amounts[id] = formatMoney(value);
    remaining = roundToCents(remaining - share);
  });

  return amounts;
};

const buildCustomAmountsFromExpense = (
  memberIds: string[],
  expense: Expense
) => {
  const amounts = expense.splitAmounts || {};
  const result: Record<string, string> = {};
  memberIds.forEach((id) => {
    const value = amounts[id] ?? 0;
    result[id] = formatMoney(value);
  });
  return result;
};

const buildExpensePayload = (params: {
  id: string;
  title: string;
  amount: number;
  currency: string;
  originalAmount: number;
  fxRate: number;
  paidBy: string;
  splitBetween: string[];
  splitMode: "equal" | "custom";
  splitAmounts?: Record<string, number>;
  createdAt: string;
}): Expense => {
  const payload: Expense = {
    id: params.id,
    title: params.title,
    amount: params.amount,
    currency: params.currency,
    originalAmount: params.originalAmount,
    paidBy: params.paidBy,
    splitBetween: params.splitBetween,
    splitMode: params.splitMode,
    createdAt: params.createdAt
  };

  if (params.fxRate !== 1) {
    payload.fxRate = params.fxRate;
  }

  if (
    params.splitMode === "custom" &&
    params.splitAmounts &&
    Object.keys(params.splitAmounts).length > 0
  ) {
    payload.splitAmounts = params.splitAmounts;
  }

  return payload;
};

const computeBalances = (group: Group) => {
  const balances: Record<string, number> = {};
  group.members.forEach((member) => {
    balances[member.id] = 0;
  });

  for (const expense of group.expenses) {
    if (!expense.paidBy) continue;
    if (!(expense.paidBy in balances)) {
      balances[expense.paidBy] = 0;
    }
    balances[expense.paidBy] += expense.amount;
    const hasCustomSplit =
      (expense.splitMode === "custom" || !!expense.splitAmounts) &&
      expense.splitAmounts &&
      Object.keys(expense.splitAmounts).length > 0;

    if (hasCustomSplit && expense.splitAmounts) {
      for (const [memberId, amount] of Object.entries(expense.splitAmounts)) {
        if (!(memberId in balances)) {
          balances[memberId] = 0;
        }
        balances[memberId] -= amount;
      }
    } else {
      const splitMembers =
        Array.isArray(expense.splitBetween) && expense.splitBetween.length > 0
          ? expense.splitBetween
          : [expense.paidBy];
      const splitCount = splitMembers.length || 1;
      const share = expense.amount / splitCount;
      for (const memberId of splitMembers) {
        if (!(memberId in balances)) {
          balances[memberId] = 0;
        }
        balances[memberId] -= share;
      }
    }
  }

  return group.members.map((member) => ({
    member,
    balance: balances[member.id] || 0
  }));
};

const computeSettlements = (
  balanceRows: { member: Member; balance: number }[]
): Settlement[] => {
  const creditors = balanceRows
    .filter((row) => row.balance > 0)
    .map((row) => ({
      member: row.member,
      amount: roundToCents(row.balance)
    }));
  const debtors = balanceRows
    .filter((row) => row.balance < 0)
    .map((row) => ({
      member: row.member,
      amount: roundToCents(Math.abs(row.balance))
    }));

  const settlements: Settlement[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const payment = Math.min(debtor.amount, creditor.amount);

    if (payment > 0) {
      settlements.push({
        from: debtor.member,
        to: creditor.member,
        amount: payment
      });
    }

    debtor.amount = roundToCents(debtor.amount - payment);
    creditor.amount = roundToCents(creditor.amount - payment);

    if (debtor.amount <= 0.01) debtorIndex += 1;
    if (creditor.amount <= 0.01) creditorIndex += 1;
  }

  return settlements;
};

export default function App() {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<
    "connecting" | "syncing" | "ready" | "error"
  >("connecting");
  const [cloudError, setCloudError] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authResetMessage, setAuthResetMessage] = useState("");
  const [view, setView] = useState<"groups" | "group" | "master">("groups");
  const [viewInitialized, setViewInitialized] = useState(false);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const hasMigratedRef = useRef(false);

  const [groupName, setGroupName] = useState("");
  const [groupCurrencyDraft, setGroupCurrencyDraft] = useState("USD");
  const [memberName, setMemberName] = useState("");
  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCurrency, setExpenseCurrency] = useState("USD");
  const [expenseFxRate, setExpenseFxRate] = useState("1");
  const [paidBy, setPaidBy] = useState("");
  const [splitBetween, setSplitBetween] = useState<string[]>([]);
  const [splitMode, setSplitMode] = useState<"equal" | "custom">("equal");
  const [customSplitAmounts, setCustomSplitAmounts] = useState<
    Record<string, string>
  >({});
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

  const activeGroup = useMemo(() => {
    return state.groups.find((group) => group.id === state.activeGroupId) || null;
  }, [state.groups, state.activeGroupId]);

  const baseCurrency = activeGroup?.currency || "USD";

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
      setCloudError("");
      setAuthError("");
      setAuthBusy(false);
      setAuthResetMessage("");
      if (!user) {
        setHydrated(false);
        setState(INITIAL_STATE);
        setCloudStatus("connecting");
        setGroupsLoaded(false);
        hasMigratedRef.current = false;
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady || !authUser || hasMigratedRef.current) return;
    hasMigratedRef.current = true;
    const migrateLegacyState = async () => {
      const legacyRef = doc(db, "users", authUser.uid);
      const legacySnap = await getDoc(legacyRef);
      if (!legacySnap.exists()) return;
      const legacyData = legacySnap.data() as {
        migratedToGroups?: boolean;
        state?: AppState;
      };
      if (!legacyData?.state || legacyData.migratedToGroups) return;

      const groupsToCreate = legacyData.state.groups || [];
      for (const group of groupsToCreate) {
        await setDoc(doc(db, "groups", group.id || createId()), {
          name: group.name,
          members: group.members || [],
          expenses: group.expenses || [],
          currency: group.currency || "USD",
          inviteCode: createInviteCode(),
          ownerId: authUser.uid,
          collaborators: [authUser.uid],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      await setDoc(
        legacyRef,
        {
          migratedToGroups: true
        },
        { merge: true }
      );

      if (legacyData.state.activeGroupId) {
        setState((prev) => ({
          ...prev,
          activeGroupId: legacyData.state?.activeGroupId || null
        }));
      }
    };

    migrateLegacyState().catch((error) => {
      setCloudStatus("error");
      setCloudError(error?.message || "Migration failed.");
    });
  }, [authReady, authUser]);

  useEffect(() => {
    if (!authReady || !authUser) return;
    setCloudStatus("connecting");
    setGroupsLoaded(false);
    const groupQuery = query(
      collection(db, "groups"),
      where("collaborators", "array-contains", authUser.uid)
    );

    const unsubscribe = onSnapshot(
      groupQuery,
      (snapshot) => {
        const groups = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as Omit<Group, "id">;
          return {
            id: docSnap.id,
            name: data.name || "Untitled trip",
            members: data.members || [],
            expenses: data.expenses || [],
            currency: data.currency || "USD",
            inviteCode: data.inviteCode || "",
            ownerId: data.ownerId || "",
            collaborators: data.collaborators || []
          };
        });

        setState((prev) => ({
          ...prev,
          groups,
          activeGroupId: groups.find((group) => group.id === prev.activeGroupId)
            ? prev.activeGroupId
            : prev.activeGroupId
              ? null
              : prev.activeGroupId
        }));
        setGroupsLoaded(true);
        setHydrated(true);
        setCloudStatus("ready");
      },
      (error) => {
        setCloudStatus("error");
        setCloudError(error?.message || "Cloud sync failed.");
        setGroupsLoaded(true);
        setHydrated(true);
      }
    );

    return () => unsubscribe();
  }, [authReady, authUser]);

  useEffect(() => {
    if (!hydrated || viewInitialized) return;
    setView(state.activeGroupId ? "group" : "groups");
    setViewInitialized(true);
  }, [hydrated, viewInitialized, state.activeGroupId]);

  const addGroup = useCallback(async () => {
    if (!authUser) return;
    const trimmed = groupName.trim();
    if (!trimmed) return;
    try {
      const docRef = await addDoc(collection(db, "groups"), {
        name: trimmed,
        members: [],
        expenses: [],
        currency: groupCurrencyDraft || "USD",
        inviteCode: createInviteCode(),
        ownerId: authUser.uid,
        collaborators: [authUser.uid],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setState((prev) => ({
        ...prev,
        activeGroupId: docRef.id
      }));
      setView("group");
      setGroupName("");
      setGroupCurrencyDraft("USD");
    } catch (error) {
      setCloudStatus("error");
      setCloudError(
        error instanceof Error ? error.message : "Unable to create group."
      );
    }
  }, [authUser, groupName, groupCurrencyDraft]);

  const joinGroupByCode = useCallback(async () => {
    if (!authUser) return;
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setJoinError("");
    try {
      const groupQuery = query(
        collection(db, "groups"),
        where("inviteCode", "==", code)
      );
      const snapshot = await getDocs(groupQuery);
      if (snapshot.empty) {
        setJoinError("No group found with that code.");
        return;
      }
      const groupDoc = snapshot.docs[0];
      await updateDoc(groupDoc.ref, {
        collaborators: arrayUnion(authUser.uid),
        updatedAt: serverTimestamp()
      });
      setJoinCode("");
      setState((prev) => ({
        ...prev,
        activeGroupId: groupDoc.id
      }));
      setView("group");
    } catch (error) {
      setCloudStatus("error");
      setCloudError(
        error instanceof Error ? error.message : "Unable to join group."
      );
    }
  }, [authUser, joinCode]);

  const addMember = useCallback(async () => {
    if (!activeGroup) return;
    const trimmed = memberName.trim();
    if (!trimmed) return;
    const newMember: Member = { id: createId(), name: trimmed };
    const nextMembers = [...activeGroup.members, newMember];
    try {
      await updateDoc(doc(db, "groups", activeGroup.id), {
        members: nextMembers,
        updatedAt: serverTimestamp()
      });
      setMemberName("");
    } catch (error) {
      setCloudStatus("error");
      setCloudError(
        error instanceof Error ? error.message : "Unable to add member."
      );
    }
  }, [activeGroup, memberName]);

  const resetExpenseForm = useCallback(() => {
    setEditingExpenseId(null);
    setExpenseTitle("");
    setExpenseAmount("");
    setSplitMode("equal");
    setCustomSplitAmounts({});
    if (activeGroup) {
      setPaidBy(activeGroup.members[0]?.id || "");
      setSplitBetween(activeGroup.members.map((member) => member.id));
    }
    setExpenseCurrency(baseCurrency);
    setExpenseFxRate("1");
  }, [activeGroup, baseCurrency]);

  const addExpense = useCallback(
    async (
      nextPaidBy: string,
      nextSplitBetween: string[],
      nextSplitMode: "equal" | "custom",
      nextCustomSplitAmounts: Record<string, string>
    ) => {
      if (!activeGroup) return;
      const title = expenseTitle.trim();
      const originalAmount = parseAmount(expenseAmount);
      if (!title || Number.isNaN(originalAmount) || originalAmount <= 0) return;
      const fxRate =
        expenseCurrency === baseCurrency ? 1 : parseAmount(expenseFxRate);
      if (!fxRate || fxRate <= 0) return;
      const amount = roundToCents(originalAmount * fxRate);

      const fallbackSplit = nextSplitBetween.length
        ? nextSplitBetween
        : [nextPaidBy];
      const splitAmounts =
        nextSplitMode === "custom"
          ? fallbackSplit.reduce<Record<string, number>>((acc, memberId) => {
              const value = roundToCents(
                parseAmount(nextCustomSplitAmounts[memberId] || "0")
              );
              if (value > 0) {
                acc[memberId] = value;
              }
              return acc;
            }, {})
          : undefined;

      const newExpense = buildExpensePayload({
        id: createId(),
        title,
        amount,
        currency: expenseCurrency,
        originalAmount,
        fxRate,
        paidBy: nextPaidBy,
        splitBetween: fallbackSplit,
        splitMode: nextSplitMode,
        splitAmounts,
        createdAt: new Date().toISOString()
      });

      const nextExpenses = [newExpense, ...activeGroup.expenses];
      try {
        await updateDoc(doc(db, "groups", activeGroup.id), {
          expenses: nextExpenses,
          updatedAt: serverTimestamp()
        });
        resetExpenseForm();
      } catch (error) {
        setCloudStatus("error");
        setCloudError(
          error instanceof Error
            ? error.message
            : "Unable to save expense."
        );
      }
    },
    [
      activeGroup,
      expenseTitle,
      expenseAmount,
      expenseCurrency,
      expenseFxRate,
      baseCurrency,
      resetExpenseForm
    ]
  );

  const saveExpenseEdits = useCallback(
    async (
      nextPaidBy: string,
      nextSplitBetween: string[],
      nextSplitMode: "equal" | "custom",
      nextCustomSplitAmounts: Record<string, string>
    ) => {
      if (!activeGroup || !editingExpenseId) return;
      const title = expenseTitle.trim();
      const originalAmount = parseAmount(expenseAmount);
      if (!title || Number.isNaN(originalAmount) || originalAmount <= 0) return;
      const fxRate =
        expenseCurrency === baseCurrency ? 1 : parseAmount(expenseFxRate);
      if (!fxRate || fxRate <= 0) return;
      const amount = roundToCents(originalAmount * fxRate);

      const fallbackSplit = nextSplitBetween.length
        ? nextSplitBetween
        : [nextPaidBy];
      const splitAmounts =
        nextSplitMode === "custom"
          ? fallbackSplit.reduce<Record<string, number>>((acc, memberId) => {
              const value = roundToCents(
                parseAmount(nextCustomSplitAmounts[memberId] || "0")
              );
              if (value > 0) {
                acc[memberId] = value;
              }
              return acc;
            }, {})
          : undefined;

      const nextExpenses = activeGroup.expenses.map((expense) =>
        expense.id === editingExpenseId
          ? buildExpensePayload({
              id: expense.id,
              title,
              amount,
              currency: expenseCurrency,
              originalAmount,
              fxRate,
              paidBy: nextPaidBy,
              splitBetween: fallbackSplit,
              splitMode: nextSplitMode,
              splitAmounts,
              createdAt: expense.createdAt
            })
          : expense
      );

      try {
        await updateDoc(doc(db, "groups", activeGroup.id), {
          expenses: nextExpenses,
          updatedAt: serverTimestamp()
        });
        resetExpenseForm();
      } catch (error) {
        setCloudStatus("error");
        setCloudError(
          error instanceof Error
            ? error.message
            : "Unable to update expense."
        );
      }
    },
    [
      activeGroup,
      editingExpenseId,
      expenseTitle,
      expenseAmount,
      expenseCurrency,
      expenseFxRate,
      baseCurrency,
      resetExpenseForm
    ]
  );

  const startEditExpense = useCallback(
    (groupId: string, expenseId: string) => {
      const group = state.groups.find((item) => item.id === groupId);
      if (!group) return;
      const expense = group.expenses.find((item) => item.id === expenseId);
      if (!expense) return;

      if (state.activeGroupId !== groupId) {
        setState((prev) => ({
          ...prev,
          activeGroupId: groupId
        }));
      }

      setView("group");
      setEditingExpenseId(expenseId);
      setExpenseTitle(expense.title);
      const expenseCurrencyValue = expense.currency || baseCurrency;
      const displayAmount =
        expense.originalAmount ?? expense.amount ?? 0;
      setExpenseAmount(formatMoney(displayAmount));
      setExpenseCurrency(expenseCurrencyValue);
      setExpenseFxRate(
        expense.fxRate ? String(expense.fxRate) : "1"
      );
      setPaidBy(expense.paidBy);
      const expenseSplitBetween = Array.isArray(expense.splitBetween)
        ? expense.splitBetween
        : [];
      const splitIds =
        expenseSplitBetween.length > 0
          ? expenseSplitBetween
          : expense.splitAmounts
            ? Object.keys(expense.splitAmounts)
            : [expense.paidBy];
      const nextSplitMode =
        expense.splitMode || (expense.splitAmounts ? "custom" : "equal");
      setSplitBetween(splitIds);
      setSplitMode(nextSplitMode);
      setCustomSplitAmounts(
        nextSplitMode === "custom"
          ? buildCustomAmountsFromExpense(splitIds, expense)
          : {}
      );
    },
    [state.groups, state.activeGroupId, baseCurrency]
  );

  const confirmDeleteExpense = useCallback(
    async (groupId: string, expenseId: string) => {
      const ok = window.confirm("Delete this expense?");
      if (!ok) return;
      const group = state.groups.find((item) => item.id === groupId);
      if (!group) return;
      const nextExpenses = group.expenses.filter(
        (expense) => expense.id !== expenseId
      );
      await updateDoc(doc(db, "groups", groupId), {
        expenses: nextExpenses,
        updatedAt: serverTimestamp()
      });
      if (editingExpenseId === expenseId) {
        resetExpenseForm();
      }
    },
    [editingExpenseId, resetExpenseForm, state.groups]
  );

  useEffect(() => {
    if (!activeGroup) return;
    if (editingExpenseId) return;
    setPaidBy(activeGroup.members[0]?.id || "");
    setSplitBetween(activeGroup.members.map((member) => member.id));
    setSplitMode("equal");
    setCustomSplitAmounts({});
    setExpenseCurrency(activeGroup.currency || "USD");
    setExpenseFxRate("1");
  }, [activeGroup, editingExpenseId]);

  useEffect(() => {
    if (!activeGroup) return;
    setCustomSplitAmounts((prev) => {
      const next: Record<string, string> = {};
      splitBetween.forEach((memberId) => {
        next[memberId] = prev[memberId] ?? "";
      });
      return next;
    });
  }, [activeGroup, splitBetween]);

  useEffect(() => {
    if (!activeGroup) return;
    setGroupCurrencyDraft(activeGroup.currency || "USD");
  }, [activeGroup]);

  const balances = useMemo(() => {
    return activeGroup ? computeBalances(activeGroup) : [];
  }, [activeGroup]);

  const settlements = useMemo(() => {
    return activeGroup ? computeSettlements(balances) : [];
  }, [activeGroup, balances]);

  const expenseAmountNumber = useMemo(
    () => parseAmount(expenseAmount),
    [expenseAmount]
  );
  const fxRateNumber = useMemo(() => {
    if (expenseCurrency === baseCurrency) return 1;
    return parseAmount(expenseFxRate);
  }, [expenseCurrency, expenseFxRate, baseCurrency]);
  const expenseBaseAmount = useMemo(() => {
    if (!fxRateNumber || fxRateNumber <= 0) return 0;
    return roundToCents(expenseAmountNumber * fxRateNumber);
  }, [expenseAmountNumber, fxRateNumber]);
  const fxRateValid =
    expenseCurrency === baseCurrency || (fxRateNumber > 0 && fxRateNumber !== 0);

  const customTotal = useMemo(() => {
    return splitBetween.reduce((sum, memberId) => {
      return sum + parseAmount(customSplitAmounts[memberId] || "0");
    }, 0);
  }, [splitBetween, customSplitAmounts]);

  const customTotalMatches =
    splitMode === "custom" &&
    splitBetween.length > 0 &&
    Math.abs(roundToCents(customTotal) - roundToCents(expenseBaseAmount)) <=
      0.01;

  const canSubmitExpense =
    expenseTitle.trim().length > 0 &&
    expenseAmountNumber > 0 &&
    fxRateValid &&
    paidBy.length > 0 &&
    (splitMode === "equal" ||
      (splitBetween.length > 0 && customTotalMatches));

  const allExpenses = useMemo<MasterExpense[]>(() => {
    return state.groups.flatMap((group) =>
      group.expenses.map((expense) => ({
        ...expense,
        groupId: group.id,
        groupName: group.name,
        groupCurrency: group.currency || "USD"
      }))
    );
  }, [state.groups]);

  const sortedAllExpenses = useMemo(() => {
    return [...allExpenses].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [allExpenses]);

  const currencySet = useMemo(() => {
    return new Set(state.groups.map((group) => group.currency || "USD"));
  }, [state.groups]);

  const singleCurrency = useMemo(() => {
    if (currencySet.size === 1) {
      return Array.from(currencySet)[0] || "USD";
    }
    return "USD";
  }, [currencySet]);

  const totalSpent = useMemo(() => {
    if (currencySet.size > 1) return null;
    return allExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  }, [allExpenses, currencySet]);

  const totalExpenses = allExpenses.length;
  const totalGroups = state.groups.length;
  const totalMembers = useMemo(() => {
    return state.groups.reduce((sum, group) => sum + group.members.length, 0);
  }, [state.groups]);

  const groupTotals = useMemo(() => {
    return state.groups
      .map((group) => ({
        group,
        total: group.expenses.reduce((sum, expense) => sum + expense.amount, 0),
        currency: group.currency || "USD"
      }))
      .sort((a, b) => b.total - a.total);
  }, [state.groups]);

  const memberPaidTotals = useMemo(() => {
    const totals: Record<
      string,
      { name: string; groupName: string; total: number; currency: string }
    > = {};
    state.groups.forEach((group) => {
      const memberMap: Record<string, string> = {};
      group.members.forEach((member) => {
        memberMap[member.id] = member.name;
      });
      group.expenses.forEach((expense) => {
        const key = `${group.id}:${expense.paidBy}`;
        if (!totals[key]) {
          totals[key] = {
            name: memberMap[expense.paidBy] || "Unknown",
            groupName: group.name,
            total: 0,
            currency: group.currency || "USD"
          };
        }
        totals[key].total += expense.amount;
      });
    });
    return Object.values(totals).sort((a, b) => b.total - a.total);
  }, [state.groups]);

  const memberNameByGroup = useMemo(() => {
    const map: Record<string, Record<string, string>> = {};
    state.groups.forEach((group) => {
      const members: Record<string, string> = {};
      group.members.forEach((member) => {
        members[member.id] = member.name;
      });
      map[group.id] = members;
    });
    return map;
  }, [state.groups]);

  const cloudLabel =
    cloudStatus === "ready"
      ? "Synced"
      : cloudStatus === "error"
        ? "Offline"
        : "Syncing...";

  const handleAuth = useCallback(async () => {
    setAuthError("");
    setAuthResetMessage("");
    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthError("Enter an email and password.");
      return;
    }
    setAuthBusy(true);
    try {
      if (authMode === "signup") {
        await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      } else {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      }
      setAuthEmail("");
      setAuthPassword("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to authenticate.";
      setAuthError(message);
    } finally {
      setAuthBusy(false);
    }
  }, [authEmail, authPassword, authMode]);

  const handlePasswordReset = useCallback(async () => {
    setAuthError("");
    setAuthResetMessage("");
    if (!authEmail.trim()) {
      setAuthError("Enter your email to reset the password.");
      return;
    }
    setAuthBusy(true);
    try {
      await sendPasswordResetEmail(auth, authEmail);
      setAuthResetMessage("Password reset email sent.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to send reset email.";
      setAuthError(message);
    } finally {
      setAuthBusy(false);
    }
  }, [authEmail]);

  const handleSignOut = useCallback(async () => {
    await signOut(auth);
    setView("groups");
    setViewInitialized(false);
  }, []);

  const handleDeleteGroup = useCallback(() => {
    if (!activeGroup) return;
    const confirmText = `Delete group \"${activeGroup.name}\"? This will remove all members and expenses.`;
    const ok = window.confirm(confirmText);
    if (!ok) return;

    deleteDoc(doc(db, "groups", activeGroup.id)).catch((error) => {
      setCloudStatus("error");
      setCloudError(
        error instanceof Error ? error.message : "Unable to delete group."
      );
    });
    resetExpenseForm();
    setView("groups");
  }, [activeGroup, resetExpenseForm]);

  const handleCopyInvite = useCallback(async () => {
    if (!activeGroup?.inviteCode) return;
    try {
      await navigator.clipboard.writeText(activeGroup.inviteCode);
      setCopyMessage("Copied invite code!");
      setTimeout(() => setCopyMessage(""), 2000);
    } catch {
      setCopyMessage("Copy failed.");
      setTimeout(() => setCopyMessage(""), 2000);
    }
  }, [activeGroup]);

  const saveGroupSettings = useCallback(async () => {
    if (!activeGroup) return;
    try {
      await updateDoc(doc(db, "groups", activeGroup.id), {
        currency: groupCurrencyDraft,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      setCloudStatus("error");
      setCloudError(
        error instanceof Error ? error.message : "Unable to save settings."
      );
    }
  }, [activeGroup, groupCurrencyDraft]);

  const exportGroupCsv = useCallback(() => {
    if (!activeGroup) return;
    const memberNames: Record<string, string> = {};
    activeGroup.members.forEach((member) => {
      memberNames[member.id] = member.name;
    });
    const rows: (string | number)[][] = [
      [
        "Group",
        "Date",
        "Title",
        "Amount",
        "Base Currency",
        "Original Amount",
        "Original Currency",
        "Paid By",
        "Split Between",
        "Split Mode"
      ]
    ];
    activeGroup.expenses.forEach((expense) => {
      rows.push([
        activeGroup.name,
        expense.createdAt,
        expense.title,
        formatMoney(expense.amount),
        activeGroup.currency,
        formatMoney(expense.originalAmount ?? expense.amount),
        expense.currency || activeGroup.currency,
        memberNames[expense.paidBy] || "",
        expense.splitBetween
          .map((id) => memberNames[id] || id)
          .join(" | "),
        expense.splitMode || "equal"
      ]);
    });
    downloadCsv(
      `${activeGroup.name.replace(/\\s+/g, "-").toLowerCase()}-expenses.csv`,
      rows
    );
  }, [activeGroup]);

  const exportAllCsv = useCallback(() => {
    const rows: (string | number)[][] = [
      [
        "Group",
        "Date",
        "Title",
        "Amount",
        "Base Currency",
        "Original Amount",
        "Original Currency",
        "Paid By",
        "Split Between",
        "Split Mode"
      ]
    ];

    allExpenses.forEach((expense) => {
      const members = memberNameByGroup[expense.groupId] || {};
      rows.push([
        expense.groupName,
        expense.createdAt,
        expense.title,
        formatMoney(expense.amount),
        expense.groupCurrency,
        formatMoney(expense.originalAmount ?? expense.amount),
        expense.currency || expense.groupCurrency,
        members[expense.paidBy] || "",
        expense.splitBetween.map((id) => members[id] || id).join(" | "),
        expense.splitMode || "equal"
      ]);
    });

    downloadCsv("tripsplit-all-expenses.csv", rows);
  }, [allExpenses, memberNameByGroup]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const scrollToSection = useCallback((id: string) => {
    const element = document.getElementById(id);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const renderBottomNav = () => {
    if (!authUser) return null;
    return (
      <nav className="bottom-nav no-print">
        <button
          className={view === "groups" ? "active" : ""}
          onClick={() => {
            setView("groups");
            setState((prev) => ({ ...prev, activeGroupId: null }));
          }}
        >
          <Icon name="home" />
          <span>Groups</span>
        </button>
        <button
          className={view === "master" ? "active" : ""}
          onClick={() => setView("master")}
        >
          <Icon name="chart" />
          <span>Dashboard</span>
        </button>
        <button
          className={view === "group" ? "active" : ""}
          onClick={() => {
            if (activeGroup) {
              scrollToSection("new-expense");
            } else {
              setView("groups");
            }
          }}
        >
          <Icon name="plus" />
          <span>Add</span>
        </button>
      </nav>
    );
  };

  if (!authReady) {
    return (
      <div className="page">
        <header className="page-header">
          <h1 className="app-title">
            <span className="title-icon">
              <Icon name="spark" />
            </span>
            TripSplit
          </h1>
          <p className="subtitle">Connecting to your account...</p>
        </header>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="page auth-page">
        <header className="page-header">
          <h1 className="app-title">
            <span className="title-icon">
              <Icon name="spark" />
            </span>
            TripSplit
          </h1>
          <p className="subtitle">
            Sign in to sync your trips across devices.
          </p>
        </header>
        <section className="card auth-card">
          <div className="section-heading">
            <Icon name="key" />
            <h2>{authMode === "signup" ? "Create account" : "Sign in"}</h2>
          </div>
          <input
            type="email"
            value={authEmail}
            onChange={(event) => setAuthEmail(event.target.value)}
            placeholder="Email address"
            autoComplete="email"
          />
          <input
            type="password"
            value={authPassword}
            onChange={(event) => setAuthPassword(event.target.value)}
            placeholder="Password"
            autoComplete={
              authMode === "signup" ? "new-password" : "current-password"
            }
          />
          {authError ? <div className="auth-error">{authError}</div> : null}
          {authResetMessage ? (
            <div className="auth-success">{authResetMessage}</div>
          ) : null}
          <button className="primary" onClick={handleAuth} disabled={authBusy}>
            {authBusy
              ? "Please wait..."
              : authMode === "signup"
                ? "Create account"
                : "Sign in"}
          </button>
          {authMode === "signin" && (
            <button className="link auth-toggle" onClick={handlePasswordReset}>
              Forgot password?
            </button>
          )}
          <button
            className="link auth-toggle"
            onClick={() =>
              setAuthMode((prev) => (prev === "signup" ? "signin" : "signup"))
            }
          >
            {authMode === "signup"
              ? "Already have an account? Sign in"
              : "New here? Create an account"}
          </button>
        </section>
      </div>
    );
  }

  if (view === "master") {
    return (
      <div className="page">
        <header className="page-header">
          <button className="link" onClick={() => setView("groups")}
            >Back to groups</button>
          <div className="header-actions">
            <div className={`cloud-status ${cloudStatus}`}>{cloudLabel}</div>
            <button className="link" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
          <h1 className="app-title">
            <span className="title-icon">
              <Icon name="chart" />
            </span>
            Master Dashboard
          </h1>
          {cloudStatus === "error" && cloudError ? (
            <div className="cloud-error">{cloudError}</div>
          ) : null}
          <p className="subtitle">
            Overview, totals, and admin control across all trips.
          </p>
        </header>

        <section className="card">
          <div className="section-heading">
            <Icon name="wallet" />
            <h2>Overview</h2>
          </div>
          <div className="stat-row">
            <span>Total spent</span>
            <strong>
              {totalSpent === null
                ? "Mixed currencies"
                : formatCurrencyValue(totalSpent, singleCurrency)}
            </strong>
          </div>
          <div className="stat-row">
            <span>Groups</span>
            <strong>{totalGroups}</strong>
          </div>
          <div className="stat-row">
            <span>Expenses</span>
            <strong>{totalExpenses}</strong>
          </div>
          <div className="stat-row">
            <span>Members</span>
            <strong>{totalMembers}</strong>
          </div>
        </section>

        <section className="card">
          <div className="section-heading">
            <Icon name="download" />
            <h2>Export</h2>
          </div>
          <div className="select-row">
            <button className="pill" onClick={exportAllCsv}>
              <Icon name="download" /> CSV
            </button>
            <button className="pill" onClick={handlePrint}>
              <Icon name="printer" /> Print/PDF
            </button>
          </div>
        </section>

        <section>
          <div className="section-heading">
            <Icon name="list" />
            <h2>Group totals</h2>
          </div>
          {groupTotals.length === 0 ? (
            <p className="muted">No groups yet.</p>
          ) : (
            groupTotals.map(({ group, total, currency }) => (
              <div className="row" key={group.id}>
                <span>{group.name}</span>
                <strong>{formatCurrencyValue(total, currency)}</strong>
              </div>
            ))
          )}
        </section>

        <section>
          <div className="section-heading">
            <Icon name="crown" />
            <h2>Top payers</h2>
          </div>
          {memberPaidTotals.length === 0 ? (
            <p className="muted">No expenses yet.</p>
          ) : (
            memberPaidTotals.map((row, index) => (
              <div className="row" key={`${row.groupName}-${row.name}-${index}`}>
                <div>
                  <div className="row-title">{row.name}</div>
                  <div className="row-meta">{row.groupName}</div>
                </div>
                <strong>{formatCurrencyValue(row.total, row.currency)}</strong>
              </div>
            ))
          )}
        </section>

        <section>
          <div className="section-heading">
            <Icon name="receipt" />
            <h2>All expenses</h2>
          </div>
          {sortedAllExpenses.length === 0 ? (
            <p className="muted">No expenses yet.</p>
          ) : (
            sortedAllExpenses.map((expense) => (
              <div className="card" key={expense.id}>
                <div className="expense-row">
                  <div>
                    <div className="row-title">{expense.title}</div>
                    <div className="row-meta">
                      {expense.groupName} · Paid by{" "}
                      {memberNameByGroup[expense.groupId]?.[expense.paidBy] ||
                        "Unknown"}
                      {" · "}
                      {(expense.currency || expense.groupCurrency).toUpperCase()}
                    </div>
                  </div>
                  <div className="expense-actions">
                    <strong>
                      {formatCurrencyValue(
                        expense.amount,
                        expense.groupCurrency
                      )}
                    </strong>
                    {expense.currency &&
                    expense.currency !== expense.groupCurrency &&
                    expense.originalAmount ? (
                      <span className="expense-sub">
                        {formatCurrencyValue(
                          expense.originalAmount,
                          expense.currency
                        )}
                      </span>
                    ) : null}
                    <div className="action-row">
                      <button
                        className="pill"
                        onClick={() =>
                          startEditExpense(expense.groupId, expense.id)
                        }
                      >
                        Edit
                      </button>
                      <button
                        className="pill danger"
                        onClick={() =>
                          confirmDeleteExpense(expense.groupId, expense.id)
                        }
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </section>
        {renderBottomNav()}
      </div>
    );
  }

  if (view !== "group" || !activeGroup) {
    return (
      <div className="page">
        <header className="page-header">
          <h1 className="app-title">
            <span className="title-icon">
              <Icon name="spark" />
            </span>
            TripSplit
          </h1>
          <div className="header-actions">
            <div className={`cloud-status ${cloudStatus}`}>{cloudLabel}</div>
            <button className="link" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
          {cloudStatus === "error" && cloudError ? (
            <div className="cloud-error">{cloudError}</div>
          ) : null}
          <p className="subtitle">
            Track shared travel expenses and settle up fast.
          </p>
        </header>

        <section className="card">
          <div className="section-heading">
            <Icon name="users" />
            <h2>Create a group</h2>
          </div>
          <input
            value={groupName}
            onChange={(event) => setGroupName(event.target.value)}
            placeholder="e.g. Tokyo 2026"
          />
          <div className="select-row">
            <select
              value={groupCurrencyDraft}
              onChange={(event) => setGroupCurrencyDraft(event.target.value)}
            >
              {currencyOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.code} · {option.label}
                </option>
              ))}
            </select>
          </div>
          <button className="primary" onClick={addGroup}>
            Add group
          </button>
        </section>

        <section className="card">
          <div className="section-heading">
            <Icon name="share" />
            <h2>Join with code</h2>
          </div>
          <input
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value)}
            placeholder="Enter invite code"
          />
          {joinError ? <div className="auth-error">{joinError}</div> : null}
          <button className="primary" onClick={joinGroupByCode}>
            Join group
          </button>
        </section>

        <section className="card">
          <div className="section-heading">
            <Icon name="chart" />
            <h2>Master dashboard</h2>
          </div>
          <p className="muted">
            See totals across all groups and manage every expense.
          </p>
          <button className="primary" onClick={() => setView("master")}>
            Open dashboard
          </button>
        </section>

        <section>
          <div className="section-heading">
            <Icon name="list" />
            <h2>Your groups</h2>
          </div>
          {state.groups.length === 0 ? (
            <p className="muted">No groups yet.</p>
          ) : (
            state.groups.map((group) => (
              <button
                className="row button-row"
                key={group.id}
                onClick={() => {
                  setState((prev) => ({
                    ...prev,
                    activeGroupId: group.id
                  }));
                  setView("group");
                }}
              >
                <div>
                  <div className="row-title">{group.name}</div>
                  <div className="row-meta">
                    {group.members.length} people · {group.expenses.length} expenses
                  </div>
                </div>
              </button>
            ))
          )}
        </section>
        {renderBottomNav()}
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <button
          className="link"
          onClick={() => {
            setState((prev) => ({
              ...prev,
              activeGroupId: null
            }));
            setView("groups");
            resetExpenseForm();
          }}
        >
          Back to groups
        </button>
        <h1 className="app-title">
          <span className="title-icon">
            <Icon name="users" />
          </span>
          {activeGroup.name}
        </h1>
        <div className="header-actions">
          <div className={`cloud-status ${cloudStatus}`}>{cloudLabel}</div>
          <button className="link danger" onClick={handleDeleteGroup}>
            Delete group
          </button>
          <button className="link" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
        {cloudStatus === "error" && cloudError ? (
          <div className="cloud-error">{cloudError}</div>
        ) : null}
      </header>

      <section className="card">
        <div className="section-heading">
          <Icon name="users" />
          <h2>Add members</h2>
        </div>
        <input
          value={memberName}
          onChange={(event) => setMemberName(event.target.value)}
          placeholder="Friend name"
        />
        <button className="primary" onClick={addMember}>
          Add member
        </button>
      </section>

      <section className="card">
        <div className="section-heading">
          <Icon name="settings" />
          <h2>Group settings</h2>
        </div>
        <div className="field">
          <span>Base currency</span>
          <div className="select-row">
            <select
              value={groupCurrencyDraft}
              onChange={(event) => setGroupCurrencyDraft(event.target.value)}
            >
              {currencyOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.code} · {option.label}
                </option>
              ))}
            </select>
            <button className="pill" onClick={saveGroupSettings}>
              Save
            </button>
          </div>
          <div className="help-text">
            Changing the base currency will not convert past expenses.
          </div>
        </div>
        <div className="field">
          <span>Invite code</span>
          <div className="select-row">
            <input value={activeGroup.inviteCode} readOnly />
            <button className="pill" onClick={handleCopyInvite}>
              Copy
            </button>
          </div>
          {copyMessage ? <div className="help-text">{copyMessage}</div> : null}
        </div>
        <div className="field">
          <span>Export</span>
          <div className="select-row">
            <button className="pill" onClick={exportGroupCsv}>
              <Icon name="download" /> CSV
            </button>
            <button className="pill" onClick={handlePrint}>
              <Icon name="printer" /> Print/PDF
            </button>
          </div>
        </div>
      </section>

      <section id="new-expense">
        <div className="section-heading">
          <Icon name="balance" />
          <h2>Balances</h2>
        </div>
        {balances.length === 0 ? (
          <p className="muted">Add members to start splitting.</p>
        ) : (
          balances.map(({ member, balance }) => (
            <div className="row" key={member.id}>
              <span>{member.name}</span>
              <strong className={balance >= 0 ? "positive" : "negative"}>
                {balance >= 0 ? "+" : "-"}
                {formatCurrencyValue(Math.abs(balance), baseCurrency)}
              </strong>
            </div>
          ))
        )}
      </section>

      <section>
        <div className="section-heading">
          <Icon name="wallet" />
          <h2>Settle up</h2>
        </div>
        {settlements.length === 0 ? (
          <p className="muted">Everyone is even or no expenses yet.</p>
        ) : (
          settlements.map((settlement, index) => (
            <div className="row highlight" key={`${settlement.from.id}-${index}`}>
              <span>
                {settlement.from.name} pays {settlement.to.name}
              </span>
              <strong>{formatCurrencyValue(settlement.amount, baseCurrency)}</strong>
            </div>
          ))
        )}
      </section>

      <section>
        <div className="section-heading">
          <Icon name="receipt" />
          <h2>{editingExpenseId ? "Edit expense" : "New expense"}</h2>
        </div>
        {activeGroup.members.length === 0 ? (
          <p className="muted">Add members before logging expenses.</p>
        ) : (
          <div className="card">
            {editingExpenseId && (
              <div className="edit-banner">
                <span>Editing expense</span>
                <button className="pill" onClick={resetExpenseForm}>
                  Cancel
                </button>
              </div>
            )}
            <input
              value={expenseTitle}
              onChange={(event) => setExpenseTitle(event.target.value)}
              placeholder="Expense title"
            />
            <input
              value={expenseAmount}
              onChange={(event) => setExpenseAmount(event.target.value)}
              placeholder="$0.00"
              inputMode="decimal"
            />

            <div className="field">
              <span>Currency</span>
              <div className="select-row">
                <select
                  value={expenseCurrency}
                  onChange={(event) => setExpenseCurrency(event.target.value)}
                >
                  {currencyOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.code} · {option.label}
                    </option>
                  ))}
                </select>
                {expenseCurrency !== baseCurrency && (
                  <input
                    value={expenseFxRate}
                    onChange={(event) => setExpenseFxRate(event.target.value)}
                    placeholder={`Rate to ${baseCurrency}`}
                    inputMode="decimal"
                  />
                )}
              </div>
              <div className="help-text">
                Base currency: {baseCurrency}.{" "}
                {expenseCurrency === baseCurrency
                  ? "No conversion needed."
                  : fxRateValid
                    ? `Converted total: ${formatCurrencyValue(
                        expenseBaseAmount,
                        baseCurrency
                      )}`
                    : "Enter a valid exchange rate."}
              </div>
            </div>

            <div className="field">
              <span>Paid by</span>
              <div className="pill-row">
                {activeGroup.members.map((member) => (
                  <button
                    key={member.id}
                    className={
                      paidBy === member.id ? "pill active" : "pill"
                    }
                    onClick={() => setPaidBy(member.id)}
                  >
                    {member.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <span>Split between</span>
              <div className="pill-row">
                {activeGroup.members.map((member) => {
                  const active = splitBetween.includes(member.id);
                  return (
                    <button
                      key={member.id}
                      className={active ? "pill active" : "pill"}
                      onClick={() => {
                        setSplitBetween((prev) =>
                          prev.includes(member.id)
                            ? prev.filter((id) => id !== member.id)
                            : [...prev, member.id]
                        );
                      }}
                    >
                      {member.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="field">
              <span>Split mode</span>
              <div className="pill-row">
                <button
                  className={splitMode === "equal" ? "pill active" : "pill"}
                  onClick={() => setSplitMode("equal")}
                >
                  Equal
                </button>
                <button
                  className={splitMode === "custom" ? "pill active" : "pill"}
                  onClick={() => {
                    setSplitMode("custom");
                    setCustomSplitAmounts((prev) => {
                      const hasAny = splitBetween.some(
                        (memberId) => (prev[memberId] || "").trim().length > 0
                      );
                      if (hasAny) {
                        const next: Record<string, string> = {};
                        splitBetween.forEach((memberId) => {
                          next[memberId] = prev[memberId] ?? "";
                        });
                        return next;
                      }
                      return buildEqualCustomAmounts(
                        splitBetween,
                        expenseBaseAmount
                      );
                    });
                  }}
                >
                  Custom
                </button>
              </div>
            </div>

            {splitMode === "custom" && (
              <div className="custom-card">
                {splitBetween.length === 0 ? (
                  <p className="warning">Select at least one person to split.</p>
                ) : (
                  splitBetween.map((memberId) => {
                    const member = activeGroup.members.find(
                      (item) => item.id === memberId
                    );
                    return (
                      <div className="split-row" key={memberId}>
                        <span>{member?.name || "Member"}</span>
                        <input
                          value={customSplitAmounts[memberId] || ""}
                          onChange={(event) =>
                            setCustomSplitAmounts((prev) => ({
                              ...prev,
                              [memberId]: event.target.value
                            }))
                          }
                          placeholder="$0.00"
                          inputMode="decimal"
                        />
                      </div>
                    );
                  })
                )}
                <div className="split-total">
                  <span>Custom total</span>
                  <strong>
                    {formatCurrencyValue(customTotal, baseCurrency)} /{" "}
                    {formatCurrencyValue(expenseBaseAmount, baseCurrency)}
                  </strong>
                </div>
                {!fxRateValid ? (
                  <p className="warning">
                    Enter a valid exchange rate to continue.
                  </p>
                ) : expenseBaseAmount <= 0 ? (
                  <p className="warning">
                    Enter the expense total to validate the custom split.
                  </p>
                ) : !customTotalMatches ? (
                  <p className="warning">
                    Custom split must match the total in {baseCurrency}.
                  </p>
                ) : null}
              </div>
            )}

            <button
              className={canSubmitExpense ? "primary" : "primary disabled"}
              onClick={() =>
                editingExpenseId
                  ? saveExpenseEdits(
                      paidBy,
                      splitBetween,
                      splitMode,
                      customSplitAmounts
                    )
                  : addExpense(
                      paidBy,
                      splitBetween,
                      splitMode,
                      customSplitAmounts
                    )
              }
              disabled={!canSubmitExpense}
            >
              {editingExpenseId ? "Save changes" : "Add expense"}
            </button>
          </div>
        )}
      </section>

      <section>
        <div className="section-heading">
          <Icon name="list" />
          <h2>Expenses</h2>
        </div>
        {activeGroup.expenses.length === 0 ? (
          <p className="muted">No expenses yet.</p>
        ) : (
          activeGroup.expenses.map((expense) => (
            <div className="row card" key={expense.id}>
              <div>
                <div className="row-title">{expense.title}</div>
                <div className="row-meta">
                  Paid by{" "}
                  {activeGroup.members.find((m) => m.id === expense.paidBy)?.name ||
                    ""}
                  {" · "}
                  {expense.splitMode === "custom"
                    ? "Custom split"
                    : `Split ${expense.splitBetween?.length || 0} ways`}
                  {" · "}
                  {(expense.currency || baseCurrency).toUpperCase()}
                </div>
              </div>
              <div className="expense-actions">
                <strong>{formatCurrencyValue(expense.amount, baseCurrency)}</strong>
                {expense.currency &&
                expense.currency !== baseCurrency &&
                expense.originalAmount ? (
                  <span className="expense-sub">
                    {formatCurrencyValue(expense.originalAmount, expense.currency)}
                  </span>
                ) : null}
                <div className="action-row">
                  <button
                    className="pill"
                    onClick={() => startEditExpense(activeGroup.id, expense.id)}
                  >
                    Edit
                  </button>
                  <button
                    className="pill danger"
                    onClick={() =>
                      confirmDeleteExpense(activeGroup.id, expense.id)
                    }
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </section>
      {renderBottomNav()}
    </div>
  );
}
