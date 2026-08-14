import { Footer, Layout, Navbar } from "nextra-theme-docs";
import { Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import { Ubuntu } from "next/font/google";
import "nextra-theme-docs/style.css";
import "./globals.css";

const ubuntu = Ubuntu({
    weight: ["400", "500", "700"],
    subsets: ["latin"],
    variable: "--font-ubuntu",
});

export const metadata = {
    title: {
        default: "Foreseer",
        template: "%s | Foreseer",
    },
    description: "Provably fair engine for iGaming on Flare Confidential Compute",
    icons: {
        icon: "/favicon.png",
    },
};

export default async function RootLayout({ children }) {
    return (
        <html lang="en" dir="ltr" suppressHydrationWarning className={ubuntu.variable}>
            <Head color={{ hue: 23, saturation: 100, lightness: 50 }} backgroundColor={{ light: "#ffffff" }}>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link
                    href="https://fonts.googleapis.com/css2?family=Akt:wght@300..800&display=swap"
                    rel="stylesheet"
                />
            </Head>
            <body>
                <Layout
                    navbar={<Navbar logo={<img src="/text-logo.svg" alt="Foreseer" style={{ height: 30 }} />} />}
                    pageMap={await getPageMap()}
                    darkMode={false}
                    nextThemes={{ defaultTheme: "light", forcedTheme: "light" }}
                    footer={
                        <Footer>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <img src="/logo.svg" alt="Foreseer" style={{ height: 30, width: 30 }} />
                                <span>Foreseer, FORESEER-SPEC v0.1. MIT licensed.</span>
                            </div>
                        </Footer>
                    }
                >
                    {children}
                </Layout>
            </body>
        </html>
    );
}
