import "dotenv/config";
import { createApp } from "./app";

const port = Number(process.env.PORT ?? 3001);
const corsOrigin = process.env.CORS_ORIGIN;

const app = createApp(corsOrigin);

app.listen(port, () => {
  console.log(`Origina API listening on http://localhost:${port}`);
});
