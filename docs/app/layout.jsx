import { Footer, Layout, Navbar } from "nextra-theme-docs";
import { Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import { Ubuntu, Ubuntu_Mono } from "next/font/google";
import "nextra-theme-docs/style.css";
import "./globals.css";

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

export const metadata = {
    title: {
        default: "Foreseer",
        template: "%s | Foreseer",
    },
    description: "Provably fair engine for iGaming on Flare Confidential Compute",
};

export default async function RootLayout({ children }) {
    return (
        <html lang="en" dir="ltr" suppressHydrationWarning className={`${ubuntu.variable} ${ubuntuMono.variable}`}>
            <Head color={{ hue: 23, saturation: 100, lightness: 50 }} backgroundColor={{ light: "#ffffff" }} />
            <body>
                <Layout
                    navbar={<Navbar logo={<b style={{ color: "#ff6200" }}>Foreseer</b>} />}
                    pageMap={await getPageMap()}
                    darkMode={false}
                    nextThemes={{ defaultTheme: "light", forcedTheme: "light" }}
                    footer={<Footer>Foreseer, FORESEER-SPEC v0.1. MIT licensed.</Footer>}
                >
                    {children}
                </Layout>
            </body>
        </html>
    );
}
