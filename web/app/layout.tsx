import type { Metadata } from "next";
import { Akt, Ubuntu, Ubuntu_Mono } from "next/font/google";
import "./globals.css";

const akt = Akt({
    subsets: ["latin"],
    variable: "--font-akt",
});

const ubuntu = Ubuntu({
    weight: ["400", "500", "700"],
    subsets: ["latin"],
    variable: "--font-ubuntu",
});

const ubuntuMono = Ubuntu_Mono({
    weight: ["400", "700"],
    subsets: ["latin"],
    variable: "--font-ubuntu-mono",
});

export const metadata: Metadata = {
    title: "Foreseer · Provably fair outcomes for iGaming, verifiable in your browser",
    description:
        "Provably fair engine for iGaming on Flare Confidential Compute. Seeds committed onchain before any bet, EIP-712 signed receipts, and six checks anyone can recompute.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
    return (
        <html
            lang="en"
            data-scroll-behavior="smooth"
            className={`${akt.variable} ${ubuntu.variable} ${ubuntuMono.variable} antialiased`}
        >
            <body>{children}</body>
        </html>
    );
}
