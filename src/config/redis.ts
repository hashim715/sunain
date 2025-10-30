import { Redis } from "ioredis";
import dotenv from "dotenv";
import { createClient, RedisClientType } from "redis";

dotenv.config();

const redispubsubClient: RedisClientType = createClient({
  url: `redis://${process.env.REDISCLIENTURI}`,
});

redispubsubClient.on("connect", () => {
  console.log("redispussubClient connected");
});

redispubsubClient.on("ready", () => {
  console.log("redispubsubClient is ready");
});

redispubsubClient.on("reconnecting", () => {
  console.log("redispubsubClient reconnecting...");
});

redispubsubClient.on("error", (err: Error) => {
  console.error("redispubsubClient error:", err);
});

redispubsubClient.on("end", () => {
  console.log("redispubsubClient connection closed");
});

(async () => {
  try {
    await redispubsubClient.connect();
    console.log("redispubsubClients connected successfully");
  } catch (err) {
    console.error("Error connecting Redis clients:", err);
  }
})();

export { redispubsubClient };
