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
import helmet from "helmet";
import cookieParser from "cookie-parser";
import {
  recordingQueue,
  transcriptQueue,
} from "./controllers/zoomSDKAuthEndpoint";
import { conversationDataRouter } from "./routes/conversationDataRoutes";
import { stripeRouter } from "./routes/stripeRoutes";
import { adminRouter } from "./routes/adminRoutes";
import { fillTopicData } from "./utils/fillTopicTablesData";
import { prisma } from "./config/postgres";
import cron from "node-cron";
import multer from "multer";
import fs from "fs";
import path from "path";

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
const PORT: number = parseInt(process.env.PORT) || 5002;

app.use(cookieParser());
app.set("trust proxy", 1);
app.use(helmet());

const allowedOrigins = [
  "http://localhost:5173",
  "https://ourlisa.com",
  "https://www.ourlisa.com",
  "https://beta.ourlisa.com",
  "http://192.168.1.168:5173",
  "http://0.0.0.0:5173",
  "https://82b93bfbbf3f.ngrok-free.app",
  "https://0e750b02e8f3.ngrok-free.app",
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

app.use(timeout("40s"));

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

// Create uploads directory
const uploadsDir = path.join(__dirname, "audio-recordings");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req: any, file: Express.Multer.File, cb: any) => {
    // meetingName comes from formData, but we need to parse it first
    // Temporarily save to root uploads dir, we'll organize later
    cb(null, uploadsDir);
  },
  filename: (req: any, file: Express.Multer.File, cb: any) => {
    const timestamp = Date.now();
    // Use timestamp for now, we'll rename after getting meetingName
    cb(null, `temp_${timestamp}.webm`);
  },
});

const upload = multer({ storage });

// Upload audio chunk endpoint
app.post(
  "/v1/audio/upload-chunk",
  upload.single("audioChunk"),
  (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        return res
          .status(400)
          .json({ success: false, message: "No file uploaded" });
      }

      const { meetingName, userName } = req.body;

      if (!meetingName || !userName) {
        // Delete temp file if missing data
        fs.unlinkSync(file.path);
        return res.status(400).json({
          success: false,
          message: "Missing meetingName or userName",
        });
      }

      // Create meeting directory
      const meetingDir = path.join(uploadsDir, meetingName);
      if (!fs.existsSync(meetingDir)) {
        fs.mkdirSync(meetingDir, { recursive: true });
      }

      // Move file to proper location with proper name
      const timestamp = Date.now();
      const finalFilename = `${userName}_${timestamp}.webm`;
      const finalPath = path.join(meetingDir, finalFilename);

      fs.renameSync(file.path, finalPath);

      console.log("✅ Audio chunk received:", finalFilename);
      console.log("📁 Saved to:", finalPath);

      res.json({
        success: true,
        filename: finalFilename,
        path: finalPath,
      });
    } catch (error) {
      console.error("❌ Error uploading audio:", error);
      res.status(500).json({ success: false, error: "Failed to upload audio" });
    }
  }
);

// Finalize recording endpoint
app.post("/v1/audio/finalize", (req: Request, res: Response) => {
  try {
    const { meetingName, userName } = req.body;

    if (!meetingName || !userName) {
      return res.status(400).json({
        success: false,
        message: "Missing meetingName or userName",
      });
    }

    console.log(`✅ Recording finalized for ${userName} in ${meetingName}`);

    res.json({ success: true, message: "Recording finalized" });
  } catch (error) {
    console.error("❌ Error finalizing:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to finalize recording" });
  }
});

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
      logger.info("✅ Queue cleared and ready");
    }

    // Schedule cleanup job to run every 10 minutes
    // cron.schedule("*/10 * * * *", cleanupUnverifiedAccounts);
    // logger.info("⏰ Scheduled cleanup job every 10 minutes");

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
