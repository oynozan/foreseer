import Band from "@/components/Band";
import { CoinflipDemo, DiceDemo, RouletteDemo } from "@/components/Demos";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import Nav from "@/components/Nav";

export default function Home() {
    return (
        <div className="frame">
            <Nav />
            <main>
                <Hero />
                <Band id="demo-dice" meta={["[ 02 / 07 ]", "GAMES // DICE · DRAW 0..9999 //"]}>
                    <DiceDemo />
                </Band>
                <Band id="demo-coinflip" meta={["[ 03 / 07 ]", "GAMES // COINFLIP · ONE BIT //"]}>
                    <CoinflipDemo />
                </Band>
                <Band id="demo-roulette" meta={["[ 04 / 07 ]", "GAMES // ROULETTE · RULE GRAMMAR //"]}>
                    <RouletteDemo />
                </Band>
                <Band id="code" meta={["[ 05 / 07 ]", "INTEGRATE // THREE WAYS IN //"]} />
                <Band id="how-it-works" meta={["[ 06 / 07 ]", "PROTOCOL // COMMIT · PLAY · REVEAL · ANCHOR //"]} />
                <Band id="faq" meta={["[ 07 / 07 ]", "FAQ // STATED HONESTLY //"]} />
            </main>
            <Footer />
        </div>
    );
}
