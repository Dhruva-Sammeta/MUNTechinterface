import type { Metadata } from "next";
import { Outfit, DM_Sans, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sapphire MUN — Conference System",
  description:
    "India's first experience-targeted Model United Nations. Strategize. Socialize. Scrutinize.",
  keywords: [
    "MUN",
    "Model United Nations",
    "Sapphire MUN",
    "conference",
    "debate",
  ],
  openGraph: {
    title: "Sapphire MUN — Conference System",
    description:
      "India's first experience-targeted Model United Nations platform.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${dmSans.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body
        className="min-h-full flex flex-col antialiased"
        style={{
          fontFamily: "var(--font-dm-sans), var(--font-sans)",
          background: "var(--color-bg-primary)",
          color: "var(--color-text-primary)",
        }}
      >
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "var(--color-bg-elevated)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-default)",
              borderRadius: "var(--radius-card)",
            },
          }}
        />
      </body>
    </html>
  );
}
