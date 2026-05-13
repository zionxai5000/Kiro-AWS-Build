"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("vitest/config");
const path_1 = __importDefault(require("path"));
exports.default = (0, config_1.defineConfig)({
    test: {
        globals: true,
        environment: 'node',
        include: ['packages/*/src/**/*.test.ts'],
        exclude: ['packages/dashboard/**', 'node_modules', 'dist'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['packages/*/src/**/*.ts'],
            exclude: ['**/*.test.ts', '**/*.d.ts', 'packages/infra/**', 'packages/dashboard/**'],
        },
    },
    resolve: {
        alias: {
            '@seraphim/core': path_1.default.resolve(__dirname, 'packages/core/src'),
            '@seraphim/services': path_1.default.resolve(__dirname, 'packages/services/src'),
            '@seraphim/drivers': path_1.default.resolve(__dirname, 'packages/drivers/src'),
            '@seraphim/app': path_1.default.resolve(__dirname, 'packages/app/src'),
        },
    },
});
//# sourceMappingURL=vitest.config.js.map