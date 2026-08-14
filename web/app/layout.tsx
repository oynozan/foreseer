import type { Metadata } from "next";
import { Akt, Ubuntu } from "next/font/google";
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

export const metadata: Metadata = {
    title: "Foreseer · Provably fair outcomes for iGaming, verifiable in your browser",
    description:
        "Provably fair engine for iGaming on Flare Confidential Compute. Seeds committed onchain before any bet, EIP-712 signed receipts, and six checks anyone can recompute.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
    return (
        <html lang="en" data-scroll-behavior="smooth" className={`${akt.variable} ${ubuntu.variable} antialiased`}>
            <body>{children}</body>
        </html>
    );
}
