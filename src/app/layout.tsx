import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  metadataBase: new URL("https://crabtopia.local"),
  title: "Crabtopia — Glow-Tide Storybook",
  description:
    "Dive for treasure, raid rivals, breed legendary crabs, and battle in the coliseum. An idle PvP crab-collecting world beneath the Glow-Tide.",
  keywords: [
    "Crabtopia",
    "idle game",
    "pvp game",
    "crab collecting",
    "browser game",
    "Glow-Tide",
  ],
  authors: [{ name: "Crabtopia Studio" }],
  applicationName: "Crabtopia",
  icons: {
    icon: "/art/ui/app-icon.png",
    apple: "/art/ui/app-icon.png",
    shortcut: "/art/ui/app-icon.png",
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "Crabtopia",
    description: "Dive. Plunder. Breed. Battle.",
    type: "website",
    images: ["/art/ui/app-icon.png"],
  },
  appleWebApp: {
    capable: true,
    title: "Crabtopia",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A1B3D",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:wght@400;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="antialiased"
        style={{
          fontFamily: "Nunito, system-ui, sans-serif",
          overscrollBehavior: "none",
          color: "#EAF6FF",
        }}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
