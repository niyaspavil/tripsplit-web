import React, { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "trip-split-state-web-v1";

type Member = {
  id: string;
  name: string;
};

type Expense = {
  id: string;
  title: string;
  amount: number;
  paidBy: string;
  splitBetween: string[];
  splitMode?: "equal" | "custom";
  splitAmounts?: Record<string, number>;
  createdAt: string;
};

type Group = {
  id: string;
  name: string;
  members: Member[];
  expenses: Expense[];
};

type AppState = {
  groups: Group[];
  activeGroupId: string | null;
};

type Settlement = {
  from: Member;
  to: Member;
  amount: number;
};

type MasterExpense = Expense & {
  groupId: string;
  groupName: string;
};

const createId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

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

const computeBalances = (group: Group) => {
  const balances: Record<string, number> = {};
  group.members.forEach((member) => {
    balances[member.id] = 0;
  });

  for (const expense of group.expenses) {
    balances[expense.paidBy] += expense.amount;
    const hasCustomSplit =
      (expense.splitMode === "custom" || !!expense.splitAmounts) &&
      expense.splitAmounts &&
      Object.keys(expense.splitAmounts).length > 0;

    if (hasCustomSplit && expense.splitAmounts) {
      for (const [memberId, amount] of Object.entries(expense.splitAmounts)) {
        balances[memberId] -= amount;
      }
    } else {
      const splitCount = expense.splitBetween.length || 1;
      const share = expense.amount / splitCount;
      for (const memberId of expense.splitBetween) {
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
  const [state, setState] = useState<AppState>({
    groups: [],
    activeGroupId: null
  });
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<"groups" | "group" | "master">("groups");
  const [viewInitialized, setViewInitialized] = useState(false);

  const [groupName, setGroupName] = useState("");
  const [memberName, setMemberName] = useState("");
  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
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

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        setState(JSON.parse(raw));
      } catch {
        // ignore corrupted storage
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  useEffect(() => {
    if (!hydrated || viewInitialized) return;
    setView(state.activeGroupId ? "group" : "groups");
    setViewInitialized(true);
  }, [hydrated, viewInitialized, state.activeGroupId]);

  const addGroup = useCallback(() => {
    const trimmed = groupName.trim();
    if (!trimmed) return;
    const newGroup: Group = {
      id: createId(),
      name: trimmed,
      members: [],
      expenses: []
    };
    setState((prev) => ({
      ...prev,
      groups: [newGroup, ...prev.groups],
      activeGroupId: newGroup.id
    }));
    setView("group");
    setGroupName("");
  }, [groupName]);

  const addMember = useCallback(() => {
    if (!activeGroup) return;
    const trimmed = memberName.trim();
    if (!trimmed) return;
    const newMember: Member = { id: createId(), name: trimmed };
    setState((prev) => ({
      ...prev,
      groups: prev.groups.map((group) =>
        group.id === activeGroup.id
          ? { ...group, members: [...group.members, newMember] }
          : group
      )
    }));
    setMemberName("");
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
  }, [activeGroup]);

  const addExpense = useCallback(
    (
      nextPaidBy: string,
      nextSplitBetween: string[],
      nextSplitMode: "equal" | "custom",
      nextCustomSplitAmounts: Record<string, string>
    ) => {
      if (!activeGroup) return;
      const title = expenseTitle.trim();
      const amount = parseAmount(expenseAmount);
      if (!title || Number.isNaN(amount) || amount <= 0) return;

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

      const newExpense: Expense = {
        id: createId(),
        title,
        amount,
        paidBy: nextPaidBy,
        splitBetween: fallbackSplit,
        splitMode: nextSplitMode,
        splitAmounts,
        createdAt: new Date().toISOString()
      };

      setState((prev) => ({
        ...prev,
        groups: prev.groups.map((group) =>
          group.id === activeGroup.id
            ? { ...group, expenses: [newExpense, ...group.expenses] }
            : group
        )
      }));
      resetExpenseForm();
    },
    [activeGroup, expenseTitle, expenseAmount, resetExpenseForm]
  );

  const saveExpenseEdits = useCallback(
    (
      nextPaidBy: string,
      nextSplitBetween: string[],
      nextSplitMode: "equal" | "custom",
      nextCustomSplitAmounts: Record<string, string>
    ) => {
      if (!activeGroup || !editingExpenseId) return;
      const title = expenseTitle.trim();
      const amount = parseAmount(expenseAmount);
      if (!title || Number.isNaN(amount) || amount <= 0) return;

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

      setState((prev) => ({
        ...prev,
        groups: prev.groups.map((group) =>
          group.id === activeGroup.id
            ? {
                ...group,
                expenses: group.expenses.map((expense) =>
                  expense.id === editingExpenseId
                    ? {
                        ...expense,
                        title,
                        amount,
                        paidBy: nextPaidBy,
                        splitBetween: fallbackSplit,
                        splitMode: nextSplitMode,
                        splitAmounts
                      }
                    : expense
                )
              }
            : group
        )
      }));
      resetExpenseForm();
    },
    [activeGroup, editingExpenseId, expenseTitle, expenseAmount, resetExpenseForm]
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
      setExpenseAmount(formatMoney(expense.amount));
      setPaidBy(expense.paidBy);
      const splitIds =
        expense.splitBetween.length > 0
          ? expense.splitBetween
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
    [state.groups, state.activeGroupId]
  );

  const confirmDeleteExpense = useCallback(
    (groupId: string, expenseId: string) => {
      const ok = window.confirm("Delete this expense?");
      if (!ok) return;
      setState((prev) => ({
        ...prev,
        groups: prev.groups.map((group) =>
          group.id === groupId
            ? {
                ...group,
                expenses: group.expenses.filter(
                  (expense) => expense.id !== expenseId
                )
              }
            : group
        )
      }));
      if (editingExpenseId === expenseId) {
        resetExpenseForm();
      }
    },
    [editingExpenseId, resetExpenseForm]
  );

  useEffect(() => {
    if (!activeGroup) return;
    if (editingExpenseId) return;
    setPaidBy(activeGroup.members[0]?.id || "");
    setSplitBetween(activeGroup.members.map((member) => member.id));
    setSplitMode("equal");
    setCustomSplitAmounts({});
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

  const customTotal = useMemo(() => {
    return splitBetween.reduce((sum, memberId) => {
      return sum + parseAmount(customSplitAmounts[memberId] || "0");
    }, 0);
  }, [splitBetween, customSplitAmounts]);

  const customTotalMatches =
    splitMode === "custom" &&
    splitBetween.length > 0 &&
    Math.abs(roundToCents(customTotal) - roundToCents(expenseAmountNumber)) <=
      0.01;

  const canSubmitExpense =
    expenseTitle.trim().length > 0 &&
    expenseAmountNumber > 0 &&
    paidBy.length > 0 &&
    (splitMode === "equal" ||
      (splitBetween.length > 0 && customTotalMatches));

  const allExpenses = useMemo<MasterExpense[]>(() => {
    return state.groups.flatMap((group) =>
      group.expenses.map((expense) => ({
        ...expense,
        groupId: group.id,
        groupName: group.name
      }))
    );
  }, [state.groups]);

  const sortedAllExpenses = useMemo(() => {
    return [...allExpenses].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [allExpenses]);

  const totalSpent = useMemo(() => {
    return allExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  }, [allExpenses]);

  const totalExpenses = allExpenses.length;
  const totalGroups = state.groups.length;
  const totalMembers = useMemo(() => {
    return state.groups.reduce((sum, group) => sum + group.members.length, 0);
  }, [state.groups]);

  const groupTotals = useMemo(() => {
    return state.groups
      .map((group) => ({
        group,
        total: group.expenses.reduce((sum, expense) => sum + expense.amount, 0)
      }))
      .sort((a, b) => b.total - a.total);
  }, [state.groups]);

  const memberPaidTotals = useMemo(() => {
    const totals: Record<
      string,
      { name: string; groupName: string; total: number }
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
            total: 0
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

  if (view === "master") {
    return (
      <div className="page">
        <header className="page-header">
          <button className="link" onClick={() => setView("groups")}
            >Back to groups</button>
          <h1>Master Dashboard</h1>
          <p className="subtitle">
            Overview, totals, and admin control across all trips.
          </p>
        </header>

        <section className="card">
          <h2>Overview</h2>
          <div className="stat-row">
            <span>Total spent</span>
            <strong>${formatMoney(totalSpent)}</strong>
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

        <section>
          <h2>Group totals</h2>
          {groupTotals.length === 0 ? (
            <p className="muted">No groups yet.</p>
          ) : (
            groupTotals.map(({ group, total }) => (
              <div className="row" key={group.id}>
                <span>{group.name}</span>
                <strong>${formatMoney(total)}</strong>
              </div>
            ))
          )}
        </section>

        <section>
          <h2>Top payers</h2>
          {memberPaidTotals.length === 0 ? (
            <p className="muted">No expenses yet.</p>
          ) : (
            memberPaidTotals.map((row, index) => (
              <div className="row" key={`${row.groupName}-${row.name}-${index}`}>
                <div>
                  <div className="row-title">{row.name}</div>
                  <div className="row-meta">{row.groupName}</div>
                </div>
                <strong>${formatMoney(row.total)}</strong>
              </div>
            ))
          )}
        </section>

        <section>
          <h2>All expenses</h2>
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
                    </div>
                  </div>
                  <div className="expense-actions">
                    <strong>${formatMoney(expense.amount)}</strong>
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
      </div>
    );
  }

  if (view !== "group" || !activeGroup) {
    return (
      <div className="page">
        <header className="page-header">
          <h1>TripSplit</h1>
          <p className="subtitle">
            Track shared travel expenses and settle up fast.
          </p>
        </header>

        <section className="card">
          <h2>Create a group</h2>
          <input
            value={groupName}
            onChange={(event) => setGroupName(event.target.value)}
            placeholder="e.g. Tokyo 2026"
          />
          <button className="primary" onClick={addGroup}>
            Add group
          </button>
        </section>

        <section className="card">
          <h2>Master dashboard</h2>
          <p className="muted">
            See totals across all groups and manage every expense.
          </p>
          <button className="primary" onClick={() => setView("master")}>
            Open dashboard
          </button>
        </section>

        <section>
          <h2>Your groups</h2>
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
        <h1>{activeGroup.name}</h1>
      </header>

      <section className="card">
        <h2>Add members</h2>
        <input
          value={memberName}
          onChange={(event) => setMemberName(event.target.value)}
          placeholder="Friend name"
        />
        <button className="primary" onClick={addMember}>
          Add member
        </button>
      </section>

      <section>
        <h2>Balances</h2>
        {balances.length === 0 ? (
          <p className="muted">Add members to start splitting.</p>
        ) : (
          balances.map(({ member, balance }) => (
            <div className="row" key={member.id}>
              <span>{member.name}</span>
              <strong className={balance >= 0 ? "positive" : "negative"}>
                {balance >= 0 ? "+" : ""}${formatMoney(balance)}
              </strong>
            </div>
          ))
        )}
      </section>

      <section>
        <h2>Settle up</h2>
        {settlements.length === 0 ? (
          <p className="muted">Everyone is even or no expenses yet.</p>
        ) : (
          settlements.map((settlement, index) => (
            <div className="row highlight" key={`${settlement.from.id}-${index}`}>
              <span>
                {settlement.from.name} pays {settlement.to.name}
              </span>
              <strong>${formatMoney(settlement.amount)}</strong>
            </div>
          ))
        )}
      </section>

      <section>
        <h2>{editingExpenseId ? "Edit expense" : "New expense"}</h2>
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
                        expenseAmountNumber
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
                    ${formatMoney(customTotal)} / ${formatMoney(expenseAmountNumber)}
                  </strong>
                </div>
                {expenseAmountNumber <= 0 ? (
                  <p className="warning">
                    Enter the expense total to validate the custom split.
                  </p>
                ) : !customTotalMatches ? (
                  <p className="warning">Custom split must match the total.</p>
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
        <h2>Expenses</h2>
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
                    : `Split ${expense.splitBetween.length} ways`}
                </div>
              </div>
              <div className="expense-actions">
                <strong>${formatMoney(expense.amount)}</strong>
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
    </div>
  );
}
