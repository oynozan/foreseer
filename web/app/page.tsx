import Band from "@/components/Band";
import CodeSection from "@/components/CodeSection";
import EconomySection from "@/components/EconomySection";
import Faq from "@/components/Faq";
import FlareSection from "@/components/FlareSection";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import Nav from "@/components/Nav";

export default function Home() {
    return (
        <div className="frame">
            <Nav home />
            <main>
                <Hero />
                <Band id="demo-roulette" meta={["[ 01 / 07 ]", "GAMES // ROULETTE //"]}>
                    <div className="h-80" data-demo="roulette" />
                </Band>
                <Band id="demo-games" meta={["[ 02 / 07 ]", "GAMES // COINFLIP + DICE //"]}>
                    <div className="grid gap-4 pt-12 md:grid-cols-2">
                        <div id="demo-coinflip" className="h-64" data-demo="coinflip" />
                        <div id="demo-dice" className="h-64" data-demo="dice" />
                    </div>
                </Band>
                <Band id="code" meta={["[ 03 / 07 ]", "INTEGRATE // THREE WAYS IN //"]}>
                    <CodeSection />
                </Band>
                <Band id="how-it-works" meta={["[ 04 / 07 ]", "PROTOCOL // COMMIT · PLAY · REVEAL · ANCHOR //"]}>
                    <HowItWorks />
                </Band>
                <Band id="flare" meta={["[ 05 / 07 ]", "FLARE // CONFIDENTIAL COMPUTE //"]}>
                    <FlareSection />
                </Band>
                <Band id="economy" meta={["[ 06 / 07 ]", "ECONOMY // OPERATORS //"]}>
                    <EconomySection />
                </Band>
                <Band id="faq" meta={["[ 07 / 07 ]", "FAQ // STATED HONESTLY //"]}>
                    <Faq />
                </Band>
            </main>
            <Footer />
        </div>
    );
}
