import type { Metadata } from "next";
import { Roboto, Rufina } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const roboto = Roboto({ variable: "--font-roboto", subsets: ["latin"] });
const rufina = Rufina({ variable: "--font-rufina", subsets: ["latin"], weight: ["400", "700"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const socialImage = `${protocol}://${host}/og.png`;
  return {
    title: "FDA Device Explorer — Registrations + Listings",
    description: "Search, filter, inspect, and export openFDA medical device registration and listing records.",
    openGraph: { title: "FDA Device Explorer", description: "Find the device. Trace the maker.", images: [{ url: socialImage, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", images: [socialImage] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${roboto.variable} ${rufina.variable}`}>{children}</body></html>;
}
