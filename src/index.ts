import express, { Application, Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import bodyParser from "body-parser";
import timeout from "connect-timeout";
import { chatController } from "./controllers/chatController";
import { uploadRouter } from "./routes/uploadRoutes";
import { logger } from "./utils/logger";
import { authRouter } from "./routes/authRoutes";
import { userRouter } from "./routes/userRoutes";
import { healthCheckRouter } from "./routes/healthCheckRoutes";
import { ZoomAuthEndpointRouter } from "./routes/zoomAuthEndpointRoutes";
import { zoomRouter } from "./routes/zoomRoutes";
import { annotationRouter } from "./routes/annotationRoutes";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import {
  recordingQueue,
  transcriptQueue,
} from "./controllers/zoomSDKAuthEndpoint";
// import { localRecordingQueue } from "./controllers/chatController";
import { conversationDataRouter } from "./routes/conversationDataRoutes";
import { stripeRouter } from "./routes/stripeRoutes";
import { adminRouter } from "./routes/adminRoutes";
import { fillTopicData } from "./utils/fillTopicTablesData";
import { prisma } from "./config/postgres";
import cron from "node-cron";

const cleanupUnverifiedAccounts = async () => {
  try {
    logger.info("🧹 Running cleanup job for unverified accounts...");

    const cutoffDate = new Date();
    cutoffDate.setMinutes(cutoffDate.getMinutes() - 40);

    const result = await prisma.user.deleteMany({
      where: {
        AND: [
          {
            OR: [{ verified: false }, { email_verified: false }],
          },
          {
            createdAt: {
              lt: cutoffDate,
            },
          },
        ],
      },
    });

    logger.info(`✅ Deleted ${result.count} unverified accounts`);
  } catch (error) {
    logger.error("❌ Error cleaning up unverified accounts:", error);
  }
};

dotenv.config();

const app: Application = express();
const PORT: number = parseInt(process.env.PORT) || 5001;

app.use(cookieParser());
app.set("trust proxy", 1);
app.use(helmet());

const allowedOrigins = [
  "http://localhost:5173",
  "https://ourlisa.com",
  "https://www.ourlisa.com",
  "https://www.sunain.com",
  "https://beta.ourlisa.com",
  "http://192.168.1.168:5173",
  "http://0.0.0.0:5173",
  "https://82b93bfbbf3f.ngrok-free.app",
  "https://0e750b02e8f3.ngrok-free.app",
  "https://annotation.sunain.com",
  "http://localhost:3001",
];

app.use(express.json());

const corsOptions =
  process.env.ALLOW_ALL_ORIGINS === "true"
    ? {
        origin: function (origin: any, callback: any) {
          callback(null, origin || "*");
        },
        credentials: true,
      }
    : {
        origin: function (origin: any, callback: any) {
          if (!origin) return callback(null, true);
          if (allowedOrigins.includes(origin)) {
            return callback(null, true);
          } else {
            return callback(new Error("Not allowed by CORS"));
          }
        },
        credentials: true,
      };

app.use(cors(corsOptions));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(timeout("500s"));

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    return next(err);
  }
  if (req.timedout) {
    return res.status(503).json({
      success: false,
      message: "Your request has timed out. Please try again later.",
    });
  }
  return res
    .status(500)
    .json({ success: false, message: "Something went wrong try again.." });
});

app.use("/v1/uploadUrl", uploadRouter);
app.use("/v1/auth", authRouter);
app.use("/v1/user", userRouter);
app.use("/v1/zoomSDKAuth", ZoomAuthEndpointRouter);
app.use("/v1/zoom", zoomRouter);
app.use("/v1/health", healthCheckRouter);
app.use("/v1/conversationsData", conversationDataRouter);
app.use("/v1/stripe", stripeRouter);
app.use("/v1/admin", adminRouter);
app.use("/v1/annotations", annotationRouter);

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    return next(err);
  }
  if (req.timedout) {
    return res.status(503).json({
      success: false,
      message: "Your request has timed out. Please try again later.",
    });
  }
  return res
    .status(500)
    .json({ success: false, message: "Something went wrong try again.." });
});

const server: http.Server = http.createServer(app);

chatController(app, server);

const start = async (): Promise<void> => {
  try {
    logger.info("🚀 Starting server...");

    // fillTopicData()
    //   .catch((e) => {
    //     console.error(e);
    //     process.exit(1);
    //   })
    //   .finally(async () => {
    //     await prisma.$disconnect();
    //   });

    if (process.env.ENV !== "production") {
      logger.info("🗑️ Clearing all jobs from queue...");
      await recordingQueue.pause();
      await recordingQueue.obliterate({ force: true });
      await recordingQueue.resume();
      await transcriptQueue.pause();
      await transcriptQueue.obliterate({ force: true });
      await transcriptQueue.resume();
      // await localRecordingQueue.pause();
      // await localRecordingQueue.obliterate({ force: true });
      // await localRecordingQueue.resume();
      logger.info("✅ Queue cleared and ready");
    }

    // Schedule cleanup job to run every 10 minutes
    cron.schedule("*/10 * * * *", cleanupUnverifiedAccounts);
    logger.info("⏰ Scheduled cleanup job every 10 minutes");

    server.listen(PORT, (): void => {
      logger.info(`Listening on port ${PORT}`);
    });
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
};

process.on("SIGTERM", async () => {
  console.log("⚠️ SIGTERM received, closing queue...");
  await recordingQueue.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("⚠️ SIGINT received, closing queue...");
  await recordingQueue.close();
  process.exit(0);
});

start();
