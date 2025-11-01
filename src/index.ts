import express, { Application, Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import bodyParser from "body-parser";
import timeout from "connect-timeout";
import { chatController } from "./controllers/chatController";
import { uploadRouter } from "./routes/uploadRoutes";
import { RtcTokenBuilder, RtcRole } from "agora-access-token";

dotenv.config();

const app: Application = express();
const PORT: number = parseInt(process.env.PORT) || 5001;
const APP_ID: string | undefined = process.env.APP_ID;
const APP_CERTIFICATE: string | undefined = process.env.APP_CERTIFICATE;

interface RtcParams extends Request {
  params: {
    channel: string;
    role: "publisher" | "audience";
    tokentype: "uid" | "userAccount";
    uid: string;
  };
  query: {
    expiry?: string;
    // The simplified endpoint uses these, but they are also part of 'query'
    channel?: string;
    uid?: string;
  };
}

app.use(express.json());
app.use(
  cors({
    origin: "*",
  })
);

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

app.use("/api/uploadUrl", uploadRouter);

const nocache = (req: Request, res: Response, next: NextFunction): void => {
  res.header("Cache-Control", "private, no-cache, no-store, must-revalidate");
  res.header("Expires", "-1");
  res.header("Pragma", "no-cache");
  next();
};

app.get("/ping", (req: Request, res: Response) => {
  res.json({
    message: "Agora Token Server is running",
    timestamp: new Date().toISOString(),
  });
});

// Main token generation endpoint
app.get(
  "/rtc/:channel/:role/:tokentype/:uid",
  nocache,
  (req: RtcParams, res: Response) => {
    // 1. Basic configuration checks
    if (!APP_ID || !APP_CERTIFICATE) {
      return res.status(500).json({
        error: "Agora credentials not configured in environment variables",
      });
    }

    const {
      channel: channelName,
      role: roleStr,
      tokentype,
      uid: uidStr,
    } = req.params;

    if (!channelName) {
      return res.status(400).json({ error: "Channel name is required" });
    }

    // 2. Determine the role
    let role: number;
    if (roleStr === "publisher") {
      role = RtcRole.PUBLISHER;
    } else if (roleStr === "audience") {
      role = RtcRole.SUBSCRIBER;
    } else {
      return res.status(400).json({
        error: 'Invalid role. Use "publisher" or "audience"',
      });
    }

    // 3. Calculate token expiration time
    let expirationTimeInSeconds: number = 3600; // Default: 1 hour
    if (req.query.expiry) {
      const customExpiry = parseInt(req.query.expiry, 10);
      if (!isNaN(customExpiry)) {
        expirationTimeInSeconds = customExpiry;
      }
    }

    const currentTimestamp: number = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs: number =
      currentTimestamp + expirationTimeInSeconds;

    let token: string;

    try {
      // 4. Generate token based on tokentype
      if (tokentype === "userAccount") {
        token = RtcTokenBuilder.buildTokenWithAccount(
          APP_ID,
          APP_CERTIFICATE,
          channelName,
          uidStr, // Use uidStr as the user account
          role,
          privilegeExpiredTs
        );
      } else if (tokentype === "uid") {
        const uid: number = uidStr === "0" ? 0 : parseInt(uidStr, 10);

        if (isNaN(uid)) {
          return res.status(400).json({
            error: "Invalid UID. Must be a number",
          });
        }

        token = RtcTokenBuilder.buildTokenWithUid(
          APP_ID,
          APP_CERTIFICATE,
          channelName,
          uid, // Use uid as a number
          role,
          privilegeExpiredTs
        );
      } else {
        return res.status(400).json({
          error: 'Invalid tokentype. Use "uid" or "userAccount"',
        });
      }

      // 5. Success response
      return res.json({
        rtcToken: token,
        appId: APP_ID,
        channel: channelName,
        uid: uidStr,
        expiresIn: expirationTimeInSeconds,
      });
    } catch (error) {
      console.error("Error generating token:", error);
      return res.status(500).json({
        error: "Failed to generate token",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Simplified endpoint for publisher role (using uid)
app.get("/token", nocache, (req: RtcParams, res: Response) => {
  // 1. Basic configuration checks
  if (!APP_ID || !APP_CERTIFICATE) {
    return res.status(500).json({
      error: "Agora credentials not configured in environment variables",
    });
  }

  const { channel, uid } = req.query;

  if (!channel) {
    return res.status(400).json({ error: "channel parameter is required" });
  }

  // 2. Determine user ID and expiration
  const userId: number = uid ? parseInt(uid, 10) : 0; // Default to 0 if not provided

  if (isNaN(userId)) {
    return res.status(400).json({ error: "Invalid UID. Must be a number" });
  }

  const expirationTimeInSeconds: number = 3600; // 1 hour default
  const currentTimestamp: number = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs: number = currentTimestamp + expirationTimeInSeconds;

  try {
    // 3. Generate token
    const token: string = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERTIFICATE,
      channel,
      userId,
      RtcRole.PUBLISHER, // Always PUBLISHER for this endpoint
      privilegeExpiredTs
    );

    // 4. Success response
    return res.json({
      token,
      appId: APP_ID,
      channel,
      uid: userId,
    });
  } catch (error) {
    console.error("Error generating token:", error);
    return res.status(500).json({
      error: "Failed to generate token",
      details: error instanceof Error ? error.message : "Unknown error",
    });
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
    server.listen(PORT, (): void => {
      console.log(`Listening on port ${PORT}`);
    });
  } catch (err) {
    console.log(err);
  }
};

start();
