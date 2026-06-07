"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

// ── Types ────────────────────────────────────────────────────────────────────
interface Provider {
  id: string;
  name: string;
  description: string | null;
  strategy: string | null;
  broker: string | null;
  broker_server: string | null;
  is_verified: boolean;
  grade: string;
  win_rate: number;
  profit_factor: number;
  max_drawdown: number;
  total_trades: number;
  total_subscribers: number;
  monthly_fee: number;
  account_currency: string;
}

interface Subscription {
  id: string;
  is_active: boolean;
  risk_mode: string;
  fixed_lot: number;
  risk_percent: number;
  max_lot_size: number;
  mt5_login: string | null;
  mt5_server: string | null;
  broker: string | null;
  vps_status: string;
  subscriber_balance: number;
  created_at: string;
  total_copied_trades: number;
  total_pnl: number;
  win_rate: number;
  open_positions: number;
  signal_providers: {
    id: string; name: string; grade: string; is_verified: boolean;
    broker: string | null; win_rate: number; profit_factor: number;
  } | null;
}

interface MyProvider {
  id: string;
  name: string;
  description: string | null;
  strategy: string | null;
  broker: string | null;
  broker_server: string | null;
  monthly_fee: number;
  grade: string;
  win_rate: number;
  profit_factor: number;
  total_trades: number;
  total_subscribers: number;
  is_active: boolean;
  provider_token: string | null;
}

// ── Grade helpers ────────────────────────────────────────────────────────────
const GRADE_COLOR: Record<string, string> = {
  elite:    "#F5C518",
  gold:     "#E8A020",
  silver:   "#A0B0C0",
  bronze:   "#CD7F32",
  ungraded: "#6b7280",
};

const GRADE_LABEL: Record<string, string> = {
  elite: "ELITE", gold: "GOLD", silver: "SILVER", bronze: "BRONZE", ungraded: "UNGRADED",
};

function GradeBadge({ grade }: { grade: string }) {
  const color = GRADE_COLOR[grade] ?? GRADE_COLOR.ungraded;
  return (
    <span style={{ color, border: `1px solid ${color}40`, background: `${color}15` }}
          className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
      {GRADE_LABEL[grade] ?? grade}
    </span>
  );
}

// ── Subscribe Modal ──────────────────────────────────────────────────────────
function SubscribeModal({ provider, onClose, onSuccess }: {
  provider: Provider;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [riskMode,   setRiskMode]   = useState("proportional");
  const [balance,    setBalance]    = useState("");
  const [fixedLot,   setFixedLot]   = useState("0.01");
  const [riskPct,    setRiskPct]    = useState("1.0");
  const [maxLot,     setMaxLot]     = useState("0.10");
  const [maxDdPct,   setMaxDdPct]   = useState("5.0");
  const [maxTrades,  setMaxTrades]  = useState("5");
  const [mt5Login,   setMt5Login]   = useState("");
  const [mt5Pass,    setMt5Pass]    = useState("");
  const [mt5Server,  setMt5Server]  = useState("");
  const [broker,     setBroker]     = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done,       setDone]       = useState(false);
  const [error,      setError]      = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/copy-trading/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider_id:           provider.id,
        risk_mode:             riskMode,
        fixed_lot:             parseFloat(fixedLot) || 0.01,
        risk_percent:          parseFloat(riskPct) || 1.0,
        max_lot_size:          parseFloat(maxLot) || 0.1,
        max_daily_loss_percent: parseFloat(maxDdPct) || 5.0,
        max_open_trades:       parseInt(maxTrades) || 5,
        mt5_login:             mt5Login || null,
        mt5_investor_password: mt5Pass || null,
        mt5_server:            mt5Server || null,
        broker:                broker || null,
        subscriber_balance:    parseFloat(balance) || 0,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const d = await res.json() as { error?: string };
      setError(d.error ?? "Failed to subscribe");
      return;
    }
    setDone(true);
    setTimeout(() => { onSuccess(); onClose(); }, 3000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70"
         onClick={onClose}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl p-6 space-y-4"
           style={{ background: "var(--cj-surface)", border: "1px solid var(--cj-border)" }}
           onClick={(e) => e.stopPropagation()}>

        {done ? (
          <div className="py-8 text-center">
            <div className="text-4xl mb-4">⚙️</div>
            <p className="text-zinc-100 font-semibold mb-2">Setting up your copy account…</p>
            <p className="text-zinc-500 text-sm">This takes 2–3 minutes. You&apos;ll see the status update in My Subscriptions.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-zinc-100">Subscribe to {provider.name}</h2>
              <p className="text-xs text-zinc-500 mt-1">{provider.broker} · {provider.broker_server}</p>
            </div>

            {/* Risk mode */}
            <div>
              <label className="text-xs font-medium text-zinc-400 block mb-2">Risk Mode</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: "proportional", label: "Proportional", desc: "Matches provider risk %" },
                  { value: "fixed",        label: "Fixed Lot",    desc: "Same lot every trade" },
                  { value: "risk_percent", label: "Risk %",       desc: "% of balance per trade" },
                ].map((m) => (
                  <button key={m.value} type="button"
                          onClick={() => setRiskMode(m.value)}
                          className="p-2 rounded-xl text-left transition-all"
                          style={{
                            border: riskMode === m.value ? "1px solid var(--cj-gold)" : "1px solid var(--cj-border)",
                            background: riskMode === m.value ? "var(--cj-gold-glow)" : "var(--cj-raised)",
                            color: riskMode === m.value ? "var(--cj-gold)" : "var(--cj-text-muted)",
                          }}>
                    <div className="text-xs font-semibold">{m.label}</div>
                    <div className="text-[10px] mt-0.5 opacity-70">{m.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Conditional input */}
            {riskMode === "proportional" && (
              <InputField label="Your Account Balance (USD)" value={balance} onChange={setBalance} placeholder="e.g. 1000" type="number"/>
            )}
            {riskMode === "fixed" && (
              <InputField label="Lot Size" value={fixedLot} onChange={setFixedLot} placeholder="0.01" type="number"/>
            )}
            {riskMode === "risk_percent" && (
              <InputField label="Risk per Trade (%)" value={riskPct} onChange={setRiskPct} placeholder="1.0" type="number"/>
            )}

            {/* Safety */}
            <div className="space-y-3 p-4 rounded-xl" style={{ background: "var(--cj-raised)", border: "1px solid var(--cj-border)" }}>
              <p className="text-xs font-semibold text-zinc-400">Safety Settings</p>
              <div className="grid grid-cols-3 gap-3">
                <InputField label="Max Lot" value={maxLot} onChange={setMaxLot} placeholder="0.10" type="number"/>
                <InputField label="Max Daily Loss %" value={maxDdPct} onChange={setMaxDdPct} placeholder="5.0" type="number"/>
                <InputField label="Max Open Trades" value={maxTrades} onChange={setMaxTrades} placeholder="5" type="number"/>
              </div>
            </div>

            {/* MT5 */}
            <div className="space-y-3 p-4 rounded-xl" style={{ background: "var(--cj-raised)", border: "1px solid var(--cj-border)" }}>
              <p className="text-xs font-semibold text-zinc-400">MT5 Connection</p>
              <InputField label="MT5 Account Number" value={mt5Login} onChange={setMt5Login} placeholder="12345678"/>
              <div>
                <label className="text-[10px] text-zinc-500 block mb-1 flex items-center gap-1">
                  MT5 Investor Password
                  <span title="Investor password is read-only — it cannot open or close trades on your account. It only allows the copy system to monitor your account."
                        className="cursor-help text-[var(--cj-gold)]">ⓘ</span>
                </label>
                <input value={mt5Pass} onChange={(e) => setMt5Pass(e.target.value)}
                       type="password" placeholder="Investor password (read-only)"
                       className="w-full bg-[var(--cj-surface)] border border-[var(--cj-border)] rounded-lg px-3 py-2 text-sm text-[var(--cj-text)] placeholder:text-[var(--cj-text-muted)] outline-none focus:border-[var(--cj-gold)] transition-[border-color]"/>
              </div>
              <InputField label="Broker Server" value={mt5Server} onChange={setMt5Server} placeholder="BrokerName-Live"/>
              <InputField label="Broker Name" value={broker} onChange={setBroker} placeholder="e.g. Exness"/>
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="flex gap-3">
              <button type="button" onClick={onClose}
                      className="flex-1 py-2.5 rounded-xl text-sm text-zinc-400 border border-[var(--cj-border)] hover:border-zinc-500 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={submitting}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold text-[#0A0A0F] disabled:opacity-50 transition-opacity"
                      style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)" }}>
                {submitting ? "Subscribing…" : "Start Copy Trading"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function InputField({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="text-[10px] text-zinc-500 block mb-1">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)}
             type={type} placeholder={placeholder}
             className="w-full bg-[var(--cj-surface)] border border-[var(--cj-border)] rounded-lg px-3 py-2 text-sm text-[var(--cj-text)] placeholder:text-[var(--cj-text-muted)] outline-none focus:border-[var(--cj-gold)] transition-[border-color]"/>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function CopyTradingPage() {
  const router = useRouter();
  const [tab,          setTab]          = useState<"marketplace" | "my" | "provider">("marketplace");
  const [providers,    setProviders]    = useState<Provider[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [myProvider,   setMyProvider]   = useState<MyProvider | null>(null);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [loadingSubs,  setLoadingSubs]  = useState(true);
  const [subModal,     setSubModal]     = useState<Provider | null>(null);
  const [authorized,   setAuthorized]   = useState<boolean | null>(null);

  // Provider registration form
  const [provName,     setProvName]     = useState("");
  const [provDesc,     setProvDesc]     = useState("");
  const [provStrategy, setProvStrategy] = useState("");
  const [provBroker,   setProvBroker]   = useState("");
  const [provServer,   setProvServer]   = useState("");
  const [provFee,      setProvFee]      = useState("0");
  const [provSubmitting, setProvSubmitting] = useState(false);
  const [provError,    setProvError]    = useState("");

  // Access guard
  useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace("/login"); return; }
      sb.from("user_profiles")
        .select("is_copy_trading_enabled")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          const enabled = (data as { is_copy_trading_enabled?: boolean } | null)?.is_copy_trading_enabled ?? false;
          if (!enabled) { router.replace("/dashboard"); return; }
          setAuthorized(true);
        });
    });
  }, [router]);

  const loadProviders = useCallback(async () => {
    setLoadingProviders(true);
    const res = await fetch("/api/copy-trading/providers");
    if (res.ok) {
      const d = await res.json() as { providers: Provider[] };
      setProviders(d.providers ?? []);
    }
    setLoadingProviders(false);
  }, []);

  const loadSubscriptions = useCallback(async () => {
    setLoadingSubs(true);
    const res = await fetch("/api/copy-trading/my-subscriptions");
    if (res.ok) {
      const d = await res.json() as { subscriptions: Subscription[] };
      setSubscriptions(d.subscriptions ?? []);
    }
    setLoadingSubs(false);
  }, []);

  const loadMyProvider = useCallback(async () => {
    const res = await fetch("/api/copy-trading/provider/register");
    if (res.ok) {
      const d = await res.json() as { provider: MyProvider | null };
      setMyProvider(d.provider);
      if (d.provider) {
        setProvName(d.provider.name);
        setProvDesc(d.provider.description ?? "");
        setProvStrategy(d.provider.strategy ?? "");
        setProvBroker(d.provider.broker ?? "");
        setProvServer(d.provider.broker_server ?? "");
        setProvFee(String(d.provider.monthly_fee));
      }
    }
  }, []);

  useEffect(() => {
    if (!authorized) return;
    loadProviders();
    loadSubscriptions();
    loadMyProvider();
  }, [authorized, loadProviders, loadSubscriptions, loadMyProvider]);

  async function handleSubscriptionToggle(subId: string, isActive: boolean) {
    await fetch("/api/copy-trading/my-subscriptions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription_id: subId, is_active: !isActive }),
    });
    loadSubscriptions();
  }

  async function handleProviderRegister(e: React.FormEvent) {
    e.preventDefault();
    setProvSubmitting(true);
    setProvError("");
    const res = await fetch("/api/copy-trading/provider/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: provName, description: provDesc, strategy: provStrategy,
        broker: provBroker, broker_server: provServer, monthly_fee: parseInt(provFee) || 0,
      }),
    });
    setProvSubmitting(false);
    if (!res.ok) {
      const d = await res.json() as { error?: string };
      setProvError(d.error ?? "Failed to register");
      return;
    }
    loadMyProvider();
  }

  if (authorized === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--cj-bg)" }}>
        <div className="w-6 h-6 rounded-full border-2 border-[var(--cj-gold)] border-t-transparent animate-spin"/>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--cj-bg)" }}>
      <div className="md:ml-[240px] px-4 sm:px-8 py-8 max-w-6xl">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-zinc-100">Copy Trading</h1>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                    style={{ background: "rgba(245,197,24,0.15)", border: "1px solid rgba(245,197,24,0.4)", color: "var(--cj-gold)" }}>
                PRIVATE BETA
              </span>
            </div>
            <p className="text-zinc-500 text-sm">Follow professional traders and copy their trades automatically.</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 p-1 rounded-xl w-fit"
             style={{ background: "var(--cj-surface)", border: "1px solid var(--cj-border)" }}>
          {([
            { key: "marketplace", label: "Marketplace" },
            { key: "my",          label: "My Subscriptions" },
            { key: "provider",    label: "Become a Provider" },
          ] as const).map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                    style={{
                      background: tab === key ? "var(--cj-gold-glow)" : "transparent",
                      color:      tab === key ? "var(--cj-gold)" : "var(--cj-text-muted)",
                      border:     tab === key ? "1px solid var(--cj-gold-muted)" : "1px solid transparent",
                    }}>
              {label}
            </button>
          ))}
        </div>

        {/* ── MARKETPLACE TAB ─────────────────────────────────────────── */}
        {tab === "marketplace" && (
          <div>
            {loadingProviders ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 rounded-full border-2 border-[var(--cj-gold)] border-t-transparent animate-spin"/>
              </div>
            ) : providers.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-4xl mb-4">📡</div>
                <p className="text-zinc-400 font-medium mb-2">No signal providers yet.</p>
                <p className="text-zinc-600 text-sm">Be the first to apply in the &quot;Become a Provider&quot; tab.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {providers.map((p) => (
                  <div key={p.id} className="rounded-2xl p-5 flex flex-col gap-4"
                       style={{ background: "var(--cj-surface)", border: "1px solid var(--cj-border)" }}>
                    {/* Header */}
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-[#0A0A0F] shrink-0"
                           style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)" }}>
                        {p.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-zinc-100 text-sm truncate">{p.name}</span>
                          {p.is_verified && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                                  style={{ background: "rgba(245,197,24,0.15)", color: "#F5C518", border: "1px solid rgba(245,197,24,0.3)" }}>
                              ✓ VERIFIED
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-500 mt-0.5">{p.broker} · {p.broker_server}</p>
                      </div>
                    </div>

                    {/* Grade */}
                    <div className="flex items-center gap-2">
                      <GradeBadge grade={p.grade}/>
                    </div>

                    {/* Stats grid */}
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "Win Rate",    value: `${p.win_rate.toFixed(1)}%`,      color: "text-emerald-400" },
                        { label: "Prof. Factor", value: p.profit_factor.toFixed(2),       color: "" },
                        { label: "Max DD",       value: `${p.max_drawdown.toFixed(1)}%`, color: "text-rose-400" },
                        { label: "Trades",       value: p.total_trades,                  color: "" },
                        { label: "Subscribers",  value: p.total_subscribers,             color: "" },
                        { label: "Monthly",      value: p.monthly_fee > 0 ? `₦${p.monthly_fee.toLocaleString()}` : "Free", color: "" },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="text-center p-2 rounded-lg" style={{ background: "var(--cj-raised)" }}>
                          <div className={`text-sm font-semibold ${color || "text-zinc-100"}`}>{value}</div>
                          <div className="text-[10px] text-zinc-600 mt-0.5">{label}</div>
                        </div>
                      ))}
                    </div>

                    {p.strategy && (
                      <p className="text-xs text-zinc-500 line-clamp-2">{p.strategy}</p>
                    )}

                    <button onClick={() => setSubModal(p)}
                            className="w-full py-2.5 rounded-xl text-sm font-bold text-[#0A0A0F] mt-auto transition-opacity hover:opacity-90"
                            style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)" }}>
                      Subscribe
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── MY SUBSCRIPTIONS TAB ────────────────────────────────────── */}
        {tab === "my" && (
          <div>
            {loadingSubs ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 rounded-full border-2 border-[var(--cj-gold)] border-t-transparent animate-spin"/>
              </div>
            ) : subscriptions.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-4xl mb-4">📋</div>
                <p className="text-zinc-400 font-medium mb-2">No active subscriptions.</p>
                <p className="text-zinc-600 text-sm">Browse the Marketplace to find a signal provider to follow.</p>
                <button onClick={() => setTab("marketplace")}
                        className="mt-4 px-5 py-2 rounded-xl text-sm font-semibold text-[#0A0A0F]"
                        style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)" }}>
                  Browse Marketplace
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {subscriptions.map((sub) => {
                  const prov = sub.signal_providers;
                  const statusLabel = !sub.is_active ? "Paused" : sub.vps_status === "pending" ? "Setting up" : "Active";
                  const statusColor = !sub.is_active ? "text-zinc-500" : sub.vps_status === "pending" ? "text-amber-400" : "text-emerald-400";
                  return (
                    <div key={sub.id} className="rounded-2xl p-5"
                         style={{ background: "var(--cj-surface)", border: "1px solid var(--cj-border)" }}>
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-zinc-100">{prov?.name ?? "Unknown Provider"}</span>
                            {prov && <GradeBadge grade={prov.grade}/>}
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            <span className={`font-medium ${statusColor}`}>{statusLabel}</span>
                            <span className="text-zinc-600">·</span>
                            <span className="text-zinc-500">{sub.broker ?? prov?.broker ?? "—"}</span>
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button onClick={() => handleSubscriptionToggle(sub.id, sub.is_active)}
                                  className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                                  style={{ border: "1px solid var(--cj-border)", color: "var(--cj-text-muted)", background: "var(--cj-raised)" }}>
                            {sub.is_active ? "Pause" : "Resume"}
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                        {[
                          { label: "Copied Trades", value: sub.total_copied_trades },
                          { label: "Total PnL",     value: `${sub.total_pnl >= 0 ? "+" : ""}$${sub.total_pnl.toFixed(2)}`,
                            color: sub.total_pnl >= 0 ? "text-emerald-400" : "text-rose-400" },
                          { label: "Win Rate",      value: `${sub.win_rate}%`, color: "text-emerald-400" },
                          { label: "Open Positions", value: sub.open_positions },
                        ].map(({ label, value, color }) => (
                          <div key={label} className="p-3 rounded-xl" style={{ background: "var(--cj-raised)" }}>
                            <div className={`text-sm font-semibold ${color ?? "text-zinc-100"}`}>{value}</div>
                            <div className="text-[10px] text-zinc-600 mt-0.5">{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── BECOME A PROVIDER TAB ────────────────────────────────────── */}
        {tab === "provider" && (
          <div className="max-w-lg space-y-6">
            {/* Benefits */}
            {!myProvider && (
              <div className="rounded-2xl p-5 space-y-3"
                   style={{ background: "var(--cj-surface)", border: "1px solid var(--cj-border)" }}>
                <h3 className="font-semibold text-zinc-100">Why become a signal provider?</h3>
                <div className="space-y-2">
                  {[
                    ["📡", "Broadcast your trades live to subscribers"],
                    ["💰", "Earn a monthly fee from each subscriber"],
                    ["✅", "Get NIRI Verified badge after performance review"],
                    ["📈", "Your stats are calculated automatically from signals"],
                  ].map(([icon, text]) => (
                    <div key={text as string} className="flex items-start gap-2.5 text-sm text-zinc-400">
                      <span className="text-base shrink-0">{icon}</span>
                      <span>{text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Registration form / existing provider */}
            <div className="rounded-2xl p-5"
                 style={{ background: "var(--cj-surface)", border: "1px solid var(--cj-border)" }}>
              {myProvider ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-zinc-100">{myProvider.name}</h3>
                      <p className="text-xs text-zinc-500 mt-0.5">{myProvider.broker} · {myProvider.broker_server}</p>
                    </div>
                    <GradeBadge grade={myProvider.grade}/>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Win Rate",    value: `${myProvider.win_rate}%` },
                      { label: "Trades",      value: myProvider.total_trades },
                      { label: "Subscribers", value: myProvider.total_subscribers },
                    ].map(({ label, value }) => (
                      <div key={label} className="p-3 rounded-xl text-center" style={{ background: "var(--cj-raised)" }}>
                        <div className="text-sm font-semibold text-zinc-100">{value}</div>
                        <div className="text-[10px] text-zinc-600 mt-0.5">{label}</div>
                      </div>
                    ))}
                  </div>

                  {myProvider.provider_token && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-zinc-400">Provider Token</p>
                      <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: "var(--cj-raised)", border: "1px solid var(--cj-border)" }}>
                        <code className="flex-1 text-xs text-[var(--cj-gold)] font-sans break-all select-all">
                          {myProvider.provider_token}
                        </code>
                        <button onClick={() => navigator.clipboard.writeText(myProvider!.provider_token!)}
                                className="text-[10px] px-2 py-1 rounded text-zinc-400 hover:text-zinc-200 shrink-0"
                                style={{ border: "1px solid var(--cj-border)" }}>
                          Copy
                        </button>
                      </div>
                      <p className="text-[10px] text-zinc-600">Paste this token into the NIRI Provider EA Inputs tab.</p>
                    </div>
                  )}

                  <a href="/NIRI_Provider_EA.mq5" download="NIRI_Provider_EA.mq5"
                     className="flex items-center gap-3 p-3 rounded-xl transition-all"
                     style={{ background: "var(--cj-gold-glow)", border: "1px solid var(--cj-gold-muted)" }}>
                    <span className="text-xl shrink-0">📦</span>
                    <div>
                      <p className="text-sm font-bold text-[var(--cj-gold)]">Download Provider EA</p>
                      <p className="text-[11px] text-zinc-500">NIRI_Provider_EA.mq5 — install in MT5 Experts folder</p>
                    </div>
                  </a>
                </div>
              ) : (
                <form onSubmit={handleProviderRegister} className="space-y-4">
                  <h3 className="font-semibold text-zinc-100">Apply as a Signal Provider</h3>

                  <InputField label="Display Name *" value={provName} onChange={setProvName} placeholder="e.g. AlphaTrader"/>
                  <InputField label="Strategy Description" value={provDesc} onChange={setProvDesc} placeholder="Describe your trading approach"/>
                  <InputField label="Strategy Type" value={provStrategy} onChange={setProvStrategy} placeholder="e.g. Scalping, Swing, News"/>
                  <InputField label="Broker" value={provBroker} onChange={setProvBroker} placeholder="e.g. Exness"/>
                  <InputField label="Broker Server" value={provServer} onChange={setProvServer} placeholder="e.g. Exness-Real8"/>
                  <InputField label="Monthly Fee (₦)" value={provFee} onChange={setProvFee} placeholder="0 = free" type="number"/>

                  {provError && <p className="text-xs text-red-400">{provError}</p>}

                  <button type="submit" disabled={provSubmitting || !provName.trim()}
                          className="w-full py-2.5 rounded-xl text-sm font-bold text-[#0A0A0F] disabled:opacity-50 transition-opacity hover:opacity-90"
                          style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)" }}>
                    {provSubmitting ? "Registering…" : "Register as Provider"}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Subscribe Modal */}
      {subModal && (
        <SubscribeModal
          provider={subModal}
          onClose={() => setSubModal(null)}
          onSuccess={() => { setSubModal(null); loadSubscriptions(); setTab("my"); }}
        />
      )}
    </div>
  );
}
