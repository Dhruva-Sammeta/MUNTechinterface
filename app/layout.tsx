import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

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
    <html lang="en" className="h-full">
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
