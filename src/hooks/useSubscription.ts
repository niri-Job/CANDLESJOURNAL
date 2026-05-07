"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";

// Developer account — always treated as Pro regardless of DB value
const DEV_USER_ID = "b9433d15-02e3-44ed-b66f-b4f51f22fac7";

export interface SubscriptionState {
  plan:    "free" | "pro";
  isPro:   boolean;
  loading: boolean;
  subEnd:  string | null;
  userId:  string | null;
  refetch: () => void;
}

export function useSubscription(): SubscriptionState {
  const [plan,    setPlan]    = useState<"free" | "pro">("free");
  const [loading, setLoading] = useState(true);
  const [subEnd,  setSubEnd]  = useState<string | null>(null);
  const [userId,  setUserId]  = useState<string | null>(null);
  const [tick,    setTick]    = useState(0);

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
        .select("subscription_status, subscription_end")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      const active = !!data?.subscription_end && new Date(data.subscription_end) > new Date();
      const isPro  = data?.subscription_status === "pro" && active;
      setPlan(isPro ? "pro" : "free");
      setSubEnd(data?.subscription_end ?? null);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [tick]);

  return {
    plan,
    isPro:   plan === "pro",
    loading,
    subEnd,
    userId,
    refetch: () => setTick((t) => t + 1),
  };
}
