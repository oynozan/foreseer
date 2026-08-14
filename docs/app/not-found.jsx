import Link from "next/link";

export const metadata = {
    title: "Page not found",
};

const styles = {
    wrap: {
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "48px 24px",
        background: "#ffffff",
    },
    pill: {
        background: "#d0fccd",
        color: "#14532d",
        borderRadius: 999,
        padding: "4px 14px",
        fontSize: 13,
        fontWeight: 500,
        marginBottom: 18,
    },
    code: {
        fontSize: 72,
        fontWeight: 700,
        lineHeight: 1,
        color: "#ff6200",
        margin: 0,
        letterSpacing: "-0.03em",
    },
    title: {
        fontSize: 24,
        fontWeight: 600,
        color: "#1d1d1d",
        margin: "14px 0 8px",
    },
    text: {
        color: "#6f6f6f",
        maxWidth: 460,
        margin: "0 0 26px",
    },
    row: { display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" },
    primary: {
        background: "#ff6200",
        color: "#ffffff",
        borderRadius: 10,
        padding: "11px 22px",
        fontWeight: 600,
        textDecoration: "none",
    },
    alt: {
        background: "#ffffff",
        color: "#1d1d1d",
        border: "1px solid #e8e6e3",
        borderRadius: 10,
        padding: "11px 22px",
        fontWeight: 500,
        textDecoration: "none",
    },
};

export default function NotFound() {
    return (
        <div style={styles.wrap}>
            <span style={styles.pill}>every receipt is verifiable, this page is not</span>
            <p style={styles.code}>404</p>
            <h1 style={styles.title}>This page does not exist</h1>
            <p style={styles.text}>
                The address may have moved when the docs were reorganized. The pages below are good re-entry points.
            </p>
            <div style={styles.row}>
                <Link href="/" style={styles.primary}>
                    What is Foreseer
                </Link>
                <Link href="/sdk" style={styles.alt}>
                    SDK
                </Link>
                <Link href="/verify" style={styles.alt}>
                    Verify your bet
                </Link>
                <Link href="/api" style={styles.alt}>
                    Server API
                </Link>
            </div>
        </div>
    );
}
