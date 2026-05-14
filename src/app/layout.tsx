import type { Metadata } from "next";
import { Inter, DM_Sans, DM_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: {
    default: "NIRI — AI Trading Journal for MT5 Traders",
    template: "%s | NIRI",
  },
  description:
    "Connect your MT5, sync trades automatically, and get AI coaching that tells you exactly what behavioral patterns are costing you money.",
  metadataBase: new URL("https://niri.live"),
  openGraph: {
    type: "website",
    siteName: "NIRI",
    url: "https://niri.live",
    title: "NIRI — AI Trading Journal for MT5 Traders",
    description:
      "Connect your MT5, sync trades automatically, and get AI coaching that tells you exactly what behavioral patterns are costing you money.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "NIRI — AI Trading Journal for MT5 Traders",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@niritoday",
    creator: "@niritoday",
    title: "NIRI — AI Trading Journal for MT5 Traders",
    description:
      "Connect your MT5, sync trades automatically, and get AI coaching that tells you exactly what behavioral patterns are costing you money.",
    images: ["/og-image.png"],
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  keywords: ["forex journal", "MT5 trading journal", "AI trading coach", "trade tracker", "forex trader", "trading performance"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${dmSans.variable} ${dmMono.variable} h-full antialiased`}
    >
      {/* Anti-flash: apply saved theme before first paint */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('cj_theme')||'light';document.documentElement.setAttribute('data-theme',t);})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
