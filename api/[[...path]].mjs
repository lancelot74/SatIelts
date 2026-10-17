import { boot } from "../server/boot.mjs";

const { app } = await boot();
export default app;
