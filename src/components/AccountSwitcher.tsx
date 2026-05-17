"use client";

interface AccountSwitcherProps {
  accounts: {
    account_signature: string;
    account_login: string | null;
    account_server: string | null;
  }[];
  selected: string;
  onChange: (sig: string) => void;
}

export function AccountSwitcher({ accounts, selected, onChange }: AccountSwitcherProps) {
  if (accounts.length <= 1) return null;

  return (
    <div className="relative inline-flex items-center mb-5">
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-[var(--cj-raised)] border border-zinc-700 rounded-xl
                   px-4 py-2.5 pr-9 text-sm text-zinc-100 font-medium
                   focus:outline-none focus:border-[var(--cj-gold)]
                   hover:border-zinc-500 transition-colors cursor-pointer"
      >
        {accounts.map((a) => (
          <option key={a.account_signature} value={a.account_signature}>
            {a.account_login ?? "—"} — {a.account_server ?? "Unknown"}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-3 text-zinc-500"
        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  );
}
