import type { Metadata } from "next";
import { Akt, Ubuntu, Ubuntu_Mono } from "next/font/google";
import "./globals.css";

// Akt ships no metric overrides, so pick the fallback ourselves
const akt = Akt({
    subsets: ["latin"],
    variable: "--font-akt",
    fallback: ["Ubuntu", "system-ui", "sans-serif"],
    adjustFontFallback: false,
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
    title: "Foreseer · Provably fair outcome infrastructure for iGaming",
    description:
        "Outcome infrastructure for iGaming operators on Flare Confidential Compute. Seeds committed onchain before any bet, EIP-712 signed receipts, and six checks anyone can recompute.",
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
