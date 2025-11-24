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
import helmet from "helmet";
import cookieParser from "cookie-parser";

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

// Simplified endpoint for publisher role (using uid)
// app.get("/token", nocache, (req: RtcParams, res: Response) => {
//   // 1. Basic configuration checks
//   if (!APP_ID || !APP_CERTIFICATE) {
//     return res.status(500).json({
//       error: "Agora credentials not configured in environment variables",
//     });
//   }

//   const { channel, uid } = req.query;

//   if (!channel) {
//     return res.status(400).json({ error: "channel parameter is required" });
//   }

//   // 2. Determine user ID and expiration
//   const userId: number = uid ? parseInt(uid, 10) : 0; // Default to 0 if not provided

//   if (isNaN(userId)) {
//     return res.status(400).json({ error: "Invalid UID. Must be a number" });
//   }

//   const expirationTimeInSeconds: number = 3600; // 1 hour default
//   const currentTimestamp: number = Math.floor(Date.now() / 1000);
//   const privilegeExpiredTs: number = currentTimestamp + expirationTimeInSeconds;

//   try {
//     // 3. Generate token
//     const token: string = RtcTokenBuilder.buildTokenWithUid(
//       APP_ID,
//       APP_CERTIFICATE,
//       channel,
//       userId,
//       RtcRole.PUBLISHER, // Always PUBLISHER for this endpoint
//       privilegeExpiredTs
//     );

//     // 4. Success response
//     return res.json({
//       token,
//       appId: APP_ID,
//       channel,
//       uid: userId,
//     });
//   } catch (error) {
//     console.error("Error generating token:", error);
//     return res.status(500).json({
//       error: "Failed to generate token",
//       details: error instanceof Error ? error.message : "Unknown error",
//     });
//   }
// });

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
    server.listen(PORT, (): void => {
      logger.info(`Listening on port ${PORT}`);
    });
  } catch (err) {
    logger.error(err);
  }
};

start();
