import type { Metadata } from "next";
import LandingPage from "./LandingPage";

export const metadata: Metadata = {
  title: "NIRI — AI Trading Journal for MT5 Traders",
  description:
    "Connect your MT5, sync trades automatically, and get AI coaching that tells you exactly what behavioral patterns are costing you money. Start free.",
  alternates: { canonical: "https://niri.live" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "NIRI",
  url: "https://niri.live",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  description:
    "AI-powered trading journal for MT5 traders. Sync trades automatically, track performance, and get AI coaching that tells you exactly what behavioral patterns are costing you money.",
  offers: {
    "@type": "Offer",
    price: "15000",
    priceCurrency: "NGN",
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      price: "15000",
      priceCurrency: "NGN",
      billingDuration: "P1M",
    },
  },
  creator: {
    "@type": "Organization",
    name: "NIRI",
    url: "https://niri.live",
    sameAs: ["https://x.com/niritoday", "https://t.me/niritoday"],
  },
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingPage />
    </>
  );
}
