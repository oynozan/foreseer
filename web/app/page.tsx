import Band from "@/components/Band";
import CodeSection from "@/components/CodeSection";
import CoinflipDemo from "@/components/CoinflipDemo";
import DiceDemo from "@/components/DiceDemo";
import EconomySection from "@/components/EconomySection";
import Faq from "@/components/Faq";
import FlareSection from "@/components/FlareSection";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import Nav from "@/components/Nav";
import RouletteDemo from "@/components/RouletteDemo";

export default function Home() {
    return (
        <div className="frame">
            <Nav home />
            <main>
                <Hero />
                <Band id="demo-roulette" meta={["[ 01 / 08 ]", "GAMES // ROULETTE //"]}>
                    <RouletteDemo />
                </Band>
                <div className="band">
                    <div className="col grid md:grid-cols-2">
                        <section id="demo-coinflip" className="pb-6 md:pr-12">
                            <div className="meta tech" aria-hidden="true">
                                <span>[ 02 / 08 ]</span>
                                <span>GAMES // COINFLIP //</span>
                            </div>
                            <CoinflipDemo />
                        </section>
                        <section
                            id="demo-dice"
                            className="mt-10 border-t border-line pb-6 md:mt-0 md:border-t-0 md:border-l md:pl-12"
                        >
                            <div className="meta tech" aria-hidden="true">
                                <span>[ 03 / 08 ]</span>
                                <span>GAMES // DICE //</span>
                            </div>
                            <DiceDemo />
                        </section>
                    </div>
                </div>
                <Band id="code" meta={["[ 04 / 08 ]", "INTEGRATE // THREE WAYS IN //"]}>
                    <CodeSection />
                </Band>
                <Band id="how-it-works" meta={["[ 05 / 08 ]", "PROTOCOL // COMMIT · PLAY · REVEAL · ANCHOR //"]}>
                    <HowItWorks />
                </Band>
                <Band id="flare" meta={["[ 06 / 08 ]", "FLARE // CONFIDENTIAL COMPUTE //"]}>
                    <FlareSection />
                </Band>
                <Band id="economy" meta={["[ 07 / 08 ]", "ECONOMY // OPERATORS //"]}>
                    <EconomySection />
                </Band>
                <Band id="faq" meta={["[ 08 / 08 ]", "FAQ // STATED HONESTLY //"]}>
                    <Faq />
                </Band>
            </main>
            <Footer />
        </div>
    );
}
