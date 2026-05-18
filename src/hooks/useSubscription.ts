"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";

// Developer account — always treated as Pro regardless of DB value
const DEV_USER_ID = "b9433d15-02e3-44ed-b66f-b4f51f22fac7";

// 14-day trial from account creation
const TRIAL_DAYS = 14;

export interface SubscriptionState {
  plan:        "free" | "pro" | "trial";
  isPro:       boolean;
  isTrial:     boolean;
  trialDaysLeft: number;
  loading:     boolean;
  subEnd:      string | null;
  userId:      string | null;
  refetch:     () => void;
}

export function useSubscription(): SubscriptionState {
  const [plan,          setPlan]          = useState<"free" | "pro" | "trial">("free");
  const [trialDaysLeft, setTrialDaysLeft] = useState(0);
  const [loading,       setLoading]       = useState(true);
  const [subEnd,        setSubEnd]        = useState<string | null>(null);
  const [userId,        setUserId]        = useState<string | null>(null);
  const [tick,          setTick]          = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();

      if (!user || cancelled) { setLoading(false); return; }
      setUserId(user.id);

      // Developer account always Pro
      if (user.id === DEV_USER_ID) {
        setPlan("pro");
        setSubEnd(null);
        setLoading(false);
        return;
      }

      const { data } = await sb
        .from("user_profiles")
        .select("subscription_status, subscription_end, created_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      const active = !!data?.subscription_end && new Date(data.subscription_end) > new Date();
      const isPaid = data?.subscription_status === "pro" && active;

      if (isPaid) {
        setPlan("pro");
        setSubEnd(data?.subscription_end ?? null);
        setTrialDaysLeft(0);
      } else {
        // Trial: 14 days from profile creation
        const createdAt = (data as { created_at?: string } | null)?.created_at;
        const trialEnd  = createdAt
          ? new Date(new Date(createdAt).getTime() + TRIAL_DAYS * 86_400_000)
          : null;
        const daysLeft = trialEnd
          ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86_400_000))
          : 0;

        if (daysLeft > 0) {
          setPlan("trial");
          setTrialDaysLeft(daysLeft);
        } else {
          setPlan("free");
          setTrialDaysLeft(0);
        }
        setSubEnd(null);
      }

      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [tick]);

  return {
    plan,
    isPro:        plan === "pro" || plan === "trial",
    isTrial:      plan === "trial",
    trialDaysLeft,
    loading,
    subEnd,
    userId,
    refetch: () => setTick((t) => t + 1),
  };
}
