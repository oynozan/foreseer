import Band from "@/components/Band";
import CodeSection from "@/components/CodeSection";
import Faq from "@/components/Faq";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import Nav from "@/components/Nav";

export default function Home() {
    return (
        <div className="frame">
            <Nav />
            <main>
                <Hero />
                <Band id="demo-roulette" meta={["[ 02 / 06 ]", "GAMES // ROULETTE //"]}>
                    <div className="h-80" data-demo="roulette" />
                </Band>
                <Band id="demo-games" meta={["[ 03 / 06 ]", "GAMES // COINFLIP + DICE //"]}>
                    <div className="grid gap-4 pt-12 md:grid-cols-2">
                        <div id="demo-coinflip" className="h-64" data-demo="coinflip" />
                        <div id="demo-dice" className="h-64" data-demo="dice" />
                    </div>
                </Band>
                <Band id="code" meta={["[ 04 / 06 ]", "INTEGRATE // THREE WAYS IN //"]}>
                    <CodeSection />
                </Band>
                <Band id="how-it-works" meta={["[ 05 / 06 ]", "PROTOCOL // COMMIT · PLAY · REVEAL · ANCHOR //"]}>
                    <HowItWorks />
                </Band>
                <Band id="faq" meta={["[ 06 / 06 ]", "FAQ // STATED HONESTLY //"]}>
                    <Faq />
                </Band>
            </main>
            <Footer />
        </div>
    );
}
