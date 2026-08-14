const PILL = "w-full rounded-full px-6 py-3 text-center text-[14px] font-medium transition-colors sm:w-auto";

export const PRIMARY = `${PILL} bg-primary text-white hover:bg-primary-hover`;
export const SECONDARY = `${PILL} border border-line bg-white text-ink hover:border-ink`;
export const MUTED = `${PILL} border border-line bg-white text-muted`;

// controls stack on phones, sit in a row from sm up
export const ROW = "mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center";
