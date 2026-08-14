export default function HeroBackdrop() {
    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <div className="hero-grid absolute inset-0" />
            <div className="absolute -left-40 top-10 h-105 w-105 rounded-full bg-primary/10 blur-3xl" />
            <div className="absolute -right-40 bottom-10 h-105 w-105 rounded-full bg-primary/10 blur-3xl" />
        </div>
    );
}
