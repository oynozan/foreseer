import type { ReactNode } from "react";

type BandProps = {
    id: string;
    meta?: [string, string];
    children?: ReactNode;
};

export default function Band({ id, meta, children }: BandProps) {
    return (
        <section id={id} className="band">
            <div className="col pb-24">
                {meta && (
                    <div className="meta tech" aria-hidden="true">
                        <span>{meta[0]}</span>
                        <span>{meta[1]}</span>
                    </div>
                )}
                {children}
            </div>
        </section>
    );
}
