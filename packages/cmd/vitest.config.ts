import path from "path";

const config = {
  resolve: {
    alias: {
      "@debug": path.resolve(__dirname, "./src/debug"),
      "@env": path.resolve(__dirname, "./src/env"),
      "@lib": path.resolve(__dirname, "./src/lib"),
      "@logger": path.resolve(__dirname, "./src/logger"),
    },
  },
};

export default config;
