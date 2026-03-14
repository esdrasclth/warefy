import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ERP Warefy",
  description: "Minimalist modern ERP module for Warehouse",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
