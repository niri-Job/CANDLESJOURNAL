import type { Metadata } from "next";
import LandingPage from "./LandingPage";

// SEO metadata — update og:image when brand assets arrive
export const metadata: Metadata = {
  title: "NIRI — AI Trading Journal for MT5 Traders",
  description:
    "Connect your MT5, sync trades automatically, and get AI coaching that tells you exactly what behavioral patterns are costing you money. Start free.",
};

export default function Page() {
  return <LandingPage />;
}
