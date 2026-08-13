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
