import type { ReactNode } from "react";

type BandProps = {
    id: string;
    meta?: [string, string];
    children?: ReactNode;
    className?: string;
};

export default function Band({ id, meta, children, className }: BandProps) {
    return (
        <section id={id} className={`band ${className || ""}`}>
            <div className="col pb-6">
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
