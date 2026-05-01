import type { Metadata } from "next";
import LandingPage from "./LandingPage";

// SEO metadata — update og:image when brand assets arrive
export const metadata: Metadata = {
  title: "CandlesJournal — Trading Journal for African Forex Traders",
  description:
    "Track your MT5 trades, get AI coaching, and improve your forex performance. Built for African traders.",
};

export default function Page() {
  return <LandingPage />;
}
