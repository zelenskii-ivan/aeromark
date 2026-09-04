import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Аэромарк — тренажёр Марка",
  description:
    "Персональный авиационный тренажёр по математике, русскому языку и чтению для 1 класса.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/icon-192.png",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Аэромарк", statusBarStyle: "black-translucent" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
