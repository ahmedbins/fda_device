import type { Metadata } from "next";
import { Roboto, Rufina } from "next/font/google";
import { headers } from "next/headers";
import ContactFooter from "./contact-footer";
import "./globals.css";

const roboto = Roboto({ variable: "--font-roboto", subsets: ["latin"] });
const rufina = Rufina({ variable: "--font-rufina", subsets: ["latin"], weight: ["400", "700"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const socialImage = `${protocol}://${host}/og-regulatory.png`;
  return {
    title: "Sonova Regulatory Data Hub | FDA, FCC, Health Canada and IECEE",
    description: "Explore and monitor authoritative FDA device data, FCC equipment authorizations, Health Canada MDALL licences, and IECEE CB Scheme certificates.",
    openGraph: { title: "Sonova Regulatory Data Hub", description: "FDA, FCC, Health Canada MDALL and IECEE certificate records in one workspace.", images: [{ url: socialImage, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: "Sonova Regulatory Data Hub", description: "FDA, FCC, Health Canada MDALL and IECEE certificate records in one workspace.", images: [socialImage] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${roboto.variable} ${rufina.variable}`}>
        {children}
        <ContactFooter />
      </body>
    </html>
  );
}
