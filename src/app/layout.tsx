import type { Metadata } from "next";
import { Suspense } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "EVENTLINE FSM",
  description: "Field Service Management - EVENTLINE GmbH Basel",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "EVENTLINE FSM",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className="h-full antialiased">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className="min-h-full flex flex-col" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        <ThemeProvider>
          <Suspense>{children}</Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}
