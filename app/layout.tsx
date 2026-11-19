import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ВОЛЬТ — портал электрослужбы",
  description: "Заявки, оборудование, планово-предупредительные ремонты и прогноз загрузки электрослужбы.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
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
