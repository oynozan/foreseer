import Band from "@/components/Band";

export default function Home() {
    return (
        <div className="frame">
            <main>
                <Band id="hero" meta={["[ 01 / 07 ]", "PROTOCOL // COMMIT BEFORE BET //"]}>
                    <h1 className="pt-16">
                        The house locks its randomness <span className="text-primary">before you bet.</span>
                    </h1>
                </Band>
                <Band id="demo-dice" meta={["[ 02 / 07 ]", "GAMES // DICE · DRAW 0..9999 //"]} />
                <Band id="demo-coinflip" meta={["[ 03 / 07 ]", "GAMES // COINFLIP · ONE BIT //"]} />
                <Band id="demo-roulette" meta={["[ 04 / 07 ]", "GAMES // ROULETTE · RULE GRAMMAR //"]} />
                <Band id="code" meta={["[ 05 / 07 ]", "INTEGRATE // THREE WAYS IN //"]} />
                <Band id="how-it-works" meta={["[ 06 / 07 ]", "PROTOCOL // COMMIT · PLAY · REVEAL · ANCHOR //"]} />
                <Band id="faq" meta={["[ 07 / 07 ]", "FAQ // STATED HONESTLY //"]} />
            </main>
        </div>
    );
}
