import type { Metadata } from "next";
import LandingPage from "./LandingPage";

export const metadata: Metadata = {
  title: "NIRI — Know Your Trading Edge | AI Trading Journal for MT5 Traders",
  description:
    "NIRI helps you Know Your Trading Edge. AI-powered trading journal built for MT5 traders — auto-sync trades, track behaviour, and improve discipline. Start free.",
  alternates: { canonical: "https://niri.live" },
  openGraph: {
    title: "NIRI — Know Your Trading Edge",
    description:
      "The first AI trading journal built for African traders. Sync MT5 trades automatically and discover exactly what behavioral patterns are costing you money.",
    url: "https://niri.live",
    siteName: "NIRI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NIRI — Know Your Trading Edge",
    description:
      "The first AI trading journal built for African traders. Sync MT5 trades automatically and discover exactly what behavioral patterns are costing you money.",
  },
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
