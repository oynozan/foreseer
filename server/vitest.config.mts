import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// esbuild drops decorator metadata, swc emits it
export default defineConfig({
    test: {
        include: ["test/**/*.test.ts"],
    },
    plugins: [
        swc.vite({
            jsc: {
                parser: { syntax: "typescript", decorators: true },
                transform: { legacyDecorator: true, decoratorMetadata: true },
                target: "es2022",
            },
            module: { type: "es6" },
        }),
    ],
});
