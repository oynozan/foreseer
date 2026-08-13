import { Footer, Layout, Navbar } from "nextra-theme-docs";
import { Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import "nextra-theme-docs/style.css";

export const metadata = {
    title: {
        default: "Foreseer",
        template: "%s | Foreseer",
    },
    description: "Provably fair engine for iGaming on Flare Confidential Compute",
};

export default async function RootLayout({ children }) {
    return (
        <html lang="en" dir="ltr" suppressHydrationWarning>
            <Head />
            <body>
                <Layout
                    navbar={<Navbar logo={<b>Foreseer</b>} />}
                    pageMap={await getPageMap()}
                    footer={<Footer>Foreseer, FORESEER-SPEC v0.1. MIT licensed.</Footer>}
                >
                    {children}
                </Layout>
            </body>
        </html>
    );
}
