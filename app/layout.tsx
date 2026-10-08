import type { Metadata, Viewport } from "next";
import { SiteFooter } from "@/app/site-footer";
import "./globals.css";

/**
 * Адрес сайта в punycode: аэромарк.рф. Нужен для канонических ссылок,
 * карты сайта и превью в мессенджерах и поиске.
 */
export const SITE_URL = "https://xn--80aa4agjld3h.xn--p1ai";

const TITLE = "Аэромарк — тренажёр чтения и математики для 1 класса";
const DESCRIPTION =
  "Бесплатный тренажёр для первоклассника в стиле лётной школы: буквы, слоги, слова и рассказы с озвучкой, счёт до 20 и русский язык. Короткие уроки, звёзды и самолёты вместо оценок, отчёт для родителей.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Аэромарк",
  authors: [{ name: "Иван Зеленский" }],
  creator: "Иван Зеленский",
  keywords: [
    "тренажёр чтения",
    "обучение чтению",
    "первый класс",
    "чтение по слогам",
    "как научить ребёнка читать",
    "математика 1 класс",
    "развивающие игры для детей",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    url: "/",
    siteName: "Аэромарк",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/flight-map.webp", alt: "Карта полётов Аэромарка" }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/flight-map.webp"] },
  robots: { index: true, follow: true },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/icon-192.png",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Аэромарк", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#0866a5" };

/** Структурированные данные: поисковик понимает, что это обучающее приложение. */
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Аэромарк",
  url: SITE_URL,
  description: DESCRIPTION,
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  inLanguage: "ru",
  educationalLevel: "1 класс",
  audience: { "@type": "EducationalAudience", educationalRole: "student" },
  offers: { "@type": "Offer", price: "0", priceCurrency: "RUB" },
  author: { "@type": "Person", name: "Иван Зеленский", email: "ivan.sergey.zelenskiy@gmail.com" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
        {children}
        {/* Подвал рендерится на сервере: это текст, который видят поисковики,
            пока само приложение загружается в браузере. */}
        <SiteFooter />
      </body>
    </html>
  );
}
