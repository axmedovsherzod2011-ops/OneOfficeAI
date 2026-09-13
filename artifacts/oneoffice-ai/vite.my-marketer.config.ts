import { mergeConfig } from "vite";
import baseConfig from "./vite.config.ts";
import myMarketerTransform from "./vite.my-marketer-plugin.ts";
import productImageAiTransform from "./vite.product-image-ai-plugin.ts";

export default mergeConfig(baseConfig, {
  plugins: [myMarketerTransform(), productImageAiTransform()],
});
